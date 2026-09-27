import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireLeaderSession } from '@/lib/services/profile'
import { partnerDisplayName } from '@/lib/partners'
import { classifyPurchasePayoutStatus } from '@/lib/services/payouts'
import RepassesClient, { type PartnerGroup, type EligiblePurchaseRow, type PayoutHistoryRow } from './RepassesClient'

export default async function RepassesPage() {
  const supabase = await createServerSupabaseClient()
  // Financeiro sensível — só líder, igual comissões/financeiro/créditos.
  const { user, profile } = await requireLeaderSession(supabase)

  const [{ data: purchases }, { data: subInvoices }, { data: items }, { data: payouts }] = await Promise.all([
    supabase
      .from('app_purchases')
      .select('id, partner_id, application_name, plan_name, amount, partner_amount, paid_at')
      .eq('status', 'paid')
      .not('partner_id', 'is', null)
      .order('paid_at', { ascending: true }),
    // Receita de assinatura de app_plan com parceiro — mesma fila,
    // mesma janela de retenção (peça 5 já computa partner_amount por ciclo).
    supabase
      .from('subscription_invoices')
      .select('id, amount, partner_amount, paid_at, subscriptions(partner_id, plan_name)')
      .order('paid_at', { ascending: true }),
    supabase
      .from('partner_payout_items')
      .select('app_purchase_id, subscription_invoice_id, partner_payouts(status)'),
    supabase
      .from('partner_payouts')
      .select('*')
      .order('created_at', { ascending: false }),
  ])

  // Uma compra/fatura está "paga" (já repassada) se algum item que a cobre
  // pertence a um repasse ainda confirmado (não revertido).
  const confirmedItems = (items ?? []).filter(i => {
    const po = Array.isArray(i.partner_payouts) ? i.partner_payouts[0] : i.partner_payouts
    return po?.status === 'confirmado'
  })
  const coveredIds = new Set(confirmedItems.map(i => i.app_purchase_id).filter(Boolean))
  const coveredInvoiceIds = new Set(confirmedItems.map(i => i.subscription_invoice_id).filter(Boolean))

  const subInvoiceRows = (subInvoices ?? [])
    .map(si => {
      const sub = Array.isArray(si.subscriptions) ? si.subscriptions[0] : si.subscriptions
      return sub?.partner_id ? { ...si, partnerId: sub.partner_id as string, planName: sub.plan_name as string } : null
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  const partnerIds = [...new Set([
    ...(purchases ?? []).map(p => p.partner_id as string),
    ...subInvoiceRows.map(r => r.partnerId),
    ...(payouts ?? []).map(p => p.partner_id as string),
  ])]
  const { data: partnerProfiles } = partnerIds.length
    ? await supabase.from('profiles').select('id, full_name, email, company_name, payout_pix_key, payout_account_holder, payout_notes').in('id', partnerIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null; company_name: string | null; payout_pix_key: string | null; payout_account_holder: string | null; payout_notes: string | null }[] }
  const partnerNameById = new Map((partnerProfiles ?? []).map(p => [p.id, partnerDisplayName(p)]))
  const partnerPayoutInfoById = new Map((partnerProfiles ?? []).map(p => [p.id, {
    pixKey: p.payout_pix_key, accountHolder: p.payout_account_holder, notes: p.payout_notes,
  }]))

  // Agrupa compras/faturas elegíveis/retidas por parceiro — mesma fila
  // pras 2 fontes (venda avulsa de app + ciclo de assinatura).
  const groups = new Map<string, PartnerGroup>()
  const getGroup = (partnerId: string) => {
    if (!groups.has(partnerId)) {
      groups.set(partnerId, {
        partnerId,
        partnerName: partnerNameById.get(partnerId) ?? 'Parceiro removido',
        payoutInfo: partnerPayoutInfoById.get(partnerId) ?? { pixKey: null, accountHolder: null, notes: null },
        retidoTotal: 0,
        elegivelTotal: 0,
        eligiblePurchases: [],
      })
    }
    return groups.get(partnerId)!
  }

  for (const p of purchases ?? []) {
    if (!p.paid_at) continue
    const status = classifyPurchasePayoutStatus(p.paid_at, coveredIds.has(p.id))
    if (status === 'pago') continue // já repassada, não entra na fila

    const g = getGroup(p.partner_id as string)
    const row: EligiblePurchaseRow = {
      id: p.id, kind: 'app_purchase',
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

  for (const si of subInvoiceRows) {
    const status = classifyPurchasePayoutStatus(si.paid_at, coveredInvoiceIds.has(si.id))
    if (status === 'pago') continue

    const g = getGroup(si.partnerId)
    const row: EligiblePurchaseRow = {
      id: si.id, kind: 'subscription_invoice',
      applicationName: 'Assinatura', planName: si.planName,
      amount: si.amount, partnerAmount: si.partner_amount,
      paidAt: si.paid_at, status,
    }
    if (status === 'retido') g.retidoTotal += si.partner_amount
    else { g.elegivelTotal += si.partner_amount; g.eligiblePurchases.push(row) }
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
