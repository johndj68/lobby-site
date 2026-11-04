'use client'

import { useMemo, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Plus, Banknote, Receipt, Search, Download, ChevronLeft, ChevronRight, Clock, AlertTriangle,
} from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import AdminShell from '@/components/layout/AdminShell'
import FinanceiroSubNav from '@/components/admin/finance/FinanceiroSubNav'
import NewAccountModal from '@/components/admin/finance/NewAccountModal'
import AccountDetailDrawer from '@/components/admin/finance/AccountDetailDrawer'
import {
  formatCurrencyBRL, formatDateBR, ACCOUNT_STATUS_LABEL, getAccountStatusStyle, isAccountOverdue,
  todaySaoPauloDateStr, exportAccountsCSV,
} from '@/lib/finance'
import type { AccountEntry, AccountKind } from '@/types'

interface Props {
  user:                SupabaseUser
  profile:             { full_name?: string } | null
  payable:             AccountEntry[]
  receivable:          AccountEntry[]
  payoutPendingTotal:  number
  payoutPendingCount:  number
  chargesPendingTotal: number
  chargesPendingCount: number
}

type Tab        = 'todas' | AccountKind
type StatusFilt = 'todos' | 'aberto' | 'pendente' | 'parcial' | 'liquidada' | 'cancelada'
type DueFilt    = 'todas' | 'vencidas' | 'hoje' | '7d' | '30d' | 'sem_data'
type DateField  = 'vencimento' | 'criacao'

interface FiltersState {
  tab: Tab; search: string; status: StatusFilt; due: DueFilt; dateField: DateField; page: number; open: string | null
}

const PAGE_SIZE = 20

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function isOpenStatus(status: string) { return status === 'pendente' || status === 'parcial' }
function isDoneStatus(status: string) { return status === 'pago' || status === 'recebido' }

function calcSummary(rows: AccountEntry[]) {
  const open = rows.filter(r => isOpenStatus(r.status))
  const openTotal = open.reduce((s, r) => s + (r.amount - r.amountSettled), 0)
  const overdue = open.filter(r => isAccountOverdue(r.dueDate, r.status))
  const overdueTotal = overdue.reduce((s, r) => s + (r.amount - r.amountSettled), 0)
  return { openTotal, openCount: open.length, overdueTotal, overdueCount: overdue.length }
}

