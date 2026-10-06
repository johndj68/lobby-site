'use client'

import { Wallet, Clock, ShieldCheck, AlertTriangle } from 'lucide-react'
import { colors, shadows } from '@/lib/design-tokens'
import { formatCurrencyBRL, formatDateBR } from '@/lib/finance'

export interface OverviewRow {
  retido_amount:         number
  elegivel_amount:       number
  reserva_retida_amount: number
}

export interface PendenciasRow {
  repasse_revertido_recente: boolean
  repasse_revertido_motivo:  string | null
  repasse_revertido_valor:   number | null
  repasse_revertido_em:      string | null
  valor_bloqueado_disputa:   number
  disputas_abertas_qtd:      number
}

interface Props {
  overview:    OverviewRow | null
  pendencias:  PendenciasRow | null
  loading:     boolean
  error:       boolean
  onGoLiberacoes: () => void
  onRetry:     () => void
}

/**
 * 3 cards de saldo ATUAL — não 4. O mockup original tinha um 4º card
 * "Em processamento", mas neste modelo um repasse nasce já confirmado
 * (create_partner_payout libera reserva/retenção e registra o repasse no
 * mesmo instante — não existe "comprometido mas ainda não concluído", ver
 * 20260927200000_repasse_parceiro.sql). A própria Visão geral desta área
 * (VisaoGeralClient.tsx) já tinha chegado nessa mesma conclusão — 3 cards
 * reais, "repassado" fica só no histórico (nunca como saldo atual).
 */
export default function SaldosAtuais({ overview, pendencias, loading, error, onGoLiberacoes, onRetry }: Props) {
  if (error) {
    return (
      <div className="mb-6 flex items-center gap-3 rounded-xl border p-4 text-sm" style={{ borderColor: '#EF4444', color: colors.text }}>
        Não foi possível carregar os saldos atuais.
        <button onClick={onRetry} className="rounded-lg border px-3 py-1 text-xs font-semibold" style={{ borderColor: colors.border }}>Tentar novamente</button>
      </div>
    )
  }

  const skeleton = loading && !overview

  return (
    <div className="mb-6">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>Saldos atuais · BRL</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border-2 p-4" style={{ borderColor: colors.primary, background: `${colors.primary}0D`, boxShadow: shadows.card }}>
          <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: colors.primary }}>
            <Wallet size={14} aria-hidden="true" />Disponível para repasse
          </p>
          {skeleton ? <Skeleton /> : (
            <p className="mt-1 text-xl font-bold tabular-nums" style={{ color: colors.primary }}>{formatCurrencyBRL(overview!.elegivel_amount)}</p>
          )}
          <p className="mt-1 text-[11px]" style={{ color: colors.textMuted }}>
            Valor já elegível, ainda não incluído em nenhum repasse.
          </p>
        </div>

        <div className="rounded-xl border p-4" style={{ borderColor: colors.border, background: colors.card, boxShadow: shadows.card }}>
          <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: colors.textSecondary }}>
            <Clock size={14} aria-hidden="true" />Em retenção
          </p>
          {skeleton ? <Skeleton /> : (
            <p className="mt-1 text-xl font-bold tabular-nums" style={{ color: '#F59E0B' }}>{formatCurrencyBRL(overview!.retido_amount)}</p>
          )}
          <p className="mt-1 text-[11px]" style={{ color: colors.textMuted }}>Ainda dentro do prazo inicial da venda.</p>
          <button type="button" onClick={onGoLiberacoes} className="mt-1 text-[11px] font-semibold" style={{ color: colors.primary }}>
            Ver liberações previstas →
          </button>
        </div>

        <div className="rounded-xl border p-4" style={{ borderColor: colors.border, background: colors.card, boxShadow: shadows.card }}>
          <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: colors.textSecondary }}>
            <ShieldCheck size={14} aria-hidden="true" />Reserva de segurança
          </p>
          {skeleton ? <Skeleton /> : (
            <p className="mt-1 text-xl font-bold tabular-nums" style={{ color: '#6D28D9' }}>{formatCurrencyBRL(overview!.reserva_retida_amount)}</p>
          )}
          <p className="mt-1 text-[11px]" style={{ color: colors.textMuted }}>
            Parcela reservada preventivamente conforme a política da venda.
          </p>
        </div>
      </div>

      {pendencias && (pendencias.valor_bloqueado_disputa > 0 || pendencias.repasse_revertido_recente) && (
        <div className="mt-3 flex flex-col gap-1 rounded-xl border p-3 text-xs" style={{ borderColor: '#F59E0B', background: '#F59E0B0D' }}>
          {pendencias.valor_bloqueado_disputa > 0 && (
            <p className="flex items-center gap-1.5" style={{ color: colors.text }}>
              <AlertTriangle size={13} style={{ color: '#F59E0B' }} aria-hidden="true" />
              {formatCurrencyBRL(pendencias.valor_bloqueado_disputa)} bloqueado{pendencias.disputas_abertas_qtd === 1 ? '' : 's'} por {pendencias.disputas_abertas_qtd} disputa{pendencias.disputas_abertas_qtd === 1 ? '' : 's'} em andamento — fica fora dos saldos acima até a disputa ser encerrada.
            </p>
          )}
          {pendencias.repasse_revertido_recente && (
            <p className="flex items-center gap-1.5" style={{ color: colors.text }}>
              <AlertTriangle size={13} style={{ color: '#F59E0B' }} aria-hidden="true" />
              Um repasse{pendencias.repasse_revertido_valor != null ? ` de ${formatCurrencyBRL(pendencias.repasse_revertido_valor)}` : ''} foi revertido
              {pendencias.repasse_revertido_em ? ` em ${formatDateBR(pendencias.repasse_revertido_em.slice(0, 10))}` : ''}
              {pendencias.repasse_revertido_motivo ? ` — motivo: ${pendencias.repasse_revertido_motivo}` : ''}.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Skeleton() {
  return <div className="mt-2 h-6 w-24 animate-pulse rounded" style={{ background: colors.borderLight }} />
}
