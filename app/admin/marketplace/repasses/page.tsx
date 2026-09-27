import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireLeaderSession } from '@/lib/services/profile'
import { partnerDisplayName } from '@/lib/partners'
import { classifyPurchasePayoutStatus } from '@/lib/services/payouts'
import RepassesClient, { type PartnerGroup, type EligiblePurchaseRow, type PayoutHistoryRow } from './RepassesClient'

export default async function RepassesPage() {
  const supabase = await createServerSupabaseClient()
  // Financeiro sensível — só líder, igual comissões/financeiro/créditos.
  const { user, profile } = await requireLeaderSession(supabase)

  const [{ data: purchases }, { data: items }, { data: payouts }] = await Promise.all([
    supabase
      .from('app_purchases')
      .select('id, partner_id, application_name, plan_name, amount, partner_amount, paid_at')
      .eq('status', 'paid')
      .not('partner_id', 'is', null)
      .order('paid_at', { ascending: true }),
    supabase
      .from('partner_payout_items')
      .select('app_purchase_id, partner_payouts(status)'),
    supabase
      .from('partner_payouts')
      .select('*')
      .order('created_at', { ascending: false }),
  ])

  // Uma compra está "paga" (já repassada) se algum item que a cobre
  // pertence a um repasse ainda confirmado (não revertido).
  const coveredIds = new Set(
    (items ?? [])
      .filter(i => {
        const po = Array.isArray(i.partner_payouts) ? i.partner_payouts[0] : i.partner_payouts
        return po?.status === 'confirmado'
      })
      .map(i => i.app_purchase_id)
  )

  const partnerIds = [...new Set([
    ...(purchases ?? []).map(p => p.partner_id as string),
    ...(payouts ?? []).map(p => p.partner_id as string),
  ])]
  const { data: partnerProfiles } = partnerIds.length
    ? await supabase.from('profiles').select('id, full_name, email, company_name').in('id', partnerIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null; company_name: string | null }[] }
  const partnerNameById = new Map((partnerProfiles ?? []).map(p => [p.id, partnerDisplayName(p)]))

  // Agrupa compras elegíveis/retidas por parceiro.
  const groups = new Map<string, PartnerGroup>()
  for (const p of purchases ?? []) {
    if (!p.paid_at) continue
    const status = classifyPurchasePayoutStatus(p.paid_at, coveredIds.has(p.id))
    if (status === 'pago') continue // já repassada, não entra na fila

    const partnerId = p.partner_id as string
    if (!groups.has(partnerId)) {
      groups.set(partnerId, {
        partnerId,
        partnerName: partnerNameById.get(partnerId) ?? 'Parceiro removido',
        retidoTotal: 0,
        elegivelTotal: 0,
        eligiblePurchases: [],
      })
    }
    const g = groups.get(partnerId)!
    const row: EligiblePurchaseRow = {
      id: p.id,
      applicationName: p.application_name,
      planName: p.plan_name,
      amount: p.amount,
      partnerAmount: p.partner_amount,
      paidAt: p.paid_at,
      status,
    }
    if (status === 'retido') g.retidoTotal += p.partner_amount
    else { g.elegivelTotal += p.partner_amount; g.eligiblePurchases.push(row) }
  }

  const partnerGroups = [...groups.values()]
    .filter(g => g.retidoTotal > 0 || g.eligiblePurchases.length > 0)
    .sort((a, b) => b.elegivelTotal - a.elegivelTotal)

  const history: PayoutHistoryRow[] = (payouts ?? []).map(po => ({
    ...po,
    partnerName: partnerNameById.get(po.partner_id) ?? 'Parceiro removido',
  }))

  return (
    <RepassesClient
      user={user}
      profile={profile}
      partnerGroups={partnerGroups}
      history={history}
    />
  )
}
