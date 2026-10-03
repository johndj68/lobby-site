'use client'

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import { formatCurrencyBRL, formatDateBR } from '@/lib/finance'

export interface PendenciasRow {
  recebimento_incompleto:    boolean
  repasse_revertido_recente: boolean
  repasse_revertido_motivo:  string | null
  repasse_revertido_valor:   number | null
  repasse_revertido_em:      string | null
  valor_bloqueado_disputa:   number
  disputas_abertas_qtd:      number
}

interface Aviso {
  titulo:  string
  impacto: string
  acao:    string
  href:    string
}

function buildAvisos(p: PendenciasRow, partnerId: string | null): Aviso[] {
  const avisos: Aviso[] = []
  const parceiroQuery = partnerId ? `?parceiro=${partnerId}` : ''

  if (p.recebimento_incompleto) {
    avisos.push({
      titulo: 'Configuração de recebimento incompleta',
      impacto: 'Sem uma chave PIX cadastrada, seus repasses não podem ser enviados quando ficarem disponíveis.',
      acao: 'Completar cadastro',
      href: `/dashboard/financeiro/configuracoes${parceiroQuery}`,
    })
  }

  if (p.repasse_revertido_recente) {
    const quando = p.repasse_revertido_em ? ` em ${formatDateBR(p.repasse_revertido_em.slice(0, 10))}` : ''
    const valor = p.repasse_revertido_valor != null ? `${formatCurrencyBRL(p.repasse_revertido_valor)} — ` : ''
    avisos.push({
      titulo: `Um repasse seu foi revertido${quando}`,
      impacto: p.repasse_revertido_motivo ? `${valor}motivo: ${p.repasse_revertido_motivo}` : 'Um repasse já confirmado foi desfeito.',
      acao: 'Ver repasses e extrato',
      href: `/dashboard/financeiro/repasses${parceiroQuery}`,
    })
  }

  if (p.disputas_abertas_qtd > 0) {
    avisos.push({
      titulo: `${formatCurrencyBRL(p.valor_bloqueado_disputa)} bloqueado${p.disputas_abertas_qtd > 1 ? 's' : ''} por disputa`,
      impacto: `${p.disputas_abertas_qtd} compra${p.disputas_abertas_qtd > 1 ? 's' : ''} em disputa — o valor fica retido até a resolução, fora das filas normais de repasse.`,
      acao: 'Falar com o suporte',
      href: '/dashboard/suporte',
    })
  }

  return avisos
}

interface Props {
  data:    PendenciasRow | null
  loading: boolean
  error:   boolean
  onRetry: () => void
  partnerId: string | null
}

export default function PendenciasAvisos({ data, loading, error, onRetry, partnerId }: Props) {
  if (loading) return null

  if (error) {
    return (
      <div className="mb-6 flex items-center gap-3 rounded-xl border p-3 text-xs" style={{ borderColor: '#EF4444', color: colors.text }}>
        <AlertTriangle size={14} style={{ color: '#EF4444' }} aria-hidden="true" />
        Dados financeiros temporariamente indisponíveis pra pendências.
        <button onClick={onRetry} className="rounded-lg border px-2 py-1 font-semibold" style={{ borderColor: colors.border }}>Tentar novamente</button>
      </div>
    )
  }

  if (!data) return null
  const avisos = buildAvisos(data, partnerId)
  if (avisos.length === 0) return null

  return (
    <div className="mb-6 space-y-2">
      {avisos.map(a => (
        <div key={a.titulo} className="flex items-start gap-3 rounded-xl border p-3" style={{ borderColor: '#F59E0B', background: '#F59E0B0D' }}>
          <AlertTriangle size={16} style={{ color: '#F59E0B', marginTop: 2 }} aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: colors.text }}>{a.titulo}</p>
            <p className="mt-0.5 text-xs" style={{ color: colors.textSecondary }}>{a.impacto}</p>
            <Link href={a.href} className="mt-1 inline-block text-xs font-semibold" style={{ color: colors.primary }}>
              {a.acao} →
            </Link>
          </div>
        </div>
      ))}
    </div>
  )
}
