// reels-feedback 처리 흐름 시험(설계서 5·8절). DB·페이앱·Resend 모두 가짜.
// 금액 다름·중복·취소의 DB 판정은 SQL 시험이 본다. 여기서는 apply 결과를 응답·메일로 올바르게 잇는지 본다.
// 실행: deno test --no-lock supabase/functions/reels-feedback/
import { assert, assertEquals, assertFalse, assertMatch } from "jsr:@std/assert@1";
import { sha256Hex, type PayAppSecrets } from "../_shared/payapp.ts";
import { buildReelsMail, sellerLines, type ReelsMailData } from "../_shared/reelsMail.ts";
import { createHandler, type ApplyOutcome, type ReelsFeedbackDeps } from "./handler.ts";

const SECRETS: PayAppSecrets = {
  userid: "seller1",
  linkkey: "LK-abc",
  linkval: "LV-xyz",
  requestkey: "RK-secret",
};
const NOW = new Date("2026-11-06T03:01:00Z"); // 한국 12:01
const URL_ = "https://x.supabase.co/functions/v1/reels-feedback";
const ORDER = "00000000-0000-4000-8000-000000000001";
const KEY = "K".repeat(43);
const RESEND_KEY = "re_test_secret";

const MAIL_DATA: ReelsMailData = {
  order_no: "R261106-0001",
  email: "owner@example.com",
  shop_name: "카페 문",
  plan: 1,
  amount: 99000,
  list_price: 200000,
  discount: 101000,
  is_trial: true,
  method: "send_materials",
  paid_at: "2026-11-06T03:00:30Z",
};

interface Opts {
  applies?: ApplyOutcome[];
  applyThrows?: boolean;
  recordThrows?: boolean;
  secrets?: PayAppSecrets | null;
  resendKey?: string;
  resendStatus?: number;
  claim?: (ReelsMailData | null)[];
}

function setup(o: Opts = {}) {
  const records: {
    payload: Record<string, unknown>;
    source: string;
    verified: boolean;
    verifyError: string | null;
  }[] = [];
  const applied: number[] = [];
  const claims: { orderId: string; hash: string }[] = [];
  const done: { orderId: string; status: string }[] = [];
  const sent: { url: string; body: Record<string, unknown>; auth: string }[] = [];
  const logs: unknown[][] = [];
  const applies = [
    ...(o.applies ?? [{ result: "applied", detail: null, order_id: ORDER, send_mail: true }]),
  ];
  const claimQueue = [...(o.claim ?? [MAIL_DATA, null])];
  const deps: ReelsFeedbackDeps = {
    secrets: () => (o.secrets === undefined ? SECRETS : o.secrets),
    record: (payload, source, verified, verifyError) => {
      if (o.recordThrows) return Promise.reject(new Error("db down"));
      records.push({ payload, source, verified, verifyError });
      return Promise.resolve(records.length);
    },
    apply: (id) => {
      applied.push(id);
      if (o.applyThrows) return Promise.reject(new Error("rpc fail"));
      return Promise.resolve(
        applies.shift() ?? { result: "duplicate", detail: null, order_id: ORDER, send_mail: false },
      );
    },
    mailClaim: (orderId, hash) => {
      claims.push({ orderId, hash });
      return Promise.resolve(claimQueue.shift() ?? null);
    },
    mailDone: (orderId, status) => {
      done.push({ orderId, status });
      return Promise.resolve();
    },
    resendKey: () => o.resendKey ?? RESEND_KEY,
    fetch: (url, init) => {
      sent.push({
        url,
        body: JSON.parse(String(init?.body)),
        auth: new Headers(init?.headers).get("Authorization") ?? "",
      });
      return Promise.resolve(
        new Response(o.resendStatus && o.resendStatus >= 400 ? "bad" : '{"id":"m1"}', {
          status: o.resendStatus ?? 200,
        }),
      );
    },
    siteUrl: "https://ai-solution.co.kr",
    newViewKey: () => KEY,
    now: () => NOW,
    log: (...a) => logs.push(a),
  };
  return { handler: createHandler(deps), records, applied, claims, done, sent, logs };
}

