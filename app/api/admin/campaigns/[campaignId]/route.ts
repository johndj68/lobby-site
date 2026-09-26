import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAppAdminEvent } from '@/lib/services/app-publish'

const EDITABLE_FIELDS = ['internal_name', 'space_id', 'package_id', 'starts_at', 'ends_at'] as const
const FIELD_LABEL: Record<string, string> = {
  internal_name: 'nome interno', space_id: 'espaço', package_id: 'pacote', starts_at: 'início', ends_at: 'término',
}

/**
 * Edita a configuração de uma campanha (não o anúncio — isso é
 * /creative). Alterar datas/espaço/pacote aqui NÃO reserva capacidade
 * sozinho; a rota /reserve precisa ser chamada depois pra validar e
 * travar a vaga antes da contratação.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'technician') {
    return NextResponse.json({ error: 'Sem permissão para editar campanhas.' }, { status: 403 })
  }

  const { data: campaign } = await supabase
    .from('sponsored_campaigns')
    .select('id, cancelled_at, updated_at, app_draft_id, application_id')
    .eq('id', campaignId)
    .single()
  if (!campaign) return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404 })
  if (campaign.cancelled_at) {
    return NextResponse.json({ error: 'Esta campanha está cancelada.' }, { status: 409 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })

  if (body.starts_at && body.ends_at && new Date(body.ends_at).getTime() <= new Date(body.starts_at).getTime()) {
    return NextResponse.json({ error: 'O término precisa ser posterior ao início.' }, { status: 400 })
  }
  if ('internal_name' in body && (typeof body.internal_name !== 'string' || !body.internal_name.trim())) {
    return NextResponse.json({ error: 'O nome interno não pode ficar vazio.' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  for (const field of EDITABLE_FIELDS) {
    if (field in body) updates[field] = field === 'internal_name' ? body[field].trim() : body[field]
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo para atualizar.' }, { status: 400 })
  }

  // Concorrência otimista: o cliente manda o updated_at que carregou. Se
  // outro admin já salvou algo nesse meio-tempo, o valor não bate mais e o
  // update abaixo não encontra a linha (0 rows) — nunca sobrescreve
  // silenciosamente uma edição mais recente (seção 17).
  const expectedUpdatedAt = typeof body.expected_updated_at === 'string' ? body.expected_updated_at : null
  let query = supabase.from('sponsored_campaigns')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', campaignId)
  if (expectedUpdatedAt) query = query.eq('updated_at', expectedUpdatedAt)

  const { data: updatedRows, error } = await query.select('id, updated_at')
  if (error) {
    console.error('[campaigns PATCH]', error)
    return NextResponse.json({ error: 'Não foi possível salvar agora — tente novamente.' }, { status: 500 })
  }
  if (!updatedRows || updatedRows.length === 0) {
    const { data: fresh } = await supabase.from('sponsored_campaigns').select('updated_at').eq('id', campaignId).single()
    return NextResponse.json({
      error: 'Outro administrador salvou uma alteração nesta campanha enquanto você editava. Recarregue para ver os dados mais recentes antes de salvar de novo.',
      conflict: true, updatedAt: fresh?.updated_at ?? null,
    }, { status: 409 })
  }

  const changedFields = Object.keys(updates).map(f => FIELD_LABEL[f] ?? f)
  await logAppAdminEvent(supabase, {
    appDraftId: campaign.app_draft_id, applicationId: campaign.application_id, campaignId,
    actorId: user.id, action: 'update_campaign_config',
    reason: `Campos alterados: ${changedFields.join(', ')}.`,
    previousStatus: null, newStatus: null,
  })

  return NextResponse.json({ ok: true, updatedAt: updatedRows[0].updated_at })
}
