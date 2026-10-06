'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Copy, Check, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { colors } from '@/lib/design-tokens'
import { formatOfferPrice } from '@/lib/services/offers'
import { resolvePromotionStatus } from './promotion-status'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'

interface DetailRow {
  id: string; plan_id: string; application_id: string | null; name: string | null
  app_name: string; plan_name: string; currency: string; billing_period: string | null
  promo_price: number; original_price: number | null; discount_percentage: number | null
  discount_duration_type: 'primeira_cobranca' | 'ciclos_fixos' | null; discount_cycles: number | null
  unit_limit: number | null; eligible_for_daily_deals: boolean; timezone: string
  starts_at: string; ends_at: string; is_approved: boolean; is_active: boolean
  cancelled_at: string | null; paused_at: string | null; rejected_at: string | null
  rejection_reason: string | null; previous_version_id: string | null; superseded_at: string | null
  plan_current_price: number | null; plan_status: string; app_suspended: boolean
  created_at: string; created_by: string
}

interface HistoryRow { action: string; reason: string | null; created_at: string; actor_role: 'equipe_lobby' | 'parceiro' | 'sistema' }

const ACTOR_LABEL: Record<HistoryRow['actor_role'], string> = { equipe_lobby: 'Equipe LOBBY', parceiro: 'Você', sistema: 'Automático' }

interface ResultsRow { currency: string; sales_count: number; gross_amount: number; discount_granted: number; refunded_amount: number; partner_amount: number }

const ACTION_LABEL: Record<string, string> = {
  create_promotion: 'Promoção aprovada',
  reject_promotion: 'Pedido rejeitado',
  pause_promotion: 'Promoção pausada',
  update_promotion: 'Promoção retomada',
  cancel_promotion: 'Promoção cancelada',
  reactivate_promotion: 'Promoção reativada com novo período',
  supersede_promotion: 'Substituída por nova versão',
}

interface Props {
  promotionId: string | null
  partnerId: string | null
  onClose: () => void
  onDuplicate: (id: string) => void
  onEdit: (id: string) => void
  onCancel: (id: string) => void
}

