import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * Publica um app do marketplace — ou seja, seta app_drafts.status='published'.
 * Antes disso, nada no projeto fazia essa transição (aprovar só marca
 * status='approved'; nenhum código chegava a 'published'). Todas as
 * condições abaixo são checadas no servidor: o botão no admin só chama
 * este endpoint, ele não decide nada sozinho no frontend.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ draftId: string }> }
) {
  const { draftId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'technician') {
    return NextResponse.json({ error: 'Sem permissão para publicar aplicativos.' }, { status: 403 })
  }

  const { data: draft } = await supabase
    .from('app_drafts')
    .select('id, name, status')
    .eq('id', draftId)
    .single()
  if (!draft) return NextResponse.json({ error: 'Aplicativo não encontrado.' }, { status: 404 })
  if (draft.status === 'published') {
    return NextResponse.json({ error: 'Este aplicativo já está publicado.' }, { status: 409 })
  }

  // 1) Versão aprovada — pega a submissão mais recente.
  const { data: submissions } = await supabase
    .from('app_submissions')
    .select('id, status')
    .eq('app_draft_id', draftId)
    .order('submitted_at', { ascending: false })
    .limit(1)
  const latestSubmission = submissions?.[0]
  if (!latestSubmission || latestSubmission.status !== 'approved') {
    return NextResponse.json({ error: 'O aplicativo precisa ter uma versão aprovada na revisão antes de ser publicado.' }, { status: 400 })
  }

  // 2) Ausência de bloqueios — issues de severidade "blocker" ainda não resolvidas.
  const { data: blockers } = await supabase
    .from('review_issues')
    .select('id')
    .eq('submission_id', latestSubmission.id)
    .eq('severity', 'blocker')
    .is('resolved_at', null)
  if (blockers && blockers.length > 0) {
    return NextResponse.json({ error: `Existem ${blockers.length} bloqueio(s) de revisão não resolvido(s).` }, { status: 400 })
  }

  // 3) Configuração comercial válida — pelo menos uma oferta cadastrada.
  const { data: plans } = await supabase
    .from('app_plans')
    .select('id')
    .eq('app_draft_id', draftId)
    .not('billing_period', 'is', null)
  if (!plans || plans.length === 0) {
    return NextResponse.json({ error: 'Cadastre pelo menos uma oferta (plano/preço) antes de publicar.' }, { status: 400 })
  }

  // 4) Entrega ou ativação disponível.
  const { data: activationConfig } = await supabase
    .from('app_activation_config')
    .select('id, activation_link, support_email')
    .eq('app_draft_id', draftId)
    .maybeSingle()
  if (!activationConfig || (!activationConfig.activation_link && !activationConfig.support_email)) {
    return NextResponse.json({ error: 'Configure a entrega/ativação do aplicativo (link ou e-mail de suporte) antes de publicar.' }, { status: 400 })
  }

  // Todas as condições passaram — publica de fato. Guard `.eq('status', draft.status)`
  // evita corrida se dois técnicos clicarem publicar ao mesmo tempo.
  const { data: updated, error: updateErr } = await supabase
    .from('app_drafts')
    .update({ status: 'published' })
    .eq('id', draftId)
    .eq('status', draft.status)
    .select('id, status')
    .single()

  if (updateErr || !updated) {
    return NextResponse.json({ error: 'Não foi possível publicar agora — o status pode ter mudado em outra sessão. Recarregue e tente novamente.' }, { status: 409 })
  }

  await supabase
    .from('app_submissions')
    .update({ published_at: new Date().toISOString() })
    .eq('id', latestSubmission.id)

  return NextResponse.json({ ok: true, app: draft.name, submissionId: latestSubmission.id })
}
