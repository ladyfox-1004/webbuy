// 영업 메일 본문·MIME 시험. 실행: bun test ./tests
import { describe, expect, test } from "bun:test";
import {
  FROM_EMAIL,
  LANDING_IMG,
  LANDING_URL,
  SHORTS_IMG,
  SHORTS_URL,
  buildMime,
  buildRawMessage,
  bytesToBase64,
  encodeHeaderWord,
  maskEmail,
  renderOutreachMail,
  toBase64Url,
} from "../src/lib/outreach/mail";
import { SELLER } from "../src/lib/reels/constants";

const ID = "3f2b8c1e-1234-4abc-9def-0123456789ab";
const base = { id: ID, channel_name: "가나다TV", top_title: "집에서 만드는 김치찌개", email: "Owner@Example.com" };

function decodeB64(s: string): string {
  return Buffer.from(s.replace(/\s+/g, ""), "base64").toString("utf8");
}

/** RFC2047 머리 풀기(시험용) */
function decodeHeader(v: string): string {
  return v
    .replace(/\r\n /g, "")
    .replace(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/g, (_, b) => Buffer.from(b, "base64").toString("utf8"));
}

describe("본문", () => {
  test("제목: (광고) 로 시작, 채널 이름", () => {
    const m = renderOutreachMail(base);
    expect(m.subject).toBe("(광고) 가나다TV 채널에 쇼츠를 더해 보시면 어떨까요");
    expect(m.to).toBe("owner@example.com");
  });

  test("대표 영상 제목이 있으면 그 문장, 없으면 채널 문장", () => {
    const a = renderOutreachMail(base);
    expect(a.text).toContain("가나다TV 채널의 「집에서 만드는 김치찌개」 편을 보고 연락드립니다.");
    expect(a.html).toContain("가나다TV 채널의 「집에서 만드는 김치찌개」 편을 보고 연락드립니다.");
    for (const t of [null, "", "   "]) {
      const b = renderOutreachMail({ ...base, top_title: t });
      expect(b.text).toContain("가나다TV 채널을 보고 연락드립니다.");
      expect(b.text).not.toContain("「」");
      expect(b.html).not.toContain("편을 보고");
    }
  });

  test("카드 2개: 그림 절대 주소·alt·utm 링크, 그림 아래 글 링크도", () => {
    const m = renderOutreachMail(base);
    expect(SHORTS_URL).toBe(
      "https://ai-solution.co.kr/reels?utm_source=email&utm_medium=outreach&utm_campaign=channel_line&utm_content=shorts",
    );
    expect(LANDING_URL).toBe(
      "https://ai-solution.co.kr/?utm_source=email&utm_medium=outreach&utm_campaign=channel_line&utm_content=landing",
    );
    expect(m.html).toContain(`src="${SHORTS_IMG}"`);
    expect(m.html).toContain(`src="${LANDING_IMG}"`);
    expect(SHORTS_IMG).toBe("https://ai-solution.co.kr/mail/shorts.png");
    const imgs = m.html.match(/<img [^>]*>/g) ?? [];
    expect(imgs.length).toBe(2);
    for (const img of imgs) expect(img).toMatch(/alt="[^"]+"/);
    const esc = (u: string) => u.replace(/&/g, "&amp;");
    // 그림 링크 + 「자세히 보기」 글 링크 = 카드마다 2번
    expect(m.html.split(`href="${esc(SHORTS_URL)}"`).length - 1).toBe(2);
    expect(m.html.split(`href="${esc(LANDING_URL)}"`).length - 1).toBe(2);
    expect(m.text).toContain(SHORTS_URL);
    expect(m.text).toContain(LANDING_URL);
    expect(m.text).toContain("문의 댓글이 달리는 쇼츠 제작");
    expect(m.text).toContain("참고 영상의 흐름·훅을 분석해 새로 만들어 드립니다. 1편 30초 기준");
    expect(m.text).toContain("랜딩페이지·홈페이지 제작");
    expect(m.text).toContain("문의가 들어오면 카톡·시트로 바로 알림까지");
    expect(m.text).toContain("상담만 받으셔도 됩니다. 이 메일에 답장 주셔도 됩니다.");
  });

  test("HTML: 표 기반·폭 600·인라인 스타일(style 태그·외부 css 없음)", () => {
    const m = renderOutreachMail(base);
    expect(m.html).toContain('<table role="presentation" width="600"');
    expect(m.html).not.toContain("<style");
    expect(m.html).not.toContain("<link");
    expect(m.html).not.toContain("<script");
  });

  test("바닥글: 판매자 정보(SELLER 그대로)·수신거부 링크(id)", () => {
    const m = renderOutreachMail(base);
    for (const v of [SELLER.name, SELLER.ceo, SELLER.bizNo, SELLER.address, SELLER.email]) {
      expect(m.text).toContain(v);
      expect(m.html).toContain(v);
    }
    expect(m.unsubscribeUrl).toBe(`https://ai-solution.co.kr/unsubscribe?id=${ID}`);
    expect(m.oneClickUrl).toBe(`https://ai-solution.co.kr/api/unsubscribe?id=${ID}`);
    expect(m.html).toContain(`href="${m.unsubscribeUrl}"`);
    expect(m.html).toContain("여기를 눌러 주세요(수신거부)");
    expect(m.text).toContain(m.unsubscribeUrl);
    expect(m.text).toContain("이 메일은 공개된 비즈니스 문의 주소로 보내 드렸습니다.");
  });

  test("문체: 이모지·마크다운 볼드·결과 보장 없음", () => {
    const m = renderOutreachMail(base);
    for (const s of [m.text, m.subject]) {
      expect(s).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(s).not.toContain("**");
      expect(s).not.toMatch(/\d+\s*배|보장|무조건|100%/);
    }
    expect(m.html).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  test("받는 쪽 글은 HTML escape, 머리는 줄바꿈 제거", () => {
    const m = renderOutreachMail({
      ...base,
      channel_name: '<b>나쁜</b>"TV"\r\nBcc: x@y.z',
      top_title: "<script>alert(1)</script>",
    });
    expect(m.html).not.toContain("<b>나쁜</b>");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.subject).not.toMatch(/[\r\n]/);
    const mime = buildMime(m, { boundary: "BB" });
    const head = mime.split("\r\n\r\n")[0];
    expect(head).not.toMatch(/^Bcc:/m);
  });

  test("이상한 주소·빈 채널 이름은 거절", () => {
    expect(() => renderOutreachMail({ ...base, email: "not-an-email" })).toThrow();
    expect(() => renderOutreachMail({ ...base, email: "a@b.com\r\nBcc: c@d.com" })).toThrow();
    expect(() => renderOutreachMail({ ...base, channel_name: "  " })).toThrow();
  });

  test("로그용 가리기: 앞 3글자만", () => {
    expect(maskEmail("owner@example.com")).toBe("own***");
    expect(maskEmail("")).toBe("***");
  });
});

describe("MIME", () => {
  test("base64 는 표준과 같다", () => {
    for (const s of ["", "a", "ab", "abc", "abcd", "한글 에이아이솔루션", "x".repeat(100)]) {
      const b = new TextEncoder().encode(s);
      expect(bytesToBase64(b)).toBe(Buffer.from(b).toString("base64"));
    }
    expect(toBase64Url("??>>~~")).toBe(Buffer.from("??>>~~").toString("base64url"));
  });

  test("RFC2047: ASCII 는 그대로, 한글은 =?UTF-8?B?…?= 조각(75자 이하)으로", () => {
    expect(encodeHeaderWord("hello")).toBe("hello");
    const long = "(광고) 아주아주긴채널이름이들어간경우에도잘라서보낼수있는지확인하는채널 채널에 쇼츠를 더해 보시면 어떨까요";
    const enc = encodeHeaderWord(long);
    for (const w of enc.split("\r\n ")) {
      expect(w).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
      expect(w.length).toBeLessThanOrEqual(75);
    }
    expect(decodeHeader(enc)).toBe(long);
  });

  test("머리: From·To·Subject·List-Unsubscribe(원클릭 https + mailto)·multipart/alternative", () => {
    const m = renderOutreachMail(base);
    const mime = buildMime(m, { boundary: "BOUNDARY123" });
    const [head, ...rest] = mime.split("\r\n\r\n");
    const lines = head.replace(/\r\n /g, " ").split("\r\n");
    const get = (k: string) => lines.find((l) => l.startsWith(`${k}: `))?.slice(k.length + 2) ?? "";
    expect(decodeHeader(get("From"))).toBe(`에이아이솔루션 <${FROM_EMAIL}>`);
    expect(get("From")).toMatch(/^=\?UTF-8\?B\?/);
    expect(get("To")).toBe("<owner@example.com>");
    expect(decodeHeader(get("Subject").replace(/ =\?/g, "=?"))).toBe(m.subject);
    expect(get("MIME-Version")).toBe("1.0");
    expect(get("List-Unsubscribe")).toBe(
      `<https://ai-solution.co.kr/api/unsubscribe?id=${ID}>, <mailto:${FROM_EMAIL}?subject=%EC%88%98%EC%8B%A0%EA%B1%B0%EB%B6%80>`,
    );
    expect(get("List-Unsubscribe-Post")).toBe("List-Unsubscribe=One-Click");
    expect(get("Content-Type")).toBe('multipart/alternative; boundary="BOUNDARY123"');
    // 머리는 ASCII 만
    expect(head).toMatch(/^[\x20-\x7e\r\n]*$/);

    const body = rest.join("\r\n\r\n");
    expect(body).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(body).toContain('Content-Type: text/html; charset="UTF-8"');
    expect(body.trimEnd().endsWith("--BOUNDARY123--")).toBe(true);
    // 글 판·HTML 판 풀어 보기
    const parts = mime.split("--BOUNDARY123").slice(1, 3);
    const decoded = parts.map((p) => decodeB64(p.split("\r\n\r\n")[1]));
    expect(decoded[0]).toBe(m.text.replace(/\n/g, "\r\n"));
    expect(decoded[1]).toBe(m.html.replace(/\n/g, "\r\n"));
    // base64 줄은 76자 이하
    for (const p of parts) for (const l of p.split("\r\n\r\n")[1].split("\r\n")) expect(l.length).toBeLessThanOrEqual(76);
  });

  test("raw 는 base64url(+ / = 없음)이고 풀면 MIME 원문", () => {
    const m = renderOutreachMail(base);
    const raw = buildRawMessage(m, { boundary: "B1" });
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(raw, "base64url").toString("utf8")).toBe(buildMime(m, { boundary: "B1" }));
  });
});
