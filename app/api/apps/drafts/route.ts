import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Bloqueio administrativo de novos cadastros de app (/admin/marketplace/parceiros)
  const { data: profile } = await supabase
    .from('profiles')
    .select('marketplace_new_apps_blocked')
    .eq('id', user.id)
    .single()
  if (profile?.marketplace_new_apps_blocked) {
    return NextResponse.json({ error: 'Novos aplicativos estão temporariamente bloqueados para esta conta. Entre em contato com o suporte da LOBBY.' }, { status: 403 })
  }

  // url: enviado pelo fluxo "importar pelo site" (NovoAppClient) — nunca era
  // gravado aqui, então nenhum rascunho carregava sinal real de origem por
  // URL (a etapa "Começar" não tinha como distinguir import de manual).
  // req.json() pode falhar em corpo vazio (fluxo manual não manda nada).
  const body = await req.json().catch(() => ({}))
  const url = typeof body?.url === 'string' && body.url.trim() ? body.url.trim() : null

  // Create new draft
  const { data, error } = await supabase
    .from('app_drafts')
    .insert({
      created_by: user.id,
      stage: 1,
      status: 'draft',
      website_url: url,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[drafts POST]', error)
    return NextResponse.json({ error: 'Failed to create draft' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id })
}
