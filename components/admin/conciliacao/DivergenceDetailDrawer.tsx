'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Copy, Check, ExternalLink } from 'lucide-react'
import { formatCurrencyBRL } from '@/lib/finance'
import { OPERATION_TYPE_LABEL, RESULT_TYPE_LABEL, RESULT_TYPE_STYLE } from '@/lib/reconciliation-labels'
import type { ReconciliationItem, ReconciliationOperationType } from '@/types'

interface Props {
  item:  ReconciliationItem | null
  onClose: () => void
}

// Só linka pra listagem geral da área — nenhuma das tabelas conciliadas tem
// uma rota de detalhe por ID de compra hoje; fabricar um link de detalhe
// que não existe violaria a regra de "só mostrar links reais".
const OPERATION_LIST_LINK: Partial<Record<ReconciliationOperationType, { href: string; label: string }>> = {
  creditos:  { href: '/admin/creditos',              label: 'Ver listagem de créditos' },
  apps:      { href: '/admin/marketplace/aplicativos', label: 'Ver listagem de apps do marketplace' },
  destaques: { href: '/admin/marketplace/destaques',   label: 'Ver listagem de destaques patrocinados' },
}

const EXPLANATION: Record<ReconciliationItem['resultType'], string> = {
  correspondente:               'O pagamento no Stripe bate com o registro local: mesmo valor, moeda e status.',
  diferenca_valor:              'O Stripe e o registro local concordam que o pagamento existe, mas o valor (ou reembolso) registrado difere.',
  diferenca_moeda:              'O Stripe registrou a cobrança numa moeda diferente da gravada localmente — comparação de valor não é confiável até isso ser corrigido.',
  diferenca_status:             'O Stripe confirma o pagamento, mas o registro local ainda não está marcado como pago (ou está em outro status).',
  sem_registro_local:           'Existe uma cobrança bem-sucedida no Stripe sem nenhum registro local correspondente encontrado nas tabelas conciliadas.',
  sem_correspondencia_provedor: 'Existe um registro local marcado como pago sem nenhuma cobrança bem-sucedida do Stripe encontrada no período.',
  possivel_duplicidade:         'Mais de uma cobrança do Stripe aponta para a mesma compra local — pode ser uma tentativa duplicada de pagamento.',
  nao_verificavel:              'Não foi possível confirmar presença ou ausência com segurança (execução parcial ou registro na borda do período) — não é uma afirmação de divergência nem de correspondência.',
}

function CopyField({ label, value }: { label: string; value: string | null }) {
  const [copied, setCopied] = useState(false)
  if (!value) return null
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-white/30">{label}</p>
        <p className="truncate font-mono text-xs text-white/70">{value}</p>
      </div>
      <button type="button" aria-label={`Copiar ${label}`}
        onClick={() => { navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }}
        className="shrink-0 rounded-md p-1.5 text-white/40 hover:bg-white/[0.06] hover:text-white">
        {copied ? <Check size={13} className="text-[#34D399]" aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
      </button>
    </div>
  )
}

function CompareRow({ label, provider, local, differs }: { label: string; provider: string; local: string; differs: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2 border-b border-white/[0.05] py-2 text-xs last:border-0">
      <span className="text-white/40">{label}</span>
      <span className={differs ? 'font-semibold text-[#F87171]' : 'text-white/70'}>{provider}</span>
      <span className={differs ? 'font-semibold text-[#F87171]' : 'text-white/70'}>{local}</span>
    </div>
  )
}

