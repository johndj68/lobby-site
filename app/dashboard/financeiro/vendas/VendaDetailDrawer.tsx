'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Copy, Check, Clock, CheckCircle2, Ban, AlertTriangle, PackageCheck, HelpCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { colors } from '@/lib/design-tokens'
import { formatCurrencyBRL, formatDateBR } from '@/lib/finance'
import AppLogo from '@/components/admin/AppLogo'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'

interface PayoutLeg {
  kind:              'main' | 'reserve'
  amount:            number
  payout_status:     'confirmado' | 'revertido' | null
  payout_created_at: string | null
  payout_reference:  string | null
  reverted_at:       string | null
}

interface HistoryEvent {
  event_at:    string
  label:       string
  description: string | null
}

interface SaleDetail {
  sale_id:                 string
  sale_kind:               'app_purchase' | 'subscription_invoice'
  application_id:          string | null
  application_name:        string
  logo_url:                string | null
  plan_name:               string
  buyer_name:              string
  buyer_email:             string
  amount:                  number
  commission_percent:      number | null
  commission_amount:       number
  partner_amount:          number
  paid_at:                 string
  payment_status:          'confirmado' | 'parcialmente_reembolsado' | 'reembolsado'
  retention_days:          number
  retention_release_at:    string
  retention_days_left:     number
  reserve_amount:          number
  reserve_status:          'held' | 'released' | 'clawed_back' | null
  reserve_window_days:     number | null
  reserve_release_at:      string | null
  reserve_days_left:       number | null
  refund_status:           'processing' | 'refunded' | null
  refunded_amount:         number
  refund_reason:           string | null
  refunded_at:             string | null
  refund_window_days:      number | null
  dispute_status:          string | null
  dispute_opened_at:       string | null
  dispute_closed_at:       string | null
  dispute_reason:          string | null
  activation_status:       'available' | 'reserved' | 'delivered' | 'revoked' | null
  activation_delivered_at: string | null
  payout_legs:             PayoutLeg[]
  history:                 HistoryEvent[]
}

const PAYMENT_STATUS_LABEL: Record<SaleDetail['payment_status'], string> = {
  confirmado: 'Confirmado', parcialmente_reembolsado: 'Parcialmente reembolsado', reembolsado: 'Reembolsado',
}

const RESERVE_STATUS_LABEL: Record<string, string> = { held: 'Retida', released: 'Liberada', clawed_back: 'Perdida em disputa' }

const ACTIVATION_STATUS_LABEL: Record<string, string> = {
  available: 'Aguardando entrega', reserved: 'Reservado para entrega', delivered: 'Entregue ao comprador', revoked: 'Revogado',
}

const DISPUTE_PENDING_STATUSES = ['needs_response', 'under_review', 'warning_needs_response', 'warning_under_review']

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

interface LegDisplayProps { label: string; amount: number; releaseAt: string | null; daysLeft: number | null; leg: PayoutLeg | undefined; disputePending: boolean }

function LegDisplay({ label, amount, releaseAt, daysLeft, leg, disputePending }: LegDisplayProps) {
  const paid = leg?.payout_status === 'confirmado'
  const reverted = !!leg?.reverted_at
  let statusNode: React.ReactNode
  if (reverted) {
    statusNode = <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: '#EF4444' }}><Ban size={12} aria-hidden="true" />Repasse revertido</span>
  } else if (paid) {
    statusNode = <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: '#10B981' }}><CheckCircle2 size={12} aria-hidden="true" />Já repassado em {formatDateBR(leg!.payout_created_at?.slice(0, 10) ?? null)}</span>
  } else if (disputePending) {
    statusNode = <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: '#F59E0B' }}><AlertTriangle size={12} aria-hidden="true" />Liberação pendente devido a uma disputa</span>
  } else if (daysLeft !== null && daysLeft > 0) {
    statusNode = <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: '#F59E0B' }}><Clock size={12} aria-hidden="true" />Previsão de liberação em {formatDateBR(releaseAt?.slice(0, 10) ?? null)} — faltam {daysLeft} dia{daysLeft === 1 ? '' : 's'}</span>
  } else {
    statusNode = <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: colors.primary }}><CheckCircle2 size={12} aria-hidden="true" />Disponível para repasse</span>
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3" style={{ borderColor: colors.border }}>
      <div>
        <p className="text-sm font-semibold" style={{ color: colors.text }}>{label}</p>
        {statusNode}
      </div>
      <p className="text-sm font-bold tabular-nums" style={{ color: colors.text }}>{formatCurrencyBRL(amount)}</p>
    </div>
  )
}

interface Props {
  saleId:    string | null
  partnerId: string | null
  onClose:   () => void
}

