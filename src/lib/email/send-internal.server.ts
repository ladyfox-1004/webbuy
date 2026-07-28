import * as React from 'react'
import { render } from '@react-email/render'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { TEMPLATES } from '@/lib/email-templates/registry'

const SITE_NAME = 'AISOLUTION'
const SENDER_DOMAIN = 'notify.ai-solution.space'
const FROM_DOMAIN = 'ai-solution.space'

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Server-only: enqueue a transactional email without going through the HTTP
 * send route (which requires a user JWT). Used by webhooks/verifyPayment.
 */
export async function sendInternalTransactionalEmail(opts: {
  templateName: string
  recipientEmail: string
  idempotencyKey?: string
  templateData?: Record<string, any>
}): Promise<{ success: boolean; reason?: string }> {
  const { templateName, recipientEmail } = opts
  const templateData = opts.templateData ?? {}
  const messageId = crypto.randomUUID()
  const idempotencyKey = opts.idempotencyKey ?? messageId
  const entry = TEMPLATES[templateName]
  if (!entry) throw new Error(`Template '${templateName}' not registered`)

  const to = entry.to || recipientEmail
  if (!to) throw new Error('recipientEmail required')
  const normalized = to.toLowerCase()

  // suppression check
  const { data: suppressed } = await supabaseAdmin
    .from('suppressed_emails').select('id').eq('email', normalized).maybeSingle()
  if (suppressed) {
    await supabaseAdmin.from('email_send_log').insert({
      message_id: messageId, template_name: templateName,
      recipient_email: to, status: 'suppressed',
    })
    return { success: false, reason: 'email_suppressed' }
  }

  // unsubscribe token (get-or-create)
  const { data: existing } = await supabaseAdmin
    .from('email_unsubscribe_tokens').select('token, used_at').eq('email', normalized).maybeSingle()
  let unsubscribeToken: string
  if (existing && !existing.used_at) {
    unsubscribeToken = existing.token
  } else {
    unsubscribeToken = generateToken()
    await supabaseAdmin.from('email_unsubscribe_tokens')
      .upsert({ token: unsubscribeToken, email: normalized }, { onConflict: 'email', ignoreDuplicates: true })
    const { data: stored } = await supabaseAdmin
      .from('email_unsubscribe_tokens').select('token').eq('email', normalized).maybeSingle()
    if (stored?.token) unsubscribeToken = stored.token
  }

  const element = React.createElement(entry.component, templateData)
  const html = await render(element)
  const text = await render(element, { plainText: true })
  const subject = typeof entry.subject === 'function' ? entry.subject(templateData) : entry.subject

  await supabaseAdmin.from('email_send_log').insert({
    message_id: messageId, template_name: templateName,
    recipient_email: to, status: 'pending',
  })

  const { error } = await supabaseAdmin.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: messageId,
      to,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject, html, text,
      purpose: 'transactional',
      label: templateName,
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    },
  })
  if (error) {
    await supabaseAdmin.from('email_send_log').insert({
      message_id: messageId, template_name: templateName,
      recipient_email: to, status: 'failed', error_message: error.message,
    })
    throw new Error(`enqueue failed: ${error.message}`)
  }
  return { success: true }
}
