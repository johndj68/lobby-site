'use server'

import { headers } from 'next/headers'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { getResendClient } from '@/lib/resend'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

interface ContactInput {
  name:          string
  email:         string
  phone:         string
  company:       string
  document:      string
  interest_area: string
  message:       string
}

type ActionResult = { success: true } | { success: false; error: string }

/**
 * Salva a solicitação de contato e notifica os técnicos líderes via e-mail e WhatsApp.
 * Chamada pelo ContactForm (client component) como Server Action.
 */
export async function submitContact(input: ContactInput): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient()

  // Se o cliente está logado, atualiza o perfil com os dados mais recentes
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const docDigits = input.document.replace(/\D/g, '')
    await supabase.from('profiles').upsert(
      {
        id:           user.id,
        full_name:    input.name,
        company_name: input.company,
        phone:        input.phone,
        ...(docDigits ? { document: docDigits } : {}),
      },
      { onConflict: 'id' },
    )
  }

  // Rate limit por IP: o limite por e-mail abaixo é trivialmente contornável
  // trocando o campo email a cada envio (form público, sem autenticação) —
  // este é o backstop que não depende de nenhum campo controlado pelo atacante.
  const ip = getClientIp({ headers: await headers() })
  const ipLimit = checkRateLimit({ key: `contact-ip:${ip}`, limit: 5, windowMs: 10 * 60_000 })
  if (!ipLimit.allowed) {
    return { success: false, error: 'Muitas solicitações em pouco tempo. Aguarde alguns minutos e tente novamente.' }
  }

  // Rate limit: no máx. 3 envios por email em 10 minutos
  const admin = createAdminClient()
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { count } = await admin
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('email', input.email)
    .gte('created_at', since)
  if ((count ?? 0) >= 3) {
    return { success: false, error: 'Muitas solicitações em pouco tempo. Aguarde alguns minutos e tente novamente.' }
  }

  // Insere o contato no banco
  const { error: dbError } = await supabase.from('contacts').insert({
    name:          input.name,
    email:         input.email,
    phone:         input.phone,
    company:       input.company,
    interest_area: input.interest_area || null,
    message:       input.message,
  })
  if (dbError) {
    console.error('submitContact: DB error', dbError)
    return { success: false, error: 'Erro ao salvar solicitação. Tente novamente.' }
  }

  // Dispara notificações sem bloquear a resposta ao cliente
  notifyLeaders(input).catch(err => console.error('submitContact: notify error', err))
  sendConfirmationEmail(input).catch(err => console.error('submitContact: confirm email error', err))

  return { success: true }
}

/* ── Notificações ─────────────────────────────────────────────────── */

async function notifyLeaders(contact: ContactInput) {
  // Admin client ignora RLS para buscar todos os líderes
  const admin = createAdminClient()
  const { data: leaders } = await admin
    .from('profiles')
    .select('email, full_name')
    .eq('role', 'technician')
    .eq('is_leader', true)

  const leaderEmails = (leaders ?? [])
    .map(l => l.email as string | null)
    .filter((e): e is string => Boolean(e))

  await Promise.allSettled([
    leaderEmails.length > 0 ? sendEmailToLeaders(contact, leaderEmails) : Promise.resolve(),
    sendWhatsAppToLeaders(contact),
  ])
}

/* ── E-mail ───────────────────────────────────────────────────────── */

