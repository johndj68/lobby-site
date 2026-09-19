'use client'

// Página de créditos do cliente.
// Exibe saldo atual, histórico de transações, compras pendentes
// e grade de pacotes disponíveis para compra.

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  Coins, Wallet, TrendingUp, TrendingDown, Clock,
  ShoppingCart, ArrowUpRight, ArrowDownRight, PackageOpen,
} from 'lucide-react'
import CreditPackageCard from '@/components/credits/CreditPackageCard'
import BuyCreditsModal from '@/components/credits/BuyCreditsModal'
import { formatCurrencyBRL } from '@/lib/finance'
import { formatCredits, CREDIT_TX_TYPE_LABEL, getCreditTxStyle, getCreditPurchaseStyle } from '@/lib/credits'
import { timeAgo } from '@/lib/utils'
import { createClient } from '@/lib/supabase'
import type { ClientCreditWallet, CreditPackage, CreditTransaction, CreditPurchase } from '@/types'
import type { User as SupabaseUser } from '@supabase/supabase-js'

/* ── Props recebidas do Server Component (page.tsx) ─────────── */
interface Props {
  user:                SupabaseUser
  profile:             { full_name?: string } | null
  initialWallet:       ClientCreditWallet | null   // carteira do cliente (saldo, totais)
  packages:            CreditPackage[]             // pacotes disponíveis para compra
  initialTransactions: CreditTransaction[]         // histórico de movimentações de crédito
  initialPurchases:    CreditPurchase[]            // histórico de compras de pacotes
}


