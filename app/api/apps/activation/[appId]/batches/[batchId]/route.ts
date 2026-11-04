import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

async function checkOwnership(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  appId: string,
  batchId: string,
  userId: string
) {
  const { data: draft } = await supabase
    .from('app_drafts')
    .select('id')
    .eq('id', appId)
    .eq('created_by', userId)
    .single()
  if (!draft) return false

  const { data: batch } = await supabase
    .from('app_activation_codes_batch')
    .select('id')
    .eq('id', batchId)
    .eq('app_draft_id', appId)
    .single()
  return !!batch
}

// Exclui um lote que nunca entregou nada — delete_activation_batch (RPC)
// já garante isso de novo, ownership incluso, mesmo se essa checagem
// aqui tiver algum furo.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string; batchId: string }> }
) {
  const { appId, batchId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await checkOwnership(supabase, appId, batchId, user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { error } = await supabase.rpc('delete_activation_batch', { p_batch_id: batchId })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

// Revoga todos os códigos ainda disponíveis do lote (não afeta os já
// entregues) ou atualiza a validade (expiresAt).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string; batchId: string }> }
) {
  const { appId, batchId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await checkOwnership(supabase, appId, batchId, user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))

  if (body.action === 'revoke') {
    const { data, error } = await supabase.rpc('revoke_activation_batch', { p_batch_id: batchId })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, revoked: data })
  }

  if (body.action === 'set_expiry') {
    const expiresAt = body.expiresAt ?? null
    const { error } = await supabase.rpc('set_activation_batch_expiry', { p_batch_id: batchId, p_expires_at: expiresAt })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