export default function VendaDetailDrawer({ saleId, partnerId, onClose }: Props) {
  const [detail, setDetail] = useState<SaleDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [copied, setCopied] = useState(false)
  const [retryTick, setRetryTick] = useState(0)

  useEffect(() => {
    if (!saleId) { setDetail(null); return }
    let cancelled = false
    setLoading(true)
    setError(false)
    setDetail(null)
    const supabase = createClient()
    supabase.rpc('get_partner_sale_detail', { p_sale_id: saleId, p_partner_id: partnerId })
      .then(({ data, error: err }: { data: SaleDetail[] | null; error: unknown }) => {
        if (cancelled) return
        if (err) { setError(true); setLoading(false); return }
        setDetail(data?.[0] ?? null)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [saleId, partnerId, retryTick])

  const copyRef = () => {
    if (!detail) return
    navigator.clipboard?.writeText(detail.sale_id)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const disputePending = !!detail?.dispute_status && DISPUTE_PENDING_STATUSES.includes(detail.dispute_status)
  const mainLeg = detail?.payout_legs.find(l => l.kind === 'main')
  const reserveLeg = detail?.payout_legs.find(l => l.kind === 'reserve')

  return (
    <Sheet open={!!saleId} onOpenChange={open => { if (!open) onClose() }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg" aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>Detalhes da venda</SheetTitle>
          <SheetDescription>Composição financeira, retenção, reserva e histórico desta venda.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4 pb-6">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg" style={{ background: colors.borderLight }} />)}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <AlertTriangle size={24} style={{ color: '#EF4444' }} aria-hidden="true" />
              <p className="text-sm" style={{ color: colors.text }}>Não foi possível carregar os detalhes desta venda.</p>
              <button
                onClick={() => setRetryTick(t => t + 1)}
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                style={{ borderColor: colors.border, color: colors.text }}
                type="button"
              >
                Tentar novamente
              </button>
            </div>
          ) : !detail ? (
            saleId && (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <HelpCircle size={24} style={{ color: colors.textMuted }} aria-hidden="true" />
                <p className="text-sm" style={{ color: colors.text }}>Esta venda não foi encontrada ou você não tem acesso a ela.</p>
              </div>
            )
          ) : (
            <>
              {/* Cabeçalho */}
              <div className="flex items-start gap-3 border-b pb-4" style={{ borderColor: colors.border }}>
                <AppLogo url={detail.logo_url} size={40} theme="light" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="font-mono text-xs" style={{ color: colors.textMuted }}>#{detail.sale_id.slice(-8).toUpperCase()}</p>
                    <button type="button" onClick={copyRef} aria-label="Copiar referência completa da venda" className="rounded p-0.5" style={{ color: colors.textMuted }}>
                      {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
                    </button>
                  </div>
                  <p className="truncate font-semibold" style={{ color: colors.text }}>{detail.application_name}</p>
                  <p className="text-sm" style={{ color: colors.textSecondary }}>{detail.plan_name} · {formatDateBR(detail.paid_at.slice(0, 10))}</p>
                  <span className="mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-bold" style={{ color: colors.text, background: colors.backgroundAlt }}>
                    {PAYMENT_STATUS_LABEL[detail.payment_status]}
                  </span>
                </div>
              </div>

              {/* A. Produto adquirido */}
              <section>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>Produto adquirido</h3>
                <div className="grid grid-cols-2 gap-2 text-sm" style={{ color: colors.text }}>
                  <p><span style={{ color: colors.textSecondary }}>Aplicativo:</span> {detail.application_name}</p>
                  <p><span style={{ color: colors.textSecondary }}>Plano:</span> {detail.plan_name}</p>
                  <p><span style={{ color: colors.textSecondary }}>Modalidade:</span> {detail.sale_kind === 'app_purchase' ? 'Compra única' : 'Assinatura'}</p>
                  <p><span style={{ color: colors.textSecondary }}>Data da compra:</span> {formatDateBR(detail.paid_at.slice(0, 10))}</p>
                </div>
              </section>

              {/* B. Composição financeira */}
              <section>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>Composição financeira</h3>
                <div className="space-y-1 rounded-lg border p-3 text-sm" style={{ borderColor: colors.border }}>
                  <div className="flex justify-between"><span style={{ color: colors.textSecondary }}>Valor pago</span><span className="tabular-nums font-semibold" style={{ color: colors.text }}>{formatCurrencyBRL(detail.amount)}</span></div>
                  <div className="flex justify-between"><span style={{ color: colors.textSecondary }}>Comissão da LOBBY{detail.commission_percent != null ? ` (${detail.commission_percent}%)` : ''}</span><span className="tabular-nums" style={{ color: colors.text }}>−{formatCurrencyBRL(detail.commission_amount)}</span></div>
                  {detail.refunded_amount > 0 && (
                    <div className="flex justify-between"><span style={{ color: colors.textSecondary }}>Reembolsado</span><span className="tabular-nums" style={{ color: '#EF4444' }}>−{formatCurrencyBRL(detail.refunded_amount)}</span></div>
                  )}
                  <div className="mt-1 flex justify-between border-t pt-1" style={{ borderColor: colors.border }}>
                    <span className="font-semibold" style={{ color: colors.text }}>Sua participação</span>
                    <span className="tabular-nums font-bold" style={{ color: colors.primary }}>{formatCurrencyBRL(detail.partner_amount)}</span>
                  </div>
                </div>
              </section>

              {/* C/D. Distribuição da participação + datas de liberação */}
              <section>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>Distribuição da participação</h3>
                <div className="space-y-2">
                  <LegDisplay
                    label="Fatia principal"
                    amount={detail.partner_amount - detail.reserve_amount}
                    releaseAt={detail.retention_release_at}
                    daysLeft={detail.retention_days_left}
                    leg={mainLeg}
                    disputePending={disputePending}
                  />
                  {detail.reserve_amount > 0 && (
                    <LegDisplay
                      label={`Reserva de disputa (${RESERVE_STATUS_LABEL[detail.reserve_status ?? ''] ?? '—'})`}
                      amount={detail.reserve_amount}
                      releaseAt={detail.reserve_release_at}
                      daysLeft={detail.reserve_days_left}
                      leg={reserveLeg}
                      disputePending={disputePending}
                    />
                  )}
                </div>
                <p className="mt-2 text-[11px]" style={{ color: colors.textMuted }}>
                  A reserva não é uma taxa — é uma parcela temporariamente indisponível até {detail.reserve_window_days ?? 120} dias sem disputa. A liberação não significa que o valor já foi transferido; acompanhe a transferência em Repasses e extrato.
                </p>
              </section>

              {/* Disputa, se existir */}
              {detail.dispute_status && (
                <section className="rounded-lg border p-3" style={{ borderColor: '#F59E0B' }}>
                  <h3 className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: '#F59E0B' }}>
                    <AlertTriangle size={13} aria-hidden="true" />Disputa
                  </h3>
                  <p className="text-sm" style={{ color: colors.text }}>Status: {detail.dispute_status}</p>
                  {detail.dispute_reason && <p className="text-sm" style={{ color: colors.textSecondary }}>Motivo: {detail.dispute_reason}</p>}
                  <p className="text-xs" style={{ color: colors.textMuted }}>
                    Aberta em {fmtDateTime(detail.dispute_opened_at)}{detail.dispute_closed_at ? ` · Encerrada em ${fmtDateTime(detail.dispute_closed_at)}` : ''}
                  </p>
                </section>
              )}

              {/* Reembolso, se existir */}
              {(detail.refund_status || detail.refunded_amount > 0) && (
                <section className="rounded-lg border p-3" style={{ borderColor: colors.border }}>
                  <h3 className="mb-1 text-xs font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>Reembolso</h3>
                  <p className="text-sm" style={{ color: colors.text }}>
                    {detail.refund_status === 'processing' ? 'Em processamento' : 'Concluído'} — {formatCurrencyBRL(detail.refunded_amount)} de {formatCurrencyBRL(detail.amount)}
                  </p>
                  {detail.refund_reason && <p className="text-sm" style={{ color: colors.textSecondary }}>Motivo: {detail.refund_reason}</p>}
                  {detail.refunded_at && <p className="text-xs" style={{ color: colors.textMuted }}>Em {fmtDateTime(detail.refunded_at)}</p>}
                </section>
              )}

              {/* E. Ativação e entrega */}
              {detail.activation_status && (
                <section>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>
                    <PackageCheck size={13} aria-hidden="true" />Ativação e entrega
                  </h3>
                  <p className="text-sm" style={{ color: colors.text }}>{ACTIVATION_STATUS_LABEL[detail.activation_status] ?? detail.activation_status}</p>
                  {detail.activation_delivered_at && <p className="text-xs" style={{ color: colors.textMuted }}>Entregue em {fmtDateTime(detail.activation_delivered_at)}</p>}
                </section>
              )}

              {/* F. Histórico */}
              <section>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>Histórico</h3>
                <ol className="space-y-2 border-l pl-3" style={{ borderColor: colors.border }}>
                  {detail.history.map((ev, i) => (
                    <li key={i}>
                      <p className="text-sm font-semibold" style={{ color: colors.text }}>{ev.label}</p>
                      <p className="text-xs" style={{ color: colors.textMuted }}>{fmtDateTime(ev.event_at)}{ev.description ? ` — ${ev.description}` : ''}</p>
                    </li>
                  ))}
                </ol>
              </section>

              <div className="rounded-lg p-3 text-sm" style={{ background: colors.backgroundAlt }}>
                <p style={{ color: colors.text }}>Precisa de ajuda com esta venda?</p>
                <p className="mt-0.5 text-xs" style={{ color: colors.textSecondary }}>
                  Informe a referência <strong>#{detail.sale_id.slice(-8).toUpperCase()}</strong> ao abrir um chamado.
                </p>
                <Link href="/dashboard/suporte" className="mt-1 inline-block text-sm font-semibold" style={{ color: colors.primary }}>Contatar suporte →</Link>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
