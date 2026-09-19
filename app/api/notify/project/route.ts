import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { sendEmail, sendWhatsApp, buildMessageEmailHtml } from '@/lib/notifications'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 10 project notifications per minute per technician
  const rl = checkRateLimit({ key: `notify-proj:${user.id}`, limit: 10, windowMs: 60_000 })
  const limited = rateLimitResponse(rl)
  if (limited) return limited

  const admin = createAdminClient()

  // Reconsulta role/is_leader direto na tabela a cada chamada — não confia
  // em app_metadata.role do JWT (populado pelo trigger sync_profile_role_to_jwt,
  // mas só no PRÓXIMO refresh de sessão). Um técnico rebaixado continua com
  // o claim antigo no token até ele expirar/renovar; DAST confirmou isso
  // (token emitido antes da remoção do papel ainda carregava role=technician
  // no claim) — a checagem de autorização real tem que reconsultar o estado
  // atual, igual toda RLS deste projeto já faz.
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role, is_leader')
    .eq('id', user.id)
    .single()
  if (callerProfile?.role !== 'technician') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { project_id } = await req.json().catch(() => ({}))
  if (!project_id) return NextResponse.json({ error: 'project_id required' }, { status: 400 })

  const { data: proj, error: projErr } = await admin
    .from('client_projects')
    .select('id, title, client_id, client_progress, status, lead_technician_id')
    .eq('id', project_id)
    .single()

  if (projErr || !proj) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Scope: só o técnico líder do projeto ou um líder podem disparar a
  // notificação — antes, qualquer técnico conseguia acionar aviso pra
  // qualquer projeto (mesma checagem já feita por RLS em `messages`).
  if (proj.lead_technician_id !== user.id) {
    if (!callerProfile.is_leader) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  notifyProjectUpdate(proj).catch(err =>
    console.error('[notify/project] Error:', err)
  )

  return NextResponse.json({ ok: true })
}

interface Project {
  id:               string
  title:            string
  client_id:        string
  status:           string
  client_progress:  Record<string, unknown> | null
}

async function notifyProjectUpdate(proj: Project) {
  const admin = createAdminClient()

  const { data: client } = await admin
    .from('profiles')
    .select('full_name, email, phone, notification_prefs')
    .eq('id', proj.client_id)
    .single()

  if (!client?.email) return

  const prefs = (client.notification_prefs ?? {}) as Record<string, boolean>
  if (prefs.projectUpdates === false) return

  const firstName    = client.full_name?.split(' ')[0] ?? 'Cliente'
  const cp           = proj.client_progress ?? {}
  const approvalRequired = !!(cp.approvalRequired) &&
    (!cp.approvalStatus || cp.approvalStatus === 'aguardando')

  const projectUrl = `${SITE_URL}/dashboard/projetos/${proj.id}`

  const isApproval = approvalRequired

  const subject = isApproval
    ? `[LOBBY] Aprovação necessária — ${proj.title}`
    : `[LOBBY] Atualização do seu projeto — ${proj.title}`

  const previewText = isApproval
    ? (cp.approvalMessage as string | undefined) ?? 'Uma etapa do seu projeto precisa da sua aprovação para avançar.'
    : (cp.projectSummary as string | undefined) ?? `Seu projeto "${proj.title}" foi atualizado pela equipe LOBBY.`

  const ctaLabel = isApproval ? 'Revisar e aprovar' : 'Ver atualização no dashboard'

  const html = buildMessageEmailHtml({
    recipientName:  firstName,
    senderLabel:    'Equipe LOBBY',
    messagePreview: previewText,
    ctaUrl:         projectUrl,
    ctaLabel,
  })

  const whatsAppText = isApproval
    ? `⚠️ *Aprovação necessária — ${proj.title}*\n\n` +
      `${previewText.slice(0, 280)}${previewText.length > 280 ? '…' : ''}\n\n` +
      `Acesse: ${projectUrl}`
    : `📊 *Atualização do seu projeto — ${proj.title}*\n\n` +
      `${previewText.slice(0, 280)}${previewText.length > 280 ? '…' : ''}\n\n` +
      `Ver detalhes: ${projectUrl}`

  await Promise.allSettled([
    sendEmail(client.email, subject, html),
    client.phone
      ? sendWhatsApp([client.phone], whatsAppText)
      : Promise.resolve(),
  ])
}
