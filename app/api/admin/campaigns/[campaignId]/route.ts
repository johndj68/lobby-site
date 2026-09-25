import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const EDITABLE_FIELDS = ['internal_name', 'space_id', 'package_id', 'starts_at', 'ends_at'] as const

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
    .select('id, cancelled_at')
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

  const updates: Record<string, unknown> = {}
  for (const field of EDITABLE_FIELDS) {
    if (field in body) updates[field] = body[field]
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo para atualizar.' }, { status: 400 })
  }

  const { error } = await supabase.from('sponsored_campaigns').update(updates).eq('id', campaignId)
  if (error) {
    console.error('[campaigns PATCH]', error)
    return NextResponse.json({ error: 'Não foi possível salvar agora — tente novamente.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
