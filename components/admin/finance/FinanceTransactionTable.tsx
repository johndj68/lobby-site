'use client'

import { motion } from 'framer-motion'
import { Eye, Pencil, CheckCircle2, Ban, Trash2, Wallet } from 'lucide-react'
import { formatCurrencyBRL, formatDateBR, PAYMENT_METHOD_LABEL } from '@/lib/finance'
import { FinanceTypeBadge, FinanceStatusBadge } from './FinanceBadges'
import type { FinancialTransaction } from '@/types'

interface Props {
  transactions: FinancialTransaction[]
  onView:      (t: FinancialTransaction) => void
  onEdit:      (t: FinancialTransaction) => void
  onMarkPaid:  (t: FinancialTransaction) => void
  onCancel:    (t: FinancialTransaction) => void
  onDelete:    (t: FinancialTransaction) => void
}

/**
 * Lista de transações — cards que se reorganizam por breakpoint em vez de
 * um <table> tradicional (o projeto não usa tabelas HTML em nenhum outro
 * lugar; listas já são sempre div/grid-based), então não existe cenário
 * de scroll horizontal em nenhuma largura de tela.
 */
export default function FinanceTransactionTable({ transactions, onView, onEdit, onMarkPaid, onCancel, onDelete }: Props) {
  if (transactions.length === 0) return null

  return (
    <div className="space-y-2.5">
      {transactions.map((t, i) => (
        <motion.div
          key={t.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(i, 10) * 0.02 }}
          className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.03] transition-all hover:border-white/[0.12]"
        >
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Left: description + client + badges */}
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <FinanceTypeBadge type={t.type} />
                <FinanceStatusBadge status={t.status} />
                <span className="text-[11px] text-white/30">{formatDateBR(t.sale_date)}</span>
              </div>
              <p className="truncate text-sm font-bold text-white">{t.description}</p>
              <p className="truncate text-[11px] text-white/40">
                {t.client_name || 'Sem cliente vinculado'}
                {t.company_name && ` · ${t.company_name}`}
              </p>
            </div>

            {/* Middle: value + payment method */}
            <div className="flex shrink-0 flex-col gap-0.5 sm:items-end sm:text-right">
              <span className="text-base font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                {formatCurrencyBRL(t.amount)}
              </span>
              <span className="text-[11px] text-white/35">
                {t.payment_method ? PAYMENT_METHOD_LABEL[t.payment_method] : '—'}
              </span>
            </div>

            {/* Right: actions */}
            <div className="flex shrink-0 flex-wrap gap-1.5">
              <button type="button" onClick={() => onView(t)} aria-label="Ver detalhes"
                className="rounded-lg bg-white/[0.05] p-2 text-white/45 transition-all hover:bg-white/[0.10] hover:text-white/80">
                <Eye size={14} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => onEdit(t)} aria-label="Editar"
                className="rounded-lg bg-[#A78BFA]/10 p-2 text-[#A78BFA] transition-all hover:bg-[#A78BFA]/20">
                <Pencil size={14} aria-hidden="true" />
              </button>
              {t.status !== 'pago' && (
                <button type="button" onClick={() => onMarkPaid(t)} aria-label="Marcar como pago"
                  className="rounded-lg bg-[#10B981]/10 p-2 text-[#34D399] transition-all hover:bg-[#10B981]/20">
                  <CheckCircle2 size={14} aria-hidden="true" />
                </button>
              )}
              {t.status !== 'cancelado' && (
                <button type="button" onClick={() => onCancel(t)} aria-label="Cancelar entrada"
                  className="rounded-lg bg-[#F59E0B]/10 p-2 text-[#F59E0B] transition-all hover:bg-[#F59E0B]/20">
                  <Ban size={14} aria-hidden="true" />
                </button>
              )}
              <button type="button" onClick={() => onDelete(t)} aria-label="Excluir"
                className="rounded-lg bg-red-500/10 p-2 text-red-400 transition-all hover:bg-red-500/20">
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

export function FinanceTransactionEmptyState({ hasFilters, onCreate }: { hasFilters: boolean; onCreate: () => void }) {
  if (hasFilters) {
    return (
      <div className="rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-10 text-center">
        <p className="text-sm font-medium text-white/50">Nenhum resultado encontrado para os filtros selecionados.</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-white/[0.10] bg-white/[0.02] px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#005BFF]/10">
        <Wallet size={26} className="text-[#60A5FA]" aria-hidden="true" />
      </div>
      <div>
        <h3 className="text-base font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          Nenhuma entrada financeira registrada
        </h3>
        <p className="mt-1.5 max-w-sm text-sm text-white/40">
          Registre vendas de e-books, projetos ou visitas técnicas para acompanhar o financeiro da empresa.
        </p>
      </div>
      <button type="button" onClick={onCreate}
        className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-5 py-2.5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(0,91,255,0.28)] transition-all hover:-translate-y-0.5">
        Registrar primeira entrada
      </button>
    </div>
  )
}
