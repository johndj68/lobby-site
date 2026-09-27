// SERVER-ONLY — nunca importar em 'use client'.
// Utilitários compartilhados de e-mail (Resend) e WhatsApp (Z-API).

import { getResendClient } from '@/lib/resend'

// ── E-mail ────────────────────────────────────────────────────────────────────

export async function sendEmail(
  to: string | string[],
  subject: string,
  html: string,
): Promise<void> {
  let client: ReturnType<typeof getResendClient>
  try {
    client = getResendClient()
  } catch {
    console.warn('[notifications] Resend não configurado — e-mail ignorado.')
    return
  }

  const { error } = await client.resend.emails.send({
    from:    client.from,
    to:      Array.isArray(to) ? to : [to],
    subject,
    html,
  })

  if (error) {
    console.error('[notifications] Falha ao enviar e-mail:', error)
  }
}

// ── WhatsApp (Z-API) ──────────────────────────────────────────────────────────

export async function sendWhatsApp(phones: string[], message: string): Promise<void> {
  const instanceId = process.env.ZAPI_INSTANCE_ID
  const token      = process.env.ZAPI_TOKEN

  if (!instanceId || !token) {
    console.warn('[notifications] WhatsApp não configurado (ZAPI_INSTANCE_ID / ZAPI_TOKEN ausentes).')
    return
  }

  const validPhones = phones
    .map(p => p.replace(/\D/g, ''))
    .filter(p => p.length >= 10)

  if (validPhones.length === 0) return

  const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`

  await Promise.allSettled(
    validPhones.map(phone =>
      fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ phone, message }),
      }).then(async res => {
        if (!res.ok) {
          const body = await res.text().catch(() => '')
          console.error(`[notifications] Z-API erro ${res.status} para ${phone}:`, body)
        }
      }),
    ),
  )
}

// ── Templates ─────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

// Only allow https:// and relative paths — blocks javascript: and data: URIs
function safeUrl(url: string): string {
  if (/^https?:\/\//i.test(url) || url.startsWith('/')) return url
  return '#'
}

export function buildCreditReceiptEmailHtml({
  recipientName,
  credits,
  amountFormatted,
  balance,
  dateFormatted,
  packageName,
  ctaUrl,
}: {
  recipientName:   string
  credits:         number
  amountFormatted: string
  balance:         number
  dateFormatted:   string
  packageName:     string
  ctaUrl:          string
}): string {
  const eName    = escapeHtml(recipientName)
  const ePkg     = escapeHtml(packageName)
  const eUrl     = safeUrl(ctaUrl)

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F8FC;font-family:'Inter',Arial,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E3E7F0;box-shadow:0 4px 24px rgba(11,16,32,0.07);">
    <div style="background:linear-gradient(135deg,#059669,#10B981);padding:24px 32px;">
      <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.65);">LOBBY · Créditos</p>
      <h1 style="margin:6px 0 0;font-size:20px;font-weight:800;color:#fff;">Créditos confirmados!</h1>
      <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,.70);">Pagamento recebido e créditos adicionados</p>
    </div>
    <div style="padding:24px 32px;">
      <p style="margin:0 0 20px;font-size:14px;color:#374151;">Olá, <strong>${eName}</strong>! Seu pagamento foi confirmado.</p>
      <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:12px;padding:16px 20px;margin-bottom:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span style="font-size:12px;color:#6B7280;">Pacote</span>
          <span style="font-size:13px;font-weight:700;color:#111827;">${ePkg}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span style="font-size:12px;color:#6B7280;">Créditos adicionados</span>
          <span style="font-size:20px;font-weight:800;color:#059669;">+${credits}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-top:10px;border-top:1px solid #D1FAE5;">
          <span style="font-size:12px;color:#6B7280;">Valor pago</span>
          <span style="font-size:13px;font-weight:700;color:#374151;">${amountFormatted}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span style="font-size:12px;color:#6B7280;">Saldo atual</span>
          <span style="font-size:14px;font-weight:800;color:#111827;">${balance} créditos</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:12px;color:#6B7280;">Data</span>
          <span style="font-size:12px;color:#374151;">${dateFormatted}</span>
        </div>
      </div>
      <a href="${eUrl}" target="_blank"
        style="display:inline-block;background:linear-gradient(135deg,#059669,#10B981);color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:12px 24px;border-radius:10px;">
        Ver meus créditos
      </a>
    </div>
    <div style="padding:14px 32px;background:#F7F8FC;border-top:1px solid #E3E7F0;">
      <p style="margin:0;font-size:11px;color:#9CA3AF;">LOBBY · Recibo de compra · Guarde este e-mail como comprovante</p>
    </div>
  </div>
</body>
</html>`
}

