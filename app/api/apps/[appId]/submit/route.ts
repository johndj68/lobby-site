import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { calculateReview } from '@/lib/validations/app-review'
import { TERMS_DOCUMENTS_AVAILABLE } from '@/lib/services/submission-gate'

// Estados a partir dos quais um novo envio é permitido — mesmos dois casos
// que a tela de Revisão trata como editável (rascunho e ajustes pedidos).
// Qualquer outro status (já em análise, aprovado, publicado) significa que
// já existe uma decisão ou análise em curso; reenviar por cima quebraria a
// regra de "submissões em análise permanecem estáveis".
const SUBMITTABLE_STATUSES = ['draft', 'changes_requested']

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const { appId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { acceptances } = await req.json()

  if (!acceptances || typeof acceptances !== 'object') {
    return NextResponse.json({ error: 'Missing acceptances' }, { status: 400 })
  }

  // Validate required acceptances
  if (!acceptances.authorized_to_commercialize || !acceptances.reviewed_app_info ||
      !acceptances.accepted_partner_terms || !acceptances.accepted_commercial_terms) {
    return NextResponse.json({ error: 'All terms must be accepted' }, { status: 400 })
  }

  // Documentos reais de termos ainda não existem no projeto — não deixar
  // criar um aceite pra um contrato que não existe em lugar nenhum, mesmo
  // que o cliente tenha marcado os checkboxes (não confiar só no frontend).
  if (!TERMS_DOCUMENTS_AVAILABLE) {
    return NextResponse.json({ error: 'Os termos de parceiro ainda não estão disponíveis para aceite.' }, { status: 409 })
  }

  try {
    // Load draft — RLS (dono ou app_team_members) decide o acesso de leitura.
    const { data: draft } = await supabase
      .from('app_drafts')
      .select('*')
      .eq('id', appId)
      .single()

    if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Permissão de ENVIAR é mais estrita que a de ver: dono, ou membro da
    // equipe com role owner / permissão edit. Ver a listagem não dá direito
    // de enviar pra análise em nome do dono.
    const isOwner = draft.created_by === user.id
    let canEdit = isOwner
    if (!canEdit) {
      const { data: membership } = await supabase
        .from('app_team_members').select('role, permissions').eq('app_draft_id', appId).eq('user_id', user.id).maybeSingle()
      canEdit = membership?.role === 'owner' || !!membership?.permissions?.includes('edit')
    }
    if (!canEdit) return NextResponse.json({ error: 'Sem permissão para enviar este aplicativo.' }, { status: 403 })

    if (!SUBMITTABLE_STATUSES.includes(draft.status)) {
      return NextResponse.json({ error: 'Este aplicativo já está em análise ou já foi decidido.', status: draft.status }, { status: 409 })
    }

    // Reload all data for validation
    const { data: plans } = await supabase
      .from('app_plans')
      .select('*')
      .eq('app_draft_id', appId)

    const { data: config } = await supabase
      .from('app_activation_config')
      .select('*')
      .eq('app_draft_id', appId)
      .maybeSingle()

    const { data: members } = await supabase
      .from('app_team_members')
      .select('*')
      .eq('app_draft_id', appId)

    const { data: invitations } = await supabase
      .from('app_team_invitations')
      .select('*')
      .eq('app_draft_id', appId)
      .eq('status', 'pending')

    // Validate (server-side) — mesmo motor usado pela tela de revisão.
    const review = calculateReview(draft, plans || [], config, members || [], invitations || [])
    if (review.blockers > 0) {
      return NextResponse.json({ error: 'Há informações obrigatórias pendentes.', blockers: review.blockers }, { status: 400 })
    }

    // Trava atômica: só passa daqui quem conseguir mudar o status PARA
    // 'submitted' a partir de um dos SUBMITTABLE_STATUSES — se outra aba/
    // clique/retry já fez isso entre a checagem acima e agora, 0 linhas
    // voltam e devolvemos conflito em vez de criar uma segunda submissão
    // pro mesmo envio. Fecha a corrida de "clique duplo" e "duas abas"
    // sem precisar de transação — é a mesma condição que já validou.
    const { data: claimedRows, error: claimError } = await supabase
      .from('app_drafts')
      .update({ status: 'submitted', stage: 4, last_edited_at: new Date().toISOString() })
      .eq('id', appId)
      .in('status', SUBMITTABLE_STATUSES)
      .select('updated_at')

    if (claimError) {
      console.error('[submit] claim error:', claimError)
      return NextResponse.json({ error: 'Failed to submit' }, { status: 500 })
    }
    if (!claimedRows || claimedRows.length === 0) {
      return NextResponse.json({ error: 'Este aplicativo acabou de ser enviado ou alterado. Recarregue a página e revise os dados atuais.' }, { status: 409 })
    }

    // Create acceptance record
    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0] ||
                      req.headers.get('x-real-ip') ||
                      'unknown'

    const { data: acceptance, error: acceptError } = await supabase
      .from('app_review_acceptances')
      .insert({
        app_draft_id: appId,
        user_id: user.id,
        authorized_to_commercialize: acceptances.authorized_to_commercialize,
        reviewed_app_info: acceptances.reviewed_app_info,
        accepted_partner_terms: acceptances.accepted_partner_terms,
        accepted_commercial_terms: acceptances.accepted_commercial_terms,
        partner_terms_version: 'v1.0',
        commercial_terms_version: 'v1.0',
        ip_address: ipAddress,
        user_agent: req.headers.get('user-agent') || 'unknown',
      })
      .select()
      .single()

    if (acceptError) {
      console.error('[submit] acceptance error:', acceptError)
      // Já reivindicamos o status 'submitted' acima — desfaz pra não deixar
      // o rascunho marcado como enviado sem submissão nenhuma por trás.
      await supabase.from('app_drafts').update({ status: draft.status, stage: draft.stage }).eq('id', appId)
      return NextResponse.json({ error: 'Failed to record acceptance' }, { status: 500 })
    }

    // Create submission
    const { data: submission, error: submitError } = await supabase
      .from('app_submissions')
      .insert({
        app_draft_id: appId,
        submitted_by: user.id,
        status: 'pending',
        acceptance_id: acceptance.id,
        data: {
          // Snapshot of current state
          name: draft.name,
          short_description: draft.short_description,
          full_description: draft.full_description,
          category: draft.category,
          category_id: draft.category_id,
          logo_url: draft.logo_url,
          media_gallery: draft.media_gallery,
          features: draft.features,
          plans: plans,
          activation_config: config,
          team_members: (members || []).length,
        },
        content_snapshot: draft, // Full draft snapshot
      })
      .select()
      .single()

    if (submitError) {
      console.error('[submit] submission error:', submitError)
      await supabase.from('app_drafts').update({ status: draft.status, stage: draft.stage }).eq('id', appId)
      return NextResponse.json({ error: 'Failed to create submission' }, { status: 500 })
    }

    return NextResponse.json({
      submission: {
        id: submission.id,
        app_id: appId,
        status: submission.status,
        submitted_at: submission.submitted_at,
        acceptance_id: acceptance.id,
      },
    })
  } catch (err) {
    console.error('[submit]', err)
    return NextResponse.json({ error: 'Failed to submit' }, { status: 500 })
  }
}
