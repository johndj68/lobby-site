import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireTechnicianSession } from '@/lib/services/profile'
import PrecosClient from './PrecosClient'

export default async function PrecosPage() {
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireTechnicianSession(supabase)

  const { data: rows } = await supabase
    .from('plan_price_change_requests')
    .select(`
      id, status, current_price, requested_price, current_billing_period, requested_billing_period,
      requested_by, reviewed_by, reviewed_at, review_notes, created_at,
      app_plans ( id, name, app_draft_id, app_drafts ( id, name ) )
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  const requesterIds = [...new Set((rows ?? []).map(r => r.requested_by).filter(Boolean))]
  const { data: requesterProfiles } = requesterIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', requesterIds)
    : { data: [] }
  const requesterById = new Map((requesterProfiles ?? []).map(p => [p.id, p]))

  const mapped = (rows ?? []).map(r => {
    const plan = Array.isArray(r.app_plans) ? r.app_plans[0] : r.app_plans
    const draft = plan ? (Array.isArray(plan.app_drafts) ? plan.app_drafts[0] : plan.app_drafts) : null
    const requester = requesterById.get(r.requested_by)
    return {
      id: r.id,
      status: r.status as 'pendente' | 'aprovado' | 'rejeitado',
      appName: draft?.name ?? 'Aplicativo removido',
      planName: plan?.name ?? 'Plano removido',
      currentPrice: r.current_price,
      requestedPrice: r.requested_price,
      currentBillingPeriod: r.current_billing_period,
      requestedBillingPeriod: r.requested_billing_period,
      requesterName: requester?.full_name || requester?.email || 'Desconhecido',
      reviewNotes: r.review_notes,
      createdAt: r.created_at,
    }
  })

  const pending = mapped.filter(r => r.status === 'pendente')
  const history = mapped.filter(r => r.status !== 'pendente')

  return <PrecosClient user={user} profile={profile} pending={pending} history={history} />
}