async function form(over: Record<string, string> = {}): Promise<string> {
  const responsedate = over.responsedate ?? "20261106120000";
  const f: Record<string, string> = {
    userid: SECRETS.userid,
    linkkey: SECRETS.linkkey,
    linkval: SECRETS.linkval,
    responsedate,
    hash: await sha256Hex(SECRETS.userid + responsedate + SECRETS.requestkey),
    pay_state: "4",
    mul_no: "1001",
    var1: ORDER,
    var2: "reels",
    price: "99000",
    goodname: "문의 댓글 쇼츠 1편(30초 기준)",
    recvphone: "01012345678",
    ...over,
  };
  return new URLSearchParams(f).toString();
}

const post = (body: string, ct = "application/x-www-form-urlencoded; charset=UTF-8", url = URL_) =>
  new Request(url, { method: "POST", headers: { "Content-Type": ct }, body });

Deno.test(
  "정상 통보: 원본 저장(비밀값 없음·전화 4자리) → 적용 → SUCCESS → 메일 한 통",
  async () => {
    const s = setup();
    const res = await s.handler(post(await form()));
    assertEquals(res.status, 200);
    assertEquals(await res.text(), "SUCCESS");
    assertEquals(s.records.length, 1);
    assertEquals(s.applied, [1]);
    const r = s.records[0];
    assert(r.verified);
    assertEquals(r.verifyError, null);
    assertEquals(r.source, "feedback");
    for (const k of ["linkkey", "linkval", "hash"]) assertFalse(k in r.payload, k);
    assertEquals(r.payload.recvphone, "5678");
    assertEquals(r.payload._responsedate_skew_sec, 60);
    const raw = JSON.stringify(r.payload);
    for (const secret of ["RK-secret", "LV-xyz", "LK-abc", "01012345678"])
      assertFalse(raw.includes(secret), secret);

    // 메일: 새 열쇠의 해시로 claim → Resend → done('sent')
    assertEquals(s.claims, [{ orderId: ORDER, hash: await sha256Hex(KEY) }]);
    assertEquals(s.sent.length, 1);
    assertEquals(s.sent[0].url, "https://api.resend.com/emails");
    assertEquals(s.sent[0].auth, `Bearer ${RESEND_KEY}`);
    const b = s.sent[0].body;
    assertEquals(b.from, "에이아이솔루션 <contact@ai-solution.co.kr>");
    assertEquals(b.reply_to, "contact@ai-solution.co.kr");
    assertEquals(b.to, ["owner@example.com"]);
    assert(String(b.text).includes(`https://ai-solution.co.kr/reels/order/R261106-0001?k=${KEY}`));
    assertEquals(s.done, [{ orderId: ORDER, status: "sent" }]);
    // 로그에 열쇠 원문·비밀값이 없다
    assertFalse(JSON.stringify(s.logs).includes(KEY));
    assertFalse(JSON.stringify(s.logs).includes(RESEND_KEY));
  },
);

Deno.test(
  "검증 실패(userid·linkkey·linkval·hash·responsedate): 기록(verified false) + 200 FAIL, apply 안 부름",
  async () => {
    const bads: [Record<string, string>, string][] = [
      [{ userid: "attacker" }, "userid_mismatch"],
      [{ linkkey: "LK-wrong" }, "linkkey_mismatch"],
      [{ linkval: "LV-wrong" }, "linkval_mismatch"],
      [{ hash: "00" }, "hash_mismatch"],
      [{ responsedate: "2026-11-06" }, "responsedate_invalid"],
    ];
    for (const [over, err] of bads) {
      const s = setup();
      const res = await s.handler(post(await form(over)));
      assertEquals(res.status, 200, err);
      assertEquals(await res.text(), "FAIL", err);
      assertEquals(s.records.length, 1, err);
      assertFalse(s.records[0].verified, err);
      assertEquals(s.records[0].verifyError, err);
      assertEquals(s.applied, [], err);
      assertEquals(s.sent.length, 0, err);
    }
  },
);

Deno.test("비밀값 없음: 기록(secrets_missing) + 200 FAIL, apply 안 부름", async () => {
  const s = setup({ secrets: null });
  const res = await s.handler(post(await form()));
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "FAIL");
  assertEquals(s.records[0].verifyError, "secrets_missing");
  assertEquals(s.applied, []);
});

