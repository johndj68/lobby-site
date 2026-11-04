import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import crypto from 'crypto'

const MAX_CODES = 100000
const MAX_CODE_LENGTH = 1000

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}

// Persiste os códigos já validados por upload-codes. Fica em rota
// separada (não dentro de upload-codes) pra manter upload-codes como
// prévia sem efeito colateral — o parceiro só grava depois de confirmar
// o resumo na tela. Grava via cliente da própria sessão (RLS do parceiro
// já cobre isso — "Developers insert own code batches"/"own codes" —,
// não via admin), então RLS continua sendo a barreira real mesmo se essa
// rota tiver um bug de autorização.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const { appId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: draft } = await supabase
    .from('app_drafts')
    .select('id')
    .eq('id', appId)
    .eq('created_by', user.id)
    .single()

  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const planId = body?.planId as string | undefined
  const codes = body?.codes as string[] | undefined

  if (!planId || !Array.isArray(codes) || codes.length === 0) {
    return NextResponse.json({ error: 'Missing planId or codes' }, { status: 400 })
  }

  if (codes.length > MAX_CODES) {
    return NextResponse.json({ error: `Too many codes (max ${MAX_CODES})` }, { status: 400 })
  }

  for (const code of codes) {
    if (typeof code !== 'string' || !code.trim() || code.length > MAX_CODE_LENGTH) {
      return NextResponse.json({ error: 'Invalid code in payload' }, { status: 400 })
    }
  }

  const { data: plan } = await supabase
    .from('app_plans')
    .select('id')
    .eq('id', planId)
    .eq('app_draft_id', appId)
    .single()

  if (!plan) return NextResponse.json({ error: 'Invalid plan' }, { status: 404 })

  // Revalida duplicidade no servidor no momento do commit — a lista
  // recebida do cliente é o resultado de upload-codes, mas o tempo entre
  // a prévia e a confirmação pode ter permitido outro upload concorrente
  // inserir os mesmos códigos primeiro.
  const hashByCode = new Map(codes.map(c => [c, hashCode(c)] as const))
  const { data: existing } = await supabase
    .from('app_activation_codes')
    .select('code_hash')
    .eq('app_draft_id', appId)
    .in('code_hash', Array.from(hashByCode.values()))

  const existingHashes = new Set((existing || []).map(e => e.code_hash))
  const newCodes = codes.filter(c => !existingHashes.has(hashByCode.get(c)!))

  if (newCodes.length === 0) {
    return NextResponse.json({ error: 'Todos os códigos enviados já existem.' }, { status: 400 })
  }

  const { data: batch, error: batchErr } = await supabase
    .from('app_activation_codes_batch')
    .insert({
      app_draft_id: appId,
      plan_id: planId,
      batch_name: `Importação ${new Date().toISOString().slice(0, 10)}`,
      total_codes: newCodes.length,
      available: newCodes.length,
      reserved: 0,
      delivered: 0,
      imported_by: user.id,
    })
    .select('id')
    .single()

  if (batchErr || !batch) {
    console.error('[commit-codes] batch insert failed', batchErr)
    return NextResponse.json({ error: 'Failed to create batch' }, { status: 500 })
  }

  const rows = newCodes.map(code => ({
    batch_id: batch.id,
    app_draft_id: appId,
    plan_id: planId,
    code,
    code_hash: hashByCode.get(code)!,
    status: 'available',
  }))

  const { error: codesErr } = await supabase.from('app_activation_codes').insert(rows)

  if (codesErr) {
    console.error('[commit-codes] codes insert failed', codesErr)
    // Limpa o batch órfão — sem código nenhum, o valid_counts check não
    // teria travado (total_codes já bateria com available=0 só se
    // atualizássemos, mas não atualizamos), então o batch ficaria com
    // total_codes > 0 e available = total_codes mesmo sem linha em
    // app_activation_codes — remove pra não sujar as contagens da tela.
    await supabase.from('app_activation_codes_batch').delete().eq('id', batch.id)
    return NextResponse.json({ error: 'Failed to save codes' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, batchId: batch.id, count: newCodes.length })
}
