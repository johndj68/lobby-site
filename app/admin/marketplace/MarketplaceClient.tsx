'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { toast } from 'sonner'
import {
  Grid3x3, Clock, ShoppingCart, TrendingUp, RotateCcw, Coins,
  AlertTriangle, ChevronRight, Search, Star, History, Info,
  ExternalLink, RefreshCw, Rocket,
} from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import AdminShell from '@/components/layout/AdminShell'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import {
  MARKETPLACE_COLORS as C, PERIOD_OPTIONS, deriveAppStatus, summarizeOffer,
  formatPeriodLabel, formatDateTimeBR, formatRelativeTime,
  type PeriodKey, type AppDraftRow, type SubmissionRow, type PlanRow,
} from '@/lib/marketplace'
import { formatCurrencyBRL } from '@/lib/finance'

interface Person { id: string; full_name: string | null; email: string | null }
interface CampaignRow {
  id: string
  title: string | null
  starts_at: string
  ends_at: string
  is_approved: boolean
  is_active: boolean
  is_paid: boolean
  payment_status: string
  created_at: string
  application: { id: string; name: string; slug: string; logo_url: string | null } | null
}

interface Props {
  user: SupabaseUser
  profile: { full_name?: string; email?: string; is_leader?: boolean } | null
  period: PeriodKey
  from: string | null
  to: string | null
  range: { start: string; end: string }
  drafts: AppDraftRow[]
  submissions: SubmissionRow[]
  plans: PlanRow[]
  campaigns: CampaignRow[]
  people: Person[]
  loadErrors: { drafts: boolean; submissions: boolean; plans: boolean; campaigns: boolean }
}

const NAV_TABS = [
  { label: 'Visão geral', href: '/admin/marketplace', enabled: true },
  { label: 'Aplicativos', href: '/admin/marketplace/aplicativos', enabled: true },
  { label: 'Solicitações', href: '/admin/marketplace/solicitacoes', enabled: true },
  { label: 'Ofertas', href: '/admin/marketplace/ofertas', enabled: false },
  { label: 'Destaques', href: '/admin/marketplace/destaques', enabled: false },
  { label: 'Categorias', href: '/admin/marketplace/categorias', enabled: false },
  { label: 'Parceiros', href: '/admin/marketplace/parceiros', enabled: false },
]

function personName(people: Person[], id: string | null | undefined): string {
  if (!id) return '—'
  const p = people.find(p => p.id === id)
  return p?.full_name || p?.email || 'Usuário removido'
}