async function sendEmailToLeaders(contact: ContactInput, to: string[]) {
  let resend: ReturnType<typeof getResendClient>['resend']
  let from: string
  try {
    ({ resend, from } = getResendClient())
  } catch {
    console.warn('submitContact: Resend não configurado — e-mail ignorado.')
    return
  }

  const areaLabel = escapeHtml(contact.interest_area || 'Não informada')
  const adminUrl  = process.env.NEXT_PUBLIC_SITE_URL
    ? `${process.env.NEXT_PUBLIC_SITE_URL}/admin/solicitacoes`
    : '/admin/solicitacoes'
  const waLink = `https://wa.me/55${contact.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
    `Olá ${contact.name}, vi sua solicitação sobre ${contact.interest_area || 'Não informada'} e gostaria de conversar!`,
  )}`
  const mailLink = `mailto:${encodeURIComponent(contact.email)}?subject=${encodeURIComponent(
    `Re: Solicitação LOBBY — ${contact.interest_area || 'Não informada'}`,
  )}&body=${encodeURIComponent(`Olá ${contact.name},\n\n`)}`

  const eName    = escapeHtml(contact.name)
  const eEmail   = escapeHtml(contact.email)
  const ePhone   = escapeHtml(contact.phone)
  const eCompany = escapeHtml(contact.company)
  const eMessage = escapeHtml(contact.message)

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nova solicitação LOBBY</title></head>
<body style="margin:0;padding:0;background:#F7F8FC;font-family:'Inter',Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E3E7F0;box-shadow:0 4px 24px rgba(11,16,32,0.07);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#005BFF,#7B2CFF);padding:28px 32px;">
      <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.65);">LOBBY · Plataforma</p>
      <h1 style="margin:6px 0 0;font-size:22px;font-weight:800;color:#fff;line-height:1.2;">Nova solicitação recebida</h1>
      <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,.70);">Área: <strong style="color:#fff;">${areaLabel}</strong></p>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px;">

      <!-- Client info table -->
      <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:20px;">
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #F0F3FA;width:40%;">
            <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#9CA3AF;">Nome</p>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #F0F3FA;">
            <p style="margin:0;font-size:14px;font-weight:600;color:#0B1020;">${eName}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #F0F3FA;">
            <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#9CA3AF;">E-mail</p>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #F0F3FA;">
            <a href="${mailLink}" style="font-size:14px;color:#005BFF;text-decoration:none;">${eEmail}</a>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #F0F3FA;">
            <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#9CA3AF;">Telefone</p>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #F0F3FA;">
            <a href="tel:${ePhone}" style="font-size:14px;color:#0B1020;text-decoration:none;">${ePhone}</a>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 0;">
            <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#9CA3AF;">Empresa</p>
          </td>
          <td style="padding:10px 0;">
            <p style="margin:0;font-size:14px;color:#0B1020;">${eCompany}</p>
          </td>
        </tr>
      </table>

      <!-- Message -->
      <div style="background:#F7F8FC;border-left:3px solid #005BFF;border-radius:0 8px 8px 0;padding:16px 18px;margin-bottom:24px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#9CA3AF;">Mensagem</p>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.65;white-space:pre-wrap;">${eMessage}</p>
      </div>

      <!-- CTA buttons -->
      <p style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9CA3AF;">Responder agora</p>
      <table cellspacing="0" cellpadding="0" style="margin-bottom:24px;">
        <tr>
          <td style="padding-right:10px;">
            <a href="${waLink}" target="_blank"
              style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:11px 20px;border-radius:10px;">
              WhatsApp
            </a>
          </td>
          <td style="padding-right:10px;">
            <a href="${mailLink}"
              style="display:inline-block;background:#005BFF;color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:11px 20px;border-radius:10px;">
              E-mail direto
            </a>
          </td>
          <td>
            <a href="${adminUrl}" target="_blank"
              style="display:inline-block;background:#F7F8FC;border:1px solid #E3E7F0;color:#374151;text-decoration:none;font-size:13px;font-weight:700;padding:11px 20px;border-radius:10px;">
              Ver no painel
            </a>
          </td>
        </tr>
      </table>
    </div>

    <!-- Footer -->
    <div style="padding:16px 32px;background:#F7F8FC;border-top:1px solid #E3E7F0;">
      <p style="margin:0;font-size:11px;color:#9CA3AF;">LOBBY · Notificação automática · Não responda este e-mail</p>
    </div>
  </div>
