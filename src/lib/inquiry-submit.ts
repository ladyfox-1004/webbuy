// 상담 접수 한 건 처리(검증된 입력 → DB 저장 → 알림). 서버 함수(inquiry.functions.ts)가 부른다.
// 🚨 DB(inquiries)가 원본이다. 저장에 성공하면 시트·카톡 알림이 어떻게 되든 고객에게는 성공으로 답한다.
//    저장에 실패했을 때만 오류를 던진다(알림은 보내지 않는다).
// TanStack·Supabase 를 직접 import 하지 않고 insert/notify 를 받아서, 단위 시험(tests/inquiry-submit.test.ts)에서
// 가짜로 끼워 볼 수 있게 했다.
import { z } from "zod";
import type { InquiryNotice } from "./notify/types";

export const InquirySchema = z.object({
  name: z.string().trim().min(1).max(100),
  contact: z.string().trim().min(1).max(200),
  services: z.array(z.string().trim().max(60)).max(20).default([]),
  referenceLinks: z.string().trim().max(2000).optional().default(""),
  notes: z.string().trim().max(5000).optional().default(""),
  fileStoragePath: z.string().trim().max(500).optional().nullable(),
  fileName: z.string().trim().max(200).optional().nullable(),
  consent: z.literal(true),
  // 아래는 컬럼이 없어서 notes 머리말과 시트 알림으로만 남기는 값들.
  // 🚨 2026-11 폼에서 「프로젝트 예산」「희망 론칭일」 칸을 뺐다. 예전 화면(캐시)이 보내도 깨지지 않게
  //    선택값으로 남겨 둔다. 비면 notes 머리말에 "미입력"/"미정" 으로 들어간다(생성기 형식 유지).
  budget: z.string().trim().max(100).optional().default(""),
  launchDate: z.string().trim().max(20).optional().default(""),
  topic: z.string().trim().max(120).optional().default(""),
  // 스팸 봇용 숨김 필드. 사람은 볼 수 없으므로 값이 있으면 봇이다.
  honeypot: z.string().max(200).optional().default(""),
  attachmentFailed: z.boolean().optional().default(false),
});

export type InquiryInput = z.infer<typeof InquirySchema>;

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

export function composeNotes(data: InquiryInput): string {
  const parts = [
    `[예산] ${cleanLine(data.budget) || "미입력"}`,
    `[희망 론칭일] ${cleanLine(data.launchDate) || "미정"}`,
  ];
  if (data.topic) parts.push(`[문의 주제] ${cleanLine(data.topic)}`);
  if (data.attachmentFailed) parts.push(`[첨부] 업로드 실패(${cleanLine(data.fileName ?? "")})`);
  const body = data.notes.slice(0, 5000);
  return `${parts.join(" / ")}\n\n${body}`;
}

export type InquiryRow = {
  id: string;
  name: string;
  contact: string;
  services: string[];
  reference_links: string;
  notes: string;
  file_storage_path: string | null;
  file_name: string | null;
  consent: true;
  source: "homepage";
};

export type InquiryDeps = {
  /** inquiries 에 한 줄 넣기. anon 에는 읽기 정책이 없으므로 .select() 를 붙이지 않는다. */
  insert: (row: InquiryRow) => Promise<{ error: { code?: string; message: string } | null }>;
  /** 시트·카톡 알림(runInquiryNotifications). 던져도 접수는 성공이다. */
  notify: (n: InquiryNotice) => Promise<unknown>;
  newId?: () => string;
  now?: () => Date;
};

export const INQUIRY_FAILED_MESSAGE = "문의 전송에 실패했습니다. 잠시 후 다시 시도해주세요.";

export async function processInquiry(data: InquiryInput, deps: InquiryDeps): Promise<{ ok: true }> {
  if (data.honeypot.trim()) {
    // 봇으로 보고 조용히 성공 처리한다(저장·알림 없음).
    console.warn("inquiry honeypot hit");
    return { ok: true };
  }

  const failed = data.attachmentFailed;
  // 알림 결과를 나중에 이 행에 적으려고 id 를 미리 만든다(anon 은 .select() 로 되읽을 수 없다).
  const id = (deps.newId ?? (() => crypto.randomUUID()))();
  const receivedAt = (deps.now ?? (() => new Date()))().toISOString();

  // 첨부파일은 경로/파일명만 문자열로 남긴다.
  // 서명 URL 은 service_role 이 필요하므로 여기서 만들지 않는다. 다운로드 URL 은 생성기가 만든다.
  let insertError: { code?: string; message: string } | null;
  try {
    ({ error: insertError } = await deps.insert({
      id,
      name: data.name,
      contact: data.contact,
      services: data.services,
      reference_links: data.referenceLinks,
      notes: composeNotes(data),
      file_storage_path: failed ? null : (data.fileStoragePath ?? null),
      file_name: data.fileName ?? null,
      consent: true,
      source: "homepage",
    }));
  } catch (err) {
    insertError = { message: err instanceof Error ? err.name : "unknown" };
  }

  if (insertError) {
    console.error(`inquiries insert failed [${insertError.code ?? "?"}]: ${insertError.message}`);
    throw new Error(INQUIRY_FAILED_MESSAGE);
  }

  // DB 가 원본이다. 여기서부터는 실패해도 고객에게는 성공으로 응답한다.
  // 구글 시트(apps-script/README.md)·카카오톡 나에게 보내기(/admin/kakao-connect) 결과는
  // inquiries.sheet_notify_status / kakao_notify_status 에 남는다.
  // 🚨 Workers 는 응답 뒤 남은 Promise 를 버릴 수 있으므로 여기서 await 한다(각 요청은 8초 제한).
  try {
    await deps.notify({
      id,
      receivedAt,
      name: data.name,
      contact: data.contact,
      services: data.services,
      topic: data.topic,
      notes: data.notes,
      referenceLinks: data.referenceLinks,
      hasAttachment: Boolean(data.fileName) && !failed,
      fileName: data.fileName ?? "",
      attachmentFailed: failed,
      budget: data.budget,
      launchDate: data.launchDate,
      source: "homepage",
    });
  } catch (err) {
    // runInquiryNotifications 는 던지지 않게 만들었지만, 만약을 위해 한 번 더 막는다.
    console.error(`inquiry notify crashed: ${err instanceof Error ? err.name : "unknown"}`);
  }

  return { ok: true };
}