export default function MarketplaceClient({
  user, profile, period, from, to, range, drafts, submissions, plans, campaigns, people, loadErrors,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'todos' | 'publicado' | 'aprovado' | 'aguardando_analise' | 'ajustes_solicitados' | 'rejeitado' | 'rascunho'>('todos')
  const [customFrom, setCustomFrom] = useState(from ?? '')
  const [customTo, setCustomTo] = useState(to ?? '')
  const [publishTarget, setPublishTarget] = useState<{ id: string; name: string } | null>(null)
  const [publishing, setPublishing] = useState(false)

  async function handlePublish() {
    if (!publishTarget) return
    setPublishing(true)
    try {
      const res = await fetch(`/api/admin/apps/${publishTarget.id}/publish`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Não foi possível publicar.')
        return
      }
      toast.success(`${data.app} publicado.`)
      setPublishTarget(null)
      router.refresh()
    } catch {
      toast.error('Falha de conexão ao publicar. Tente novamente.')
    } finally {
      setPublishing(false)
    }
  }

  const rangeStart = useMemo(() => new Date(range.start), [range.start])
  const rangeEnd = useMemo(() => new Date(range.end), [range.end])
  const periodLabel = formatPeriodLabel(period, { start: rangeStart, end: rangeEnd }, from, to)

  // Submissão mais recente por app — decide o status exibido e alimenta os
  // indicadores. Feito no cliente porque os arrays já vieram inteiros e
  // pequenos do servidor; nada disso refaz consulta ao banco.
  const latestSubmissionByDraft = useMemo(() => {
    const map = new Map<string, SubmissionRow>()
    for (const s of submissions) {
      const cur = map.get(s.app_draft_id)
      if (!cur || new Date(s.submitted_at) > new Date(cur.submitted_at)) map.set(s.app_draft_id, s)
    }
    return map
  }, [submissions])

  const plansByDraft = useMemo(() => {
    const map = new Map<string, PlanRow[]>()
    for (const p of plans) {
      const arr = map.get(p.app_draft_id) ?? []
      arr.push(p)
      map.set(p.app_draft_id, arr)
    }
    return map
  }, [plans])

  const rows = useMemo(() => drafts.map(d => {
    type WithApplications = AppDraftRow & { applications?: { is_published: boolean; suspended_at: string | null } | { is_published: boolean; suspended_at: string | null }[] | null }
    const dApplications = (d as WithApplications).applications
    const application = Array.isArray(dApplications) ? (dApplications[0] ?? null) : (dApplications ?? null)
    let status = deriveAppStatus(d.status, latestSubmissionByDraft.get(d.id) ?? null)
    // Suspensão vive em applications, não em app_drafts.status (de propósito
    // — suspender preserva o histórico de que o app já foi aprovado/publicado).
    if (application?.suspended_at) status = { key: 'suspenso', label: 'Suspenso', color: C.error }
    return {
      draft: d,
      status,
      offer: summarizeOffer(plansByDraft.get(d.id) ?? []),
      partner: personName(people, d.created_by),
    }
  }), [drafts, latestSubmissionByDraft, plansByDraft, people])

  const appsPublicados = rows.filter(r => r.status.key === 'publicado').length
  const aguardandoAnalise = rows.filter(r => r.status.key === 'aguardando_analise').length
  const aprovadosNaoPublicados = rows.filter(r => r.status.key === 'aprovado').length

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (statusFilter !== 'todos' && r.status.key !== statusFilter) return false
      if (q && !`${r.draft.name ?? ''} ${r.partner}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [rows, search, statusFilter])

  const visibleRows = filteredRows.slice(0, 6)

  // Atividade recente — eventos reais dentro do período selecionado, a
  // partir das mesmas submissões usadas nos indicadores (sem tabela de
  // eventos dedicada, então o histórico nasce daqui).
  const activity = useMemo(() => {
    type Event = { id: string; label: string; app: string; actor: string; at: string; href?: string }
    const events: Event[] = []
    for (const s of submissions) {
      const draft = drafts.find(d => d.id === s.app_draft_id)
      const appName = draft?.name ?? 'Aplicativo removido'
      const submittedAt = new Date(s.submitted_at)
      if (submittedAt >= rangeStart && submittedAt <= rangeEnd) {
        events.push({ id: `${s.id}-submit`, label: 'Enviado para análise', app: appName, actor: personName(people, s.submitted_by), at: s.submitted_at, href: `/admin/marketplace/solicitacoes/${s.id}` })
      }
      if (s.reviewed_at) {
        const reviewedAt = new Date(s.reviewed_at)
        if (reviewedAt >= rangeStart && reviewedAt <= rangeEnd) {
          const label = s.status === 'approved' ? 'Aprovado' : s.status === 'rejected' ? 'Rejeitado' : s.status === 'changes_requested' ? 'Ajustes solicitados' : 'Revisado'
          events.push({ id: `${s.id}-review`, label, app: appName, actor: personName(people, s.reviewer_id), at: s.reviewed_at, href: `/admin/marketplace/solicitacoes/${s.id}` })
        }
      }
    }
    for (const c of campaigns) {
      const createdAt = new Date(c.created_at)
      if (createdAt >= rangeStart && createdAt <= rangeEnd) {
        events.push({ id: `${c.id}-campaign`, label: 'Campanha criada', app: c.application?.name ?? 'Aplicativo removido', actor: '—', at: c.created_at })
      }
    }
    return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 8)
  }, [submissions, drafts, campaigns, people, rangeStart, rangeEnd])

  const anyLoadError = loadErrors.drafts || loadErrors.submissions || loadErrors.plans || loadErrors.campaigns

  const setPeriod = (next: PeriodKey, extra?: { from?: string; to?: string }) => {
    const params = new URLSearchParams()
    params.set('period', next)
    if (next === 'custom' && extra?.from && extra?.to) {
      params.set('from', extra.from)
      params.set('to', extra.to)
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <AdminShell user={user} profile={profile}>
      <div style={{ background: C.bg, minHeight: '100vh' }} className="px-4 py-6 sm:px-6 lg:px-8">
        {/* Cabeçalho */}
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>
              Marketplace
            </h1>
            <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>
              Gerencie aplicativos, parceiros, ofertas e publicações.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label htmlFor="mkt-period" className="sr-only">Período</label>
              <select
                id="mkt-period"
                value={period}
                onChange={e => setPeriod(e.target.value as PeriodKey, { from: customFrom, to: customTo })}
                className="rounded-xl border px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2"
                style={{ background: C.card, borderColor: C.border, color: C.text }}
              >
                {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {period === 'custom' && (
                <div className="flex items-center gap-1.5">
                  <label className="sr-only" htmlFor="mkt-from">Data inicial</label>
                  <input id="mkt-from" type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                    className="rounded-xl border px-2 py-2 text-xs" style={{ background: C.card, borderColor: C.border, color: C.text }} />
                  <span style={{ color: C.textSecondary }}>–</span>
                  <label className="sr-only" htmlFor="mkt-to">Data final</label>
                  <input id="mkt-to" type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                    className="rounded-xl border px-2 py-2 text-xs" style={{ background: C.card, borderColor: C.border, color: C.text }} />
                  <button
                    onClick={() => customFrom && customTo && setPeriod('custom', { from: customFrom, to: customTo })}
                    disabled={!customFrom || !customTo}
                    className="rounded-xl px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                    style={{ background: C.primary }}
                  >
                    Aplicar
                  </button>
                </div>
              )}
            </div>

            <Link
              href="/admin/marketplace/aplicativos"
              className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white"
              style={{ background: C.primary }}
            >
              Gerenciar aplicativos
            </Link>
          </div>
        </div>

        {/* Navegação interna */}
        <nav aria-label="Seções do marketplace" className="mb-6 flex flex-wrap gap-1 border-b" style={{ borderColor: C.border }}>
          {NAV_TABS.map(tab => {
            const active = tab.href === '/admin/marketplace'
            if (!tab.enabled) {
              return (
                <span
                  key={tab.href}
                  title="Esta área ainda não foi implementada."
                  aria-disabled="true"
                  className="cursor-not-allowed px-3 py-2.5 text-sm font-medium opacity-40"
                  style={{ color: C.textSecondary }}
                >
                  {tab.label}
                </span>
              )
            }
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="px-3 py-2.5 text-sm font-medium transition-colors"
                style={{
                  color: active ? C.primary : C.textSecondary,
                  borderBottom: active ? `2px solid ${C.primary}` : '2px solid transparent',
                }}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>

        {anyLoadError && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: C.error, background: 'rgba(239,68,68,0.08)', color: C.text }}>
            <AlertTriangle size={16} style={{ color: C.error }} aria-hidden="true" />
            Alguns dados não puderam ser carregados agora. Os blocos afetados mostram &quot;Indisponível&quot; — recarregue a página para tentar novamente.
          </div>
        )}

        {/* Indicadores */}
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: C.textSecondary }}>Situação atual</p>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard icon={Grid3x3} title="Apps publicados" value={String(appsPublicados)}
            sub="Status do pipeline de submissão" href="/admin/marketplace/aplicativos?publicacao=publicado" />
          <MetricCard icon={Clock} title="Aguardando análise" value={String(aguardandoAnalise)}
            sub="Solicitações ativas" href="/admin/marketplace/solicitacoes" />
          <span className="col-span-2 sm:col-span-1 lg:hidden" />
          <p className="col-span-2 -mb-1 self-end text-[11px] font-semibold uppercase tracking-wide sm:col-span-3 lg:col-span-4" style={{ color: C.textSecondary }}>
            No período · {periodLabel}
          </p>
          <MetricCard icon={ShoppingCart} title="Pedidos pagos" value="Indisponível"
            sub="Sem tabela de pedidos do marketplace ainda" muted
            tooltip="Não existe hoje uma tabela de pedidos/pagamentos ligada aos planos do marketplace (app_plans) — precisa ser modelada antes de calcular este número." />
          <MetricCard icon={TrendingUp} title="Vendas brutas" value="Indisponível"
            sub="Sem fonte de pagamento confiável" muted
            tooltip="Vendas brutas = valor de vendas confirmadas no período, antes de reembolsos. Sem tabela de pedidos do marketplace, este valor não pode ser calculado de forma confiável." />
          <MetricCard icon={RotateCcw} title="Reembolsos" value="Indisponível"
            sub="Sem registro de reembolso do marketplace" muted
            tooltip="Reembolsos concluídos no período, excluindo pendentes e considerando parciais. Ainda não existe esse registro para apps do marketplace." />
          <MetricCard icon={Coins} title="Comissão LOBBY" value="Indisponível"
            sub="Sem regra de comissão cadastrada" muted
            tooltip="Não há percentual de comissão nem registro de comissão por transação no banco hoje — mostrar um valor aqui seria inventar um número." />
        </div>

        {/* Gráfico + Ações necessárias */}
        <div className="mb-6 grid gap-4 lg:grid-cols-[3fr_2fr]">
          <section className="rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
            <h2 className="text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Vendas no período</h2>
            <p className="mb-4 text-xs" style={{ color: C.textSecondary }}>Evolução das vendas brutas no período selecionado.</p>
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-10 text-center" style={{ borderColor: C.border }}>
              <Info size={20} style={{ color: C.textSecondary }} aria-hidden="true" />
              <p className="text-sm font-medium" style={{ color: C.text }}>Sem fonte de dados de vendas</p>
              <p className="max-w-sm text-xs" style={{ color: C.textSecondary }}>
                Não existe hoje uma tabela de pedidos do marketplace para agregar vendas brutas por dia. Assim que o checkout de apps registrar pedidos, este gráfico passa a exibir a série real — nenhuma curva é inventada enquanto isso não existir.
              </p>
            </div>
          </section>

          <section className="rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
            <h2 className="text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Ações necessárias</h2>
            <p className="mb-4 text-xs" style={{ color: C.textSecondary }}>Itens que precisam da sua atenção.</p>
            {aguardandoAnalise === 0 && aprovadosNaoPublicados === 0 ? (
              <p className="text-sm" style={{ color: C.textSecondary }}>Nenhuma ação pendente no momento.</p>
            ) : (
              <ul className="space-y-3">
                {aguardandoAnalise > 0 && (
                  <AlertItem icon={Clock} color={C.warning}
                    title={`${aguardandoAnalise} solicitaç${aguardandoAnalise > 1 ? 'ões' : 'ão'} aguardando análise`}
                    desc="Novos envios de parceiros." href="/admin/marketplace/solicitacoes" cta="Revisar" />
                )}
                {aprovadosNaoPublicados > 0 && (
                  <AlertItem icon={Grid3x3} color={C.primary}
                    title={`${aprovadosNaoPublicados} app${aprovadosNaoPublicados > 1 ? 's' : ''} aprovado${aprovadosNaoPublicados > 1 ? 's' : ''} aguardando publicação`}
                    desc="Aprovados na revisão, ainda não publicados." href="/admin/marketplace/aplicativos?publicacao=nao_publicado&revisao=aprovado" cta="Ver aplicativos" />
                )}
              </ul>
            )}
          </section>
        </div>

        {/* Resumo de aplicativos */}
        <section id="apps-tabela" className="mb-6 rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Aplicativos do marketplace</h2>
              <p className="text-xs" style={{ color: C.textSecondary }}>Gerencie aplicativos, parceiros, status de publicação e ofertas.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.textSecondary }} aria-hidden="true" />
                <label htmlFor="mkt-search" className="sr-only">Buscar aplicativo ou parceiro</label>
                <input
                  id="mkt-search"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar aplicativo ou parceiro..."
                  className="rounded-xl border py-2 pl-8 pr-3 text-sm outline-none focus-visible:ring-2"
                  style={{ background: C.header, borderColor: C.border, color: C.text }}
                />
              </div>
              <label htmlFor="mkt-status-filter" className="sr-only">Filtro de publicação</label>
              <select
                id="mkt-status-filter"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
                className="rounded-xl border px-3 py-2 text-sm"
                style={{ background: C.header, borderColor: C.border, color: C.text }}
              >
                <option value="todos">Publicação: todos</option>
                <option value="publicado">Publicado</option>
                <option value="aprovado">Aprovado, não publicado</option>
                <option value="aguardando_analise">Aguardando análise</option>
                <option value="ajustes_solicitados">Ajustes solicitados</option>
                <option value="rejeitado">Rejeitado</option>
                <option value="rascunho">Rascunho</option>
              </select>
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm" style={{ color: C.textSecondary }}>
              {loadErrors.drafts ? 'Não foi possível carregar os aplicativos agora.' : 'Nenhum aplicativo cadastrado ainda.'}
            </p>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide" style={{ color: C.textSecondary }}>
                      <th className="pb-2 font-medium">Aplicativo</th>
                      <th className="pb-2 font-medium">Parceiro</th>
                      <th className="pb-2 font-medium">Publicação</th>
                      <th className="pb-2 font-medium">Oferta</th>
                      <th className="pb-2 font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map(r => (
                      <tr key={r.draft.id} className="border-t" style={{ borderColor: C.border }}>
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-2.5">
                            {r.draft.logo_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.draft.logo_url} alt="" className="h-8 w-8 rounded-lg object-cover" />
                            ) : (
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: C.header }}>
                                <Grid3x3 size={14} style={{ color: C.textSecondary }} aria-hidden="true" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="truncate font-medium" style={{ color: C.text }}>{r.draft.name || 'Sem nome'}</p>
                              <p className="truncate text-xs" style={{ color: C.textSecondary }}>{r.draft.short_description || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-3" style={{ color: C.textSecondary }}>{r.partner}</td>
                        <td className="py-3 pr-3">
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                            style={{ background: `${r.status.color}22`, color: r.status.color }}>
                            {r.status.label}
                          </span>
                        </td>
                        <td className="py-3 pr-3" style={{ color: C.textSecondary }}>{r.offer}</td>
                        <td className="py-3">
                          <div className="flex items-center gap-3">
                            {r.status.key === 'aprovado' && (
                              <button
                                type="button"
                                onClick={() => setPublishTarget({ id: r.draft.id, name: r.draft.name || 'Sem nome' })}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-white"
                                style={{ background: C.primary }}
                              >
                                <Rocket size={11} aria-hidden="true" /> Publicar
                              </button>
                            )}
                            <Link href={`/admin/marketplace/aplicativos/${r.draft.id}`} className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: C.primary }}>
                              Gerenciar <ChevronRight size={12} aria-hidden="true" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Cards no mobile */}
              <div className="space-y-3 md:hidden">
                {visibleRows.map(r => (
                  <div key={r.draft.id} className="rounded-xl border p-3" style={{ borderColor: C.border, background: C.header }}>
                    <div className="mb-2 flex items-center gap-2.5">
                      {r.draft.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.draft.logo_url} alt="" className="h-8 w-8 rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: C.card }}>
                          <Grid3x3 size={14} style={{ color: C.textSecondary }} aria-hidden="true" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium" style={{ color: C.text }}>{r.draft.name || 'Sem nome'}</p>
                        <p className="truncate text-xs" style={{ color: C.textSecondary }}>{r.partner}</p>
                      </div>
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${r.status.color}22`, color: r.status.color }}>
                        {r.status.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs" style={{ color: C.textSecondary }}>
                      <span>{r.offer}</span>
                      <div className="flex items-center gap-3">
                        {r.status.key === 'aprovado' && (
                          <button
                            type="button"
                            onClick={() => setPublishTarget({ id: r.draft.id, name: r.draft.name || 'Sem nome' })}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-white"
                            style={{ background: C.primary }}
                          >
                            <Rocket size={11} aria-hidden="true" /> Publicar
                          </button>
                        )}
                        <Link href={`/admin/marketplace/aplicativos/${r.draft.id}`} className="font-semibold" style={{ color: C.primary }}>Gerenciar →</Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between">
                {filteredRows.length > visibleRows.length && (
                  <p className="text-xs" style={{ color: C.textSecondary }}>Mostrando {visibleRows.length} de {filteredRows.length}.</p>
                )}
                <Link href="/admin/marketplace/aplicativos" className="ml-auto text-xs font-semibold" style={{ color: C.primary }}>Ver todos os aplicativos →</Link>
              </div>
            </>
          )}
        </section>

        {/* Destaques + atividade */}
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
            <div className="mb-4 flex items-center gap-2">
              <Star size={16} style={{ color: C.warning }} aria-hidden="true" />
              <div>
                <h2 className="text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Destaques patrocinados</h2>
                <p className="text-xs" style={{ color: C.textSecondary }}>Aplicativos em destaque na homepage e áreas de promoção.</p>
              </div>
            </div>
            {loadErrors.campaigns ? (
              <p className="text-sm" style={{ color: C.textSecondary }}>Não foi possível carregar as campanhas agora.</p>
            ) : campaigns.length === 0 ? (
              <p className="text-sm" style={{ color: C.textSecondary }}>Nenhuma campanha cadastrada ainda.</p>
            ) : (
              <ul className="space-y-3">
                {campaigns.map(c => {
                  const now = Date.now()
                  const live = c.is_active && c.is_approved && now >= new Date(c.starts_at).getTime() && now <= new Date(c.ends_at).getTime()
                  return (
                    <li key={c.id} className="rounded-xl border p-3" style={{ borderColor: C.border }}>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium" style={{ color: C.text }}>{c.application?.name ?? 'Aplicativo removido'}</p>
                        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ background: live ? `${C.success}22` : `${C.textSecondary}22`, color: live ? C.success : C.textSecondary }}>
                          {live ? 'No ar' : c.is_approved ? 'Aprovada, fora do período' : 'Aguardando aprovação'}
                        </span>
                      </div>
                      <p className="text-xs" style={{ color: C.textSecondary }}>
                        {formatDateTimeBR(c.starts_at)} a {formatDateTimeBR(c.ends_at)} · {c.is_paid ? 'Paga' : 'Sem cobrança configurada'}
                      </p>
                      <p className="mt-1 text-[11px]" style={{ color: C.textSecondary }}>Métricas ainda não disponíveis (sem tracking de impressões/cliques).</p>
                    </li>
                  )
                })}
              </ul>
            )}
            <button type="button" disabled title="Página de gestão de campanhas (/admin/marketplace/destaques) ainda não implementada."
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white opacity-50 cursor-not-allowed" style={{ background: C.primary }}>
              Gerenciar campanhas <ExternalLink size={12} aria-hidden="true" />
            </button>
          </section>

          <section className="rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
            <div className="mb-4 flex items-center gap-2">
              <History size={16} style={{ color: C.textSecondary }} aria-hidden="true" />
              <div>
                <h2 className="text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Atividade recente</h2>
                <p className="text-xs" style={{ color: C.textSecondary }}>Últimas ações relacionadas ao marketplace no período selecionado.</p>
              </div>
            </div>
            {loadErrors.submissions ? (
              <p className="text-sm" style={{ color: C.textSecondary }}>Não foi possível carregar a atividade agora.</p>
            ) : activity.length === 0 ? (
              <p className="text-sm" style={{ color: C.textSecondary }}>Sem atividade no período selecionado.</p>
            ) : (
              <ul className="space-y-3">
                {activity.map(ev => (
                  <li key={ev.id} className="flex items-start justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p style={{ color: C.text }}>
                        <span className="font-medium">{ev.app}</span> — {ev.label.toLowerCase()}
                      </p>
                      <p className="text-xs" style={{ color: C.textSecondary }}>por {ev.actor}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs" style={{ color: C.textSecondary }} title={formatDateTimeBR(ev.at)}>{formatRelativeTime(ev.at)}</p>
                      {ev.href && <Link href={ev.href} className="text-xs font-semibold" style={{ color: C.primary }}>Ver</Link>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <p className="mt-6 flex items-center gap-1.5 text-[11px]" style={{ color: C.textSecondary }}>
          <RefreshCw size={11} aria-hidden="true" /> Dados do período selecionado · Atualizado agora
        </p>
      </div>

      <ConfirmDialog
        open={publishTarget !== null}
        onOpenChange={next => !next && setPublishTarget(null)}
        icon={Rocket}
        variant="neutral"
        title="Publicar aplicativo?"
        description={
          <>
            <strong style={{ color: C.text }}>{publishTarget?.name}</strong> passa a aparecer como publicado. A versão aprovada mais recente é a que fica valendo — pedidos e direitos de compradores anteriores não são afetados.
          </>
        }
        confirmLabel="Publicar"
        confirmingLabel="Publicando…"
        busy={publishing}
        onConfirm={handlePublish}
      />
    </AdminShell>
  )
}

function MetricCard({ icon: Icon, title, value, sub, href, muted, tooltip }: {
  icon: React.ElementType; title: string; value: string; sub?: string; href?: string; muted?: boolean; tooltip?: string
}) {
  const content = (
    <div
      title={tooltip}
      className="h-full rounded-2xl border p-4 transition-colors"
      style={{ background: C.card, borderColor: C.border }}
    >
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: `${C.primary}1A` }}>
        <Icon size={15} style={{ color: muted ? C.textSecondary : C.primary }} aria-hidden="true" />
      </div>
      <p className="text-xs font-medium" style={{ color: C.textSecondary }}>{title}</p>
      <p className="my-0.5 text-xl font-bold" style={{ color: muted ? C.textSecondary : C.text, fontFamily: 'Space Grotesk, sans-serif' }}>{value}</p>
      {sub && <p className="truncate text-[10px]" style={{ color: C.textSecondary }}>{sub}</p>}
    </div>
  )
  if (href) {
    return href.startsWith('#')
      ? <a href={href}>{content}</a>
      : <Link href={href}>{content}</Link>
  }
  return content
}

function AlertItem({ icon: Icon, color, title, desc, href, cta }: {
  icon: React.ElementType; color: string; title: string; desc: string; href: string; cta: string
}) {
  return (
    <li className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `${color}22` }}>
          <Icon size={14} style={{ color }} aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-medium" style={{ color: C.text }}>{title}</p>
          <p className="text-xs" style={{ color: C.textSecondary }}>{desc}</p>
        </div>
      </div>
      <Link href={href} className="shrink-0 text-xs font-semibold" style={{ color: C.primary }}>{cta} →</Link>
    </li>
  )
}
