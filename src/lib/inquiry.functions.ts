import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
    const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
    if (!webhookUrl) {
      throw new Error("문의 접수 서버가 설정되지 않았습니다. 관리자에게 문의해주세요.");
    }

    // Generate a 30-day signed URL for the uploaded file (if any)
    let fileSignedUrl: string | null = null;
    if (data.fileStoragePath) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: signed } = await supabaseAdmin.storage
        .from("inquiry-files")
        .createSignedUrl(data.fileStoragePath, 60 * 60 * 24 * 30);
      fileSignedUrl = signed?.signedUrl ?? null;
    }

    const payload = {
      timestamp: new Date().toISOString(),
      name: data.name,
      contact: data.contact,
      services: data.services.join(", "),
      referenceLinks: data.referenceLinks,
      notes: data.notes,
      fileName: data.fileName ?? "",
      fileUrl: fileSignedUrl ?? "",
    };

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`Google Sheet webhook failed [${res.status}]: ${body}`);
      throw new Error("문의 전송에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
    return { ok: true };
  });
