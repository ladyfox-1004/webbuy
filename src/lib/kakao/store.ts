// 카카오 챗봇 DB 연결(Supabase service_role). 판단은 ./flow.ts, 여기서는 읽고 쓰기만.
// 표: kakao_chat_sessions·kakao_questions·kakao_faq_extra, 함수 kakao_chat_add_photos·kakao_question_alert_due
//     — 마이그레이션 supabase/migrations/20261107150000_kakao_chat.sql
// 🚨 service_role 전용(RLS 켬·정책 없음). 브라우저에서 import 하지 마라.
// 🚨 메서드 하나 = 외부 호출 하나. Worker 무료 요금제는 요청당 외부 호출 50개.
import type { Json } from "../../integrations/supabase/types";
import type { ServiceDb } from "../notify/token-store";
import { MENU_KEYS, type MenuKey } from "./faq";
import type { Session, SessionData } from "./flow";
import type { ExtraFaq } from "./match";

export type QuestionRow = {
  id: string;
  user_key: string;
  menu: MenuKey | null;
  question: string;
  bot_answer: string;
  answered_by_ai: boolean;
  contact: string | null;
};

export interface ChatStore {
  load(userKey: string): Promise<Session | null>;
  save(
    userKey: string,
    s: { menu: MenuKey | null; step: string; data: SessionData; resetPhotos: boolean },
    now: Date,
  ): Promise<void>;
  addPhotos(userKey: string, urls: string[], max: number): Promise<number>;
  loadExtraFaq(): Promise<ExtraFaq[]>;
  insertQuestion(row: QuestionRow): Promise<void>;
  setQuestionContact(ids: string[], contact: string): Promise<void>;
  /** 이 사람에게 「챗봇 새 질문」 알림을 보낼 차례인가(10분 묶기). true 면 시각을 적는다. */
  alertDue(userKey: string, now: Date): Promise<boolean>;
}

function fail(what: string, error: { code?: string | null } | null): never {
  throw new Error(`${what} 실패 [${error?.code ?? "?"}]`);
}

export function asMenu(v: unknown): MenuKey | null {
  return typeof v === "string" && (MENU_KEYS as readonly string[]).includes(v)
    ? (v as MenuKey)
    : null;
}

export function supabaseChatStore(db: ServiceDb): ChatStore {
  return {
    async load(userKey) {
      const { data, error } = await db
        .from("kakao_chat_sessions")
        .select("menu, step, data, photos, updated_at")
        .eq("user_key", userKey)
        .maybeSingle();
      if (error) fail("대화 상태 읽기", error);
      if (!data) return null;
      const d = data.data;
      return {
        menu: asMenu(data.menu),
        step: data.step,
        data: (d && typeof d === "object" && !Array.isArray(d) ? d : {}) as SessionData,
        photos: Array.isArray(data.photos) ? data.photos : [],
        updatedAt: data.updated_at,
      };
    },
    async save(userKey, s, now) {
      const row: {
        user_key: string;
        menu: MenuKey | null;
        step: string;
        data: Json;
        updated_at: string;
        photos?: string[];
      } = {
        user_key: userKey,
        menu: s.menu,
        step: s.step,
        data: s.data as unknown as Json,
        updated_at: now.toISOString(),
      };
      // 사진 칸은 새로 시작할 때만 비운다(평소에는 건드리지 않아야 동시에 온 사진을 덮어쓰지 않는다)
      if (s.resetPhotos) row.photos = [];
      const { error } = await db
        .from("kakao_chat_sessions")
        .upsert(row, { onConflict: "user_key" });
      if (error) fail("대화 상태 저장", error);
    },
    async addPhotos(userKey, urls, max) {
      const { data, error } = await db.rpc("kakao_chat_add_photos", {
        _user_key: userKey,
        _urls: urls,
        _max: max,
      });
      if (error) fail("사진 붙이기", error);
      return typeof data === "number" ? data : 0;
    },
    async loadExtraFaq() {
      const { data, error } = await db
        .from("kakao_faq_extra")
        .select("id, menu, keywords, answer")
        .eq("active", true)
        .order("created_at", { ascending: true })
        .limit(300);
      if (error) fail("추가 FAQ 읽기", error);
      return (data ?? []).map((r) => ({
        id: r.id,
        menu: asMenu(r.menu),
        keywords: r.keywords ?? [],
        answer: r.answer,
      }));
    },
    async insertQuestion(row) {
      const { error } = await db.from("kakao_questions").insert(row);
      if (error) fail("챗봇 질문 저장", error);
    },
    async setQuestionContact(ids, contact) {
      if (!ids.length) return;
      const { error } = await db
        .from("kakao_questions")
        .update({ contact })
        .in("id", ids)
        .is("contact", null);
      if (error) fail("질문 연락처 저장", error);
    },
    async alertDue(userKey, now) {
      const { data, error } = await db.rpc("kakao_question_alert_due", {
        _user_key: userKey,
        _now: now.toISOString(),
      });
      if (error) fail("알림 묶기 확인", error);
      return data === true;
    },
  };
}
