// 추천인(파트너) — 코드 규칙·브라우저 기억(30일·덮어쓰기)·금액 계산·신청 처리·관리자 동작·방문/상담 귀속 시험.
// 실행: bun test ./tests  (네트워크·DB 에 나가지 않는다. DB 쪽 시험은 supabase/tests/partners.test.sql)
import { describe, expect, test } from "bun:test";
import {
  REF_STORAGE_KEY,
  REF_TTL_MS,
  captureRef,
  checkWantedCode,
  commissionOf,
  last4,
  normalizeRef,
  readStoredRef,
  withholdingOf,
} from "../src/lib/partner/ref";
import { applyKakaoText, processPartnerApply, type ApplyRpcResult } from "../src/lib/partner/apply";
import { kstMonth, parseAdminAction, parseWon } from "../src/lib/partner/admin";
import { parseTrackBody } from "../src/lib/analytics/track";
import { InquirySchema, processInquiry, type InquiryRow } from "../src/lib/inquiry-submit";

function memStore() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}

describe("추천 코드 형식", () => {
  test("소문자 영숫자 4~16자, 대문자·공백은 정리", () => {
    expect(normalizeRef(" KimPart ")).toBe("kimpart");
    expect(normalizeRef("abcd")).toBe("abcd");
    expect(normalizeRef("a".repeat(16))).toBe("a".repeat(16));
    for (const bad of ["abc", "a".repeat(17), "kim-part", "김파트너", "kim part", "", null, 123]) {
      expect(normalizeRef(bad)).toBeNull();
    }
  });
  test("신청 코드는 예약어 금지", () => {
    expect(checkWantedCode("Admin")).toEqual({ ok: false, reason: "reserved" });
    expect(checkWantedCode("reels")).toEqual({ ok: false, reason: "reserved" });
    expect(checkWantedCode("x!")).toEqual({ ok: false, reason: "invalid" });
    expect(checkWantedCode("mycode1")).toEqual({ ok: true, code: "mycode1" });
  });
});

describe("브라우저 기억(aisol_ref)", () => {
  const t0 = Date.UTC(2026, 10, 7, 3, 0, 0);
  test("?ref= 형식 맞으면 저장, 틀리면 저장 안 함", () => {
    const s = memStore();
    expect(captureRef("?utm_source=x&ref=KimPart", t0, s)).toBe("kimpart");
    expect(JSON.parse(s.m.get(REF_STORAGE_KEY) as string)).toEqual({ code: "kimpart", at: t0 });
    expect(captureRef("?ref=bad-code", t0 + 1000, s)).toBeNull();
    expect(readStoredRef(t0 + 1000, s)?.code).toBe("kimpart");
    expect(captureRef("", t0, s)).toBeNull();
  });
  test("새 코드가 오면 덮어쓴다(마지막 클릭 기준)", () => {
    const s = memStore();
    captureRef("?ref=first1", t0, s);
    captureRef("?ref=second2", t0 + 5000, s);
    expect(readStoredRef(t0 + 6000, s)).toEqual({ code: "second2", at: t0 + 5000 });
  });
  test("30일 지나면 없음", () => {
    const s = memStore();
    captureRef("?ref=kimpart", t0, s);
    expect(readStoredRef(t0 + REF_TTL_MS - 1, s)?.code).toBe("kimpart");
    expect(readStoredRef(t0 + REF_TTL_MS + 1, s)).toBeNull();
  });
  test("깨진 값·미래 시각·저장소 없음은 null", () => {
    const s = memStore();
    s.setItem(REF_STORAGE_KEY, "{not json");
    expect(readStoredRef(t0, s)).toBeNull();
    s.setItem(REF_STORAGE_KEY, JSON.stringify({ code: "kimpart", at: t0 + 10 * 60_000 }));
    expect(readStoredRef(t0, s)).toBeNull();
    s.setItem(REF_STORAGE_KEY, JSON.stringify({ code: "BAD CODE", at: t0 }));
    expect(readStoredRef(t0, s)).toBeNull();
    expect(readStoredRef(t0, null)).toBeNull();
  });
});