/**
 * Recibo + acesso de compra de app. "Acesso" aqui é sempre o que o
 * parceiro configurou em app_activation_config (link/e-mail de
 * suporte/instruções) — nunca um código de ativação automático, porque
 * essa parte do sistema (app_activation_codes) nunca foi ligada de
 * verdade (upload de lote valida arquivo mas nunca grava nada — ver
 * app/api/apps/activation/[appId]/upload-codes/route.ts). Quando nenhuma
 * dessas 3 coisas está configurada, o e-mail diz isso explicitamente em
 * vez de fingir que tem instrução.
 */
export function buildAppPurchaseReceiptEmailHtml({
  recipientName,
  appName,
  planName,
  amountFormatted,
  dateFormatted,
  activationLink,
  supportEmail,
  instructions,
  ctaUrl,
}: {
  recipientName:    string
  appName:          string
  planName:         string
  amountFormatted:  string
  dateFormatted:    string
  activationLink?:  string | null
  supportEmail?:    string | null
  instructions?:    string | null
  ctaUrl:           string
}): string {
  const eName  = escapeHtml(recipientName)
  const eApp   = escapeHtml(appName)
  const ePlan  = escapeHtml(planName)
  const eUrl   = safeUrl(ctaUrl)

  const accessBlock = activationLink || supportEmail || instructions
    ? `
      <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:12px;padding:16px 20px;margin-bottom:20px;">
        <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:.05em;">Como acessar</p>
        ${instructions ? `<p style="margin:0 0 8px;font-size:13px;color:#374151;white-space:pre-line;">${escapeHtml(instructions)}</p>` : ''}
        ${activationLink ? `<p style="margin:0 0 6px;font-size:13px;"><a href="${safeUrl(activationLink)}" target="_blank" style="color:#059669;font-weight:700;">${escapeHtml(activationLink)}</a></p>` : ''}
        ${supportEmail ? `<p style="margin:0;font-size:12px;color:#6B7280;">Suporte: ${escapeHtml(supportEmail)}</p>` : ''}
      </div>`
    : `
      <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:12px;padding:16px 20px;margin-bottom:20px;">
        <p style="margin:0;font-size:13px;color:#92400E;">O parceiro ainda não configurou instruções de acesso pra este app. Nossa equipe vai entrar em contato pra liberar manualmente.</p>
      </div>`

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F8FC;font-family:'Inter',Arial,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E3E7F0;box-shadow:0 4px 24px rgba(11,16,32,0.07);">
    <div style="background:linear-gradient(135deg,#005BFF,#7B2CFF);padding:24px 32px;">
      <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.65);">LOBBY · Marketplace</p>
      <h1 style="margin:6px 0 0;font-size:20px;font-weight:800;color:#fff;">Compra confirmada!</h1>
      <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,.70);">Pagamento recebido</p>
    </div>
    <div style="padding:24px 32px;">
      <p style="margin:0 0 20px;font-size:14px;color:#374151;">Olá, <strong>${eName}</strong>! Seu pagamento foi confirmado.</p>
      <div style="background:#F7F8FC;border:1px solid #E3E7F0;border-radius:12px;padding:16px 20px;margin-bottom:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span style="font-size:12px;color:#6B7280;">Aplicativo</span>
          <span style="font-size:13px;font-weight:700;color:#111827;">${eApp}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span style="font-size:12px;color:#6B7280;">Plano</span>
          <span style="font-size:13px;font-weight:700;color:#111827;">${ePlan}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-top:10px;border-top:1px solid #E3E7F0;">
          <span style="font-size:12px;color:#6B7280;">Valor pago</span>
          <span style="font-size:13px;font-weight:700;color:#374151;">${amountFormatted}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:12px;color:#6B7280;">Data</span>
          <span style="font-size:12px;color:#374151;">${dateFormatted}</span>
        </div>
      </div>
      ${accessBlock}
      <a href="${eUrl}" target="_blank"
        style="display:inline-block;background:linear-gradient(135deg,#005BFF,#7B2CFF);color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:12px 24px;border-radius:10px;">
        Ver minhas compras
      </a>
    </div>
    <div style="padding:14px 32px;background:#F7F8FC;border-top:1px solid #E3E7F0;">
      <p style="margin:0;font-size:11px;color:#9CA3AF;">LOBBY · Recibo de compra · Guarde este e-mail como comprovante</p>
    </div>
  </div>
