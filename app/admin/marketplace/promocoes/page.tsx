import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireTechnicianSession } from '@/lib/services/profile'
import PromocoesClient from './PromocoesClient'

export default async function PromocoesPage() {
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireTechnicianSession(supabase)

  const { data: rows, error: loadError } = await supabase
    .from('promotions')
    .select(`
      id, promo_price, original_price, discount_percentage, starts_at, ends_at,
      is_approved, rejected_at, rejection_reason, created_by, created_at,
      app_plans ( id, name, price, currency, billing_period, app_draft_id, app_drafts ( id, name ) )
    `)
    .is('cancelled_at', null)
    .order('created_at', { ascending: false })
    .limit(200)

  const requesterIds = [...new Set((rows ?? []).map(r => r.created_by).filter(Boolean))]
  const { data: requesterProfiles } = requesterIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', requesterIds)
    : { data: [] }
  const requesterById = new Map((requesterProfiles ?? []).map(p => [p.id, p]))

  const mapped = (rows ?? []).map(r => {
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
      originalPrice: r.original_price,
      promoPrice: r.promo_price,
      discountPercentage: r.discount_percentage,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      rejectionReason: r.rejection_reason,
      requesterName: requester?.full_name || requester?.email || 'Desconhecido',
      createdAt: r.created_at,
    }
  })

  const pending = mapped.filter(r => r.status === 'pendente')
  const history = mapped.filter(r => r.status !== 'pendente')

  return <PromocoesClient user={user} profile={profile} pending={pending} history={history} loadError={!!loadError} />
}
