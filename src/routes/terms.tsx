import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  head: () => ({
    meta: [
      { title: "이용약관 — 핑크폭스" },
      { name: "description", content: "핑크폭스(PINKFOX) 서비스 이용약관" },
    ],
  }),
});

function TermsPage() {
  return (
    <div className="min-h-screen px-4 py-24 text-foreground">
      <div className="mx-auto max-w-3xl">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← 홈으로</Link>
        <h1 className="mt-6 font-display text-4xl font-bold">이용약관</h1>
        <p className="mt-2 text-sm text-muted-foreground">최종 개정일: 2026년 5월 20일</p>

        <div className="prose prose-invert mt-10 space-y-8 text-muted-foreground">
          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">제1조 (목적)</h2>
            <p className="mt-2 leading-relaxed">
              본 약관은 핑크폭스(PINKFOX, 이하 "회사")가 운영하는 웹사이트(이하 "사이트")에서 제공하는
              디지털 콘텐츠 및 관련 서비스(이하 "서비스")의 이용과 관련하여 회사와 이용자의 권리, 의무,
              책임사항 및 기타 필요한 사항을 규정함을 목적으로 합니다.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">제2조 (용어의 정의)</h2>
            <ul className="mt-2 list-disc space-y-1 pl-6 leading-relaxed">
              <li>"이용자"란 본 약관에 따라 회사가 제공하는 서비스를 이용하는 회원 및 비회원을 말합니다.</li>
              <li>"회원"이란 회사에 개인정보를 제공하여 회원등록을 한 자로서, 서비스를 지속적으로 이용할 수 있는 자를 말합니다.</li>
              <li>"콘텐츠"란 회사가 사이트를 통해 제공하는 디지털 형태의 모든 자료를 말합니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">제3조 (약관의 효력 및 변경)</h2>
            <p className="mt-2 leading-relaxed">
              본 약관은 사이트에 게시함으로써 효력이 발생합니다. 회사는 필요한 경우 관련 법령을 위배하지
              않는 범위에서 본 약관을 변경할 수 있으며, 변경된 약관은 사이트에 공지함으로써 효력이
              발생합니다.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">제4조 (서비스의 제공)</h2>
            <p className="mt-2 leading-relaxed">
              회사는 이용자에게 다음과 같은 서비스를 제공합니다.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6 leading-relaxed">
              <li>디지털 콘텐츠 및 소프트웨어 판매</li>
              <li>결제 및 주문 관리 서비스</li>
              <li>기타 회사가 정하는 서비스</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">제5조 (이용자의 의무)</h2>
            <p className="mt-2 leading-relaxed">
              이용자는 관련 법령, 본 약관의 규정, 이용안내 및 사이트에 공지한 주의사항을 준수하여야 하며,
              회사의 업무에 방해되는 행위를 하여서는 안 됩니다.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">제6조 (저작권)</h2>
            <p className="mt-2 leading-relaxed">
              사이트에서 제공하는 모든 콘텐츠에 대한 저작권은 회사 또는 원저작자에게 귀속됩니다. 이용자는
              회사의 사전 동의 없이 콘텐츠를 복제, 전송, 출판, 배포할 수 없습니다.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">제7조 (책임의 제한)</h2>
            <p className="mt-2 leading-relaxed">
              회사는 천재지변, 전쟁, 기간통신 사업자의 서비스 중지 등 불가항력적인 사유로 서비스를 제공할
              수 없는 경우에는 서비스 제공에 대한 책임이 면제됩니다.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">제8조 (분쟁의 해결)</h2>
            <p className="mt-2 leading-relaxed">
              본 약관과 관련하여 발생한 분쟁에 대하여는 대한민국 법령을 적용하며, 회사의 본사 소재지 관할
              법원을 합의관할 법원으로 합니다.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
