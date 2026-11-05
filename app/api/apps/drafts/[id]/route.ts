import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// Allowlist de colunas editáveis pelo próprio parceiro — espelha
// app/dashboard/meus-app/novo/[appId]/editar/types.ts (DraftFormData), o
// único payload real que o editor envia. Qualquer outro campo do body
// (em especial `status` e `application_id`) é descartado aqui: RLS só
// garante QUAL linha pode ser editada (created_by = auth.uid()), nunca
// QUAIS colunas — sem esta lista, um PATCH direto na API podia apontar o
// próprio rascunho pro `application_id` de outro parceiro e, graças a
// isso, sequestrar o app alvo no próximo clique de "publicar" do admin.
// `status` só muda por caminhos com trava própria (claim atômico em
// app/api/apps/[appId]/submit, ou a rota de publicação do admin).
const EDITABLE_DRAFT_FIELDS = [
  'name',
  'category_id',
  'category',
  'short_description',
  'full_description',
  'target_audience',
  'website_url',
  'video_url',
  'logo_url',
  'media_gallery',
  'benefits',
  'features',
  'integrations',
  'history',
  'trust_signals',
  'faq',
] as const

function pickEditableFields(body: Record<string, unknown>): Record<string, unknown> {
  const picked: Record<string, unknown> = {}
  for (const field of EDITABLE_DRAFT_FIELDS) {
    if (field in body) picked[field] = body[field]
  }
  return picked
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('app_drafts')
    .select('*')
    .eq('id', id)
    .eq('created_by', user.id)
    .single()

  if (error) {
    console.error('[drafts GET]', error)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(data)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const updates = pickEditableFields(body)

  const { data, error } = await supabase
    .from('app_drafts')
    .update({
      ...updates,
      last_edited_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('created_by', user.id)
    .select()
    .single()

  if (error) {
    console.error('[drafts PATCH]', error)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  return NextResponse.json(data)
}