describe("금액(원 단위 내림) — DB 와 같은 값", () => {
  test("수수료 10%", () => {
    expect(commissionOf(200_000)).toBe(20_000);
    expect(commissionOf(750_000)).toBe(75_000);
    expect(commissionOf(1_400_000 - 99_000)).toBe(130_100);
    expect(commissionOf(12_345)).toBe(1_234);
  });
  test("원천징수 3.3%", () => {
    expect(withholdingOf(130_100)).toEqual({ incomeTax: 3_903, localTax: 390, withholding: 4_293, net: 125_807 });
    expect(withholdingOf(250_100)).toEqual({ incomeTax: 7_503, localTax: 750, withholding: 8_253, net: 241_847 });
  });
  test("계좌 끝 4자리", () => {
    expect(last4("123456-01-987654")).toBe("7654");
  });
});

const goodApply = {
  name: "김파트",
  phone: "010-1111-2222",
  email: "Kim@Example.com",
  code: "",
  channels: "https://instagram.com/kim",
  bankName: "국민은행",
  bankAccount: "123456 01 987654",
  bankHolder: "김파트",
  agreeRules: true,
  agreeDisclosure: true,
  agreePrivacy: true,
  company_website: "",
};

function applyDeps(result: ApplyRpcResult = { ok: true, id: "x", code: "abc234", name: "김파트" }) {
  const calls: Record<string, string>[] = [];
  const texts: string[] = [];
  return {
    calls,
    texts,
    d: {
      apply: async (p: Record<string, string>) => {
        calls.push(p);
        return result;
      },
      notify: async (t: string) => {
        texts.push(t);
      },
    },
  };
}

describe("파트너 신청 처리", () => {
  test("정상: 숫자만 휴대폰·소문자 이메일·공백 없는 계좌로 저장하고 카톡(전화·계좌 없음)", async () => {
    const t = applyDeps();
    const r = await processPartnerApply(goodApply, t.d);
    expect(r).toEqual({ status: 200, body: { ok: true, code: "abc234" } });
    expect(t.calls[0]).toMatchObject({ phone: "01011112222", email: "kim@example.com", bank_account: "12345601987654" });
    expect(t.texts).toEqual(["파트너 신청: 김파트 / 확인 https://ai-solution.co.kr/admin/partners"]);
    expect(t.texts[0]).not.toContain("0101111");
  });
  test("동의 하나라도 빠지면 400, 저장 안 함", async () => {
    const t = applyDeps();
    const r = await processPartnerApply({ ...goodApply, agreeDisclosure: false }, t.d);
    expect(r.status).toBe(400);
    expect(t.calls.length).toBe(0);
  });
  test("허니팟이 차 있으면 저장·알림 없이 성공처럼", async () => {
    const t = applyDeps();
    const r = await processPartnerApply({ ...goodApply, company_website: "http://spam" }, t.d);
    expect(r.status).toBe(200);
    expect(t.calls.length).toBe(0);
    expect(t.texts.length).toBe(0);
  });
  test("예약어 코드는 DB 전에 거절", async () => {
    const t = applyDeps();
    const r = await processPartnerApply({ ...goodApply, code: "admin" }, t.d);
    expect(r).toMatchObject({ status: 400, body: { reason: "code_reserved" } });
    expect(t.calls.length).toBe(0);
  });
  test("중복은 409", async () => {
    const t = applyDeps({ ok: false, reason: "duplicate" });
    const r = await processPartnerApply(goodApply, t.d);
    expect(r).toMatchObject({ status: 409, body: { reason: "duplicate" } });
    expect(t.texts.length).toBe(0);
  });
  test("카톡이 실패해도 신청은 성공", async () => {
    const t = applyDeps();
    const r = await processPartnerApply(goodApply, {
      ...t.d,
      notify: async () => {
        throw new Error("kakao down");
      },
    });
    expect(r.status).toBe(200);
  });
  test("휴대폰 아님·이메일 틀림·본문 아님은 400", async () => {
    const t = applyDeps();
    expect((await processPartnerApply({ ...goodApply, phone: "02-123-4567" }, t.d)).status).toBe(400);
    expect((await processPartnerApply({ ...goodApply, email: "no-at" }, t.d)).status).toBe(400);
    expect((await processPartnerApply(null, t.d)).status).toBe(400);
  });
  test("카톡 글", () => {
    expect(applyKakaoText("  홍  길동 ")).toBe("파트너 신청: 홍 길동 / 확인 https://ai-solution.co.kr/admin/partners");
  });
});