</body>
</html>`

  const { error } = await resend.emails.send({
    from,
    to,
    subject: `[LOBBY] Nova solicitação de ${contact.name} — ${areaLabel}`,
    html,
  })
  if (error) {
    console.error('submitContact: falha ao enviar e-mail para líderes', error)
  }
}

/* ── Confirmation e-mail to submitter ────────────────────────────── */

async function sendConfirmationEmail(contact: ContactInput) {
  let resend: ReturnType<typeof getResendClient>['resend']
  let from: string
  try {
    ({ resend, from } = getResendClient())
  } catch {
    console.warn('submitContact: Resend não configurado — confirmation email ignorado.')
    return
  }

  const firstName  = escapeHtml(contact.name.split(' ')[0])
  const areaLabel  = escapeHtml(contact.interest_area || 'Geral')
  const eMessage   = escapeHtml(
    contact.message.slice(0, 400) + (contact.message.length > 400 ? '…' : ''),
  )

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recebemos sua mensagem</title></head>
<body style="margin:0;padding:0;background:#F7F8FC;font-family:'Inter',Arial,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E3E7F0;box-shadow:0 4px 24px rgba(11,16,32,0.07);">
    <div style="background:linear-gradient(135deg,#005BFF,#7B2CFF);padding:24px 32px;">
      <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.65);">LOBBY · Solicitação recebida</p>
      <h1 style="margin:6px 0 0;font-size:20px;font-weight:800;color:#fff;">Recebemos sua mensagem!</h1>
    </div>
    <div style="padding:24px 32px;">
      <p style="margin:0 0 16px;font-size:14px;color:#374151;">Olá, <strong>${firstName}</strong>!</p>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.65;">
        Sua solicitação sobre <strong>${areaLabel}</strong> foi registrada com sucesso. Nossa equipe entrará em contato em breve para dar continuidade ao seu projeto.
      </p>
      <div style="background:#F7F8FC;border-left:3px solid #005BFF;border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:20px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#9CA3AF;">Sua mensagem</p>
        <p style="margin:0;font-size:13px;color:#374151;line-height:1.65;white-space:pre-wrap;">${eMessage}</p>
      </div>
      <p style="margin:0 0 20px;font-size:13px;color:#6B7280;line-height:1.6;">
        Caso precise falar conosco antes, acesse o chat da plataforma ou responda este e-mail.
      </p>
    </div>
    <div style="padding:14px 32px;background:#F7F8FC;border-top:1px solid #E3E7F0;">
      <p style="margin:0;font-size:11px;color:#9CA3AF;">LOBBY · Notificação automática</p>
    </div>
  </div>
</body>
</html>`

  const { error } = await resend.emails.send({
    from,
    to:      [contact.email],
    subject: `Recebemos sua solicitação — LOBBY`,
    html,
  })
  if (error) {
    console.error('submitContact: falha ao enviar confirmation email', error)
  }
}

/* ── WhatsApp (Z-API) ─────────────────────────────────────────────── */
// Configurar no .env.local:
//   ZAPI_INSTANCE_ID=sua_instancia
//   ZAPI_TOKEN=seu_token
//   LEADER_WHATSAPP_PHONES=5511999999999,5511888888888  ← números dos líderes

async function sendWhatsAppToLeaders(contact: ContactInput) {
  const instanceId = process.env.ZAPI_INSTANCE_ID
  const token      = process.env.ZAPI_TOKEN
  const phonesEnv  = process.env.LEADER_WHATSAPP_PHONES

  if (!instanceId || !token || !phonesEnv) {
    console.warn('submitContact: WhatsApp não configurado (ZAPI_INSTANCE_ID / ZAPI_TOKEN / LEADER_WHATSAPP_PHONES ausentes).')
    return
  }

  const phones = phonesEnv.split(',').map(p => p.trim()).filter(Boolean)
  if (phones.length === 0) return

  const areaLabel = contact.interest_area || 'Não informada'
  const waLink = `https://wa.me/55${contact.phone.replace(/\D/g, '')}`

  const message =
    `🔔 *Nova solicitação LOBBY*\n\n` +
    `👤 *${contact.name}*\n` +
    `🏢 ${contact.company}\n` +
    `📱 ${contact.phone}\n` +
    `📧 ${contact.email}\n` +
    `🎯 Área: *${areaLabel}*\n\n` +
    `💬 _${contact.message.slice(0, 300)}${contact.message.length > 300 ? '…' : ''}_\n\n` +
    `Responder no WhatsApp: ${waLink}`

  const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`

  await Promise.allSettled(
    phones.map(phone =>
      fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ phone, message }),
      }).then(async res => {
        if (!res.ok) {
          const body = await res.text().catch(() => '')
          console.error(`submitContact: Z-API erro ${res.status} para ${phone}`, body)
        }
      }),
    ),
  )
}
