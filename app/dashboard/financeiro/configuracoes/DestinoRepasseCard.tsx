'use client'

import { Landmark, Lock, Gift, Clock } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import type { DestinationDetail } from './types'

const PIX_TYPE_LABEL: Record<string, string> = { cpf: 'CPF', cnpj: 'CNPJ', email: 'E-mail', telefone: 'Telefone', aleatoria: 'Aleatória' }
const PESSOA_LABEL: Record<string, string> = { pf: 'Pessoa física', pj: 'Pessoa jurídica' }
const CONTA_TYPE_LABEL: Record<string, string> = { corrente: 'Conta corrente', poupanca: 'Conta poupança' }

interface Props {
  data: DestinationDetail | null
  loading: boolean
  onCreate: () => void
  onViewPending: () => void
}

export default function DestinoRepasseCard({ data, loading, onCreate, onViewPending }: Props) {
  if (loading) {
    return (
      <div className="rounded-xl border p-5" style={{ borderColor: colors.border, background: colors.card }}>
        <div className="h-5 w-40 animate-pulse rounded" style={{ background: colors.borderLight }} />
        <div className="mt-3 h-20 animate-pulse rounded" style={{ background: colors.borderLight }} />
      </div>
    )
  }

  // Sem cadastro vigente, mas já existe uma 1ª solicitação em análise —
  // nunca oferecer "Cadastrar recebimento" de novo aqui (criaria uma 2ª
  // solicitação conflitante, que o backend já bloqueia, mas a UI não
  // devia nem abrir essa porta).
  if (!data?.configured && data?.pendingRequestId) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border p-10 text-center" style={{ borderColor: '#F59E0B', background: '#F59E0B0D' }}>
        <Clock size={28} style={{ color: '#F59E0B' }} aria-hidden="true" />
        <p className="text-sm font-semibold" style={{ color: colors.text }}>Seu primeiro cadastro está em análise</p>
        <p className="max-w-sm text-xs" style={{ color: colors.textSecondary }}>A equipe LOBBY vai revisar antes de valer para os próximos repasses.</p>
        <button type="button" onClick={onViewPending} className="mt-2 inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-bold" style={{ borderColor: '#F59E0B', color: '#F59E0B' }}>
          Ver alteração
        </button>
      </div>
    )
  }

  if (!data?.configured) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border p-10 text-center" style={{ borderColor: colors.border, background: colors.card }}>
        <Gift size={28} style={{ color: colors.textMuted }} aria-hidden="true" />
        <p className="text-sm font-semibold" style={{ color: colors.text }}>Adicione seus dados de recebimento</p>
        <p className="max-w-sm text-xs" style={{ color: colors.textSecondary }}>Cadastre o destino dos seus repasses para concluir esta configuração.</p>
        <button type="button" onClick={onCreate} className="mt-2 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white" style={{ background: colors.primary }}>
          Cadastrar recebimento
        </button>
      </div>
    )
  }

  const fields: { label: string; value: string | null }[] = [
    { label: 'Titular', value: data.accountHolder },
    { label: 'Tipo de pessoa', value: data.personType ? PESSOA_LABEL[data.personType] : null },
    { label: 'Documento', value: data.maskedDocument },
  ]
  if (data.payoutMethod === 'pix') {
    fields.push(
      { label: 'Tipo de chave', value: data.pixKeyType ? PIX_TYPE_LABEL[data.pixKeyType] : null },
      { label: 'Chave Pix', value: data.maskedPix },
    )
  } else {
    fields.push(
      { label: 'Banco', value: data.bankName },
      { label: 'Agência', value: data.maskedBankAgency },
      { label: 'Conta', value: data.maskedBankAccount },
      { label: 'Tipo de conta', value: data.bankAccountType ? CONTA_TYPE_LABEL[data.bankAccountType] : null },
    )
  }
  const visibleFields = fields.filter(f => f.value)

  return (
    <div className="rounded-xl border p-5" style={{ borderColor: colors.border, background: colors.card }}>
      <p className="mb-4 flex items-center gap-2 text-sm font-bold" style={{ color: colors.text }}>
        <Landmark size={16} aria-hidden="true" />Destino dos repasses
      </p>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {visibleFields.map(f => (
          <div key={f.label}>
            <p className="text-xs font-semibold" style={{ color: colors.textSecondary }}>{f.label}</p>
            <p className="text-sm" style={{ color: colors.text }}>{f.value}</p>
          </div>
        ))}
      </div>
      {data.pendingRequestId && (
        <button type="button" onClick={onViewPending} className="mt-3 flex w-full items-start gap-2 rounded-lg border p-2.5 text-left text-xs" style={{ borderColor: '#F59E0B', background: '#F59E0B0D' }}>
          <Clock size={13} style={{ color: '#F59E0B' }} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span style={{ color: colors.text }}>Há uma alteração em análise para este destino — o cadastro acima continua valendo até a aprovação. <strong>Ver alteração →</strong></span>
        </button>
      )}

      <div className="mt-4 flex items-start gap-2 rounded-lg p-2.5 text-xs" style={{ background: colors.backgroundAlt, color: colors.textSecondary }}>
        <Lock size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>Seus dados aparecem protegidos nesta tela. Dados cadastrados não significam titularidade verificada.</span>
      </div>
    </div>
  )
}
