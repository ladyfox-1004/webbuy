import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "개인정보처리방침 — 에이아이솔루션(AISOLITION)" },
      { name: "description", content: "에이아이솔루션(AISOLITION) 개인정보처리방침" },
    ],
  }),
});

function PrivacyPage() {
  return (
    <div className="min-h-screen px-4 py-24 text-foreground">
      <div className="mx-auto max-w-3xl">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← 홈으로</Link>
        <h1 className="mt-6 font-display text-4xl font-bold">개인정보처리방침</h1>
        <p className="mt-2 text-sm text-muted-foreground">최종 개정일: 2026년 5월 20일</p>

        <div className="mt-10 space-y-8 text-muted-foreground">
          <section>
            <p className="leading-relaxed">
              에이아이솔루션(AISOLITION, 이하 "회사")는 이용자의 개인정보를 중요시하며, 「개인정보 보호법」 등
              관련 법령을 준수하기 위하여 노력하고 있습니다. 본 방침은 회사가 운영하는 사이트를 통해
              수집·이용하는 개인정보의 항목과 처리 목적, 보유 기간 등을 안내합니다.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">1. 수집하는 개인정보 항목</h2>
            <ul className="mt-2 list-disc space-y-1 pl-6 leading-relaxed">
              <li>필수: 이메일 주소, 비밀번호(암호화 저장), 이름</li>
              <li>결제 시: 주문 정보, 결제 수단 정보(결제대행사 PortOne을 통해 처리)</li>
              <li>자동 수집: 접속 IP, 쿠키, 서비스 이용 기록, 기기 정보</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">2. 개인정보의 수집 및 이용목적</h2>
            <ul className="mt-2 list-disc space-y-1 pl-6 leading-relaxed">
              <li>회원 가입 및 본인 확인, 회원관리</li>
              <li>서비스 제공 및 결제, 환불 처리</li>
              <li>고객 문의 응대 및 공지사항 전달</li>
              <li>부정이용 방지 및 서비스 개선</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">3. 개인정보의 보유 및 이용기간</h2>
            <p className="mt-2 leading-relaxed">
              회사는 원칙적으로 개인정보 수집·이용 목적이 달성되면 지체 없이 파기합니다. 단, 관련 법령에
              따라 다음 정보는 명시한 기간 동안 보관됩니다.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6 leading-relaxed">
              <li>계약 또는 청약철회 등에 관한 기록: 5년</li>
              <li>대금결제 및 재화 등의 공급에 관한 기록: 5년</li>
              <li>소비자의 불만 또는 분쟁처리에 관한 기록: 3년</li>
              <li>로그인 기록: 3개월</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">4. 개인정보의 제3자 제공</h2>
            <p className="mt-2 leading-relaxed">
              회사는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다. 다만, 결제 처리를 위해
              결제대행사(PortOne 및 연계 PG사)에 결제 관련 정보가 전달될 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">5. 이용자의 권리</h2>
            <p className="mt-2 leading-relaxed">
              이용자는 언제든지 자신의 개인정보를 조회·수정·삭제·처리정지 요청할 수 있으며, 회원 탈퇴를
              통해 동의를 철회할 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">6. 개인정보 보호책임자</h2>
            <ul className="mt-2 space-y-1 leading-relaxed">
              <li>책임자: 이서연 (대표)</li>
              <li>연락처: 02-533-1134</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
