import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

const InquirySchema = z.object({
  name: z.string().trim().min(1).max(100),
  contact: z.string().trim().min(1).max(200),
  services: z.array(z.string().trim().max(60)).max(20).default([]),
  referenceLinks: z.string().trim().max(2000).optional().default(""),
  notes: z.string().trim().max(5000).optional().default(""),
  fileStoragePath: z.string().trim().max(500).optional().nullable(),
  fileName: z.string().trim().max(200).optional().nullable(),
  consent: z.literal(true),
  // 아래는 컬럼이 없어서 notes 머리말과 시트 알림으로만 남기는 값들
  budget: z.string().trim().max(100).optional().default(""),
  launchDate: z.string().trim().max(20).optional().default(""),
  topic: z.string().trim().max(120).optional().default(""),
  // 스팸 봇용 숨김 필드. 사람은 볼 수 없으므로 값이 있으면 봇이다.
  honeypot: z.string().max(200).optional().default(""),
  attachmentFailed: z.boolean().optional().default(false),
});

type InquiryInput = z.infer<typeof InquirySchema>;

// ─────────────────────────────────────────────────────────────
// notes 컬럼 형식 (로컬 생성기가 이 형식을 읽는다 — 바꾸면 생성기도 같이 고칠 것)
//
//   1행: [예산] {예산 또는 "미입력"} / [희망 론칭일] {YYYY-MM-DD 또는 "미정"}
//        (+ 문의 주제가 있으면) / [문의 주제] {주제}
//        (+ 첨부 업로드 실패 시) / [첨부] 업로드 실패({파일명})
//   2행: 빈 줄
//   3행~: 고객이 쓴 프로젝트 내용 본문(최대 5000자)
//
// 예) [예산] 3,000만 원 / [희망 론칭일] 미정 / [문의 주제] 예약·스케줄링 시스템 구축
//
//     온라인 예약과 결제를 붙이고 싶습니다...
// ─────────────────────────────────────────────────────────────
function cleanLine(s: string): string {
  // 머리말은 한 줄이어야 하므로 줄바꿈을 공백으로 바꾼다.
  return s.replace(/[\r\n]+/g, " ").trim();
}

function composeNotes(data: InquiryInput): string {
  const parts = [
    `[예산] ${cleanLine(data.budget) || "미입력"}`,
    `[희망 론칭일] ${cleanLine(data.launchDate) || "미정"}`,
  ];
  if (data.topic) parts.push(`[문의 주제] ${cleanLine(data.topic)}`);
  if (data.attachmentFailed) parts.push(`[첨부] 업로드 실패(${cleanLine(data.fileName ?? "")})`);
  const body = data.notes.slice(0, 5000);
  return `${parts.join(" / ")}\n\n${body}`;
}

// ─────────────────────────────────────────────────────────────
// 구글 시트 알림 (Apps Script 웹 앱)
// 설정 방법은 docs/inquiry-sheet/README.md 참고.
// 🚨 INQUIRY_SHEET_TOKEN 은 Worker 비밀값(wrangler secret)으로만 넣는다. 코드·.env 에 적지 마라.
// ─────────────────────────────────────────────────────────────
type SheetEnv = { INQUIRY_SHEET_WEBHOOK_URL?: string; INQUIRY_SHEET_TOKEN?: string };
type Bag = Record<string, unknown>;