describe("관리자 동작 검사", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  test("금액 문자열", () => {
    expect(parseWon("1,301,000원")).toBe(1_301_000);
    expect(parseWon(5000)).toBe(5000);
    expect(parseWon("12.5")).toBeNull();
    expect(parseWon("-1")).toBeNull();
  });
  test("동작별", () => {
    expect(parseAdminAction({ action: "set_status", id, status: "approved" })).toEqual({ action: "set_status", id, status: "approved" });
    expect(parseAdminAction({ action: "set_status", id, status: "applied" })).toHaveProperty("error");
    expect(parseAdminAction({ action: "inquiry_paid", inquiry_id: id, amount: "3,000,000" })).toEqual({
      action: "inquiry_paid",
      inquiryId: id,
      amount: 3_000_000,
    });
    expect(parseAdminAction({ action: "inquiry_paid", inquiry_id: id, amount: "0" })).toHaveProperty("error");
    expect(parseAdminAction({ action: "make_payouts" }, new Date("2026-11-30T16:00:00Z"))).toEqual({
      action: "make_payouts",
      month: "2026-12",
    });
    expect(parseAdminAction({ action: "make_payouts", month: "2026-13" })).toHaveProperty("error");
    expect(parseAdminAction({ action: "payout_paid", id: "x" })).toHaveProperty("error");
    expect(parseAdminAction({ action: "nope" })).toHaveProperty("error");
  });
  test("한국 시간 달", () => {
    expect(kstMonth(new Date("2026-11-30T14:59:00Z"))).toBe("2026-11");
    expect(kstMonth(new Date("2026-11-30T15:00:00Z"))).toBe("2026-12");
  });
});

describe("방문 기록·상담 귀속", () => {
  const ok = { v: "0f8fad5b-d9cb-469f-a165-70867728950e", s: "7c9e6679-7425-40de-944b-e07fc1f90ae7", p: "/" };
  test("방문 rf: 형식 맞으면 저장, 틀리면 그 칸만 버리고 기록은 받는다", () => {
    expect(parseTrackBody(JSON.stringify({ ...ok, rf: "kimpart" }))?.refCode).toBe("kimpart");
    const bad = parseTrackBody(JSON.stringify({ ...ok, rf: "Bad Code!" }));
    expect(bad).not.toBeNull();
    expect(bad?.refCode).toBeNull();
    expect(parseTrackBody(JSON.stringify(ok))?.refCode).toBeNull();
  });

  async function save(refCode?: string) {
    const rows: InquiryRow[] = [];
    await processInquiry(
      InquirySchema.parse({ name: "시험", contact: "010-0000-0000", consent: true, ...(refCode !== undefined ? { refCode } : {}) }),
      {
        insert: async (row) => {
          rows.push(row);
          return { error: null };
        },
        notify: async () => undefined,
      },
    );
    return rows[0];
  }
  test("상담: 코드가 맞으면 ref_code, 없거나 틀리면 열 자체를 안 보냄", async () => {
    expect((await save("KimPart")).ref_code).toBe("kimpart");
    expect("ref_code" in (await save())).toBe(false);
    expect("ref_code" in (await save("bad code!"))).toBe(false);
  });
});
