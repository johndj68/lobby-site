'use client'

import { FileText, CreditCard, Calendar } from 'lucide-react'
import { colors, shadows } from '@/lib/design-tokens'
import { formatDateBR } from '@/lib/finance'
import { SITUACAO_LABEL, type SituacaoCadastro, type DestinationDetail } from './types'

const SITUACAO_COLOR: Record<SituacaoCadastro, { color: string; bg: string }> = {
  nao_cadastrado:   { color: colors.textSecondary, bg: colors.backgroundAlt2 },
  incompleto:       { color: '#F59E0B', bg: '#F59E0B1A' },
  cadastrado:       { color: colors.primary, bg: `${colors.primary}14` },
  precisa_correcao: { color: '#EF4444', bg: '#EF44441A' },
  aguardando_aprovacao: { color: '#F59E0B', bg: '#F59E0B1A' },
}

const METODO_LABEL: Record<string, string> = { pix: 'Pix', bank_transfer: 'Transferência bancária' }

interface Props {
  situacao: SituacaoCadastro
  destination: DestinationDetail | null
  loading: boolean
}

export default function SituacaoRecebimento({ situacao, destination, loading }: Props) {
  const style = SITUACAO_COLOR[situacao]
  return (
    <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-xl border p-3" style={{ borderColor: colors.border, background: colors.card, boxShadow: shadows.card }}>
        <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: colors.textSecondary }}>
          <FileText size={14} aria-hidden="true" />Situação do cadastro
        </p>
        {loading ? (
          <div className="mt-2 h-5 w-28 animate-pulse rounded" style={{ background: colors.borderLight }} />
        ) : (
          <span className="mt-1.5 inline-flex rounded-full px-2 py-0.5 text-xs font-bold" style={{ color: style.color, background: style.bg }}>
            {SITUACAO_LABEL[situacao]}
          </span>
        )}
      </div>
      <div className="rounded-xl border p-3" style={{ borderColor: colors.border, background: colors.card, boxShadow: shadows.card }}>
        <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: colors.textSecondary }}>
          <CreditCard size={14} aria-hidden="true" />Método de recebimento
        </p>
        <p className="mt-1 text-sm font-bold" style={{ color: colors.text }}>
          {loading ? '—' : destination?.payoutMethod ? METODO_LABEL[destination.payoutMethod] : '—'}
        </p>
      </div>
      <div className="rounded-xl border p-3" style={{ borderColor: colors.border, background: colors.card, boxShadow: shadows.card }}>
        <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: colors.textSecondary }}>
          <Calendar size={14} aria-hidden="true" />Última atualização
        </p>
        <p className="mt-1 text-sm font-bold" style={{ color: colors.text }}>
          {loading ? '—' : destination?.updatedAt ? `${formatDateBR(destination.updatedAt.slice(0, 10))} ${new Date(destination.updatedAt).toTimeString().slice(0, 5)}` : '—'}
        </p>
      </div>
    </div>
  )
}
