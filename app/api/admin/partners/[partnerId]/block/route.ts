import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAppAdminEvent } from '@/lib/services/app-publish'

/**
 * Bloqueia novos cadastros de app para um parceiro (profiles.
 * marketplace_new_apps_blocked). NÃO suspende apps já publicados, não mexe
 * em vendas nem em acesso da equipe — só impede criar um app_draft novo
 * (aplicado em /api/apps/drafts, o único ponto real de criação hoje).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ partnerId: string }> }
) {
  const { partnerId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: actorProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (actorProfile?.role !== 'technician') {
    return NextResponse.json({ error: 'Sem permissão para restringir parceiros.' }, { status: 403 })
  }

  const { reason } = await req.json().catch(() => ({ reason: null }))
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return NextResponse.json({ error: 'Informe o motivo do bloqueio.' }, { status: 400 })
  }

  const { data: partner } = await supabase
    .from('profiles')
    .select('id, full_name, company_name, marketplace_new_apps_blocked')
    .eq('id', partnerId)
    .single()
  if (!partner) return NextResponse.json({ error: 'Parceiro não encontrado.' }, { status: 404 })
  if (partner.marketplace_new_apps_blocked) {
    return NextResponse.json({ error: 'Este parceiro já está com novos cadastros bloqueados.' }, { status: 409 })
  }

  const { data: updated, error } = await supabase
    .from('profiles')
    .update({
      marketplace_new_apps_blocked: true,
      marketplace_blocked_at: new Date().toISOString(),
      marketplace_blocked_by: user.id,
      marketplace_blocked_reason: reason.trim(),
    })
    .eq('id', partnerId)
    .eq('marketplace_new_apps_blocked', false) // guard de concorrência
    .select('id')
    .single()

  if (error || !updated) {
    return NextResponse.json({ error: 'Não foi possível bloquear agora — tente novamente.' }, { status: 409 })
  }

  await logAppAdminEvent(supabase, {
    partnerId,
    actorId: user.id,
    action: 'block_new_apps',
    reason: reason.trim(),
    previousStatus: 'permitido',
    newStatus: 'bloqueado',
  })

  return NextResponse.json({ ok: true, partner: partner.company_name || partner.full_name })
}
