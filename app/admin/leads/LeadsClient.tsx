'use client'

// Hooks de estado e memoização para filtros e cálculos derivados
import { useState, useMemo } from 'react'
// Componente de paginação reutilizável
import Pagination from '@/components/ui/Pagination'

// Número de leads exibidos por página na lista principal
const LEADS_PER_PAGE = 10
// Biblioteca de animações para entradas suaves
import { motion } from 'framer-motion'
// Ícones utilizados nos cards, filtros e sidebar
import {
  Download, Mail, Building2, Clock, Search,
  Users, FileText, TrendingUp, BarChart3, Eye, Zap, X,
  Activity, BookOpen, Sparkles,
  ChevronDown,
} from 'lucide-react'
// Layout padrão do painel administrativo (sidebar + header)
import AdminShell from '@/components/layout/AdminShell'
// Lista de recursos (ebooks/materiais) disponíveis para download
import { resources } from '@/lib/data'
// Tipo com ranking de downloads por material (calculado no servidor)
import type { MaterialRank } from './page'
// Tipo de lead capturado via download de material
import type { Lead } from '@/types'
// Utilitário para exibir tempo relativo (ex: "há 3 dias")
import { timeAgo } from '@/lib/utils'
// Configurações visuais por categoria (ícone, cor, bg)
import { CATEGORY_CFG } from '@/lib/categories'
import type { User as SupabaseUser } from '@supabase/supabase-js'

/* Props recebidas do Server Component */
interface Props {
  user:    SupabaseUser          // Usuário autenticado
  profile: { full_name?: string } | null  // Perfil do técnico logado
  leads:   Lead[]                // Todos os leads capturados
  ranking: MaterialRank[]        // Ranking de downloads por material (pré-calculado)
}

/* ── Configurações de filtro ─────────────────────────────────────────── */
// Configuração padrão usada quando a categoria do lead não tem cfg específica
const DEFAULT_CFG = { icon: Download, color: '#94A3B8', bg: 'rgba(148,163,184,0.10)', accent: '#64748B' }

// Categorias de filtro disponíveis na interface
const CAT_FILTERS  = ['Todos', 'Automação', 'Dados', 'Software', 'Cibersegurança']
// Opções de período para filtrar leads por data de criação
const PERIOD_OPTS  = ['Todos', 'Este mês', 'Esta semana', 'Hoje']
// Constante de milissegundos em um dia — usada nos filtros de período
const DAY_MS       = 86400000


/* Filtra leads pelo período selecionado comparando created_at com agora */
function applyPeriod(leads: Lead[], period: string): Lead[] {
  const now = Date.now()
  if (period === 'Hoje')       return leads.filter(l => now - new Date(l.created_at).getTime() < DAY_MS)
  if (period === 'Esta semana') return leads.filter(l => now - new Date(l.created_at).getTime() < 7 * DAY_MS)
  if (period === 'Este mês')   return leads.filter(l => now - new Date(l.created_at).getTime() < 30 * DAY_MS)
  return leads
}

