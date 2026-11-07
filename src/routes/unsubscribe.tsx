import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { CheckCircle2, XCircle, Loader2, ArrowLeft } from 'lucide-react'

// /unsubscribe — 메일 수신거부 화면.
//   ?id=<uuid>   영업 메일(「채널 라인」) — 단추를 눌러야 POST /api/unsubscribe 로 처리한다(src/routes/api/unsubscribe.ts).
//                🚨 링크를 여는 것만으로 처리하지 마라(메일 보안 검사기가 링크를 미리 연다).
//                🚨 없는 id 도 같은 결과 문구(존재 여부를 보여 주지 않는다).
//   ?token=…     예전 알림 메일(email_unsubscribe_tokens) — /email/unsubscribe
// 🚨 head 에는 title·robots 만. canonical 넣지 마라(루트 head 와 합쳐진다).
export const Route = createFileRoute('/unsubscribe')({
  validateSearch: (s) => z.object({ token: z.string().optional(), id: z.string().max(64).optional() }).parse(s),
  component: UnsubPage,
  head: () => ({ meta: [{ title: '수신 거부 — AISOLUTION' }, { name: 'robots', content: 'noindex' }] }),
})

type State = 'loading' | 'valid' | 'invalid' | 'already' | 'success' | 'error'

function UnsubPage() {
  const { token, id } = Route.useSearch()
  if (id !== undefined && !token) return <OutreachUnsub id={id} />
  return <TokenUnsub token={token} />
}

type OutreachState = 'idle' | 'sending' | 'done' | 'error'

/** 영업 메일 수신거부 — 단추 하나. 결과 문구는 id 가 있든 없든 같다. */
function OutreachUnsub({ id }: { id: string }) {
  const [state, setState] = useState<OutreachState>('idle')

  async function confirm() {
    setState('sending')
    try {
      const r = await fetch('/api/unsubscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setState(r.ok ? 'done' : 'error')
    } catch { setState('error') }
  }

  return (
    <div className="min-h-screen px-4 py-20">
      <div className="mx-auto mt-12 max-w-md">
        <Link to="/" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> 홈
        </Link>
        <div className="glass rounded-3xl p-10 text-center">
          {state === 'done' ? (
            <>
              <CheckCircle2 className="mx-auto h-12 w-12 text-primary-glow" />
              <h1 className="mt-4 font-display text-2xl font-bold">수신거부 완료</h1>
              <p className="mt-2 text-sm text-muted-foreground">더 이상 보내지 않겠습니다.</p>
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl font-bold">수신거부</h1>
              <p className="mt-3 text-sm text-muted-foreground">
                에이아이솔루션의 안내 메일을 더 받지 않으시려면 아래 단추를 눌러 주세요.
              </p>
              <button
                type="button"
                onClick={confirm}
                disabled={state === 'sending'}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-6 py-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {state === 'sending' && <Loader2 className="h-4 w-4 animate-spin" />} 수신거부
              </button>
              {state === 'error' && (
                <p className="mt-4 text-sm text-destructive">잠시 뒤 다시 눌러 주세요. 이 메일에 「수신거부」라고 답장 주셔도 됩니다.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function TokenUnsub({ token }: { token?: string }) {
  const [state, setState] = useState<State>('loading')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) { setState('invalid'); return }
    fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.valid) setState('valid')
        else if (d.reason === 'already_unsubscribed') setState('already')
        else setState('invalid')
      })
      .catch(() => setState('error'))
  }, [token])

  async function confirm() {
    if (!token) return
    setSubmitting(true)
    try {
      const r = await fetch('/email/unsubscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const d = await r.json()
      if (d.success) setState('success')
      else if (d.reason === 'already_unsubscribed') setState('already')
      else setState('error')
    } catch { setState('error') } finally { setSubmitting(false) }
  }

  return (
    <div className="min-h-screen px-4 py-20">
      <div className="mx-auto mt-12 max-w-md">
        <Link to="/" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> 홈
        </Link>
        <div className="glass rounded-3xl p-10 text-center">
          {state === 'loading' && <Loader2 className="mx-auto h-10 w-10 animate-spin text-muted-foreground" />}
          {state === 'valid' && (
            <>
              <h1 className="font-display text-2xl font-bold">수신 거부 확인</h1>
              <p className="mt-3 text-sm text-muted-foreground">앞으로 AISOLUTION의 이메일을 받지 않으시겠어요?</p>
              <button
                onClick={confirm}
                disabled={submitting}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-6 py-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />} 수신 거부하기
              </button>
            </>
          )}
          {state === 'success' && (
            <>
              <CheckCircle2 className="mx-auto h-12 w-12 text-primary-glow" />
              <h1 className="mt-4 font-display text-2xl font-bold">수신 거부 완료</h1>
              <p className="mt-2 text-sm text-muted-foreground">더 이상 마케팅/알림 이메일을 보내지 않아요.</p>
            </>
          )}
          {state === 'already' && (
            <>
              <CheckCircle2 className="mx-auto h-12 w-12 text-muted-foreground" />
              <h1 className="mt-4 font-display text-2xl font-bold">이미 수신 거부됨</h1>
              <p className="mt-2 text-sm text-muted-foreground">이 이메일은 이미 수신 거부 처리되었습니다.</p>
            </>
          )}
          {(state === 'invalid' || state === 'error') && (
            <>
              <XCircle className="mx-auto h-12 w-12 text-destructive" />
              <h1 className="mt-4 font-display text-2xl font-bold">유효하지 않은 링크</h1>
              <p className="mt-2 text-sm text-muted-foreground">링크가 만료되었거나 잘못되었습니다.</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
