import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

const InquirySchema = z.object({
  name: z.string().trim().min(1).max(100),
  contact: z.string().trim().min(1).max(200),
  services: z.array(z.string().max(60)).max(20).default([]),
  referenceLinks: z.string().trim().max(2000).optional().default(""),
  notes: z.string().trim().max(5000).optional().default(""),
  fileStoragePath: z.string().trim().max(500).optional().nullable(),
  fileName: z.string().trim().max(200).optional().nullable(),
  consent: z.literal(true),
});

export const submitInquiry = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InquirySchema.parse(input))
  .handler(async ({ data }) => {
    // 첨부파일은 경로/파일명만 문자열로 남긴다.
    // 서명 URL 은 service_role 이 필요한데 이 리포는 public 이라 키를 둘 수 없다.
    // 실제 다운로드 URL 은 나중에 생성기(service_role 보유)가 만든다.
    const { error } = await supabase.from("inquiries").insert({
      name: data.name,
      contact: data.contact,
      services: data.services,
      reference_links: data.referenceLinks,
      notes: data.notes,
      file_storage_path: data.fileStoragePath ?? null,
      file_name: data.fileName ?? null,
      consent: true,
      source: "homepage",
    });
    // anon 에는 읽기 정책이 없다. .select() 를 붙이면 RLS 로 실패한다.

    if (error) {
      console.error(`inquiries insert failed [${error.code ?? "?"}]: ${error.message}`);
      throw new Error("문의 전송에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
    return { ok: true };
  });
