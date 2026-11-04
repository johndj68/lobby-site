import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireLeaderSession } from '@/lib/services/profile'
import { classifyPurchasePayoutStatus, calculateAppPurchasePayoutAmounts } from '@/lib/services/payouts'
import ContasClient from './ContasClient'
import type { AccountEntry, AccountKind } from '@/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any, kind: AccountKind): AccountEntry {
  return {
    id: row.id, kind, description: row.description, amount: Number(row.amount),
    amountSettled: Number(row.amount_settled ?? 0), category: row.category ?? null,
    payerName: row.payer_name ?? null, reference: row.reference ?? null, dueDate: row.due_date, status: row.status,
    notes: row.notes, attachmentPath: row.attachment_path ?? null,
    createdAt: row.created_at, updatedAt: row.updated_at ?? row.created_at,
  }
}

export default async function ContasPage() {
  const supabase = await createServerSupabaseClient()
  // Financeiro sensível — só líder, mesmo padrão de financeiro/repasses.
  const { user, profile } = await requireLeaderSession(supabase)

  const [
    { data: payable },
    { data: receivable },
    { data: appPurchases },
    { data: subInvoices },
    { data: payoutItems },
    { data: pendingCredits },
    { data: pendingEbooks },
  ] = await Promise.all([
    supabase.from('accounts_payable').select('*').order('status').order('due_date', { ascending: true, nullsFirst: false }),
    supabase.from('accounts_receivable').select('*').order('status').order('due_date', { ascending: true, nullsFirst: false }),
    supabase.from('app_purchases').select('id, amount, partner_amount, reserve_amount, reserve_status, refunded_amount, paid_at, retention_days').eq('status', 'paid').not('partner_id', 'is', null),
    supabase.from('subscription_invoices').select('id, partner_amount, paid_at, subscriptions(partner_id)'),
    supabase.from('partner_payout_items').select('app_purchase_id, subscription_invoice_id, kind, partner_payouts(status)'),
    supabase.from('credit_purchases').select('id, amount_paid').eq('status', 'pending'),
    supabase.from('ebook_purchases').select('id, amount').eq('status', 'pending'),
  ])

  // Mesmo cálculo de elegibilidade da tela de Repasses (peça 4/gap 3),
  // só o total agregado — detalhe por parceiro continua em
  // /admin/marketplace/repasses, não duplicado aqui.
  const confirmedItems = (payoutItems ?? []).filter(i => {
    const po = Array.isArray(i.partner_payouts) ? i.partner_payouts[0] : i.partner_payouts
    return po?.status === 'confirmado'
  })
  // Só item kind='main' cobre a fatia principal (mesmo achado da tela de
  // repasses — ver app/admin/marketplace/repasses/page.tsx).
  const mainCoveredItems = confirmedItems.filter(i => i.kind === 'main')
  const coveredIds = new Set(mainCoveredItems.map(i => i.app_purchase_id).filter(Boolean))
  const coveredInvoiceIds = new Set(mainCoveredItems.map(i => i.subscription_invoice_id).filter(Boolean))

  let payoutPendingTotal = 0
  let payoutPendingCount = 0
  for (const p of appPurchases ?? []) {
    if (!p.paid_at) continue
    // Mesma fórmula da RPC create_partner_payout, centralizada em
    // lib/services/payouts.ts — nunca recalcular aqui por conta própria
    // (já divergiu desta tela antes: mainAmount não descontava reembolso
    // parcial, diferente da tela de repasses).
    const { mainNet, reserveNet } = calculateAppPurchasePayoutAmounts({
      amount: p.amount, partnerAmount: Number(p.partner_amount),
      reserveAmount: Number(p.reserve_amount ?? 0), refundedAmount: Number(p.refunded_amount ?? 0),
    })
    const status = classifyPurchasePayoutStatus(p.paid_at, coveredIds.has(p.id), p.retention_days)
    if (status !== 'pago') { payoutPendingTotal += mainNet; payoutPendingCount++ }
    // Reserva retida é passivo real até ser liberada (120 dias) ou perdida
    // em disputa (clawed_back) — soma aqui independente da janela, porque
    // "pendente de pagar" inclui dinheiro ainda não liberado, não só o que
    // já está na fila de hoje.
    if (p.reserve_status === 'held' && Number(p.reserve_amount) > 0) {
      payoutPendingTotal += reserveNet
      payoutPendingCount++
    }
  }
  for (const si of subInvoices ?? []) {
    const sub = Array.isArray(si.subscriptions) ? si.subscriptions[0] : si.subscriptions
    if (!sub?.partner_id) continue
    const status = classifyPurchasePayoutStatus(si.paid_at, coveredInvoiceIds.has(si.id))
    if (status !== 'pago') { payoutPendingTotal += si.partner_amount; payoutPendingCount++ }
  }

  const creditsPendingTotal = (pendingCredits ?? []).reduce((s, c) => s + Number(c.amount_paid), 0)
  const ebooksPendingTotal  = (pendingEbooks ?? []).reduce((s, e) => s + Number(e.amount), 0)

  return (
    <ContasClient
      user={user}
      profile={profile}
      payable={(payable ?? []).map(r => mapRow(r, 'payable'))}
      receivable={(receivable ?? []).map(r => mapRow(r, 'receivable'))}
      payoutPendingTotal={payoutPendingTotal}
      payoutPendingCount={payoutPendingCount}
      chargesPendingTotal={creditsPendingTotal + ebooksPendingTotal}
      chargesPendingCount={(pendingCredits?.length ?? 0) + (pendingEbooks?.length ?? 0)}
    />
  )
}