/** Drawer de detalhe de uma ocorrência de conciliação — adaptado do shell de AreaDetailsDrawer. */
export default function DivergenceDetailDrawer({ item, onClose }: Props) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  const open = item !== null

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    titleRef.current?.focus()
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!item) return null

  const style = RESULT_TYPE_STYLE[item.resultType]
  const currencyDiffers = Boolean(item.providerCurrency && item.localCurrency && item.providerCurrency !== item.localCurrency)
  const amountDiffers   = item.providerAmount !== null && item.localAmount !== null && Math.abs(item.providerAmount - item.localAmount) > 0.01
  const statusDiffers   = item.resultType === 'diferenca_status'
  const listLink = item.operationType ? OPERATION_LIST_LINK[item.operationType] : undefined

  return (
    <AnimatePresence>
      <motion.div key="divergence-drawer-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      <motion.div key="divergence-drawer-panel" initial={{ opacity: 0, x: 32 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 32 }}
        transition={{ duration: 0.22 }} role="dialog" aria-modal="true" aria-labelledby="divergence-drawer-title"
        className="fixed inset-y-0 right-0 z-[70] flex w-full flex-col overflow-y-auto border-l border-white/[0.08] bg-[#0F172A] shadow-[0_30px_100px_rgba(0,0,0,0.55)] sm:w-[70%] lg:w-[480px]">

        <div className="shrink-0 border-b border-white/[0.08] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ color: style.color, background: style.bg }}>
                {RESULT_TYPE_LABEL[item.resultType]}
              </span>
              <h2 id="divergence-drawer-title" ref={titleRef} tabIndex={-1} className="mt-2 text-lg font-bold text-white outline-none">
                Detalhe da ocorrência
              </h2>
            </div>
            <button type="button" onClick={onClose} aria-label="Fechar detalhe"
              className="shrink-0 rounded-lg p-1.5 text-white/40 hover:bg-white/[0.06] hover:text-white">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-5 p-5">
          <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs leading-relaxed text-white/60">
            {EXPLANATION[item.resultType]}
            {item.note && <span className="mt-1.5 block text-white/40">{item.note}</span>}
          </p>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/30">Identificação</p>
            <div className="space-y-2">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-white/30">Tipo de operação</p>
                <p className="text-xs text-white/70">{item.operationType ? OPERATION_TYPE_LABEL[item.operationType] : '—'}</p>
              </div>
              <CopyField label="ID da cobrança Stripe" value={item.stripeChargeId} />
              <CopyField label="Payment Intent" value={item.stripePaymentIntentId} />
              <CopyField label="Registro local" value={item.localTable && item.localId ? `${item.localTable}:${item.localId}` : null} />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/30">Provedor × LOBBY</p>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="grid grid-cols-3 gap-2 border-b border-white/[0.08] pb-2 text-[10px] font-bold uppercase tracking-wide text-white/30">
                <span></span><span>Provedor</span><span>LOBBY</span>
              </div>
              <CompareRow label="Data"      provider={item.providerCreatedAt ? new Date(item.providerCreatedAt).toLocaleString('pt-BR') : '—'} local={item.localCreatedAt ? new Date(item.localCreatedAt).toLocaleString('pt-BR') : '—'} differs={false} />
              <CompareRow label="Moeda"     provider={item.providerCurrency ?? '—'} local={item.localCurrency ?? '—'} differs={currencyDiffers} />
              <CompareRow label="Valor"     provider={item.providerAmount !== null ? formatCurrencyBRL(item.providerAmount) : '—'} local={item.localAmount !== null ? formatCurrencyBRL(item.localAmount) : '—'} differs={amountDiffers} />
              <CompareRow label="Status"    provider="Pago (Stripe)" local={item.localStatus ?? '—'} differs={statusDiffers} />
              {(item.localRefundedAmount ?? 0) > 0 && (
                <CompareRow label="Reembolso" provider="—" local={formatCurrencyBRL(item.localRefundedAmount ?? 0)} differs={false} />
              )}
            </div>
          </div>

          {listLink && (
            <a href={listLink.href} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.10] px-3 py-2 text-xs font-semibold text-white/60 hover:border-white/25 hover:text-white/90">
              <ExternalLink size={13} aria-hidden="true" />
              {listLink.label}
            </a>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