export default function PromocaoDetailSheet({ promotionId, partnerId, onClose, onDuplicate, onEdit, onCancel }: Props) {
  const [detail, setDetail] = useState<DetailRow | null>(null)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [results, setResults] = useState<ResultsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!promotionId) { setDetail(null); return }
    let cancelled = false
    setLoading(true)
    setError(false)
    const supabase = createClient()
    Promise.all([
      supabase.rpc('get_partner_promotion_detail', { p_promotion_id: promotionId, p_partner_id: partnerId }),
      supabase.rpc('get_partner_promotion_history', { p_promotion_id: promotionId, p_partner_id: partnerId }),
      supabase.rpc('get_partner_promotion_results', { p_promotion_id: promotionId, p_partner_id: partnerId }),
    ]).then(([detailRes, historyRes, resultsRes]: [{ data: DetailRow[] | null; error: unknown }, { data: HistoryRow[] | null; error: unknown }, { data: ResultsRow[] | null; error: unknown }]) => {
      if (cancelled) return
      if (detailRes.error || !detailRes.data?.[0]) { setError(true); setLoading(false); return }
      setDetail(detailRes.data[0])
      setHistory(historyRes.error ? [] : (historyRes.data ?? []))
      setResults(resultsRes.error ? [] : (resultsRes.data ?? []))
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [promotionId, partnerId])

  const status = detail ? resolvePromotionStatus({ is_approved: detail.is_approved, is_active: detail.is_active, starts_at: detail.starts_at, ends_at: detail.ends_at, cancelled_at: detail.cancelled_at, paused_at: detail.paused_at, rejected_at: detail.rejected_at, superseded_at: detail.superseded_at }) : null
  const canCancel = status?.key === 'rascunho' || status?.key === 'programada'
  const canEdit = status?.key === 'ativa' || status?.key === 'programada' || status?.key === 'pausada'
  const drift = !!(detail && detail.original_price != null && detail.plan_current_price != null && detail.original_price !== detail.plan_current_price
    && (status?.key === 'rascunho' || status?.key === 'programada' || status?.key === 'ativa' || status?.key === 'pausada'))

  const copyId = () => {
    if (!detail) return
    navigator.clipboard?.writeText(detail.id)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Sheet open={!!promotionId} onOpenChange={o => { if (!o) onClose() }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg" aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>Detalhes da promoção</SheetTitle>
          <SheetDescription>Resumo, análise, histórico e resultados desta promoção.</SheetDescription>
        </SheetHeader>

        {loading && <div className="px-4 py-10 text-center text-sm" style={{ color: colors.textSecondary }}>Carregando…</div>}
        {!loading && error && <div className="px-4 py-10 text-center text-sm" style={{ color: '#EF4444' }}>Não foi possível carregar os detalhes.</div>}

        {!loading && detail && status && (
          <div className="flex flex-col gap-5 px-4 pb-6">
            <div className="flex items-start justify-between gap-3 border-b pb-4" style={{ borderColor: colors.border }}>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="truncate font-mono text-xs" style={{ color: colors.textMuted }}>{detail.id}</p>
                  <button type="button" onClick={copyId} aria-label="Copiar identificador" className="rounded p-0.5" style={{ color: colors.textMuted }}>
                    {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
                  </button>
                </div>
                <p className="mt-1 text-base font-bold" style={{ color: colors.text }}>{detail.name || 'Promoção sem nome'}</p>
                <p className="text-xs" style={{ color: colors.textSecondary }}>{detail.app_name} — {detail.plan_name}</p>
                <span className="mt-1.5 inline-flex rounded-full px-2 py-0.5 text-xs font-bold" style={{ color: status.color, background: status.bg }}>{status.label}</span>
              </div>
            </div>

            {drift && (
              <div className="flex items-start gap-2 rounded-lg border p-3 text-xs" style={{ borderColor: '#F59E0B', background: '#F59E0B0D', color: colors.text }}>
                <AlertTriangle size={14} style={{ color: '#F59E0B' }} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  O preço do plano mudou desde {detail.is_approved ? 'a aprovação' : 'o pedido'} desta promoção — era {formatOfferPrice(detail.original_price!, detail.currency, null)}, hoje é {formatOfferPrice(detail.plan_current_price!, detail.currency, null)}.
                  {detail.is_approved
                    ? ' Se o desconto ainda faz sentido, proponha uma nova versão com o preço atual.'
                    : ' É provável que este pedido seja rejeitado na análise — considere cancelar e enviar de novo com o preço atual.'}
                </span>
              </div>
            )}

            {detail.previous_version_id && (
              <div className="rounded-lg p-3 text-xs" style={{ background: colors.backgroundAlt, color: colors.textSecondary }}>
                Esta é uma nova versão proposta pra uma promoção já aprovada — a versão anterior {detail.is_approved ? 'foi substituída por esta.' : 'continua valendo até esta ser aprovada.'}
              </div>
            )}

            {(detail.plan_status === 'archived' || detail.plan_status === 'paused' || detail.app_suspended) && (
              <div className="rounded-lg p-3 text-xs" style={{ background: colors.backgroundAlt2, color: colors.text }}>
                {detail.app_suspended ? 'O aplicativo desta oferta está suspenso.' : detail.plan_status === 'archived' ? 'Esta oferta foi arquivada.' : 'Esta oferta está pausada.'} Promoções vinculadas são pausadas automaticamente.
              </div>
            )}

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>Resumo</h3>
              <div className="space-y-1 text-sm" style={{ color: colors.text }}>
                <p><span style={{ color: colors.textSecondary }}>Preço de referência:</span> {detail.original_price != null ? formatOfferPrice(detail.original_price, detail.currency, detail.billing_period) : '—'}</p>
                <p><span style={{ color: colors.textSecondary }}>Preço promocional:</span> <strong>{formatOfferPrice(detail.promo_price, detail.currency, detail.billing_period)}</strong>{detail.discount_percentage != null && ` (-${detail.discount_percentage}%)`}</p>
                <p><span style={{ color: colors.textSecondary }}>Vigência:</span> {new Date(detail.starts_at).toLocaleString('pt-BR')} → {new Date(detail.ends_at).toLocaleString('pt-BR')} ({detail.timezone})</p>
                {(detail.billing_period === 'monthly' || detail.billing_period === 'yearly') && (
                  <p><span style={{ color: colors.textSecondary }}>Duração do benefício:</span> {detail.discount_duration_type === 'ciclos_fixos' ? `Primeiros ${detail.discount_cycles} ciclos` : 'Só na primeira cobrança'}</p>
                )}
                {detail.unit_limit != null && <p><span style={{ color: colors.textSecondary }}>Limite de unidades:</span> {detail.unit_limit}</p>}
                <p><span style={{ color: colors.textSecondary }}>Elegível a promoções do dia:</span> {detail.eligible_for_daily_deals ? 'Sim' : 'Não'}</p>
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>Análise</h3>
              <div className="space-y-1 text-sm" style={{ color: colors.text }}>
                <p><span style={{ color: colors.textSecondary }}>Enviado em:</span> {new Date(detail.created_at).toLocaleString('pt-BR')}</p>
                {detail.rejected_at && (
                  <p style={{ color: '#EF4444' }}>Rejeitado em {new Date(detail.rejected_at).toLocaleString('pt-BR')}{detail.rejection_reason ? ` — motivo: ${detail.rejection_reason}` : ''}</p>
                )}
                {!detail.rejected_at && detail.is_approved && <p style={{ color: '#10B981' }}>Aprovado.</p>}
                {!detail.rejected_at && !detail.is_approved && <p>Aguardando análise da equipe LOBBY.</p>}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>Histórico</h3>
              {history.length === 0 ? (
                <p className="text-xs" style={{ color: colors.textMuted }}>Nenhum evento registrado ainda.</p>
              ) : (
                <div className="space-y-2">
                  {history.map((h, i) => (
                    <div key={i} className="rounded-lg border p-2.5 text-xs" style={{ borderColor: colors.border }}>
                      <p className="font-semibold" style={{ color: colors.text }}>{ACTION_LABEL[h.action] ?? h.action}</p>
                      <p style={{ color: colors.textSecondary }}>{new Date(h.created_at).toLocaleString('pt-BR')} · {ACTOR_LABEL[h.actor_role]}</p>
                      {h.reason && <p className="mt-0.5" style={{ color: colors.text }}>{h.reason}</p>}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>Resultados</h3>
              {results.length === 0 ? (
                <p className="text-xs" style={{ color: colors.textMuted }}>Sem vendas vinculadas a esta promoção ainda — vendas feitas antes desta funcionalidade não entram aqui.</p>
              ) : (
                results.map(r => (
                  <div key={r.currency} className="space-y-1 rounded-lg border p-3 text-sm" style={{ borderColor: colors.border }}>
                    <p><span style={{ color: colors.textSecondary }}>Vendas confirmadas:</span> {r.sales_count}</p>
                    <p><span style={{ color: colors.textSecondary }}>Valor vendido:</span> {formatOfferPrice(r.gross_amount, r.currency, null)}</p>
                    <p><span style={{ color: colors.textSecondary }}>Desconto concedido:</span> {formatOfferPrice(r.discount_granted, r.currency, null)}</p>
                    <p><span style={{ color: colors.textSecondary }}>Reembolsos:</span> {formatOfferPrice(r.refunded_amount, r.currency, null)}</p>
                    <p><span style={{ color: colors.textSecondary }}>Sua participação:</span> <strong>{formatOfferPrice(r.partner_amount, r.currency, null)}</strong></p>
                  </div>
                ))
              )}
            </section>

            <div className="flex flex-col gap-2 border-t pt-4" style={{ borderColor: colors.border }}>
              {canCancel && (
                <button type="button" onClick={() => onCancel(detail.id)} className="rounded-lg border py-2 text-sm font-semibold" style={{ borderColor: '#EF4444', color: '#EF4444' }}>
                  {status.key === 'rascunho' ? 'Cancelar pedido' : 'Cancelar promoção agendada'}
                </button>
              )}
              {canEdit && (
                <button type="button" onClick={() => onEdit(detail.id)} className="rounded-lg border py-2 text-sm font-semibold" style={{ borderColor: colors.primary, color: colors.primary }}>
                  Editar promoção
                </button>
              )}
              {status.key === 'ativa' && (
                <div className="rounded-lg p-3 text-xs" style={{ background: colors.backgroundAlt }}>
                  Encerrar uma promoção ativa não é feito direto por aqui — fale com o suporte informando o identificador acima.
                </div>
              )}
              <button type="button" onClick={() => onDuplicate(detail.id)} className="rounded-lg border py-2 text-sm font-semibold" style={{ borderColor: colors.border, color: colors.text }}>
                {status.key === 'rejeitada' ? 'Corrigir e reenviar' : 'Duplicar como rascunho'}
              </button>
              <Link href={`/dashboard/suporte${partnerId ? `?parceiro=${partnerId}` : ''}`} className="text-center text-sm font-semibold" style={{ color: colors.primary }}>Contatar suporte →</Link>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
