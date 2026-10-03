'use client'

import Link from 'next/link'
import { colors } from '@/lib/design-tokens'
import { formatCurrencyBRL, formatDateBR } from '@/lib/finance'

export interface LiberacaoRow {
  sale_id:          string
  application_name: string
  plan_name:        string
  net_amount:       number
  release_date:     string
  days_remaining:   number
  tipo:             'retencao' | 'reserva'
}

interface Props {
  rows:      LiberacaoRow[]
  loading:   boolean
  error:     boolean
  onRetry:   () => void
  partnerId: string | null
}

export default function ProximasLiberacoes({ rows, loading, error, onRetry, partnerId }: Props) {
  const top = rows.slice(0, 5)

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: colors.border, background: colors.card }}>
      <p className="mb-3 text-sm font-bold" style={{ color: colors.text }}>Próximas liberações</p>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg" style={{ background: colors.borderLight }} />)}
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-xs" style={{ color: colors.text }}>
          Não foi possível carregar.
          <button onClick={onRetry} className="rounded-lg border px-2 py-1 font-semibold" style={{ borderColor: colors.border }}>Tentar novamente</button>
        </div>
      ) : top.length === 0 ? (
        <p className="text-sm" style={{ color: colors.textSecondary }}>Nenhuma liberação prevista.</p>
      ) : (
        <div className="space-y-2">
          {top.map(r => (
            <div key={`${r.sale_id}-${r.tipo}`} className="rounded-lg border p-2.5" style={{ borderColor: colors.borderLight }}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold" style={{ color: colors.text }}>{r.application_name} — {r.plan_name}</p>
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: r.tipo === 'reserva' ? '#6D28D9' : '#F59E0B', background: r.tipo === 'reserva' ? '#6D28D91A' : '#F59E0B1A' }}>
                  {r.tipo === 'reserva' ? 'Reserva' : 'Retenção'}
                </span>
              </div>
              <p className="mt-0.5 text-xs tabular-nums" style={{ color: colors.textSecondary }}>
                {formatCurrencyBRL(r.net_amount)} · {r.days_remaining <= 0 ? 'Disponível agora' : `Disponível em ${r.days_remaining} dia${r.days_remaining === 1 ? '' : 's'}`}
              </p>
              <p className="text-[11px]" style={{ color: colors.textMuted }}>Previsão de liberação: {formatDateBR(r.release_date.slice(0, 10))}</p>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-[11px]" style={{ color: colors.textMuted }}>
        Liberado do saldo — o repasse em si é feito pelo time LOBBY.
      </p>
      <Link href={`/dashboard/financeiro/repasses${partnerId ? `?parceiro=${partnerId}` : ''}`} className="mt-1 inline-block text-xs font-semibold" style={{ color: colors.primary }}>
        Ver todas as liberações →
      </Link>
    </div>
  )
}
