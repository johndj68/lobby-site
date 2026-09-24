import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const EDITABLE_FIELDS = ['internal_name', 'package_id', 'starts_at', 'ends_at'] as const

/** Edita a configuração da própria campanha rascunho (não o anúncio). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: campaign } = await supabase
    .from('sponsored_campaigns')
    .select('id, review_status, cancelled_at, app_drafts(created_by)')
    .eq('id', campaignId)
    .single()
  if (!campaign) return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404 })
  const draftRef = Array.isArray(campaign.app_drafts) ? campaign.app_drafts[0] : (campaign.app_drafts as { created_by: string } | null)
  if (!draftRef || draftRef.created_by !== user.id) {
    return NextResponse.json({ error: 'Esta campanha não pertence a você.' }, { status: 403 })
  }
  if (campaign.cancelled_at) return NextResponse.json({ error: 'Campanha cancelada.' }, { status: 409 })
  if (campaign.review_status !== 'rascunho' && campaign.review_status !== 'ajustes_solicitados') {
    return NextResponse.json({ error: 'Só é possível editar a configuração enquanto a campanha está em rascunho.' }, { status: 409 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  if (body.starts_at && body.ends_at && new Date(body.ends_at).getTime() <= new Date(body.starts_at).getTime()) {
    return NextResponse.json({ error: 'O término precisa ser posterior ao início.' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  for (const field of EDITABLE_FIELDS) {
    if (field in body) updates[field] = body[field]
  }
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Nenhum campo para atualizar.' }, { status: 400 })

  const { error } = await supabase.from('sponsored_campaigns').update(updates).eq('id', campaignId)
  if (error) return NextResponse.json({ error: 'Não foi possível salvar agora.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