export default function CreditosClient({ user, initialWallet, packages, initialTransactions, initialPurchases }: Props) {
  const searchParams = useSearchParams()
  const router = useRouter()

  // Props from server — refresh() delivers fresh values without unmounting
  const wallet       = initialWallet
  const transactions = initialTransactions
  const purchases    = initialPurchases

  // Pacote selecionado para compra — null = modal fechado
  const [buyingPkg, setBuyingPkg] = useState<CreditPackage | null>(null)

  // Realtime: refresca dados quando webhook confirma pagamento
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`credits:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'credit_purchases', filter: `client_id=eq.${user.id}` },
        (payload) => {
          router.refresh()
          const rec = payload.new as { status?: string }
          if (rec.status === 'paid') {
            toast.success('Créditos confirmados e adicionados ao seu saldo!')
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'credit_transactions', filter: `client_id=eq.${user.id}` },
        () => { router.refresh() },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user.id, router])

  /* Atalhos para os valores da carteira — fallback 0 se carteira inexistente */
  const balance   = wallet?.balance ?? 0
  const purchased = wallet?.total_purchased ?? 0
  const spent     = wallet?.total_spent ?? 0
  const lastTx    = transactions[0]

  const pendingPurchases = useMemo(() => purchases.filter(p => p.status === 'pending'), [purchases])

  // Toast ao retornar do Stripe Checkout
  useEffect(() => {
    const checkout = searchParams.get('checkout')
    if (checkout === 'success') {
      toast.success('Pagamento recebido! Seus créditos serão liberados em instantes.')
    } else if (checkout === 'canceled') {
      toast.info('Pagamento cancelado. Seus créditos não foram alterados.')
    }
  }, [searchParams])

  return (
    <>
    <div className="space-y-7">
        {/* ── TÍTULO DA PÁGINA ───────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <h1 className="flex items-center gap-2 text-3xl font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            <Coins size={26} className="text-[#005BFF]" aria-hidden="true" />
            Meus créditos
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[#5D6475]">
            Compre créditos e use para adquirir e-books, projetos e serviços da LOBBY.
          </p>
        </motion.div>

        {/* ── CARDS DE SALDO ─────────────────────────────────────── */}
        {/* Quatro métricas principais: saldo, comprados, usados e última movimentação */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" role="list" aria-label="Resumo de créditos">
          {[
            { icon: Wallet,      label: 'Saldo disponível',   value: formatCredits(balance),   color: '#005BFF', bg: 'rgba(0,91,255,0.10)'   },
            { icon: TrendingUp,  label: 'Créditos comprados', value: formatCredits(purchased), color: '#10B981', bg: 'rgba(16,185,129,0.10)' },
            { icon: TrendingDown,label: 'Créditos usados',    value: formatCredits(spent),     color: '#F59E0B', bg: 'rgba(245,158,11,0.10)' },
            // Última movimentação: exibe tempo relativo da transação mais recente
            { icon: Clock,       label: 'Última movimentação',value: lastTx ? timeAgo(lastTx.created_at) : 'Nenhuma', color: '#7B2CFF', bg: 'rgba(123,44,255,0.10)' },
          ].map(({ icon: Icon, label, value, color, bg }, i) => (
            <motion.article key={label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 + i * 0.05 }}
              className="rounded-3xl border border-[#E3E7F0] bg-white p-5 shadow-[0_8px_40px_rgba(11,16,32,0.06)]" role="listitem">
              {/* Ícone com fundo colorido específico por métrica */}
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: bg }}>
                <Icon size={19} style={{ color }} aria-hidden="true" />
              </div>
              <p className="truncate text-xl font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{value}</p>
              <p className="mt-0.5 text-xs text-[#5D6475]">{label}</p>
            </motion.article>
          ))}
        </div>

        {/* ── COMPRAS PENDENTES DE CONFIRMAÇÃO ─────────────────────
            Exibe alerta amarelo quando há compras aguardando confirmação
            de pagamento (status 'pending'). Fica oculto se não há pendências. */}
        {pendingPurchases.length > 0 && (
          <div className="rounded-3xl border border-[#F59E0B]/25 bg-[#FFFBEB] p-5">
            <p className="mb-3 flex items-center gap-2 text-sm font-bold text-[#92400E]">
              <Clock size={15} aria-hidden="true" />
              Compras pendentes de confirmação
            </p>
            <div className="space-y-2">
              {pendingPurchases.map(p => (
                <div key={p.id} className="flex items-center justify-between rounded-2xl border border-[#F59E0B]/20 bg-white/70 px-4 py-2.5 text-sm">
                  {/* Exibe quantidade de créditos e valor pago */}
                  <span className="text-[#0B1020]">{formatCredits(p.credits_amount)} — {formatCurrencyBRL(p.amount_paid)}</span>
                  <span className="text-xs font-semibold text-[#92400E]">Aguardando confirmação</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── PACOTES PARA COMPRA ──────────────────────────────────
            Grade de pacotes cadastrados pelo admin. Se vazio, exibe estado
            informativo em vez de grade em branco. */}
        <section aria-label="Pacotes de créditos">
          <h2 className="mb-4 text-xl font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Comprar créditos
          </h2>
          {packages.length === 0 ? (
            // Estado vazio: nenhum pacote ativo no momento
            <div className="rounded-3xl border border-dashed border-[#E3E7F0] p-10 text-center">
              <PackageOpen size={28} className="mx-auto mb-3 text-[#5D6475]/40" aria-hidden="true" />
              <p className="text-sm font-bold text-[#0B1020]">Nenhum pacote disponível</p>
              <p className="mt-1 text-xs text-[#5D6475]">No momento não há pacotes de créditos ativos.</p>
            </div>
          ) : (
            // Grade de cards de pacotes — ao clicar chama setBuyingPkg para abrir modal
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {packages.map(pkg => (
                <CreditPackageCard key={pkg.id} pkg={pkg} onBuy={setBuyingPkg} />
              ))}
            </div>
          )}
        </section>

        {/* ── HISTÓRICO DE MOVIMENTAÇÕES ────────────────────────────
            Combina transações (uso de créditos) e compras confirmadas
            em uma lista unificada. Compras pendentes ficam na seção acima.
            Estado vazio quando não há nenhuma movimentação. */}
        <section aria-label="Histórico de movimentações">
          <h2 className="mb-4 text-xl font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Histórico
          </h2>
          {transactions.length === 0 && purchases.length === 0 ? (
            // Estado inicial: cliente ainda não usou créditos
            <div className="rounded-3xl border border-dashed border-[#E3E7F0] p-10 text-center">
              <Coins size={28} className="mx-auto mb-3 text-[#5D6475]/40" aria-hidden="true" />
              <p className="text-sm font-bold text-[#0B1020]">Você ainda não possui créditos</p>
              <p className="mt-1 text-xs text-[#5D6475]">Compre créditos para usar em e-books, projetos e serviços da LOBBY.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-3xl border border-[#E3E7F0] bg-white shadow-[0_8px_40px_rgba(11,16,32,0.06)]">
              <div className="divide-y divide-[#E3E7F0]">
                {/* Seção 1: transações de crédito (débito e crédito por uso/serviço) */}
                {transactions.map(tx => {
                  const style = getCreditTxStyle(tx.status)
                  const isCredit = tx.direction === 'credit' // true = entrada de créditos
                  return (
                    <div key={tx.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        {/* Ícone verde para entrada (credit) e vermelho para saída (debit) */}
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isCredit ? 'bg-[#10B981]/10' : 'bg-red-500/10'}`}>
                          {isCredit
                            ? <ArrowUpRight size={16} className="text-[#10B981]" aria-hidden="true" />
                            : <ArrowDownRight size={16} className="text-red-500" aria-hidden="true" />
                          }
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#0B1020]">{tx.description}</p>
                          {/* Tipo da transação (compra, desconto, bônus) + tempo relativo */}
                          <p className="mt-0.5 text-xs text-[#5D6475]">{CREDIT_TX_TYPE_LABEL[tx.type]} · {timeAgo(tx.created_at)}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 pl-12 sm:pl-0">
                        {/* Valor com sinal + ou - e cor diferente por direção */}
                        <span className={`text-sm font-bold ${isCredit ? 'text-[#10B981]' : 'text-red-500'}`}>
                          {isCredit ? '+' : '-'}{tx.amount.toLocaleString('pt-BR')}
                        </span>
                        {/* Badge de status da transação (confirmado, pendente, cancelado) */}
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: style.bg, color: style.color }}>
                          {style.label}
                        </span>
                      </div>
                    </div>
                  )
                })}

                {/* Seção 2: compras de pacotes já confirmadas (exclui pendentes — já estão acima) */}
                {purchases.filter(p => p.status !== 'pending').map(p => {
                  const style = getCreditPurchaseStyle(p.status)
                  return (
                    <div key={`purchase-${p.id}`} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        {/* Ícone de carrinho para compra de pacote */}
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#005BFF]/10">
                          <ShoppingCart size={15} className="text-[#005BFF]" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#0B1020]">Compra de {formatCredits(p.credits_amount)}</p>
                          {/* Valor em reais pago + tempo relativo */}
                          <p className="mt-0.5 text-xs text-[#5D6475]">{formatCurrencyBRL(p.amount_paid)} · {timeAgo(p.created_at)}</p>
                        </div>
                      </div>
                      {/* Badge de status da compra (confirmado, recusado, etc.) */}
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: style.bg, color: style.color }}>
                        {style.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Modal de compra de créditos — abre quando buyingPkg não é null */}
      <BuyCreditsModal
        pkg={buyingPkg}
        userId={user.id}
        onClose={() => setBuyingPkg(null)}
      />
    </>
  )
}
