import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { colors } from '@/lib/design-tokens'
import { formatCurrencyBRL } from '@/lib/finance'

export const metadata: Metadata = { title: 'Vendas e financeiro | LOBBY', robots: { index: false, follow: false } }

interface OverviewRow {
  retido_amount:         number
  elegivel_amount:       number
  repassado_amount:      number
  reserva_retida_amount: number
  vendas_mes_count:      number
  vendas_mes_amount:     number
  reembolsos_mes_count:  number
  reembolsos_mes_amount: number
}

const EMPTY_OVERVIEW: OverviewRow = {
  retido_amount: 0, elegivel_amount: 0, repassado_amount: 0, reserva_retida_amount: 0,
  vendas_mes_count: 0, vendas_mes_amount: 0, reembolsos_mes_count: 0, reembolsos_mes_amount: 0,
}

interface SearchParams {
  parceiro?: string
}

export default async function FinanceiroVisaoGeralPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const supabase = await createServerSupabaseClient()
  await requireClientSession(supabase)
  const sp = await searchParams
  const partnerId = sp.parceiro || null

  const { data, error } = await supabase.rpc('get_partner_financeiro_overview', { p_partner_id: partnerId }) as unknown as { data: OverviewRow[] | null; error: unknown }

  if (error) {
    return (
      <div>
        <h2 className="mb-4 text-lg font-bold" style={{ color: colors.text }}>Visão geral</h2>
        <p className="text-sm" style={{ color: colors.textSecondary }}>Não foi possível carregar seus indicadores financeiros. Tente novamente em instantes.</p>
      </div>
    )
  }

  const overview = data?.[0] ?? EMPTY_OVERVIEW

  const cards: { label: string; value: number; sub: string; color: string }[] = [
    { label: 'Retido',                      value: overview.retido_amount,         sub: 'Dentro do período de retenção',          color: '#F59E0B' },
    { label: 'Elegível para repasse',       value: overview.elegivel_amount,       sub: 'Fora da retenção, aguardando repasse',    color: colors.primary },
    { label: 'Já repassado',                value: overview.repassado_amount,      sub: 'Histórico de repasses confirmados',       color: '#10B981' },
    { label: 'Reserva de disputa retida',   value: overview.reserva_retida_amount, sub: 'Liberada em até 120 dias sem disputa',    color: '#6D28D9' },
    { label: 'Vendas do mês',               value: overview.vendas_mes_amount,     sub: `${overview.vendas_mes_count} venda${overview.vendas_mes_count === 1 ? '' : 's'}`, color: colors.text },
    { label: 'Reembolsos do mês',           value: overview.reembolsos_mes_amount, sub: `${overview.reembolsos_mes_count} reembolso${overview.reembolsos_mes_count === 1 ? '' : 's'}`, color: '#EF4444' },
  ]

  return (
    <div>
      <h2 className="mb-4 text-lg font-bold" style={{ color: colors.text }}>Visão geral</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cards.map(c => (
          <div key={c.label} className="rounded-xl border p-4" style={{ borderColor: colors.border, background: colors.backgroundAlt }}>
            <p className="text-xs font-semibold" style={{ color: colors.textSecondary }}>{c.label}</p>
            <p className="mt-1 text-xl font-bold" style={{ color: c.color }}>{formatCurrencyBRL(c.value)}</p>
            <p className="mt-0.5 text-[11px]" style={{ color: colors.textMuted }}>{c.sub}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