Deno.test("같은 통보 두 번(두 번째 apply = duplicate): 둘 다 SUCCESS, 메일은 한 번", async () => {
  const s = setup({
    applies: [
      { result: "applied", detail: null, order_id: ORDER, send_mail: true },
      { result: "duplicate", detail: null, order_id: ORDER, send_mail: false },
    ],
  });
  const body = await form();
  assertEquals(await (await s.handler(post(body))).text(), "SUCCESS");
  assertEquals(await (await s.handler(post(body))).text(), "SUCCESS");
  assertEquals(s.applied, [1, 2]);
  assertEquals(s.sent.length, 1);
  assertEquals(s.claims.length, 1);
});

Deno.test("send_mail 이어도 claim 이 null(이미 보냄)이면 메일 안 보냄", async () => {
  const s = setup({ claim: [null] });
  assertEquals(await (await s.handler(post(await form()))).text(), "SUCCESS");
  assertEquals(s.claims.length, 1);
  assertEquals(s.sent.length, 0);
  assertEquals(s.done, []);
});

Deno.test("금액 다름(needs_review, send_mail false): SUCCESS, 메일 없음", async () => {
  const s = setup({
    applies: [
      {
        result: "needs_review",
        detail: "금액 불일치: 통보 9900원 / 주문 99000원",
        order_id: ORDER,
        send_mail: false,
      },
    ],
  });
  const res = await s.handler(post(await form({ price: "9900" })));
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "SUCCESS");
  assertEquals(s.claims.length, 0);
  assertEquals(s.sent.length, 0);
});

Deno.test("취소 통보(applied, send_mail false): SUCCESS, 메일 없음", async () => {
  const s = setup({
    applies: [{ result: "applied", detail: null, order_id: ORDER, send_mail: false }],
  });
  const res = await s.handler(post(await form({ pay_state: "9" })));
  assertEquals(await res.text(), "SUCCESS");
  assertEquals(s.claims.length, 0);
  assertEquals(s.sent.length, 0);
});

Deno.test("모르는 주문(ignored): SUCCESS(재시도 안 시킴), 메일 없음", async () => {
  const s = setup({
    applies: [{ result: "ignored", detail: null, order_id: null, send_mail: false }],
  });
  assertEquals(await (await s.handler(post(await form()))).text(), "SUCCESS");
  assertEquals(s.sent.length, 0);
});

Deno.test("원본 저장 실패: 500 FAIL(페이앱 재시도), apply 안 부름", async () => {
  const s = setup({ recordThrows: true });
  const res = await s.handler(post(await form()));
  assertEquals(res.status, 500);
  assertEquals(await res.text(), "FAIL");
  assertEquals(s.applied, []);
});

Deno.test("apply 예외·apply 결과 error: FAIL", async () => {
  const a = setup({ applyThrows: true });
  const r1 = await a.handler(post(await form()));
  assertEquals(r1.status, 200);
  assertEquals(await r1.text(), "FAIL");
  assertEquals(a.sent.length, 0);
  const b = setup({
    applies: [{ result: "error", detail: "검증 안 됨", order_id: null, send_mail: false }],
  });
  assertEquals(await (await b.handler(post(await form()))).text(), "FAIL");
});

Deno.test("GET·json 본문: 405 FAIL, 기록 안 함", async () => {
  const s = setup();
  const g = await s.handler(new Request(URL_, { method: "GET" }));
  assertEquals(g.status, 405);
  assertEquals(await g.text(), "FAIL");
  const j = await s.handler(post(JSON.stringify({ pay_state: 4 }), "application/json"));
  assertEquals(j.status, 405);
  assertEquals(s.records.length, 0);
});

Deno.test("failurl(?src=fail) 은 source fail 로 기록", async () => {
  const s = setup();
  await s.handler(post(await form(), undefined, `${URL_}?src=fail`));
  assertEquals(s.records[0].source, "fail");
});

