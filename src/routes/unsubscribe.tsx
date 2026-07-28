import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { CheckCircle2, XCircle, Loader2, ArrowLeft } from 'lucide-react'

export const Route = createFileRoute('/unsubscribe')({
  validateSearch: (s) => z.object({ token: z.string().optional() }).parse(s),
  component: UnsubPage,
  head: () => ({ meta: [{ title: '수신 거부 — AISOLUTION' }] }),
})

type State = 'loading' | 'valid' | 'invalid' | 'already' | 'success' | 'error'

function UnsubPage() {
  const { token } = Route.useSearch()
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
