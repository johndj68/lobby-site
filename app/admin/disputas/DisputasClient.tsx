'use client'

import type { User as SupabaseUser } from '@supabase/supabase-js'
import AdminShell from '@/components/layout/AdminShell'
import { formatCurrencyBRL, formatDateBR } from '@/lib/finance'

export interface DisputeRow {
  id:                        string
  stripe_dispute_id:         string
  source_type:               string | null
  source_id:                 string | null
  amount:                    number
  currency:                  string
  reason:                    string | null
  status:                    string
  held_amount:               number | null
  partner_clawback_amount:   number | null
  opened_at:                 string
  closed_at:                 string | null
}

const SOURCE_LABEL: Record<string, string> = {
  credit_purchases:      'Compra de créditos',
  app_purchases:         'Compra de app',
  campaign_purchases:    'Campanha patrocinada',
  subscription_invoices: 'Assinatura',
}

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  needs_response:   { label: 'Precisa de resposta', color: '#DC2626', bg: 'rgba(220,38,38,0.1)' },
  under_review:     { label: 'Em análise',           color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  warning_needs_response: { label: 'Alerta — precisa de resposta', color: '#DC2626', bg: 'rgba(220,38,38,0.1)' },
  warning_under_review:   { label: 'Alerta — em análise', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  warning_closed:   { label: 'Alerta encerrado',      color: '#94A3B8', bg: 'rgba(148,163,184,0.1)' },
  won:              { label: 'Ganha — desfeito',      color: '#16A34A', bg: 'rgba(22,163,74,0.1)' },
  lost:             { label: 'Perdida — congelado',   color: '#DC2626', bg: 'rgba(220,38,38,0.1)' },
}

interface Props {
  user:      SupabaseUser
  profile:   { full_name?: string } | null
  disputes:  DisputeRow[]
}

export default function DisputasClient({ user, profile, disputes }: Props) {
  return (
    <AdminShell user={user} profile={profile}>
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="mb-1 text-2xl font-bold sm:text-3xl">Disputas Stripe</h1>
        <p className="mb-5 text-sm text-[#5D6475]">
          Registro automático de contestações abertas contra cobranças da LOBBY. O que a cobrança liberou
          (créditos, acesso, campanha ou assinatura) já foi congelado automaticamente na abertura — disputa
          ganha desfaz o congelamento, disputa perdida mantém pra sempre.
        </p>

        {disputes.length === 0 ? (
          <p className="rounded-xl border border-[#E3E7F0] bg-white p-6 text-sm text-[#5D6475]">
            Nenhuma disputa registrada.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#E3E7F0] bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E3E7F0] text-left text-xs text-[#5D6475]">
                  <th className="px-4 py-3">Aberta em</th>
                  <th className="px-4 py-3">Origem</th>
                  <th className="px-4 py-3">Valor</th>
                  <th className="px-4 py-3">Motivo</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Congelado</th>
                  <th className="px-4 py-3">Cobrar do parceiro</th>
                </tr>
              </thead>
              <tbody>
                {disputes.map((d) => {
                  const status = STATUS_LABEL[d.status] ?? { label: d.status, color: '#5D6475', bg: 'rgba(93,100,117,0.1)' }
                  return (
                    <tr key={d.id} className="border-b border-[#E3E7F0] last:border-0">
                      <td className="px-4 py-3">{formatDateBR(d.opened_at)}</td>
                      <td className="px-4 py-3">
                        {d.source_type ? (SOURCE_LABEL[d.source_type] ?? d.source_type) : (
                          <span className="text-[#DC2626]">Não identificada</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold">{formatCurrencyBRL(d.amount)}</td>
                      <td className="px-4 py-3 text-[#5D6475]">{d.reason ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ color: status.color, background: status.bg }}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#5D6475]">
                        {d.closed_at && d.status === 'won' ? 'Desfeito' : (d.source_type ? 'Sim' : '—')}
                        {d.held_amount ? ` (${d.held_amount} créditos)` : ''}
                      </td>
                      <td className="px-4 py-3">
                        {d.partner_clawback_amount && d.partner_clawback_amount > 0 ? (
                          <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ color: '#DC2626', background: 'rgba(220,38,38,0.1)' }}>
                            {formatCurrencyBRL(d.partner_clawback_amount)}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  )
}
