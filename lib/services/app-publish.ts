import type { SupabaseClient } from '@supabase/supabase-js'

export interface PublishEligibility {
  ok: true
  latestSubmission: { id: string; status: string }
  plans: { id: string; price: number | null; billing_period: string; currency: string }[]
}
export interface PublishBlocked {
  ok: false
  error: string
}

/**
 * Condições pra um draft poder virar (ou continuar) publicado — usada tanto
 * por /publish (primeira publicação ou reparo) quanto por /reactivate
 * (seção 12 exige revalidar as mesmas condições, não só destravar o flag).
 */
export async function checkPublishEligibility(
  supabase: SupabaseClient,
  draftId: string,
): Promise<PublishEligibility | PublishBlocked> {
  const { data: submissions } = await supabase
    .from('app_submissions')
    .select('id, status')
    .eq('app_draft_id', draftId)
    .order('submitted_at', { ascending: false })
    .limit(1)
  const latestSubmission = submissions?.[0]
  if (!latestSubmission || latestSubmission.status !== 'approved') {
    return { ok: false, error: 'O aplicativo precisa ter uma versão aprovada na revisão.' }
  }

  const { data: blockers } = await supabase
    .from('review_issues')
    .select('id')
    .eq('submission_id', latestSubmission.id)
    .eq('severity', 'blocker')
    .is('resolved_at', null)
  if (blockers && blockers.length > 0) {
    return { ok: false, error: `Existem ${blockers.length} bloqueio(s) de revisão não resolvido(s).` }
  }

  const { data: plans } = await supabase
    .from('app_plans')
    .select('id, price, billing_period, currency')
    .eq('app_draft_id', draftId)
    .not('billing_period', 'is', null)
  if (!plans || plans.length === 0) {
    return { ok: false, error: 'Cadastre pelo menos uma oferta (plano/preço) antes de publicar.' }
  }

  const { data: activationConfig } = await supabase
    .from('app_activation_config')
    .select('id, activation_link, support_email')
    .eq('app_draft_id', draftId)
    .maybeSingle()
  if (!activationConfig || (!activationConfig.activation_link && !activationConfig.support_email)) {
    return { ok: false, error: 'Configure a entrega/ativação do aplicativo (link ou e-mail de suporte) antes de publicar.' }
  }

  return { ok: true, latestSubmission, plans }
}

/** applications.logo_url/preview_image_url viram <Image> na home — next/image
 *  só aceita hosts declarados em next.config.ts (hoje só o storage do
 *  Supabase). Fora disso, cai pra null em vez de derrubar a home pública. */
export function isAllowedImageUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const allowedHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname
    return new URL(url).hostname === allowedHost
  } catch {
    return false
  }
}

export async function logAppAdminEvent(
  supabase: SupabaseClient,
  event: {
    appDraftId?: string | null
    applicationId?: string | null
    partnerId?: string | null
    actorId: string
    action: 'publish' | 'suspend' | 'reactivate' | 'block_new_apps' | 'unblock_new_apps'
    reason?: string | null
    previousStatus: string
    newStatus: string
  },
) {
  await supabase.from('app_admin_events').insert({
    app_draft_id: event.appDraftId ?? null,
    application_id: event.applicationId ?? null,
    partner_id: event.partnerId ?? null,
    actor_id: event.actorId,
    action: event.action,
    reason: event.reason ?? null,
    previous_status: event.previousStatus,
    new_status: event.newStatus,
  })
}