</body>
</html>`
}

export function buildSubscriptionPaymentFailedEmailHtml({
  recipientName,
  planName,
  amountFormatted,
  ctaUrl,
}: {
  recipientName:   string
  planName:        string
  amountFormatted: string
  ctaUrl:          string
}): string {
  const eName = escapeHtml(recipientName)
  const ePlan = escapeHtml(planName)
  const eUrl  = safeUrl(ctaUrl)

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F8FC;font-family:'Inter',Arial,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E3E7F0;box-shadow:0 4px 24px rgba(11,16,32,0.07);">
    <div style="background:linear-gradient(135deg,#DC2626,#F97316);padding:24px 32px;">
      <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.7);">LOBBY · Assinatura</p>
      <h1 style="margin:6px 0 0;font-size:20px;font-weight:800;color:#fff;">Falha na cobrança</h1>
      <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,.75);">Não conseguimos processar o pagamento</p>
    </div>
    <div style="padding:24px 32px;">
      <p style="margin:0 0 16px;font-size:14px;color:#374151;">Olá, <strong>${eName}</strong>. A cobrança de <strong>${amountFormatted}</strong> da sua assinatura <strong>${ePlan}</strong> não foi aprovada.</p>
      <p style="margin:0 0 20px;font-size:13px;color:#6B7280;">O Stripe tenta cobrar de novo automaticamente nos próximos dias. Se o problema persistir, atualize a forma de pagamento pra não perder o acesso.</p>
      <a href="${eUrl}" target="_blank"
        style="display:inline-block;background:linear-gradient(135deg,#DC2626,#F97316);color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:12px 24px;border-radius:10px;">
        Ver minhas assinaturas
      </a>
    </div>
    <div style="padding:14px 32px;background:#F7F8FC;border-top:1px solid #E3E7F0;">
      <p style="margin:0;font-size:11px;color:#9CA3AF;">LOBBY · Aviso automático de cobrança</p>
    </div>
  </div>
</body>
</html>`
}

export function buildMessageEmailHtml({
  recipientName,
  senderLabel,
  messagePreview,
  ctaUrl,
  ctaLabel,
}: {
  recipientName:   string
  senderLabel:     string
  messagePreview:  string
  ctaUrl:          string
  ctaLabel:        string
}): string {
  const preview = messagePreview.length > 280
    ? messagePreview.slice(0, 280) + '…'
    : messagePreview

  const eName    = escapeHtml(recipientName)
  const eSender  = escapeHtml(senderLabel)
  const ePreview = escapeHtml(preview)
  const eLabel   = escapeHtml(ctaLabel)
  const eUrl     = safeUrl(ctaUrl)

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F8FC;font-family:'Inter',Arial,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E3E7F0;box-shadow:0 4px 24px rgba(11,16,32,0.07);">
    <div style="background:linear-gradient(135deg,#005BFF,#7B2CFF);padding:24px 32px;">
      <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.65);">LOBBY · Mensagem</p>
      <h1 style="margin:6px 0 0;font-size:20px;font-weight:800;color:#fff;">Nova mensagem recebida</h1>
      <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,.70);">De: <strong style="color:#fff;">${eSender}</strong></p>
    </div>
    <div style="padding:24px 32px;">
      <p style="margin:0 0 16px;font-size:14px;color:#374151;">Olá, <strong>${eName}</strong>!</p>
      <div style="background:#F7F8FC;border-left:3px solid #005BFF;border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:20px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#9CA3AF;">Mensagem</p>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.65;white-space:pre-wrap;">${ePreview}</p>
      </div>
      <a href="${eUrl}" target="_blank"
        style="display:inline-block;background:linear-gradient(135deg,#005BFF,#7B2CFF);color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:12px 24px;border-radius:10px;">
        ${eLabel}
      </a>
    </div>
    <div style="padding:14px 32px;background:#F7F8FC;border-top:1px solid #E3E7F0;">
      <p style="margin:0;font-size:11px;color:#9CA3AF;">LOBBY · Notificação automática · Não responda este e-mail</p>
    </div>
  </div>
</body>
</html>`
}