/* ── Sidebar: Resumo de leads por categoria com gráfico donut ────────── */
function CategorySummary({ leads }: { leads: Lead[] }) {
  const total = leads.length
  // Calcula contagem e percentual de cada categoria para o donut e a lista
  const rows = CAT_FILTERS.slice(1).map(cat => {
    const count = leads.filter(l => l.interest_area === cat).length
    const pct   = total ? Math.round((count / total) * 100) : 0
    const cfg   = CATEGORY_CFG[cat] ?? DEFAULT_CFG
    return { cat, count, pct, cfg }
  })

  // Constrói o gradiente cônico do donut acumulando os percentuais das categorias
  const donut = rows.reduce<string[]>((acc, { pct, cfg }, i) => {
    const prev = rows.slice(0, i).reduce((s, r) => s + r.pct, 0)
    if (pct > 0) acc.push(`${cfg.accent} ${prev}% ${prev + pct}%`)
    return acc
  }, [])
  // Estilo final do donut — fundo cinza escuro quando não há dados
  const donutStyle = donut.length
    ? { background: `conic-gradient(${donut.join(', ')}, #1E293B 100%)` }
    : { background: '#1E293B' }

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          Resumo por categoria
        </h3>
        <Sparkles size={13} className="text-white/30" aria-hidden="true" />
      </div>

      {/* Gráfico donut: proporção visual de leads por categoria */}
      <div className="mb-5 flex justify-center">
        <div className="relative">
          <div className="h-24 w-24 rounded-full" style={donutStyle} />
          {/* Centro do donut mostra o total de leads */}
          <div className="absolute inset-0 m-3 flex flex-col items-center justify-center rounded-full bg-[#111827]">
            <span className="text-xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{total}</span>
            <span className="text-[9px] text-white/40">leads</span>
          </div>
        </div>
      </div>

      {/* Lista de categorias com cor, percentual e contagem */}
      <div className="space-y-2.5">
        {rows.map(({ cat, count, pct, cfg }) => (
          <div key={cat} className="flex items-center gap-2.5">
            <div className="h-2 w-2 shrink-0 rounded-full" style={{ background: cfg.accent }} aria-hidden="true" />
            <span className="flex-1 truncate text-[11px] text-white/55">{cat}</span>
            <span className="text-[11px] text-white/35">{pct}%</span>
            <span className="w-4 text-right text-[11px] font-bold text-white/65">{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Sidebar: Feed de atividade recente dos leads ────────────────────── */
function LeadRecentActivity({ leads }: { leads: Lead[] }) {
  /* Gera até 5 itens de atividade combinando eventos de "lead capturado" e "material baixado"
     para os 4 leads mais recentes, ordenados por timestamp decrescente */
  const items = leads.slice(0, 4).flatMap(l => {
    const resource = resources.find(r => r.id === l.resource_id)
    return [
      {
        key:   `lead-${l.id}`,
        icon:  Users,
        color: '#60A5FA',
        bg:    'rgba(96,165,250,0.12)',
        title: `Novo lead capturado: ${l.name}`,
        sub:   timeAgo(l.created_at),
        ts:    new Date(l.created_at).getTime(),
      },
      {
        key:   `mat-${l.id}`,
        icon:  BookOpen,
        color: '#A78BFA',
        bg:    'rgba(167,139,250,0.12)',
        title: `Material baixado: ${resource?.title ?? l.resource_id}`,
        sub:   timeAgo(l.created_at),
        // -1ms para garantir que o evento de material fique imediatamente após o de lead
        ts:    new Date(l.created_at).getTime() - 1,
      },
    ]
  }).sort((a, b) => b.ts - a.ts).slice(0, 5)

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          Atividade recente
        </h3>
        <Activity size={13} className="text-white/30" aria-hidden="true" />
      </div>

      {items.length > 0 ? (
        <div className="relative space-y-4">
          {/* Linha vertical que conecta visualmente os itens do feed */}
          <div className="pointer-events-none absolute left-[13px] top-2 h-[calc(100%-16px)] w-px bg-white/[0.06]" aria-hidden="true" />
          {items.map(item => {
            const Icon = item.icon
            return (
              <div key={item.key} className="flex items-start gap-3">
                <div className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: item.bg }}>
                  <Icon size={12} style={{ color: item.color }} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="truncate text-xs font-semibold text-white/80">{item.title}</p>
                  <p className="text-[10px] text-white/35">{item.sub}</p>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-center text-xs text-white/30">Nenhuma atividade.</p>
      )}
    </div>
  )
}

/* ── Card individual de lead com painel de detalhes expansível ───────── */
function LeadCard({ lead, index }: { lead: Lead; index: number }) {
  // Controla a visibilidade do painel de detalhes (material baixado + observação)
  const [showDetail, setShowDetail] = useState(false)
  // Recurso (ebook/material) associado ao download que gerou este lead
  const resource = resources.find(r => r.id === lead.resource_id)
  // Categoria do lead: usa interest_area ou categoria do recurso como fallback
  const cat   = lead.interest_area ?? resource?.category ?? ''
  // Configuração visual da categoria (ícone, cor, bg)
  const cfg   = CATEGORY_CFG[cat as string] ?? DEFAULT_CFG
  const Icon  = cfg.icon

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="overflow-hidden rounded-3xl border border-white/[0.08] bg-[#111827]/80 shadow-[0_20px_70px_rgba(0,0,0,0.25)] transition-all duration-300 hover:border-[#005BFF]/35 hover:shadow-[0_8px_32px_rgba(0,91,255,0.12)]"
    >
      <div className="p-5 sm:p-6">
        {/* Cabeçalho: ícone da categoria, nome, email, empresa, tempo e ações */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            {/* Ícone da categoria do lead */}
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
              style={{ background: cfg.bg }}
            >
              <Icon size={22} style={{ color: cfg.color }} aria-hidden="true" />
            </div>
            <div>
              {/* Nome do lead e badge de categoria */}
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  {lead.name}
                </h3>
                {cat && (
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[10px] font-bold"
                    style={{ background: cfg.bg, color: cfg.color }}
                  >
                    {cat}
                  </span>
                )}
              </div>

              {/* Informações de contato: email, empresa e tempo desde o cadastro */}
              <div className="mt-2 flex flex-wrap gap-3">
                <a
                  href={`mailto:${lead.email}`}
                  className="flex items-center gap-1 text-[11px] text-[#60A5FA] hover:underline"
                >
                  <Mail size={10} aria-hidden="true" /> {lead.email}
                </a>
                {lead.company && (
                  <span className="flex items-center gap-1 text-[11px] text-white/40">
                    <Building2 size={10} aria-hidden="true" /> {lead.company}
                  </span>
                )}
                <span className="flex items-center gap-1 text-[11px] text-white/30">
                  <Clock size={10} aria-hidden="true" /> {timeAgo(lead.created_at)}
                </span>
              </div>
            </div>
          </div>

          {/* Botões de ação: ver detalhes, enviar e-mail e converter em solicitação */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDetail(v => !v)}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-white/[0.10] px-3.5 py-2 text-xs font-semibold text-white/60 transition-all hover:border-[#005BFF]/40 hover:bg-[#005BFF]/10 hover:text-[#60A5FA]"
            >
              <Eye size={13} aria-hidden="true" />
              {showDetail ? 'Fechar' : 'Ver detalhes'}
            </button>
            {/* Link mailto pré-preenchido com nome do lead */}
            <a
              href={`mailto:${lead.email}?subject=Olá, ${lead.name} — LOBBY`}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-white/[0.10] px-3.5 py-2 text-xs font-semibold text-white/60 transition-all hover:border-[#005BFF]/40 hover:bg-[#005BFF]/10 hover:text-[#60A5FA]"
            >
              <Mail size={13} aria-hidden="true" />
              Enviar e-mail
            </a>
            {/* Botão de conversão — futura funcionalidade para criar solicitação a partir do lead */}
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-3.5 py-2 text-xs font-bold text-white shadow-[0_4px_12px_rgba(0,91,255,0.25)] transition-all hover:-translate-y-0.5"
            >
              <Zap size={13} aria-hidden="true" />
              Converter em solicitação
            </button>
          </div>
        </div>

        {/* Painel de detalhes expansível: mostra o material baixado e uma observação contextual */}
        {showDetail && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-5 overflow-hidden"
          >
            {/* Bloco do material baixado (apenas se o recurso existir na lista) */}
            {resource && (
              <div className="mb-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/30">
                  Material baixado
                </p>
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: cfg.bg }}
                  >
                    <FileText size={13} style={{ color: cfg.color }} aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white/80">{resource.title}</p>
                    <p className="text-[10px] text-white/35">
                      {resource.category} {resource.readTime ? `• ${resource.readTime}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Observação gerada automaticamente sobre a origem e interesse do lead */}
            <div className="rounded-2xl border-l-2 border-[#005BFF]/50 bg-white/[0.03] p-4">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-white/30">
                Observação
              </p>
              <p className="text-sm text-white/55">
                Contato gerado por download de material gratuito. Interesse em{' '}
                <span style={{ color: cfg.color }}>{cat || 'tecnologia'}</span>.
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </motion.article>
  )
}

/* ── Componente principal da página de Leads ────────────────────────── */
export default function LeadsClient({ user, profile, leads, ranking }: Props) {
  // Categoria selecionada no filtro (ex: "Automação")
  const [catFilter,  setCatFilter]  = useState('Todos')
  // Período selecionado no dropdown (ex: "Esta semana")
  const [period,     setPeriod]     = useState('Todos')
  // Página atual da paginação (base 0)
  const [page,       setPage]       = useState(0)
  // Texto de busca livre (nome, email, empresa ou título do material)
  const [search,     setSearch]     = useState('')
  // Controla visibilidade do dropdown de período
  const [showPeriod, setShowPeriod] = useState(false)

  /* Lista filtrada de leads: aplica período, categoria e busca textual */
  const filtered = useMemo(() => {
    return applyPeriod(leads, period).filter(l => {
      // Resolve categoria do lead: interest_area > categoria do recurso > vazio
      const cat = l.interest_area ?? resources.find(r => r.id === l.resource_id)?.category ?? ''
      const matchCat = catFilter === 'Todos' || cat === catFilter
      const q = search.toLowerCase()
      const res = resources.find(r => r.id === l.resource_id)
      // Busca em nome, email, empresa, área de interesse e título do material
      const matchSearch = !q || [l.name, l.email, l.company, l.interest_area, res?.title]
        .some(v => v?.toLowerCase().includes(q))
      return matchCat && matchSearch
    })
  }, [leads, catFilter, period, search])

  // Cálculos de paginação para a lista de leads
  const leadsTotal = filtered.length
  const leadsPages = Math.max(1, Math.ceil(leadsTotal / LEADS_PER_PAGE))
  const paginatedLeads = filtered.slice(page * LEADS_PER_PAGE, (page + 1) * LEADS_PER_PAGE)

  /* Contagem de downloads por resource_id — usado no ranking de materiais */
  const resourceCounts = useMemo(() => {
    return leads.reduce<Record<string, number>>((acc, l) => {
      acc[l.resource_id] = (acc[l.resource_id] || 0) + 1
      return acc
    }, {})
  }, [leads])

  /* Top 5 recursos ordenados por número de downloads — exibido na seção de ranking */
  const rankedResources = useMemo(() => {
    return resources
      .map(r => ({ resource: r, count: resourceCounts[r.id] ?? 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }, [resourceCounts])

  // Máximo de downloads para normalizar as barras de progresso do ranking
  const maxCount = Math.max(1, rankedResources[0]?.count ?? 1)

  // Material com maior número de downloads (para o card de métricas "Mais baixado")
  const topResource = rankedResources.find(r => r.count > 0)

  /* Contagem de leads por categoria para os badges dos chips de filtro */
  const catCounts: Record<string, number> = { Todos: leads.length }
  CAT_FILTERS.slice(1).forEach(c => {
    catCounts[c] = leads.filter(l => {
      const cat = l.interest_area ?? resources.find(r => r.id === l.resource_id)?.category ?? ''
      return cat === c
    }).length
  })

  /* Estatísticas derivadas para os cards de métricas */
  // Emails distintos — indica alcance real de contatos únicos
  const uniqueEmails = new Set(leads.map(l => l.email)).size
  // Leads dos últimos 7 dias para exibir crescimento recente.
  // Date.now() fixado no mount via inicializador lazy do useState — chamar
  // função impura direto no corpo do render (ou dentro de um useMemo, que o
  // React Compiler trata do mesmo jeito) viola a regra de pureza do React;
  // o inicializador lazy do useState é o padrão sancionado para isso.
  const [weekCutoff] = useState(() => Date.now() - 7 * DAY_MS)
  const thisWeek = leads.filter(l => new Date(l.created_at).getTime() > weekCutoff)
  // Leads repetidos = diferença entre total e emails únicos (baixaram mais de um material)
  const repeatLeads = leads.length - uniqueEmails

  return (
    <AdminShell user={user} profile={profile}>
      <div className="space-y-7">

        {/* ── CABEÇALHO DA PÁGINA ──────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-start gap-4"
        >
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
            style={{ background: 'rgba(96,165,250,0.12)' }}
          >
            <Download size={22} className="text-[#60A5FA]" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Leads de materiais
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-white/40">
              Acompanhe contatos gerados por downloads, identifique interesses e priorize oportunidades comerciais.
            </p>
          </div>
        </motion.div>

        {/* ── CARDS DE MÉTRICAS: total, únicos, mais baixado, recorrentes ── */}
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {[
            { icon: Users,      label: 'Total de leads',         value: leads.length.toString(),       sub: `+${thisWeek.length} esta semana`,   color: '#60A5FA', bg: 'rgba(96,165,250,0.12)',  grad: '#3B82F6' },
            { icon: Mail,       label: 'E-mails únicos',         value: uniqueEmails.toString(),        sub: 'Contatos capturados',                color: '#34D399', bg: 'rgba(52,211,153,0.12)',  grad: '#10B981' },
            { icon: FileText,   label: 'Mais baixado',           value: topResource ? topResource.count.toString() : '0', sub: topResource?.resource.title ?? '—', color: '#A78BFA', bg: 'rgba(167,139,250,0.12)', grad: '#8B5CF6' },
            { icon: TrendingUp, label: 'Leads recorrentes',      value: repeatLeads.toString(),        sub: 'Baixaram mais de um material',      color: '#34D399', bg: 'rgba(52,211,153,0.12)',  grad: '#10B981' },
          ].map(({ icon: Icon, label, value, sub, color, bg, grad }, i) => (
            <motion.article
              key={label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.06 }}
              className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.25)] transition-all duration-300 hover:-translate-y-1 hover:border-[#005BFF]/35 hover:shadow-[0_12px_40px_rgba(0,91,255,0.15)]"
            >
              {/* Linha de destaque colorida no topo do card */}
              <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: `linear-gradient(to right, ${grad}, transparent)` }} aria-hidden="true" />
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: bg }}>
                <Icon size={19} style={{ color }} aria-hidden="true" />
              </div>
              <p className="text-2xl font-bold text-white truncate" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{value}</p>
              <p className="mt-0.5 text-xs text-white/40">{label}</p>
              <p className="mt-1.5 truncate text-[10px]" style={{ color: `${color}99` }}>{sub}</p>
            </motion.article>
          ))}
        </div>

        {/* ── RANKING DE MATERIAIS MAIS BAIXADOS (top 5 com barra de progresso) ── */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-6 shadow-[0_20px_70px_rgba(0,0,0,0.25)]"
          aria-label="Materiais mais baixados"
        >
          <div className="mb-5 flex items-center gap-3">
            <BarChart3 size={18} className="text-[#00A3FF]" aria-hidden="true" />
            <h2 className="text-base font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Materiais mais baixados
            </h2>
          </div>
          <div className="space-y-4">
            {rankedResources.map(({ resource: r, count }, i) => {
              // Percentual em relação ao material líder (não ao total)
              const pct  = Math.round((count / maxCount) * 100)
              const isTop = i === 0 && count > 0
              return (
                <div key={r.id} className="flex items-center gap-3">
                  {/* Badge de posição com gradiente especial para o 1º lugar */}
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${
                      isTop
                        ? 'bg-gradient-to-br from-[#005BFF] to-[#7B2CFF] text-white'
                        : 'bg-white/[0.06] text-white/40'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-xs font-medium ${count > 0 ? 'text-white/75' : 'text-white/35'}`}>
                      {r.title}
                    </p>
                    {/* Barra de progresso relativa ao material com mais downloads */}
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${pct}%`,
                          background: count > 0 ? 'linear-gradient(to right, #005BFF, #7B2CFF)' : 'transparent',
                        }}
                      />
                    </div>
                  </div>
                  {/* Número absoluto de downloads */}
                  <span className={`shrink-0 text-xs font-bold ${count > 0 ? 'text-white/70' : 'text-white/25'}`}>
                    {count}
                  </span>
                </div>
              )
            })}
          </div>
        </motion.section>

        {/* ── GRID PRINCIPAL: lista filtrada + sidebar ──────────────── */}
        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.7fr]">

          {/* ── COLUNA ESQUERDA: filtros + lista de leads ─────────── */}
          <div className="space-y-5">

            {/* Bloco de filtros: busca, categorias e período */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="rounded-3xl border border-white/[0.08] bg-[#0F172A]/80 p-4"
            >
              {/* Campo de busca livre */}
              <div className="relative mb-4">
                <Search size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30" aria-hidden="true" />
                <input
                  type="text"
                  placeholder="Buscar por nome, e-mail, empresa ou material..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  aria-label="Buscar leads"
                  className="h-11 w-full rounded-2xl border border-white/[0.10] bg-[#111827] pl-11 pr-10 text-sm text-white placeholder:text-white/25 outline-none transition-all focus:border-[#005BFF]/50 focus:ring-2 focus:ring-[#005BFF]/15"
                />
                {/* Botão limpar busca */}
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-white/30 hover:text-white transition-colors"
                    aria-label="Limpar busca"
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                )}
              </div>

              {/* Chips de categoria + dropdown de período lado a lado */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {/* Chips de filtro por categoria */}
                <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por categoria">
                  {CAT_FILTERS.map(f => {
                    const isActive = catFilter === f
                    const cfg = f !== 'Todos' ? (CATEGORY_CFG[f] ?? DEFAULT_CFG) : null
                    return (
                      <button
                        key={f}
                        type="button"
                        // Ao mudar categoria, volta para a primeira página
                        onClick={() => { setCatFilter(f); setPage(0) }}
                        aria-pressed={isActive}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-150 ${
                          isActive
                            ? 'bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] text-white shadow-[0_4px_14px_rgba(0,91,255,0.30)]'
                            : 'border border-white/[0.08] bg-white/[0.04] text-white/45 hover:border-[#005BFF]/40 hover:text-white/80'
                        }`}
                      >
                        {cfg && <cfg.icon size={11} style={{ color: isActive ? 'white' : cfg.color }} aria-hidden="true" />}
                        {f}
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${isActive ? 'bg-white/25 text-white' : 'bg-white/[0.07] text-white/35'}`}>
                          {catCounts[f] ?? 0}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Dropdown de período: Todos / Este mês / Esta semana / Hoje */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowPeriod(v => !v)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/45 hover:border-white/20 hover:text-white/80 transition-all"
                  >
                    {period}
                    <ChevronDown size={12} aria-hidden="true" />
                  </button>
                  {showPeriod && (
                    <div className="absolute right-0 top-full z-20 mt-1 min-w-[120px] overflow-hidden rounded-xl border border-white/[0.10] bg-[#111827] shadow-[0_8px_32px_rgba(0,0,0,0.40)]">
                      {PERIOD_OPTS.map(p => (
                        <button
                          key={p}
                          type="button"
                          // Seleciona período, fecha dropdown e volta para primeira página
                          onClick={() => { setPeriod(p); setShowPeriod(false); setPage(0) }}
                          className={`flex w-full px-3 py-2 text-left text-xs font-semibold transition-colors ${
                            period === p ? 'text-[#60A5FA]' : 'text-white/50 hover:bg-white/[0.05] hover:text-white/80'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Contador de resultados filtrados */}
              <p className="mt-3 text-[11px] text-white/25">
                {filtered.length} lead{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
              </p>
            </motion.div>

            {/* Cabeçalho da seção de cards com contagem total filtrada */}
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Leads capturados
              </h2>
              <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-bold text-white/50">
                {filtered.length} lead{filtered.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Lista paginada de cards de lead ou estado vazio */}
            {filtered.length > 0 ? (
              <div className="space-y-4">
                {paginatedLeads.map((l, i) => (
                  <LeadCard key={l.id} lead={l} index={i} />
                ))}
                {/* Paginação apenas quando há mais de uma página */}
                <Pagination
                  page={page}
                  totalPages={leadsPages}
                  onPageChange={setPage}
                  variant="dark"
                  className="mt-6"
                />
              </div>
            ) : (
              /* Estado vazio: mensagem contextual com botão para limpar filtros */
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-3xl border border-dashed border-white/[0.10] bg-white/[0.02] p-12 text-center"
              >
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: 'rgba(96,165,250,0.10)' }}>
                  <Download size={22} className="text-[#60A5FA]" aria-hidden="true" />
                </div>
                <p className="text-sm font-semibold text-white/50">Nenhum lead encontrado</p>
                <p className="mt-1.5 text-xs text-white/25">
                  {search || catFilter !== 'Todos'
                    ? 'Tente outros filtros de busca.'
                    : 'Quando um usuário baixar um material e deixar contato, ele aparecerá aqui.'
                  }
                </p>
                {/* Botão para resetar todos os filtros — aparece quando algum está ativo */}
                {(search || catFilter !== 'Todos' || period !== 'Todos') && (
                  <button
                    type="button"
                    onClick={() => { setSearch(''); setCatFilter('Todos'); setPeriod('Todos') }}
                    className="mt-5 inline-flex items-center gap-1.5 rounded-xl border border-white/[0.10] px-4 py-2 text-xs font-semibold text-white/45 transition-all hover:border-white/20 hover:text-white/70"
                  >
                    Limpar filtros
                  </button>
                )}
              </motion.div>
            )}
          </div>

          {/* ── SIDEBAR DIREITA: donut de categorias + atividade recente + lista rápida ── */}
          <aside className="space-y-5">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <CategorySummary leads={leads} />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
              <LeadRecentActivity leads={leads} />
            </motion.div>

            {/* Card de contagem rápida por categoria (sem donut) */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-5"
            >
              <h3 className="mb-4 text-sm font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Leads por categoria
              </h3>
              <div className="space-y-3">
                {CAT_FILTERS.slice(1).map(label => ({
                  label, value: catCounts[label] ?? 0, color: CATEGORY_CFG[label]?.color ?? DEFAULT_CFG.color,
                })).map(({ label, value, color }) => (
                  <div key={label} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" />
                      <span className="text-xs text-white/45">{label}</span>
                    </div>
                    <span className="text-xs font-bold text-white/70">{value}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </aside>
        </div>

        {/* ── TABELA DE RELATÓRIO DE DOWNLOADS (apenas se houver dados no ranking) ── */}
        {ranking.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            aria-label="Relatório de downloads por material"
          >
            {/* Cabeçalho da seção com total de downloads e contagem de materiais */}
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  Relatório de downloads
                </h2>
                <p className="mt-0.5 text-xs text-white/40">
                  Ranking de materiais mais baixados · {leads.length} downloads no total
                </p>
              </div>
              {/* Indicador do número de materiais com pelo menos 1 download */}
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/35">
                <FileText size={11} aria-hidden="true" />
                {ranking.length} material{ranking.length !== 1 ? 'is' : ''} encontrado{ranking.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Tabela de ranking com posição, nome, barra de progresso, categoria e contagem */}
            <div className="overflow-hidden rounded-3xl border border-white/[0.08] bg-[#111827]/80">

              {/* Cabeçalho da tabela */}
              <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 border-b border-white/[0.06] px-5 py-3">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-white/25">#</span>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-white/25">Material</span>
                <span className="hidden text-[10px] font-semibold uppercase tracking-widest text-white/25 sm:block">Categoria</span>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-white/25">Downloads</span>
              </div>

              {/* Linhas do ranking: cada material com animação de entrada escalonada */}
              {ranking.map(({ resourceId, name, category, count }, idx) => {
                // Percentual em relação ao total de downloads (não ao líder)
                const pct      = leads.length ? Math.round((count / leads.length) * 100) : 0
                // Top 3 recebem fundo levemente destacado
                const isTop3   = idx < 3
                // Cor associada à categoria do material
                const catColor = category === 'Automação'      ? '#A78BFA'
                               : category === 'Dados'          ? '#38BDF8'
                               : category === 'Software'       ? '#60A5FA'
                               : category === 'Cibersegurança' ? '#34D399'
                               : '#94A3B8'
                // Emoji de medalha para os 3 primeiros lugares
                const medalEmoji = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null

                return (
                  <motion.div
                    key={resourceId}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + idx * 0.04 }}
                    className={`grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 border-b border-white/[0.04] px-5 py-4 last:border-b-0 transition-colors hover:bg-white/[0.03] ${
                      isTop3 ? 'bg-white/[0.02]' : ''
                    }`}
                  >
                    {/* Posição com emoji de medalha para top 3 */}
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center">
                      {medalEmoji ? (
                        <span className="text-base" aria-label={`${idx + 1}º lugar`}>{medalEmoji}</span>
                      ) : (
                        <span className="text-xs font-bold text-white/25">{idx + 1}</span>
                      )}
                    </div>

                    {/* Nome do material + barra de progresso animada */}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white/85" title={name}>
                        {name}
                      </p>
                      {/* Barra de progresso com animação de largura na montagem */}
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ delay: 0.6 + idx * 0.04, duration: 0.6 }}
                            className="absolute left-0 top-0 h-full rounded-full"
                            style={{ background: `linear-gradient(to right, ${catColor}, ${catColor}88)` }}
                          />
                        </div>
                        <span className="shrink-0 text-[10px] font-semibold text-white/30">
                          {pct}%
                        </span>
                      </div>
                    </div>

                    {/* Badge de categoria (oculto em mobile) */}
                    <span
                      className="hidden shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold sm:inline-flex"
                      style={{
                        borderColor: `${catColor}33`,
                        background:  `${catColor}14`,
                        color:        catColor,
                      }}
                    >
                      {category}
                    </span>

                    {/* Contagem absoluta de downloads */}
                    <div className="flex shrink-0 flex-col items-end">
                      <span className="text-base font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                        {count}
                      </span>
                      <span className="text-[9px] text-white/25">
                        {count === 1 ? 'download' : 'downloads'}
                      </span>
                    </div>
                  </motion.div>
                )
              })}
            </div>

            {/* Rodapé com 4 estatísticas resumidas do relatório */}
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: 'Total de downloads',      value: leads.length,                               color: '#60A5FA' },
                { label: 'Materiais com downloads', value: ranking.length,                             color: '#A78BFA' },
                // Média arredondada de downloads por material com dados
                { label: 'Média por material',       value: ranking.length ? Math.round(leads.length / ranking.length) : 0, color: '#34D399' },
                { label: 'Mais baixado',             value: ranking[0]?.count ?? 0,                    color: '#FBBF24' },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 text-center">
                  <p className="text-2xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif', color }}>
                    {value}
                  </p>
                  <p className="mt-0.5 text-[11px] text-white/35">{label}</p>
                </div>
              ))}
            </div>
          </motion.section>
        )}

      </div>
    </AdminShell>
  )
}