Deno.test(
  "RESEND_API_KEY 없음: fetch 안 부르고 mail_done('skipped:메일 미설정'), 응답 SUCCESS",
  async () => {
    const s = setup({ resendKey: "" });
    const res = await s.handler(post(await form()));
    assertEquals(await res.text(), "SUCCESS");
    assertEquals(s.sent.length, 0);
    assertEquals(s.done, [{ orderId: ORDER, status: "skipped:메일 미설정" }]);
  },
);

Deno.test("Resend 실패: mail_done('failed:…'), 응답 SUCCESS", async () => {
  const s = setup({ resendStatus: 422 });
  const res = await s.handler(post(await form()));
  assertEquals(await res.text(), "SUCCESS");
  assertEquals(s.sent.length, 1);
  assertEquals(s.done.length, 1);
  assertMatch(s.done[0].status, /^failed:Resend 422/);
});

Deno.test("defer 가 있으면 메일은 뒤에서(응답 먼저)", async () => {
  const tasks: Promise<unknown>[] = [];
  const s = setup();
  const h = createHandler({
    secrets: () => SECRETS,
    record: () => Promise.resolve(1),
    apply: () =>
      Promise.resolve({ result: "applied", detail: null, order_id: ORDER, send_mail: true }),
    mailClaim: () => Promise.resolve(MAIL_DATA),
    mailDone: () => Promise.resolve(),
    resendKey: () => RESEND_KEY,
    fetch: () => Promise.resolve(new Response("{}")),
    siteUrl: "https://ai-solution.co.kr",
    defer: (t) => tasks.push(t),
    now: () => NOW,
  });
  assertEquals(await (await h(post(await form()))).text(), "SUCCESS");
  assertEquals(tasks.length, 1);
  await Promise.all(tasks);
  assertEquals(s.sent.length, 0); // 다른 setup 과 섞이지 않음
});

// ───────── 메일 본문 ─────────
Deno.test(
  "메일 본문: 주문번호·상품·금액·링크·자료 보내는 법·판매자·환불, 이모지·볼드·미정 값 없음",
  () => {
    const url = `https://ai-solution.co.kr/reels/order/R261106-0001?k=${KEY}`;
    const m = buildReelsMail(MAIL_DATA, url);
    assert(m.subject.includes("R261106-0001"));
    for (const part of [m.text, m.html]) {
      for (const want of [
        "R261106-0001",
        "문의 댓글 쇼츠 1편(30초 기준)",
        "99,000원",
        "200,000원",
        "101,000원",
        "첫 주문 할인",
        "① 자료 보냄",
        "에이아이솔루션",
        "이서연",
        "215-28-82229",
        "2025-서울서초-0732",
        "contact@ai-solution.co.kr",
        "서초중앙로29길 16-6",
        "제작 시작 전: 전액 환불",
        "편당 2회까지 무료",
        "https://open.kakao.com/o/sd29wW8h",
      ]) {
        assert(part.includes(want), want);
      }
      assert(part.includes(KEY));
      assertFalse(part.includes("**"));
      assertFalse(part.includes("[대표님 확인]"));
      assertFalse(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(part), "이모지");
      for (const banned of ["보장", "10배", "매출 "]) assertFalse(part.includes(banned), banned);
      assertFalse(part.includes("01012345678"));
    }
    // 주소는 빌드넷 business.ts 확정값, 전화는 빈 값이라 줄이 없어야 한다
    assert(sellerLines().includes("주소: 서울특별시 서초구 서초중앙로29길 16-6, B동 303호(반포동, 대림빌라)"));
    assertFalse(sellerLines().some((l) => l.startsWith("전화")));
  },
);

Deno.test("메일 본문: 차감 주문·상호 HTML 이스케이프", () => {
  const m = buildReelsMail(
    {
      ...MAIL_DATA,
      plan: 5,
      list_price: 750000,
      discount: 99000,
      amount: 651000,
      is_trial: false,
      method: "ai_only",
      shop_name: "<b>가게</b>",
    },
    "https://ai-solution.co.kr/reels/order/R261106-0002?k=x",
  );
  assert(m.text.includes("체험 차감"));
  assert(m.text.includes("651,000원"));
  assert(m.text.includes("② 촬영 없이 맡김"));
  assertFalse(m.html.includes("<b>가게</b>"));
  assert(m.html.includes("&lt;b&gt;가게&lt;/b&gt;"));
});