export default function ContasClient({
  user, profile, payable, receivable, payoutPendingTotal, payoutPendingCount, chargesPendingTotal, chargesPendingCount,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const all = useMemo(() => [...payable, ...receivable], [payable, receivable])

  const [filters, setFiltersState] = useState<FiltersState>(() => ({
    tab:       (searchParams.get('tab') as Tab) || 'todas',
    search:    searchParams.get('q') || '',
    status:    (searchParams.get('status') as StatusFilt) || 'todos',
    due:       (searchParams.get('due') as DueFilt) || 'todas',
    dateField: (searchParams.get('campo') as DateField) || 'vencimento',
    page:      Number(searchParams.get('page') || '0') || 0,
    open:      searchParams.get('open'),
  }))
  const [newModalKind, setNewModalKind] = useState<AccountKind | null>(null)

  // Estado local é a fonte de verdade; router.replace só espelha na URL pra
  // deep-link/compartilhamento (padrão da casa, ver CampaignDetailClient.tsx).
  // router.replace roda no corpo do handler (fora do updater de setState) —
  // chamá-lo dentro do callback funcional do setState conta como atualizar
  // outro componente (o Router) durante a fase de render do React.
  function setFilters(patch: Partial<FiltersState>) {
    const next: FiltersState = { ...filters, ...patch, page: patch.page !== undefined ? patch.page : 0 }
    setFiltersState(next)
    const params = new URLSearchParams()
    if (next.tab !== 'todas') params.set('tab', next.tab)
    if (next.search) params.set('q', next.search)
    if (next.status !== 'todos') params.set('status', next.status)
    if (next.due !== 'todas') params.set('due', next.due)
    if (next.dateField !== 'vencimento') params.set('campo', next.dateField)
    if (next.page) params.set('page', String(next.page))
    if (next.open) params.set('open', next.open)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const refresh = () => router.refresh()
  const drawerAccount = filters.open ? all.find(a => a.id === filters.open) ?? null : null
  const openDrawer  = (id: string) => setFilters({ open: id })
  const closeDrawer = () => setFilters({ open: null })

  const receivableSummary = useMemo(() => calcSummary(receivable), [receivable])
  const payableSummary    = useMemo(() => calcSummary(payable), [payable])

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase()
    const today = todaySaoPauloDateStr()
    return all.filter(r => {
      if (filters.tab !== 'todas' && r.kind !== filters.tab) return false
      switch (filters.status) {
        case 'aberto':     if (!isOpenStatus(r.status)) return false; break
        case 'pendente':   if (r.status !== 'pendente') return false; break
        case 'parcial':    if (r.status !== 'parcial') return false; break
        case 'liquidada':  if (!isDoneStatus(r.status)) return false; break
        case 'cancelada':  if (r.status !== 'cancelado') return false; break
      }
      const dateStr = filters.dateField === 'vencimento' ? r.dueDate : r.createdAt.slice(0, 10)
      if (filters.due === 'sem_data') { if (dateStr) return false }
      else if (dateStr) {
        if (filters.due === 'vencidas' && !(dateStr < today && isOpenStatus(r.status))) return false
        if (filters.due === 'hoje' && dateStr !== today) return false
        if (filters.due === '7d' && !(dateStr >= today && dateStr <= addDaysStr(today, 7))) return false
        if (filters.due === '30d' && !(dateStr >= today && dateStr <= addDaysStr(today, 30))) return false
      } else if (filters.due !== 'todas') return false
      if (q) {
        const haystack = [r.description, r.category, r.payerName, r.reference].filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [all, filters])

  const pageRows = filtered.slice(filters.page * PAGE_SIZE, filters.page * PAGE_SIZE + PAGE_SIZE)

  const upcoming = useMemo(() => {
    const today = todaySaoPauloDateStr()
    return all
      .filter(r => isOpenStatus(r.status) && r.dueDate && r.dueDate >= today)
      .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
      .slice(0, 6)
  }, [all])

  const applyCard = (kind: AccountKind, due: DueFilt) => setFilters({ tab: kind, status: 'aberto', due })

  return (
    <AdminShell user={user} profile={profile}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FinanceiroSubNav />
          <div className="flex gap-2">
            <button type="button" onClick={() => exportAccountsCSV(filtered, `Resultado filtrado (aba: ${filters.tab}) — ${filtered.length} registro(s) de ${all.length} total`)}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-white/[0.10] bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/60 hover:border-white/20 hover:text-white disabled:opacity-40">
              <Download size={14} aria-hidden="true" />Exportar
            </button>
            <button type="button" onClick={() => setNewModalKind(filters.tab === 'payable' ? 'payable' : 'receivable')}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-4 py-2 text-sm font-bold text-white shadow-[0_8px_24px_rgba(0,91,255,0.28)] hover:-translate-y-0.5">
              <Plus size={15} aria-hidden="true" />Novo lançamento
            </button>
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Contas a pagar e receber</h1>
          <p className="mt-1 text-sm text-white/40">Acompanhe vencimentos, pagamentos e recebimentos em um só lugar.</p>
        </div>

        {/* ── RESUMO ── */}
        <div className="grid gap-3 sm:grid-cols-4">
          <button type="button" onClick={() => applyCard('receivable', 'todas')} className="rounded-2xl border border-white/[0.08] bg-[#111827]/80 p-4 text-left hover:border-white/20">
            <div className="mb-1 flex items-center gap-1.5 text-[#60A5FA]"><Receipt size={13} aria-hidden="true" /><span className="text-xs font-semibold text-white/50">A receber em aberto</span></div>
            <p className="text-xl font-bold text-white">{formatCurrencyBRL(receivableSummary.openTotal)}</p>
            <p className="text-[11px] text-white/30">{receivableSummary.openCount} conta(s) — saldo não liquidado, não é dinheiro em banco</p>
          </button>
          <button type="button" onClick={() => applyCard('receivable', 'vencidas')} className="rounded-2xl border border-white/[0.08] bg-[#111827]/80 p-4 text-left hover:border-white/20">
            <div className="mb-1 flex items-center gap-1.5 text-[#F87171]"><AlertTriangle size={13} aria-hidden="true" /><span className="text-xs font-semibold text-white/50">Recebimentos vencidos</span></div>
            <p className="text-xl font-bold text-white">{formatCurrencyBRL(receivableSummary.overdueTotal)}</p>
            <p className="text-[11px] text-white/30">{receivableSummary.overdueCount} conta(s) — subconjunto do total em aberto</p>
          </button>
          <button type="button" onClick={() => applyCard('payable', 'todas')} className="rounded-2xl border border-white/[0.08] bg-[#111827]/80 p-4 text-left hover:border-white/20">
            <div className="mb-1 flex items-center gap-1.5 text-[#60A5FA]"><Banknote size={13} aria-hidden="true" /><span className="text-xs font-semibold text-white/50">A pagar em aberto</span></div>
            <p className="text-xl font-bold text-white">{formatCurrencyBRL(payableSummary.openTotal)}</p>
            <p className="text-[11px] text-white/30">{payableSummary.openCount} conta(s) — saldo não liquidado</p>
          </button>
          <button type="button" onClick={() => applyCard('payable', 'vencidas')} className="rounded-2xl border border-white/[0.08] bg-[#111827]/80 p-4 text-left hover:border-white/20">
            <div className="mb-1 flex items-center gap-1.5 text-[#F87171]"><AlertTriangle size={13} aria-hidden="true" /><span className="text-xs font-semibold text-white/50">Pagamentos vencidos</span></div>
            <p className="text-xl font-bold text-white">{formatCurrencyBRL(payableSummary.overdueTotal)}</p>
            <p className="text-[11px] text-white/30">{payableSummary.overdueCount} conta(s) — subconjunto do total em aberto</p>
          </button>
        </div>

        {/* ── SEÇÕES SEPARADAS (nunca somadas aos totais acima) ── */}
        {(payoutPendingCount > 0 || chargesPendingCount > 0) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {payoutPendingCount > 0 && (
              <Link href="/admin/marketplace/repasses" className="block rounded-2xl border border-[#F59E0B]/25 bg-[#F59E0B]/[0.04] p-4 text-xs text-[#FBBF24] hover:border-[#F59E0B]/40">
                Repasse a parceiros (fluxo próprio, fora dos totais acima): <strong>{formatCurrencyBRL(payoutPendingTotal)}</strong> em {payoutPendingCount} venda(s) — ver detalhes →
              </Link>
            )}
            {chargesPendingCount > 0 && (
              <Link href="/admin/financeiro" className="block rounded-2xl border border-[#F59E0B]/25 bg-[#F59E0B]/[0.04] p-4 text-xs text-[#FBBF24] hover:border-[#F59E0B]/40">
                Pedidos aguardando pagamento (crédito/e-book — ainda não é conta a receber constituída): <strong>{formatCurrencyBRL(chargesPendingTotal)}</strong> em {chargesPendingCount} compra(s) — ver no financeiro →
              </Link>
            )}
          </div>
        )}

        {/* ── PRÓXIMOS VENCIMENTOS ── */}
        {upcoming.length > 0 && (
          <div className="rounded-2xl border border-white/[0.08] bg-[#111827]/80 p-4">
            <h2 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-white/40"><Clock size={13} aria-hidden="true" />Próximos vencimentos</h2>
            <div className="space-y-1.5">
              {upcoming.map(r => (
                <button key={r.id} type="button" onClick={() => openDrawer(r.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-2.5 text-left text-xs hover:border-white/20">
                  <span className="text-white/70">{formatDateBR(r.dueDate)} · {r.description}</span>
                  <span className="flex items-center gap-3 text-white/40">
                    <span>{r.kind === 'payable' ? 'A pagar' : 'A receber'}</span>
                    <span className="font-semibold text-white/70">{formatCurrencyBRL(r.amount - r.amountSettled)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── LISTAGEM ── */}
        <div className="rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-5">
          <div className="mb-4 flex flex-wrap gap-1.5">
            {([['todas', `Todas (${all.length})`], ['receivable', `A receber (${receivable.length})`], ['payable', `A pagar (${payable.length})`]] as const).map(([t, label]) => (
              <button key={t} type="button" onClick={() => setFilters({ tab: t })}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${filters.tab === t ? 'bg-[#005BFF]/20 text-[#60A5FA]' : 'border border-white/[0.08] text-white/50 hover:text-white/80'}`}>
                {label}
              </button>
            ))}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30" aria-hidden="true" />
              <input type="text" value={filters.search} onChange={e => setFilters({ search: e.target.value })}
                placeholder="Buscar por descrição, referência, cliente ou fornecedor"
                className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.05] pl-9 pr-3 text-xs text-white placeholder:text-white/25 outline-none focus:border-[#005BFF]/50" />
            </div>
            <select value={filters.status} onChange={e => setFilters({ status: e.target.value as StatusFilt })}
              className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.05] px-2 text-xs text-white/70 outline-none">
              <option value="todos">Toda situação</option>
              <option value="aberto">Em aberto</option>
              <option value="pendente">Pendente</option>
              <option value="parcial">Parcialmente liquidada</option>
              <option value="liquidada">Liquidada</option>
              <option value="cancelada">Cancelada</option>
            </select>
            <select value={filters.dateField} onChange={e => setFilters({ dateField: e.target.value as DateField })}
              className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.05] px-2 text-xs text-white/70 outline-none">
              <option value="vencimento">Data: vencimento</option>
              <option value="criacao">Data: criação</option>
            </select>
          </div>

          <div className="mb-4 flex flex-wrap gap-1.5">
            {([['todas', 'Todas'], ['vencidas', 'Vencidas'], ['hoje', 'Vencem hoje'], ['7d', 'Próx. 7 dias'], ['30d', 'Próx. 30 dias'], ['sem_data', 'Sem vencimento']] as const).map(([d, label]) => (
              <button key={d} type="button" onClick={() => setFilters({ due: d })}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all ${filters.due === d ? 'bg-white/15 text-white' : 'border border-white/[0.08] text-white/40 hover:text-white/70'}`}>
                {label}
              </button>
            ))}
            <span className="ml-auto text-[10px] text-white/25">Fuso: América/São Paulo (UTC-3)</span>
          </div>

          {(filters.tab === 'payable' ? payable : filters.tab === 'receivable' ? receivable : all).length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm font-semibold text-white/60">{filters.tab === 'payable' ? 'Nenhuma conta a pagar' : 'Nenhuma conta a receber'}</p>
              <p className="mt-1 text-xs text-white/30">
                {filters.tab === 'payable' ? 'Organize suas obrigações e acompanhe os próximos vencimentos.' : 'Cadastre um lançamento ou acompanhe as cobranças integradas ao sistema.'}
              </p>
              <button type="button" onClick={() => setNewModalKind(filters.tab === 'payable' ? 'payable' : 'receivable')}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-4 py-2 text-xs font-bold text-white">
                <Plus size={13} aria-hidden="true" />Novo lançamento
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-xs text-white/30">Nenhum resultado para os filtros atuais.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.08] text-left text-[10px] uppercase tracking-wide text-white/30">
                    <th className="px-2 py-2">Descrição / referência</th>
                    <th className="px-2 py-2">Cliente/fornecedor</th>
                    <th className="px-2 py-2">Origem</th>
                    <th className="px-2 py-2">Vencimento</th>
                    <th className="px-2 py-2 text-right">Valor total</th>
                    <th className="px-2 py-2 text-right">Liquidado</th>
                    <th className="px-2 py-2 text-right">Saldo</th>
                    <th className="px-2 py-2">Situação</th>
                    <th className="px-2 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map(r => {
                    const style = getAccountStatusStyle(r.status)
                    const overdue = isAccountOverdue(r.dueDate, r.status)
                    return (
                      <tr key={r.id} className="border-b border-white/[0.05] last:border-0">
                        <td className="px-2 py-2">
                          <p className="font-semibold text-white/85">{r.description}</p>
                          {r.reference && <p className="text-[10px] text-white/30">Ref: {r.reference}</p>}
                        </td>
                        <td className="px-2 py-2 text-white/50">{r.category ?? r.payerName ?? '—'}</td>
                        <td className="px-2 py-2 text-white/40">Manual</td>
                        <td className="px-2 py-2 text-white/50">{r.dueDate ? formatDateBR(r.dueDate) : '—'}</td>
                        <td className="px-2 py-2 text-right text-white/70">{formatCurrencyBRL(r.amount)}</td>
                        <td className="px-2 py-2 text-right text-white/50">{formatCurrencyBRL(r.amountSettled)}</td>
                        <td className="px-2 py-2 text-right font-semibold text-white">{formatCurrencyBRL(r.amount - r.amountSettled)}</td>
                        <td className="px-2 py-2">
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color: style.color, background: style.bg }}>
                            {ACCOUNT_STATUS_LABEL[r.status]}
                          </span>
                          {overdue && <span className="ml-1 inline-flex items-center rounded-full bg-[#EF4444]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#F87171]">Atrasada</span>}
                        </td>
                        <td className="px-2 py-2">
                          <button type="button" onClick={() => openDrawer(r.id)} className="font-semibold text-[#60A5FA] hover:underline">Ver detalhes</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {filtered.length > 0 && (
            <div className="mt-3 flex items-center justify-between text-xs text-white/40">
              <span>{filtered.length} resultado(s)</span>
              {filtered.length > PAGE_SIZE && (
                <div className="flex items-center gap-2">
                  <button type="button" disabled={filters.page === 0} onClick={() => setFilters({ page: Math.max(0, filters.page - 1) })} className="rounded-lg border border-white/[0.08] p-1.5 disabled:opacity-30"><ChevronLeft size={14} /></button>
                  <span>Página {filters.page + 1}</span>
                  <button type="button" disabled={(filters.page + 1) * PAGE_SIZE >= filtered.length} onClick={() => setFilters({ page: filters.page + 1 })} className="rounded-lg border border-white/[0.08] p-1.5 disabled:opacity-30"><ChevronRight size={14} /></button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {newModalKind && <NewAccountModal defaultKind={newModalKind} onClose={() => setNewModalKind(null)} onCreated={refresh} />}
      <AccountDetailDrawer account={drawerAccount} onClose={closeDrawer} onChanged={refresh} />
    </AdminShell>
  )
}
