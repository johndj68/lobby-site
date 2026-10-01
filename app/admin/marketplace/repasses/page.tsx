import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireLeaderSession } from '@/lib/services/profile'
import { partnerDisplayName } from '@/lib/partners'
import { classifyPurchasePayoutStatus, DISPUTE_RESERVE_WINDOW_DAYS } from '@/lib/services/payouts'
import RepassesClient, { type PartnerGroup, type EligiblePurchaseRow, type PayoutHistoryRow } from './RepassesClient'

export default async function RepassesPage() {
  const supabase = await createServerSupabaseClient()
  // Financeiro sensível — só líder, igual comissões/financeiro/créditos.
  const { user, profile } = await requireLeaderSession(supabase)

  const [{ data: purchases }, { data: subInvoices }, { data: items }, { data: payouts }] = await Promise.all([
    supabase
      .from('app_purchases')
      .select('id, partner_id, application_name, plan_name, amount, partner_amount, refunded_amount, paid_at, reserve_amount, reserve_status')
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
      .select('app_purchase_id, subscription_invoice_id, kind, partner_payouts(status)'),
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
  // Só item kind='main' cobre a fatia principal — um item kind='reserve'
  // confirmado não significa que a fatia principal da mesma venda também
  // foi paga (achado na revisão final: eram tratados como a mesma coisa).
  const mainCoveredItems = confirmedItems.filter(i => i.kind === 'main')
  const coveredIds = new Set(mainCoveredItems.map(i => i.app_purchase_id).filter(Boolean))
  const coveredInvoiceIds = new Set(mainCoveredItems.map(i => i.subscription_invoice_id).filter(Boolean))

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

    // Reembolso parcial confirmado reduz o valor líquido a repassar, na
    // mesma proporção usada pela RPC create_partner_payout (Etapa 5,
    // peça 6) — esta tela não pode mostrar um total maior do que o
    // repasse de verdade vai pagar quando o líder clicar em confirmar.
    // Base é partner_amount MENOS a reserva (Etapa 5, peça 7) — a reserva
    // nunca faz parte do que a fatia principal paga, ela só é liberada
    // separadamente quando elegível (ver o segundo loop logo abaixo).
    const mainBase = Number(p.partner_amount) - Number(p.reserve_amount ?? 0)
    const refundedShare = Math.round(Number(p.refunded_amount ?? 0) * mainBase / p.amount * 100) / 100
    const netPartnerAmount = mainBase - refundedShare

    const g = getGroup(p.partner_id as string)
    const row: EligiblePurchaseRow = {
      id: p.id, kind: 'app_purchase',
      applicationName: p.application_name,
      planName: p.plan_name,
      amount: p.amount,
      partnerAmount: netPartnerAmount,
      paidAt: p.paid_at,
      status,
    }
    if (status === 'retido') g.retidoTotal += netPartnerAmount
    else { g.elegivelTotal += netPartnerAmount; g.eligiblePurchases.push(row) }
  }

  // Reserva de disputa: mesma fila do parceiro, mas com sua própria
  // janela de 120 dias e seu próprio kind — entra separada da fatia
  // principal porque pode virar elegível bem depois (spec: 2026-09-30-
  // partner-dispute-reserve-design.md).
  const RESERVE_WINDOW_MS = DISPUTE_RESERVE_WINDOW_DAYS * 86400_000
  for (const p of purchases ?? []) {
    if (!p.paid_at || p.reserve_status !== 'held' || !p.reserve_amount || p.reserve_amount <= 0) continue
    const reserveEligible = Date.now() - new Date(p.paid_at).getTime() >= RESERVE_WINDOW_MS
    if (!reserveEligible) continue // ainda dentro dos 120 dias — não aparece na fila nem como "retido" (reserva não tem indicador visual de retido nesta leva, só aparece quando fica elegível)

    const refundedShare = Math.round(Number(p.refunded_amount ?? 0) * p.reserve_amount / p.amount * 100) / 100
    const netReserveAmount = p.reserve_amount - refundedShare

    const g = getGroup(p.partner_id as string)
    const row: EligiblePurchaseRow = {
      // ':reserve' no id: a fatia principal da MESMA venda pode continuar
      // elegível/retida ao mesmo tempo (16 dias vs 120 dias são janelas
      // independentes) — sem o sufixo, as duas linhas compartilhariam
      // app_purchase.id, colidindo como chave React e fundindo a seleção
      // do checkbox (selecionar uma sempre selecionaria a outra também).
      // RepassesClient remove o sufixo antes de mandar pra RPC.
      id: `${p.id}:reserve`, kind: 'app_purchase_reserve',
      applicationName: p.application_name,
      planName: `${p.plan_name} (reserva)`,
      amount: p.amount,
      partnerAmount: netReserveAmount,
      paidAt: p.paid_at,
      status: 'elegivel',
    }
    g.elegivelTotal += netReserveAmount
    g.eligiblePurchases.push(row)
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
