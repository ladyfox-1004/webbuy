// 페이앱 공통 모듈 단위 시험. 빌드넷 _shared/payapp.test.ts 에서 단건 결제 관련 시험만 옮겨 왔다. 네트워크 없음 — fetch 는 가짜.
// 실행: deno test --no-lock supabase/functions/_shared/payapp.test.ts
import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import {
  callPayApp,
  feedbackReply,
  isFormContentType,
  kstDate14,
  normalizePhone,
  parseAmount,
  parseDate14,
  parseForm,
  parsePayAppResponse,
  payRequestParams,
  PAYAPP_API_URL,
  readSecrets,
  requestHash,
  safeEqual,
  sanitizePayload,
  secretPresence,
  sha256Hex,
  splitVat,
  verifyNotification,
  type PayAppSecrets,
} from "./payapp.ts";

const SECRETS: PayAppSecrets = {
  userid: "seller1",
  linkkey: "LK-abc",
  linkval: "LV-xyz",
  requestkey: "RK-secret",
};

async function goodNotice(over: Record<string, string> = {}): Promise<Record<string, string>> {
  const responsedate = over.responsedate ?? "20261025153000";
  const userid = over.userid ?? SECRETS.userid;
  return {
    userid,
    linkkey: SECRETS.linkkey,
    linkval: SECRETS.linkval,
    responsedate,
    hash: await sha256Hex(userid + responsedate + SECRETS.requestkey),
    pay_state: "4",
    mul_no: "1001",
    price: "29000",
    ...over,
  };
}
const NOW = new Date("2026-10-25T06:31:00Z"); // 한국 15:31

// ───────── 시크릿 ─────────
Deno.test("시크릿: 4개 모두 있어야 읽힘, 하나라도 비면 null", () => {
  const env: Record<string, string> = {
    PAYAPP_USERID: "u",
    PAYAPP_LINKKEY: "k",
    PAYAPP_LINKVAL: "v",
    PAYAPP_REQUESTKEY: "r",
  };
  assertEquals(
    readSecrets((n) => env[n]),
    { userid: "u", linkkey: "k", linkval: "v", requestkey: "r" },
  );
  assertEquals(
    readSecrets((n) => (n === "PAYAPP_LINKVAL" ? "  " : env[n])),
    null,
  );
  assertEquals(
    readSecrets(() => undefined),
    null,
  );
});

Deno.test("시크릿 있음/없음: 값은 돌려주지 않는다", () => {
  const p = secretPresence((n) => (n === "PAYAPP_USERID" ? "seller" : undefined));
  assertEquals(p, {
    PAYAPP_USERID: true,
    PAYAPP_LINKKEY: false,
    PAYAPP_LINKVAL: false,
    PAYAPP_REQUESTKEY: false,
  });
  assertFalse(JSON.stringify(p).includes("seller"));
});

