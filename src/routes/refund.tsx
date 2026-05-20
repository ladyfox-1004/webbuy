import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/refund")({
  component: RefundPage,
  head: () => ({
    meta: [
      { title: "환불 정책 — 핑크폭스" },
      { name: "description", content: "핑크폭스(PINKFOX) 환불 및 청약철회 정책" },
    ],
  }),
});

function RefundPage() {
  return (
    <div className="min-h-screen px-4 py-24 text-foreground">
      <div className="mx-auto max-w-3xl">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← 홈으로</Link>
        <h1 className="mt-6 font-display text-4xl font-bold">환불 정책</h1>
        <p className="mt-2 text-sm text-muted-foreground">최종 개정일: 2026년 5월 20일</p>

        <div className="mt-10 space-y-8 text-muted-foreground">
          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">1. 서비스 제공 기간</h2>
            <p className="mt-2 leading-relaxed">
              단 건(1회성) 결제 상품의 서비스 제공 기간은 <span className="text-foreground">결제일로부터 최대 3개월</span>입니다.
              해당 기간 내에 보관함을 통해 상품(웹 접속/파일/라이선스 키)을 이용할 수 있으며, 기간 경과 후에는
              접근이 제한될 수 있습니다. 구독형 상품의 경우 별도 약관에 따릅니다.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">2. 청약철회 및 환불 가능 기간</h2>
            <p className="mt-2 leading-relaxed">
              이용자는 「전자상거래 등에서의 소비자보호에 관한 법률」에 따라 결제일로부터 7일 이내에
              청약철회를 요청할 수 있습니다. 단, 디지털 콘텐츠의 경우 콘텐츠를 다운로드하거나 사용한
              시점부터 청약철회가 제한될 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">2. 환불이 제한되는 경우</h2>
            <ul className="mt-2 list-disc space-y-1 pl-6 leading-relaxed">
              <li>이용자가 디지털 콘텐츠의 일부 또는 전부를 사용·다운로드한 경우</li>
              <li>이용자의 책임 있는 사유로 콘텐츠가 멸실 또는 훼손된 경우</li>
              <li>구매 후 7일이 경과한 경우(단, 콘텐츠 하자가 있는 경우 제외)</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">3. 환불 절차</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-6 leading-relaxed">
              <li>고객센터(02-533-1134) 또는 이메일로 환불 요청</li>
              <li>결제 정보 및 환불 사유 확인</li>
              <li>승인 후 영업일 기준 3~5일 이내 결제 수단으로 환불</li>
            </ol>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">4. 환불 방법</h2>
            <p className="mt-2 leading-relaxed">
              결제 수단과 동일한 방법으로 환불되는 것을 원칙으로 합니다. 카드 결제의 경우 카드사 정책에
              따라 영업일 기준 3~7일 이내에 취소가 반영됩니다.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">5. 고객센터</h2>
            <ul className="mt-2 space-y-1 leading-relaxed">
              <li>전화: 02-533-1134 (평일 10:00~18:00, 주말 및 공휴일 제외)</li>
              <li>이메일: nancoco0705@gmail.com</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
