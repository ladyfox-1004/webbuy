import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { runInquiryNotifications } from "@/lib/notify";
import { InquirySchema, processInquiry } from "@/lib/inquiry-submit";

// 입력 형식·notes 머리말·저장/알림 순서는 src/lib/inquiry-submit.ts 에 있다(단위 시험: tests/inquiry-submit.test.ts).
// 🚨 DB 저장이 성공하면 시트·카톡 알림이 실패해도 성공으로 답한다.
export const submitInquiry = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InquirySchema.parse(input))
  .handler(async ({ data }) =>
    processInquiry(data, {
      // anon 에는 읽기 정책이 없다. .select() 를 붙이면 RLS 로 실패한다.
      insert: async (row) => {
        const { error } = await supabase.from("inquiries").insert(row);
        return { error };
      },
      notify: (n) => runInquiryNotifications(n),
    }),
  );
