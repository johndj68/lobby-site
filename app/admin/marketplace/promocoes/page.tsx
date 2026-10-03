import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireTechnicianSession } from '@/lib/services/profile'
import PromocoesClient from './PromocoesClient'

const SELECT = `
  id, promo_price, original_price, discount_percentage, starts_at, ends_at,
  is_approved, rejected_at, rejection_reason, created_by, created_at,
  unit_limit, eligible_for_daily_deals,
  app_plans ( id, name, price, currency, billing_period, app_draft_id, app_drafts ( id, name ) )
`

export default async function PromocoesPage() {
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireTechnicianSession(supabase)

  // Pedidos pendentes são raros por natureza (o índice parcial único
  // permite só um por plano) — buscados SEM limite, numa query separada
  // do histórico, pra nunca cair fora de uma janela de "200 mais
  // recentes" compartilhada com as promoções já resolvidas/criadas pelo
  // admin (que se acumulam muito mais rápido).
  const [
    { data: pendingRows, error: pendingError },
    { data: historyRows, error: historyError },
  ] = await Promise.all([
    supabase
      .from('promotions')
      .select(SELECT)
      .eq('is_approved', false)
      .is('rejected_at', null)
      .is('cancelled_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('promotions')
      .select(SELECT)
      .is('cancelled_at', null)
      .or('is_approved.eq.true,rejected_at.not.is.null')
      .order('created_at', { ascending: false })
      .limit(200),
  ])
  const loadError = pendingError || historyError

  const rows = [...(pendingRows ?? []), ...(historyRows ?? [])]

  const requesterIds = [...new Set(rows.map(r => r.created_by).filter(Boolean))]
  const { data: requesterProfiles } = requesterIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', requesterIds)
    : { data: [] }
  const requesterById = new Map((requesterProfiles ?? []).map(p => [p.id, p]))

  const mapRow = (r: typeof rows[number], useLivePrice: boolean) => {
    const plan = Array.isArray(r.app_plans) ? r.app_plans[0] : r.app_plans
    const draft = plan ? (Array.isArray(plan.app_drafts) ? plan.app_drafts[0] : plan.app_drafts) : null
    const requester = requesterById.get(r.created_by)
    return {
      id: r.id,
      status: (r.is_approved ? 'aprovado' : r.rejected_at ? 'rejeitado' : 'pendente') as 'pendente' | 'aprovado' | 'rejeitado',
      appName: draft?.name ?? 'Aplicativo removido',
      planName: plan?.name ?? 'Plano removido',
      currency: plan?.currency ?? 'BRL',
      billingPeriod: plan?.billing_period ?? null,
      // Pendentes: preço regular LIVE do plano, não o snapshot gravado no
      // pedido — um parceiro mal-intencionado não controla app_plans.price,
      // só o que ele mesmo envia na request (ver RLS hardening em
      // 20261003120000_promocoes_insert_check_hardening.sql). Resolvidas
      // (histórico): o snapshot original mesmo — o preço do plano pode ter
      // mudado desde a aprovação/rejeição, e o histórico precisa refletir o
      // que foi decidido NA ÉPOCA, não reescrever com o preço de hoje.
      originalPrice: useLivePrice ? (plan?.price ?? r.original_price) : r.original_price,
      promoPrice: r.promo_price,
      discountPercentage: r.discount_percentage,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      rejectionReason: r.rejection_reason,
      requesterName: requester?.full_name || requester?.email || 'Desconhecido',
      createdAt: r.created_at,
      unitLimit: r.unit_limit,
      eligibleForDailyDeals: r.eligible_for_daily_deals,
    }
  }

  const pending = (pendingRows ?? []).map(r => mapRow(r, true))
  const history = (historyRows ?? []).map(r => mapRow(r, false))

  return <PromocoesClient user={user} profile={profile} pending={pending} history={history} loadError={!!loadError} />
}