function pickSheetEnv(src: Bag | undefined): SheetEnv {
  const out: SheetEnv = {};
  if (!src) return out;
  for (const k of ["INQUIRY_SHEET_WEBHOOK_URL", "INQUIRY_SHEET_TOKEN"] as const) {
    const v = src[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

/** Workers 에서는 process.env(nodejs_compat)와 nitro 의 globalThis.__env__ 양쪽으로 들어온다. 뒤가 앞을 덮는다. */
function readSheetEnv(): SheetEnv {
  const proc = typeof process !== "undefined" ? (process.env as Bag) : undefined;
  const nitroEnv = (globalThis as { __env__?: Bag }).__env__;
  return { ...pickSheetEnv(proc), ...pickSheetEnv(nitroEnv) };
}

let warnedMissingSheetUrl = false;

type SheetPayload = {
  receivedAt: string;
  name: string;
  contact: string;
  budget: string;
  launchDate: string;
  services: string[];
  topic: string;
  notes: string;
  referenceLinks: string;
  hasAttachment: boolean;
  fileName: string;
  attachmentFailed: boolean;
  source: "homepage";
};

/**
 * 시트 알림은 "있으면 좋은" 사본이다. 원본은 DB(inquiries)다.
 * 그래서 어떤 이유로든 실패해도 예외를 던지지 않는다(고객은 이미 접수 완료).
 * 응답 뒤에 남은 Promise 는 Workers 가 버릴 수 있으므로 호출부에서 반드시 await 한다.
 */
async function notifySheet(payload: SheetPayload): Promise<void> {
  const env = readSheetEnv();
  const url = env.INQUIRY_SHEET_WEBHOOK_URL;
  if (!url) {
    if (!warnedMissingSheetUrl) {
      console.info("INQUIRY_SHEET_WEBHOOK_URL 미설정 — 시트 알림을 건너뛴다(DB 저장은 정상).");
      warnedMissingSheetUrl = true;
    }
    return;
  }
  try {
    // Apps Script 웹 앱은 POST 에 302(googleusercontent)로 답한다. 따라가도 된다.
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: env.INQUIRY_SHEET_TOKEN ?? "", ...payload }),
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`inquiry sheet notify failed: HTTP ${res.status}`);
      return;
    }
    // Apps Script 는 토큰이 틀려도 200 으로 {ok:false} 를 돌려준다.
    const text = await res.text().catch(() => "");
    if (text.includes('"ok":false')) {
      console.error("inquiry sheet notify rejected (토큰 불일치 등 — 응답 ok:false)");
    }
  } catch (err) {
    // 토큰·개인정보는 남기지 않는다. 오류 종류만.
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : "unknown";
    console.error(`inquiry sheet notify error: ${reason}`);
  }
}

export const submitInquiry = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InquirySchema.parse(input))
  .handler(async ({ data }) => {
    if (data.honeypot.trim()) {
      // 봇으로 보고 조용히 성공 처리한다(저장·알림 없음).
      console.warn("inquiry honeypot hit");
      return { ok: true };
    }

    const failed = data.attachmentFailed;

    // 첨부파일은 경로/파일명만 문자열로 남긴다.
    // 서명 URL 은 service_role 이 필요한데 이 리포는 public 이라 키를 둘 수 없다.
    // 실제 다운로드 URL 은 나중에 생성기(service_role 보유)가 만든다.
    const { error } = await supabase.from("inquiries").insert({
      name: data.name,
      contact: data.contact,
      services: data.services,
      reference_links: data.referenceLinks,
      notes: composeNotes(data),
      file_storage_path: failed ? null : (data.fileStoragePath ?? null),
      file_name: data.fileName ?? null,
      consent: true,
      source: "homepage",
    });
    // anon 에는 읽기 정책이 없다. .select() 를 붙이면 RLS 로 실패한다.

    if (error) {
      console.error(`inquiries insert failed [${error.code ?? "?"}]: ${error.message}`);
      throw new Error("문의 전송에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }

    // DB 가 원본이다. 여기서부터는 실패해도 고객에게는 성공으로 응답한다.
    await notifySheet({
      receivedAt: new Date().toISOString(),
      name: data.name,
      contact: data.contact,
      budget: data.budget || "미입력",
      launchDate: data.launchDate || "미정",
      services: data.services,
      topic: data.topic,
      notes: data.notes,
      referenceLinks: data.referenceLinks,
      hasAttachment: Boolean(data.fileName) && !failed,
      fileName: data.fileName ?? "",
      attachmentFailed: failed,
      source: "homepage",
    });

    return { ok: true };
  });
