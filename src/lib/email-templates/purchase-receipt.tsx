import React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  productTitle?: string
  amount?: number
  paymentId?: string
  libraryUrl?: string
  deliveryUrl?: string | null
  downloadUrl?: string | null
  siteName?: string
}

const Email = ({
  productTitle = '구매 상품',
  amount = 0,
  paymentId = '-',
  libraryUrl = 'https://ai-solution.space/me',
  deliveryUrl = null,
  downloadUrl = null,
  siteName = 'AISOLUTION',
}: Props) => (
  <Html lang="ko" dir="ltr">
    <Head />
    <Preview>{productTitle} 결제가 완료되었어요.</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>결제가 완료되었어요 🎉</Heading>
        <Text style={p}>
          {siteName}에서 <strong>{productTitle}</strong> 구매가 정상적으로
          완료되었습니다. 아래 링크에서 바로 이용하실 수 있어요.
        </Text>

        <Section style={card}>
          <Row k="상품" v={productTitle} />
          <Row k="결제금액" v={`₩${amount.toLocaleString('ko-KR')}`} />
          <Row k="결제번호" v={paymentId} mono />
        </Section>

        {(deliveryUrl || downloadUrl) && (
          <Section style={{ textAlign: 'center' as const, margin: '28px 0' }}>
            {deliveryUrl && (
              <Button href={deliveryUrl} style={btnPrimary}>
                제품 바로가기
              </Button>
            )}
            {downloadUrl && (
              <div style={{ marginTop: 12 }}>
                <Button href={downloadUrl} style={btnGhost}>
                  파일 다운로드
                </Button>
                <Text style={muted}>다운로드 링크는 24시간 동안 유효해요.</Text>
              </div>
            )}
          </Section>
        )}

        <Section style={{ textAlign: 'center' as const, margin: '20px 0' }}>
          <Button href={libraryUrl} style={btnGhost}>
            내 보관함 열기
          </Button>
        </Section>

        <Hr style={hr} />
        <Text style={muted}>
          문의: <Link href="mailto:nancoco0705@gmail.com" style={link}>nancoco0705@gmail.com</Link>
          {' · '}전화: 02-533-1134
        </Text>
        <Text style={muted}>
          환불 정책은{' '}
          <Link href="https://ai-solution.space/refund" style={link}>여기</Link>에서
          확인하실 수 있습니다.
        </Text>
      </Container>
    </Body>
  </Html>
)

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div style={rowWrap}>
      <span style={rowK}>{k}</span>
      <span style={{ ...rowV, fontFamily: mono ? 'ui-monospace, Menlo, monospace' : undefined }}>
        {v}
      </span>
    </div>
  )
}

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `[AISOLUTION] ${data?.productTitle ?? '구매'} 결제 완료 안내`,
  displayName: '구매 완료 안내',
  previewData: {
    productTitle: '부동산 홈페이지 기획서',
    amount: 129000,
    paymentId: 'pay-abc-123',
    libraryUrl: 'https://ai-solution.space/me',
    deliveryUrl: 'https://ai-solution.space/me',
    downloadUrl: 'https://example.com/download',
    siteName: 'AISOLUTION',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif' }
const container = { padding: '32px 24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: '0 0 16px' }
const p = { fontSize: '15px', color: '#334155', lineHeight: '1.6', margin: '0 0 20px' }
const card = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px 20px', margin: '8px 0 20px' }
const rowWrap = { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e2e8f0', fontSize: '13px' }
const rowK = { color: '#64748b' }
const rowV = { color: '#0f172a', fontWeight: 500 }
const btnPrimary = { background: '#4f46e5', color: '#ffffff', padding: '12px 22px', borderRadius: '999px', fontSize: '14px', fontWeight: 600, textDecoration: 'none' as const }
const btnGhost = { background: '#ffffff', color: '#0f172a', padding: '11px 20px', borderRadius: '999px', border: '1px solid #cbd5e1', fontSize: '14px', fontWeight: 500, textDecoration: 'none' as const }
const hr = { borderColor: '#e2e8f0', margin: '24px 0' }
const muted = { fontSize: '12px', color: '#64748b', margin: '6px 0', textAlign: 'center' as const }
const link = { color: '#4f46e5', textDecoration: 'underline' }
