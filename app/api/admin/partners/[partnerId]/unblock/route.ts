import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAppAdminEvent } from '@/lib/services/app-publish'

/**
 * Desbloqueia novos cadastros de app. Não reativa apps suspensos
 * automaticamente (seção 17) — isso é uma ação própria em
 * /admin/marketplace/aplicativos/[appId].
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
    return NextResponse.json({ error: 'Informe o motivo do desbloqueio.' }, { status: 400 })
  }

  const { data: partner } = await supabase
    .from('profiles')
    .select('id, full_name, company_name, marketplace_new_apps_blocked')
    .eq('id', partnerId)
    .single()
  if (!partner) return NextResponse.json({ error: 'Parceiro não encontrado.' }, { status: 404 })
  if (!partner.marketplace_new_apps_blocked) {
    return NextResponse.json({ error: 'Este parceiro não está bloqueado.' }, { status: 409 })
  }

  const { data: updated, error } = await supabase
    .from('profiles')
    .update({
      marketplace_new_apps_blocked: false,
      marketplace_blocked_at: null,
      marketplace_blocked_by: null,
      marketplace_blocked_reason: null,
    })
    .eq('id', partnerId)
    .eq('marketplace_new_apps_blocked', true) // guard de concorrência
    .select('id')
    .single()

  if (error || !updated) {
    return NextResponse.json({ error: 'Não foi possível desbloquear agora — tente novamente.' }, { status: 409 })
  }

  await logAppAdminEvent(supabase, {
    partnerId,
    actorId: user.id,
    action: 'unblock_new_apps',
    reason: reason.trim(),
    previousStatus: 'bloqueado',
    newStatus: 'permitido',
  })

  return NextResponse.json({ ok: true, partner: partner.company_name || partner.full_name })
}
