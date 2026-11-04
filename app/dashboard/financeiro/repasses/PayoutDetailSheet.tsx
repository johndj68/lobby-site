'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Copy, Check, FileText, Ban, CheckCircle2 } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import { formatCurrencyBRL, formatDateBR } from '@/lib/finance'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'

export interface GroupedPayout {
  payout_id:             string
  reference:             string
  notes:                 string | null
  payout_status:         'confirmado' | 'revertido'
  total_amount:          number
  currency:              string
  destination_snapshot:  string | null
  created_at:            string
  reverted_at:           string | null
  revert_reason:         string | null
  items: {
    item_id:           string
    item_kind:          'app_purchase_main' | 'app_purchase_reserve' | 'subscription_invoice'
    item_amount:        number
    sale_id:            string | null
    application_id:     string | null
    application_name:   string
    plan_name:          string
    sale_paid_at:       string
  }[]
}

const ITEM_KIND_LABEL: Record<string, string> = {
  app_purchase_main: 'Compra única — fatia principal',
  app_purchase_reserve: 'Compra única — reserva de disputa',
  subscription_invoice: 'Assinatura',
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

function buildDemonstrativo(p: GroupedPayout): string {
  const lines = [
    `Demonstrativo de repasse — LOBBY`,
    `Gerado em ${fmtDateTime(new Date().toISOString())}`,
    ``,
    `Referência: ${p.reference}`,
    `Status: ${p.payout_status === 'confirmado' ? 'Confirmado' : 'Revertido'}`,
    `Criado em: ${fmtDateTime(p.created_at)}`,
    p.reverted_at ? `Revertido em: ${fmtDateTime(p.reverted_at)}${p.revert_reason ? ` — motivo: ${p.revert_reason}` : ''}` : null,
    `Destino: ${p.destination_snapshot ?? 'não registrado'}`,
    `Valor total: ${formatCurrencyBRL(p.total_amount)} ${p.currency}`,
    p.notes ? `Observações: ${p.notes}` : null,
    ``,
    `Vendas incluídas:`,
    ...p.items.map(i => `  - ${i.application_name} — ${i.plan_name} (${ITEM_KIND_LABEL[i.item_kind]}), vendido em ${formatDateBR(i.sale_paid_at.slice(0, 10))}: ${formatCurrencyBRL(i.item_amount)}`),
    ``,
    `Este é um demonstrativo interno gerado a partir dos registros da LOBBY — não é um comprovante bancário.`,
  ].filter((l): l is string => l !== null)
  return lines.join('\n')
}

interface Props {
  payout:    GroupedPayout | null
  partnerId: string | null
  onClose:   () => void
}

export default function PayoutDetailSheet({ payout, partnerId, onClose }: Props) {
  const [copied, setCopied] = useState(false)

  const copyRef = () => {
    if (!payout) return
    navigator.clipboard?.writeText(payout.reference)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const downloadDemonstrativo = () => {
    if (!payout) return
    const blob = new Blob([buildDemonstrativo(payout)], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `demonstrativo-repasse-${payout.reference.replace(/[^a-zA-Z0-9-]/g, '_')}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const reverted = payout?.payout_status === 'revertido'
  const itemsTotal = payout?.items.reduce((s, i) => s + i.item_amount, 0) ?? 0

  return (
    <Sheet open={!!payout} onOpenChange={open => { if (!open) onClose() }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg" aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>Detalhes do repasse</SheetTitle>
          <SheetDescription>Referência, destino, vendas incluídas e histórico deste repasse.</SheetDescription>
        </SheetHeader>

        {payout && (
          <div className="flex flex-col gap-5 px-4 pb-6">
            <div className="flex items-start justify-between gap-3 border-b pb-4" style={{ borderColor: colors.border }}>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="truncate font-mono text-xs" style={{ color: colors.textMuted }}>{payout.reference}</p>
                  <button type="button" onClick={copyRef} aria-label="Copiar referência" className="rounded p-0.5" style={{ color: colors.textMuted }}>
                    {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
                  </button>
                </div>
                <p className="mt-1 text-xl font-bold tabular-nums" style={{ color: colors.text }}>{formatCurrencyBRL(payout.total_amount)}</p>
                <span className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold" style={{ color: reverted ? '#EF4444' : '#10B981', background: reverted ? '#EF44441A' : '#10B9811A' }}>
                  {reverted ? <Ban size={11} aria-hidden="true" /> : <CheckCircle2 size={11} aria-hidden="true" />}
                  {reverted ? 'Revertido' : 'Confirmado'}
                </span>
              </div>
            </div>

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>Datas</h3>
              <div className="space-y-1 text-sm" style={{ color: colors.text }}>
                <p><span style={{ color: colors.textSecondary }}>Criado em:</span> {fmtDateTime(payout.created_at)}</p>
                {payout.reverted_at && <p><span style={{ color: colors.textSecondary }}>Revertido em:</span> {fmtDateTime(payout.reverted_at)}</p>}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>Destino</h3>
              <p className="text-sm" style={{ color: colors.text }}>{payout.destination_snapshot ?? 'Não registrado neste repasse.'}</p>
              {payout.notes && <p className="mt-1 text-xs" style={{ color: colors.textSecondary }}>{payout.notes}</p>}
            </section>

            {reverted && (
              <section className="rounded-lg border p-3" style={{ borderColor: '#EF4444' }}>
                <h3 className="mb-1 text-xs font-bold uppercase tracking-wide" style={{ color: '#EF4444' }}>Motivo da reversão</h3>
                <p className="text-sm" style={{ color: colors.text }}>{payout.revert_reason ?? '—'}</p>
              </section>
            )}

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>
                Vendas incluídas ({payout.items.length})
              </h3>
              <div className="space-y-1.5">
                {payout.items.map(i => (
                  <div key={i.item_id} className="rounded-lg border p-2.5 text-xs" style={{ borderColor: colors.border }}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold" style={{ color: colors.text }}>{i.application_name} — {i.plan_name}</p>
                      <strong className="tabular-nums" style={{ color: colors.text }}>{formatCurrencyBRL(i.item_amount)}</strong>
                    </div>
                    <p style={{ color: colors.textSecondary }}>{ITEM_KIND_LABEL[i.item_kind]} · vendido em {formatDateBR(i.sale_paid_at.slice(0, 10))}</p>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between border-t pt-2 text-xs font-semibold" style={{ borderColor: colors.border, color: colors.text }}>
                <span>Total da composição</span>
                <span className="tabular-nums">{formatCurrencyBRL(itemsTotal)}</span>
              </div>
            </section>

            <div className="flex flex-col gap-2">
              <button type="button" onClick={downloadDemonstrativo} className="inline-flex items-center justify-center gap-2 rounded-lg border py-2 text-sm font-semibold" style={{ borderColor: colors.border, color: colors.text }}>
                <FileText size={14} aria-hidden="true" />Baixar demonstrativo
              </button>
              <p className="text-[11px]" style={{ color: colors.textMuted }}>
                Demonstrativo interno gerado a partir dos registros da LOBBY — não é um comprovante bancário.
              </p>
            </div>

            <div className="rounded-lg p-3 text-sm" style={{ background: colors.backgroundAlt }}>
              <p style={{ color: colors.text }}>Dúvidas sobre este repasse?</p>
              <p className="mt-0.5 text-xs" style={{ color: colors.textSecondary }}>
                Informe a referência <strong>{payout.reference}</strong> ao abrir um chamado.
              </p>
              <Link href={`/dashboard/suporte${partnerId ? `?parceiro=${partnerId}` : ''}`} className="mt-1 inline-block text-sm font-semibold" style={{ color: colors.primary }}>Contatar suporte →</Link>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
