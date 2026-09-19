import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { sendEmail, sendWhatsApp, buildMessageEmailHtml } from '@/lib/notifications'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export async function POST(req: NextRequest) {
  // Auth: only the actual sender can trigger this
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 20 notifications per minute per user
  const rl = checkRateLimit({ key: `notify-msg:${user.id}`, limit: 20, windowMs: 60_000 })
  const limited = rateLimitResponse(rl)
  if (limited) return limited

  const { message_id } = await req.json().catch(() => ({}))
  if (!message_id) {
    return NextResponse.json({ error: 'message_id required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Fetch the message — verify sender matches the authenticated user
  const { data: msg, error: msgErr } = await admin
    .from('messages')
    .select('id, client_id, sender_id, sender_role, content, project_id, technician_id')
    .eq('id', message_id)
    .single()

  if (msgErr || !msg) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  }

  if (msg.sender_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fire-and-forget — don't block the response
  notifyRecipient(msg).catch(err =>
    console.error('[notify/message] Notification error:', err)
  )

  return NextResponse.json({ ok: true })
}

// ── Notification dispatcher ───────────────────────────────────────────────────

interface Message {
  id:          string
  client_id:   string
  sender_id:   string
  sender_role: string
  content:     string
  project_id:  string | null
  technician_id: string | null
}

async function notifyRecipient(msg: Message) {
  const admin = createAdminClient()

  if (msg.sender_role === 'technician') {
    // Notify the client
    const { data: client } = await admin
      .from('profiles')
      .select('full_name, email, phone, notification_prefs')
      .eq('id', msg.client_id)
      .single()

    if (!client?.email) return

    // Respect client notification preferences
    const prefs = (client.notification_prefs ?? {}) as Record<string, boolean>
    const wantsNotif = prefs.projectUpdates !== false // default true

    if (!wantsNotif) return

    const firstName    = client.full_name?.split(' ')[0] ?? 'Cliente'
    const dashboardUrl = `${SITE_URL}/dashboard/mensagens${msg.project_id ? `?project=${msg.project_id}` : ''}`

    const html = buildMessageEmailHtml({
      recipientName:  firstName,
      senderLabel:    'Equipe LOBBY',
      messagePreview: msg.content,
      ctaUrl:         dashboardUrl,
      ctaLabel:       'Ver mensagem no dashboard',
    })

    await Promise.allSettled([
      sendEmail(
        client.email,
        'Nova mensagem da equipe LOBBY',
        html,
      ),
      client.phone
        ? sendWhatsApp(
            [client.phone],
            `💬 *Nova mensagem da equipe LOBBY*\n\n` +
            `_${msg.content.slice(0, 280)}${msg.content.length > 280 ? '…' : ''}_\n\n` +
            `Responda em: ${dashboardUrl}`,
          )
        : Promise.resolve(),
    ])
    return
  }

  if (msg.sender_role === 'client') {
    // Notify leaders (and the project's lead technician if applicable)
    const { data: client } = await admin
      .from('profiles')
      .select('full_name, email')
      .eq('id', msg.client_id)
      .single()

    const clientName = client?.full_name ?? client?.email ?? 'Cliente'

    // Fetch all leader emails
    const { data: leaders } = await admin
      .from('profiles')
      .select('email, phone')
      .eq('role', 'technician')
      .eq('is_leader', true)

    const leaderEmails = (leaders ?? [])
      .map(l => l.email as string | null)
      .filter((e): e is string => Boolean(e))

    if (leaderEmails.length === 0) return

    const adminUrl = `${SITE_URL}/admin/mensagens`

    const html = buildMessageEmailHtml({
      recipientName:  'Equipe',
      senderLabel:    clientName,
      messagePreview: msg.content,
      ctaUrl:         adminUrl,
      ctaLabel:       'Ver mensagem no painel admin',
    })

    // WhatsApp: use LEADER_WHATSAPP_PHONES env OR phones from profiles
    const envPhones = (process.env.LEADER_WHATSAPP_PHONES ?? '')
      .split(',').map(p => p.trim()).filter(Boolean)
    const profilePhones = (leaders ?? [])
      .map(l => (l.phone as string | null))
      .filter((p): p is string => Boolean(p))
    const allPhones = [...new Set([...envPhones, ...profilePhones])]

    await Promise.allSettled([
      sendEmail(
        leaderEmails,
        `[LOBBY] Nova mensagem de ${clientName}`,
        html,
      ),
      allPhones.length > 0
        ? sendWhatsApp(
            allPhones,
            `💬 *Nova mensagem de ${clientName}*\n\n` +
            `_${msg.content.slice(0, 280)}${msg.content.length > 280 ? '…' : ''}_\n\n` +
            `Responder em: ${adminUrl}`,
          )
        : Promise.resolve(),
    ])
  }
}
