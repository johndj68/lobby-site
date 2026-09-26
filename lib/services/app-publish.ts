import type { SupabaseClient } from '@supabase/supabase-js'

/** "MailCraft #2" -> "mailcraft-2". Sem acento, sem espaço, sem duplo hífen.
 *  Compartilhado entre publish/route.ts (slug de app) e lib/services/categories.ts
 *  (slug de categoria) — mesma normalização, nunca duplicada. */
export function slugify(name: string): string {
  const base = name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
  return base || 'app'
}

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
    planId?: string | null
    promotionId?: string | null
    campaignId?: string | null
    categoryId?: string | null
    /** null quando a ação vem de um processo sistêmico sem usuário humano
     *  (ex.: webhook do Stripe rodando como service_role). */
    actorId: string | null
    action:
      | 'publish' | 'suspend' | 'reactivate' | 'block_new_apps' | 'unblock_new_apps'
      // /admin/marketplace/ofertas
      | 'create_offer' | 'update_plan_price' | 'pause_offer' | 'resume_offer' | 'archive_offer'
      | 'create_promotion' | 'update_promotion' | 'pause_promotion' | 'cancel_promotion' | 'reactivate_promotion'
      // /admin/marketplace/destaques
      | 'create_campaign' | 'submit_creative' | 'review_creative_approve' | 'review_creative_changes' | 'review_creative_reject'
      | 'promote_creative' | 'reserve_capacity' | 'confirm_payment' | 'payment_capacity_conflict' | 'grant_exemption'
      | 'refund_campaign' | 'pause_campaign' | 'resume_campaign' | 'cancel_campaign' | 'reschedule_campaign'
      | 'duplicate_campaign' | 'update_space' | 'update_package' | 'update_campaign_config'
      // /admin/marketplace/categorias
      | 'create_category' | 'update_category' | 'move_category' | 'reorder_categories'
      | 'toggle_category_status' | 'toggle_category_nav' | 'delete_category'
      | 'reclassify_app' | 'reclassify_apps_bulk'
    reason?: string | null
    /** Omitidos quando o evento não representa uma transição de estado
     *  (ex.: edição de campos de configuração) — nem todo evento tem um
     *  "antes/depois" de status pra mostrar. */
    previousStatus?: string | null
    newStatus?: string | null
    /** Vínculo real com a versão do criativo (ad_creatives.id) — só pros
     *  eventos de submit_creative/review_creative_* que já sabem exatamente
     *  qual versão. Sem isso, a aba Histórico tem que adivinhar por
     *  proximidade de horário (nunca mais precisa pra eventos novos). */
    creativeId?: string | null
    /** Nota interna do revisor no momento da decisão — nunca a mesma coisa
     *  que `reason` (que em review_creative_changes/reject é a mensagem
     *  enviada ao parceiro). Só rotas /admin lêem esta coluna. */
    internalNote?: string | null
    /** Antes/depois REAIS por campo — só quando a rota tem os dois valores
     *  na mão (ex.: update_campaign_config). Nunca preencher com o valor
     *  atual como se fosse o anterior. */
    fieldChanges?: { field: string; label: string; before: string | null; after: string | null }[] | null
  },
) {
  await supabase.from('app_admin_events').insert({
    app_draft_id: event.appDraftId ?? null,
    application_id: event.applicationId ?? null,
    partner_id: event.partnerId ?? null,
    plan_id: event.planId ?? null,
    promotion_id: event.promotionId ?? null,
    campaign_id: event.campaignId ?? null,
    category_id: event.categoryId ?? null,
    actor_id: event.actorId ?? null,
    action: event.action,
    reason: event.reason ?? null,
    previous_status: event.previousStatus ?? null,
    new_status: event.newStatus ?? null,
    creative_id: event.creativeId ?? null,
    internal_note: event.internalNote ?? null,
    field_changes: event.fieldChanges ?? null,
  })
}