// ───────── 해시 ─────────
Deno.test("sha256: 알려진 값", async () => {
  assertEquals(
    await sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assertEquals(await requestHash("a", "b", "c"), await sha256Hex("abc"));
});

Deno.test("safeEqual: 같음·다름·길이 다름", async () => {
  assert(await safeEqual("abc", "abc"));
  assertFalse(await safeEqual("abc", "abd"));
  assertFalse(await safeEqual("abc", "abcd"));
  assertFalse(await safeEqual("", "x"));
  assert(await safeEqual("", ""));
});

// ───────── 한국 시간 ─────────
Deno.test("requestdate: 한국 시간 14자리", () => {
  assertEquals(kstDate14(new Date("2026-10-25T06:31:05Z")), "20261025153105");
  assertEquals(kstDate14(new Date("2026-12-31T15:00:00Z")), "20270101000000"); // UTC 15시 = 한국 다음 날 0시
});

Deno.test("parseDate14: 형식·날짜 확인", () => {
  assertEquals(parseDate14("20261025153000")?.toISOString(), "2026-10-25T06:30:00.000Z");
  assertEquals(parseDate14("2026102515300"), null);
  assertEquals(parseDate14("20260230120000"), null);
  assertEquals(parseDate14("20261025246000"), null);
  assertEquals(parseDate14(""), null);
  assertEquals(parseDate14(undefined), null);
  assert(parseDate14("20280229000000")); // 윤년
});

// ───────── 금액 ─────────
Deno.test('금액: 29000·"29000.0" 통과, 문자·소수·빈 값 거부', () => {
  assertEquals(parseAmount("29000"), 29000);
  assertEquals(parseAmount(" 29000.0 "), 29000);
  assertEquals(parseAmount("29000.5"), null);
  assertEquals(parseAmount("-1000"), null);
  assertEquals(parseAmount("1,000"), null);
  assertEquals(parseAmount(""), null);
  assertEquals(parseAmount(null), null);
  assertEquals(parseAmount("99999999999"), null);
});

Deno.test("부가세 나눔(포함가 → 공급가액·부가세)", () => {
  assertEquals(splitVat(29000), { taxable: 26364, vat: 2636, taxfree: 0 });
  assertEquals(splitVat(1000), { taxable: 909, vat: 91, taxfree: 0 });
  assertEquals(splitVat(10000), { taxable: 9091, vat: 909, taxfree: 0 });
  for (const p of [1000, 3000, 29000, 123000]) {
    const v = splitVat(p);
    assertEquals(v.taxable + v.vat + v.taxfree, p);
  }
});

// ───────── 파싱 ─────────
Deno.test("form 파싱: 한글·빈 값·모르는 필드·같은 키 두 번(처음 값)", () => {
  const body = new URLSearchParams([
    ["goodname", "빌드넷 스튜디오 월 구독"],
    ["var2", ""],
    ["new_field_2027", "x"],
    ["mul_no", "1"],
    ["mul_no", "2"],
  ]).toString();
  const f = parseForm(body);
  assertEquals(f.goodname, "빌드넷 스튜디오 월 구독");
  assertEquals(f.var2, "");
  assertEquals(f.new_field_2027, "x");
  assertEquals(f.mul_no, "1");
  assertEquals(
    parseForm("goodname=%EB%B9%8C%EB%93%9C%EB%84%B7+%EA%B5%AC%EB%8F%85").goodname,
    "빌드넷 구독",
  );
});

Deno.test("Content-Type: form 만", () => {
  assert(isFormContentType("application/x-www-form-urlencoded"));
  assert(isFormContentType("application/x-www-form-urlencoded; charset=UTF-8"));
  assertFalse(isFormContentType("application/json"));
  assertFalse(isFormContentType(null));
});

Deno.test("페이앱 응답 파싱: 성공·실패", () => {
  const ok = parsePayAppResponse("state=1&mul_no=123&payurl=https%3A%2F%2Fpayapp.kr%2Fp%2F123\n");
  assert(ok.ok);
  assertEquals(ok.fields.payurl, "https://payapp.kr/p/123");
  assertEquals(ok.error, null);
  const bad = parsePayAppResponse(
    "state=0&errorMessage=%EC%9D%B8%EC%A6%9D+%EC%8B%A4%ED%8C%A8&errorCode=70010",
  );
  assertFalse(bad.ok);
  assertEquals(bad.error, "인증 실패");
  assertEquals(bad.errorCode, "70010");
  const junk = parsePayAppResponse("<html>오류</html>");
  assertFalse(junk.ok);
  assert(junk.error);
});

// ───────── 통보 검증 ─────────
Deno.test("통보 검증: 정상 통과 + 시각 차이 기록", async () => {
  const v = await verifyNotification(await goodNotice(), SECRETS, NOW);
  assertEquals(v, { ok: true, error: null, skewSeconds: 60 });
});

Deno.test("통보 검증: hash 대소문자 무시", async () => {
  const f = await goodNotice();
  f.hash = f.hash.toUpperCase();
  assert((await verifyNotification(f, SECRETS, NOW)).ok);
});

Deno.test("통보 검증: userid·linkkey·linkval·hash·responsedate 틀리면 모두 거부", async () => {
  const cases: [Record<string, string>, string][] = [
    [{ ...(await goodNotice()), userid: "other" }, "userid_mismatch"],
    [{ ...(await goodNotice()), linkkey: "LK-wrong" }, "linkkey_mismatch"],
    [{ ...(await goodNotice()), linkval: "LV-wrong" }, "linkval_mismatch"],
    [{ ...(await goodNotice()), hash: "00" }, "hash_mismatch"],
    [{ ...(await goodNotice()), responsedate: "20261025153001" }, "hash_mismatch"], // 해시는 원래 날짜로 계산됨
    [await goodNotice({ responsedate: "2026-10-25" }), "responsedate_invalid"],
  ];
  for (const [f, err] of cases) {
    const v = await verifyNotification(f, SECRETS, NOW);
    assertFalse(v.ok, err);
    assertEquals(v.error, err);
  }
  const missing = await goodNotice();
  delete (missing as Record<string, string | undefined>).linkval;
  assertEquals((await verifyNotification(missing, SECRETS, NOW)).error, "linkval_mismatch");
});

Deno.test("통보 검증: 다른 판매자 아이디로 맞춘 해시도 거부(우리 userid 와 비교)", async () => {
  const f = await goodNotice({ userid: "attacker" });
  assertEquals((await verifyNotification(f, SECRETS, NOW)).error, "userid_mismatch");
});

Deno.test("통보 검증: 시크릿 없으면 거부", async () => {
  assertEquals((await verifyNotification(await goodNotice(), null, NOW)).error, "secrets_missing");
});

Deno.test("원본 정리: 비밀값 지우고 휴대폰 끝 4자리", () => {
  const out = sanitizePayload({
    linkkey: "a",
    linkval: "b",
    hash: "c",
    recvphone: "010-1234-5678",
    mul_no: "1",
    goodname: "한글",
  });
  assertEquals(out, { recvphone: "5678", mul_no: "1", goodname: "한글" });
});

Deno.test("통보 응답: error 만 FAIL(재시도), 나머지 SUCCESS", () => {
  assertEquals(feedbackReply("applied"), "SUCCESS");
  assertEquals(feedbackReply("duplicate"), "SUCCESS");
  assertEquals(feedbackReply("needs_review"), "SUCCESS");
  assertEquals(feedbackReply("ignored"), "SUCCESS");
  assertEquals(feedbackReply("error"), "FAIL");
  assertEquals(feedbackReply(null), "FAIL");
});

Deno.test("휴대폰 번호 정리", () => {
  assertEquals(normalizePhone("010-1234-5678"), "01012345678");
  assertEquals(normalizePhone("011 123 4567"), "0111234567");
  assertEquals(normalizePhone("02-123-4567"), null);
  assertEquals(normalizePhone(""), null);
  assertEquals(normalizePhone(null), null);
});

// ───────── 요청 인자·호출 ─────────
Deno.test("단건 결제 인자: 부가세·재시도·var2 는 인자로", () => {
  const p = payRequestParams({
    orderId: "o-2",
    goodname: "빌드넷 스튜디오 렌더 크레딧 10장",
    price: 10000,
    recvphone: "01012345678",
    feedbackUrl: "https://x/fb",
    returnUrl: "https://r",
    var2: "reels",
  });
  assertEquals(p.cmd, "payrequest");
  assertEquals(p.price, "10000");
  assertEquals(p.var2, "reels");
  assertEquals(p.var1, "o-2");
  assertEquals(p.smsuse, "n");
  assertEquals(p.checkretry, "y");
  assertEquals([p.amount_taxable, p.amount_vat, p.amount_taxfree], ["9091", "909", "0"]);
});

Deno.test(
  "호출: 주소·form 본문·hash 붙임, requestkey·linkkey 는 그대로 보내지 않음(명령 호출만 linkkey)",
  async () => {
    const seen: { url: string; body: string; ct: string }[] = [];
    const fake = (url: string, init?: RequestInit) => {
      seen.push({
        url,
        body: String(init?.body),
        ct: new Headers(init?.headers).get("Content-Type") ?? "",
      });
      return Promise.resolve(new Response("state=1&mul_no=77&payurl=https%3A%2F%2Fp"));
    };
    const r = await callPayApp({ cmd: "payrequest", price: "1000" }, SECRETS, {
      fetch: fake,
      now: NOW,
    });
    assert(r.ok);
    assertEquals(r.fields.mul_no, "77");
    assertEquals(seen[0].url, PAYAPP_API_URL);
    assert(seen[0].ct.startsWith("application/x-www-form-urlencoded"));
    const sent = parseForm(seen[0].body);
    assertEquals(sent.userid, "seller1");
    assertEquals(sent.requestdate, "20261025153100");
    assertEquals(sent.hash, await sha256Hex("seller1" + "20261025153100" + "RK-secret"));
    assertFalse(seen[0].body.includes("RK-secret"));
    assertFalse("linkkey" in sent);

    await callPayApp({ cmd: "rebillCancel", rebill_no: "R1" }, SECRETS, {
      fetch: fake,
      now: NOW,
      withLinkkey: true,
    });
    assertEquals(parseForm(seen[1].body).linkkey, "LK-abc");
  },
);

Deno.test("호출: 서버 오류·연결 실패·시간 초과는 ok=false 로", async () => {
  const s500 = () => Promise.resolve(new Response("err", { status: 500 }));
  assertEquals(
    (await callPayApp({ cmd: "x" }, SECRETS, { fetch: s500, now: NOW })).error,
    "페이앱 서버 응답 500",
  );
  const down = () => Promise.reject(new TypeError("network"));
  assertEquals(
    (await callPayApp({ cmd: "x" }, SECRETS, { fetch: down, now: NOW })).error,
    "페이앱에 연결하지 못했습니다",
  );
  const slow = (_u: string, init?: RequestInit) =>
    new Promise<Response>((_res, rej) => {
      init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
    });
  const r = await callPayApp({ cmd: "x" }, SECRETS, { fetch: slow, now: NOW, timeoutMs: 20 });
  assertEquals(r.error, "페이앱 응답 시간 초과");
});
