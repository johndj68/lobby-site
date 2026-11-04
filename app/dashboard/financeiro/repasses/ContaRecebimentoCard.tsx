'use client'

import Link from 'next/link'
import { Landmark, AlertTriangle } from 'lucide-react'
import { colors } from '@/lib/design-tokens'

export interface DestinationRow {
  configured:          boolean
  payout_method:       'pix' | 'bank_transfer' | null
  masked_pix:          string | null
  bank_name:           string | null
  masked_bank_account: string | null
  account_holder:      string | null
}

interface Props {
  data:      DestinationRow | null
  loading:   boolean
  partnerId: string | null
  /** RPC devolveu "Sem permissão" — distinguir é essencial: senão o
   *  viewer delegado sem a permissão certa lê "sem chave cadastrada",
   *  uma afirmação falsa sobre o estado real do dono, causada pela
   *  PRÓPRIA permissão faltando, não pela configuração do parceiro. */
  permissionDenied?: boolean
}

export default function ContaRecebimentoCard({ data, loading, partnerId, permissionDenied }: Props) {
  // Dado bancário é sempre do DONO do financeiro, mas a tela de edição
  // (/dashboard/financeiro/configuracoes) só edita a própria conta — igual
  // já decidido em PendenciasAvisos.tsx. Delegado só vê, nunca edita em
  // nome de outro parceiro aqui.
  const canManage = !partnerId

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: colors.border, background: colors.card }}>
      <p className="mb-3 flex items-center gap-1.5 text-sm font-bold" style={{ color: colors.text }}>
        <Landmark size={15} aria-hidden="true" />Conta de recebimento
      </p>
      {loading ? (
        <div className="h-10 animate-pulse rounded" style={{ background: colors.borderLight }} />
      ) : permissionDenied ? (
        <div className="rounded-lg border p-2.5 text-xs" style={{ borderColor: colors.border, background: colors.backgroundAlt, color: colors.text }}>
          Você não tem permissão para ver a conta de recebimento deste parceiro.
        </div>
      ) : !data?.configured ? (
        <div className="flex items-start gap-2 rounded-lg border p-2.5 text-xs" style={{ borderColor: '#F59E0B', background: '#F59E0B0D' }}>
          <AlertTriangle size={14} style={{ color: '#F59E0B' }} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span style={{ color: colors.text }}>
            {canManage ? 'Sem destino de recebimento cadastrado — seus repasses não podem ser enviados quando ficarem disponíveis.' : 'O dono deste financeiro ainda não cadastrou um destino de recebimento.'}
          </span>
        </div>
      ) : (
        <div>
          <p className="text-xs font-semibold" style={{ color: colors.textSecondary }}>
            {data.payout_method === 'bank_transfer' ? 'Transferência bancária' : 'Chave PIX'}
          </p>
          <p className="text-sm" style={{ color: colors.text }}>
            {data.payout_method === 'bank_transfer'
              ? `${data.bank_name ?? '—'} · ${data.masked_bank_account ?? '—'}`
              : data.masked_pix}
          </p>
          {data.account_holder && (
            <>
              <p className="mt-2 text-xs font-semibold" style={{ color: colors.textSecondary }}>Titular</p>
              <p className="text-sm" style={{ color: colors.text }}>{data.account_holder}</p>
            </>
          )}
        </div>
      )}
      {canManage && (
        <Link href="/dashboard/financeiro/configuracoes" className="mt-3 inline-block text-xs font-semibold" style={{ color: colors.primary }}>
          Gerenciar recebimento →
        </Link>
      )}
    </div>
  )
}
