'use client'

// Componente principal do painel do cliente (dashboard home).
// Renderiza sidebar, header fixo, métricas, projetos em andamento
// e recomendações personalizadas de recursos.

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Crown, Sparkles, CheckCircle2, HelpCircle, ArrowRight, Download, FolderKanban, MessageSquarePlus, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { dashboardRecommendedResources } from '@/lib/data'
import { STATUS_CFG, DEFAULT_STATUS_CFG } from '@/lib/project-status'
import ResourceCover from '@/components/cards/ResourceCover'
import OnboardingWelcome from '@/components/dashboard/OnboardingWelcome'
import { timeAgo } from '@/lib/utils'
import type { User as SupabaseUser } from '@supabase/supabase-js'

/* ── Tipos ─────────────────────────────────────────────────────── */

// Contadores exibidos nos cards de resumo do painel
interface Metrics {
  downloads: number   // materiais que o usuário baixou
  contacts:  number   // solicitações em aberto (novo + em_analise)
  resources: number   // total de materiais disponíveis
  projects:  number   // projetos do cliente ainda em andamento
}

// Resumo de projeto exibido na seção "Projetos em andamento"
interface RecentProject {
  id:         string
  title:      string
  status:     string
  progress:   number
  updated_at: string
}

// Props recebidas do Server Component pai (page.tsx)
interface Props {
  user:     SupabaseUser
  profile:  { full_name?: string; company_name?: string; interest_area?: string; onboarded?: boolean } | null
  metrics:  Metrics
  projects: RecentProject[]
}


/* ── Tipo unificado de recurso para o dashboard ──────────────── */
// Usado para normalizar dados do banco e dados estáticos no mesmo formato
interface DashboardResource {
  id:           string
  title:        string
  description:  string
  coverCategory: string  // used by ResourceCover
  badge:        string   // pill label (E-book / Guia / PDF)
  tags:         string[]
}

/* ── Constrói os cards de métricas com valores reais ─────────── */
// Função em vez de constante para poder receber o objeto metrics dinâmico
// e gerar os dados de exibição (value, tag, cta) conforme estado real do cliente.
function buildMetricCards(m: Metrics) {
  return [
    {
      icon: Download,
      title: 'Meus downloads',
      value: String(m.downloads),
      description: 'Materiais baixados',
      tag: m.downloads === 0 ? 'Nenhum ainda' : `${m.downloads} total`,
      cta: 'Ver histórico',
      href: '/dashboard/downloads',
      color: '#005BFF',
      gradFrom: '#005BFF',
      gradTo: '#00A3FF',
    },
    {
      icon: FolderKanban,
      title: 'Projetos',
      value: String(m.projects),
      description: 'Projetos em andamento',
      tag: m.projects === 0 ? 'Nenhum ainda' : 'Ver detalhes',
      cta: 'Ver projetos',
      href: '/dashboard/projetos',
      color: '#7B2CFF',
      gradFrom: '#7B2CFF',
      gradTo: '#005BFF',
    },
    {
      icon: MessageSquarePlus,
      title: 'Solicitações abertas',
      value: String(m.contacts),
      description: m.contacts === 0 ? 'Nenhuma em aberto' : 'Em novo ou análise',
      tag: m.contacts === 0 ? 'Tudo certo' : 'Pendente',
      cta: 'Nova solicitação',
      href: '/contato',
      color: '#00A3FF',
      gradFrom: '#00A3FF',
      gradTo: '#005BFF',
    },
    {
      icon: Crown,
      title: 'Materiais disponíveis',
      value: String(m.resources),
      description: 'Conteúdos gratuitos',
      tag: 'Explorar',
      cta: 'Ver materiais',
      href: '/recursos',
      color: '#7B2CFF',
      gradFrom: '#005BFF',
      gradTo: '#7B2CFF',
    },
  ]
}

export default function DashboardClient({ user, profile, metrics, projects }: Props) {
  // useRef evita recriar o cliente a cada re-render
  const supabaseRef = useRef(createClient())

  // Constrói cards com valores reais vindos do servidor
  const metricCards = buildMetricCards(metrics)

  /* ── Recomendações personalizadas ────────────────────────────────
     Estratégia em três camadas:
     1. Busca em resource_metadata filtrado por interest_area do perfil
     2. Se DB vazio, filtra estáticos pelo interesse
     3. Fallback: exibe todos os estáticos                           */
  const [recommended, setRecommended] = useState<DashboardResource[]>(
    // Valor inicial: recursos estáticos convertidos para DashboardResource
    dashboardRecommendedResources.map(r => ({
      id: r.id, title: r.title, description: r.description,
      coverCategory: r.coverCategory, badge: r.category, tags: r.tags,
    }))
  )
  // Controla se o título da seção deve ser "Recomendados para você" (personalizado)
  const [isPersonalized, setIsPersonalized] = useState(false)

  // Busca recursos do banco após montar — evita SSR blocking para dado menos crítico
  useEffect(() => {
    const interest = profile?.interest_area
    const sb = supabaseRef.current

    // Tenta buscar do banco filtrado pelo interesse do usuário
    let query = sb
      .from('resource_metadata')
      .select('id, title, description, category, format, read_time, level')
      .order('created_at', { ascending: false })
      .limit(4)

    if (interest) query = (query as typeof query).eq('category', interest)

    query.then(({ data }) => {
      if (data && data.length > 0) {
        // Banco tem dados: usa-os e marca como personalizado se há interesse
        setRecommended(data.map(r => ({
          id:            r.id,
          title:         r.title,
          description:   r.description,
          coverCategory: r.category,
          badge:         r.format ?? 'PDF',
          tags:          [r.format, r.read_time, r.level].filter(Boolean) as string[],
        })))
        setIsPersonalized(!!interest)
        return
      }

      // Banco vazio: filtra estáticos por interesse
      if (interest) {
        const filtered = dashboardRecommendedResources.filter(
          r => r.coverCategory === interest
        )
        if (filtered.length > 0) {
          setRecommended(filtered.map(r => ({
            id: r.id, title: r.title, description: r.description,
            coverCategory: r.coverCategory, badge: r.category, tags: r.tags,
          })))
          setIsPersonalized(true)
        }
      }
    })
  }, [profile?.interest_area])

  // Primeiro nome para saudação — fallback para parte do email se perfil vazio
  const firstName = profile?.full_name?.split(' ')[0] || user.email?.split('@')[0] || 'Usuário'

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >

            {/* ── ONBOARDING — exibe apenas na primeira visita ─── */}
            {/* onboarded === false significa que é o primeiro acesso do cliente */}
            {profile?.onboarded === false && (
              <OnboardingWelcome userId={user.id} firstName={firstName} />
            )}

            {/* ── HERO / BOAS-VINDAS ────────────────────────────── */}
            {/* Seção principal com saudação, ações rápidas e card de status da conta */}
            <section
              className="relative overflow-hidden rounded-3xl border border-[#E3E7F0] bg-white/85 p-6 shadow-[0_20px_70px_rgba(11,16,32,0.06)] backdrop-blur sm:p-8"
              aria-label="Boas-vindas"
            >
              {/* Gradientes decorativos de fundo — não interativos */}
              <div
                className="pointer-events-none absolute inset-0 rounded-3xl"
                style={{ background: 'radial-gradient(circle at 75% 30%,rgba(123,44,255,0.08) 0%,transparent 35%),radial-gradient(circle at 40% 110%,rgba(0,91,255,0.07) 0%,transparent 40%)' }}
                aria-hidden="true"
              />
              <div className="pointer-events-none absolute right-16 top-8 h-40 w-40 rounded-full bg-[#7B2CFF]/8 blur-3xl" aria-hidden="true" />
              <div className="pointer-events-none absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-[#005BFF]/6 blur-3xl" aria-hidden="true" />

              <div className="relative z-10 grid gap-6 lg:grid-cols-[1fr_auto]">
                {/* Coluna esquerda: saudação + ações rápidas */}
                <div>
                  <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[#005BFF]/20 bg-[#005BFF]/6 px-3 py-1 text-xs font-semibold text-[#005BFF]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" aria-hidden="true" />
                    Central do cliente LOBBY
                  </span>
                  <h1
                    className="mb-2 text-2xl font-bold text-[#0B1020] sm:text-3xl"
                    style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                  >
                    Olá, {firstName} 👋
                  </h1>
                  <p className="mb-1 text-sm font-semibold text-[#005BFF]">
                    Bem-vindo à sua central LOBBY.
                  </p>
                  <p className="mb-6 max-w-lg text-sm leading-relaxed text-[#5D6475]">
                    Acesse seus materiais, acompanhe projetos e descubra soluções recomendadas para o seu negócio.
                  </p>

                  {/* Ações rápidas: explorar materiais, solicitar solução, suporte */}
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href="/recursos"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#E3E7F0] bg-white px-4 py-2 text-xs font-semibold text-[#0B1020] shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#005BFF]/30 hover:shadow-md"
                    >
                      <Download size={13} aria-hidden="true" />
                      Explorar materiais
                    </Link>
                    <Link
                      href="/contato"
                      className="inline-flex items-center gap-1.5 rounded-xl lobby-gradient px-4 py-2 text-xs font-semibold text-white shadow-[0_4px_12px_rgba(0,91,255,0.28)] transition-all hover:-translate-y-0.5 hover:opacity-90"
                    >
                      <Plus size={13} aria-hidden="true" />
                      Solicitar solução
                    </Link>
                    <Link
                      href="/contato"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#E3E7F0] bg-white px-4 py-2 text-xs font-semibold text-[#0B1020] shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#7B2CFF]/30 hover:shadow-md"
                    >
                      <HelpCircle size={13} aria-hidden="true" />
                      Falar com suporte
                    </Link>
                  </div>
                </div>

                {/* Coluna direita: card de status da conta (fixo, sem lógica dinâmica) */}
                <div className="w-full shrink-0 rounded-2xl border border-[#E3E7F0] bg-white/80 p-5 backdrop-blur lg:w-52">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#5D6475]">
                    Status da conta
                  </p>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-[#5D6475]">Status</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#10B981]/10 px-2 py-0.5 text-[10px] font-bold text-[#10B981]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" aria-hidden="true" />
                        Ativa
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-[#5D6475]">Último acesso</span>
                      <span className="text-xs font-semibold text-[#0B1020]">Hoje, 10:42</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-[#5D6475]">Plano</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#005BFF]/8 px-2 py-0.5 text-[10px] font-bold text-[#005BFF]">
                        <Crown size={9} aria-hidden="true" />
                        Cliente
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ── CARDS DE MÉTRICAS ─────────────────────────────── */}
            {/* Grade de 4 cards com contadores reais (downloads, projetos, contatos, recursos) */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" role="list" aria-label="Resumo de atividade">
              {metricCards.map(({ icon: Icon, title, value, description, tag, cta, href, color, gradFrom, gradTo }, i) => (
                <motion.article
                  key={title}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.07 }}
                  role="listitem"
                  className="group relative overflow-hidden rounded-3xl border border-[#E3E7F0] bg-white/90 p-6 shadow-[0_18px_60px_rgba(11,16,32,0.06)] transition-all duration-300 hover:-translate-y-1 hover:border-[#005BFF]/30 hover:shadow-[0_24px_80px_rgba(0,91,255,0.12)]"
                >
                  {/* Faixa colorida no topo do card — identidade visual do card */}
                  <div
                    className="absolute inset-x-0 top-0 h-0.5"
                    style={{ background: `linear-gradient(to right, ${gradFrom}, ${gradTo})` }}
                    aria-hidden="true"
                  />

                  {/* Ícone com fundo colorido translúcido */}
                  <div
                    className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl"
                    style={{ background: `linear-gradient(135deg, ${gradFrom}14, ${gradTo}14)` }}
                  >
                    <Icon size={20} style={{ color }} aria-hidden="true" />
                  </div>

                  <p className="text-xs font-medium text-[#5D6475]">{title}</p>
                  <p
                    className="my-1 text-3xl font-bold text-[#0B1020]"
                    style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                  >
                    {value}
                  </p>
                  <p className="text-xs text-[#5D6475]">{description}</p>

                  {/* Pill de tag (estado rápido do card) */}
                  <span
                    className="mt-2 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
                    style={{ background: `${gradFrom}16`, color }}
                  >
                    {tag}
                  </span>

                  {/* CTA do card com seta que avança no hover */}
                  <Link
                    href={href}
                    className="mt-4 flex items-center gap-1 text-xs font-semibold transition-all"
                    style={{ color }}
                  >
                    {cta}
                    <ArrowRight
                      size={11}
                      className="transition-transform duration-300 group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </Link>
                </motion.article>
              ))}
            </div>

            {/* ── PROJETOS + RECURSOS RECOMENDADOS ────────────────
                Layout de duas colunas no desktop:
                - Esquerda (menor): projetos em andamento do cliente
                - Direita (maior): recursos recomendados personalizados */}
            <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">

              {/* Projetos em andamento — lista dos projetos passados via prop */}
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="rounded-3xl border border-[#E3E7F0] bg-white/90 p-6 shadow-[0_18px_60px_rgba(11,16,32,0.06)]"
                aria-label="Projetos em andamento"
              >
                <div className="mb-5 flex items-center justify-between">
                  <h2
                    className="text-base font-bold text-[#0B1020]"
                    style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                  >
                    Projetos em andamento
                  </h2>
                  <Link
                    href="/dashboard/projetos"
                    className="flex items-center gap-1 text-xs font-semibold text-[#005BFF] transition-all hover:gap-2"
                  >
                    Ver todos
                    <ArrowRight size={11} aria-hidden="true" />
                  </Link>
                </div>

                {/* Estado vazio: convida o cliente a solicitar o primeiro projeto */}
                {projects.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[#E3E7F0] bg-white/60 px-4 py-8 text-center">
                    <p className="text-sm font-semibold text-[#0B1020]">
                      Você ainda não tem projetos em andamento
                    </p>
                    <p className="max-w-xs text-xs text-[#5D6475]">
                      Solicite uma solução e nossa equipe criará um projeto personalizado para o seu negócio.
                    </p>
                    <Link
                      href="/dashboard/projetos"
                      className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-4 py-2 text-xs font-bold text-white shadow-[0_8px_24px_rgba(0,91,255,0.22)] transition-all hover:-translate-y-0.5"
                    >
                      Solicitar projeto
                    </Link>
                  </div>
                ) : (
                  /* Lista de projetos com barra de progresso e status colorido */
                  <div className="space-y-3">
                    {projects.map((project, i) => {
                      // STATUS_CFG mapeia o status do banco para label, cor e bg
                      const cfg = STATUS_CFG[project.status] ?? DEFAULT_STATUS_CFG
                      return (
                        <motion.div
                          key={project.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.4 + i * 0.07 }}
                          className="group rounded-2xl border border-[#E3E7F0] p-4 transition-all hover:border-[#005BFF]/20 hover:bg-[#F7F8FC]/60"
                        >
                          <div className="mb-3 flex items-start justify-between gap-2">
                            <p
                              className="text-sm font-semibold leading-snug text-[#0B1020]"
                              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                            >
                              {project.title}
                            </p>
                            {/* Badge de status colorido conforme configuração */}
                            <span
                              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                              style={{ background: cfg.bg, color: cfg.color }}
                            >
                              {cfg.label}
                            </span>
                          </div>
                          {/* Barra de progresso gradiente */}
                          <div className="flex items-center gap-2">
                            <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[#E3E7F0]">
                              <div
                                className="absolute left-0 top-0 h-full rounded-full transition-all duration-700"
                                style={{
                                  width: `${project.progress}%`,
                                  background: 'linear-gradient(to right, #005BFF, #7B2CFF)',
                                }}
                              />
                            </div>
                            <span className="shrink-0 text-xs font-bold text-[#5D6475]">
                              {project.progress}%
                            </span>
                          </div>
                          {/* Tempo relativo desde a última atualização */}
                          <p className="mt-2 text-[10px] text-[#5D6475]">
                            Atualizado {timeAgo(project.updated_at)}
                          </p>
                        </motion.div>
                      )
                    })}
                  </div>
                )}
              </motion.section>

              {/* Recursos recomendados — personalizados ou estáticos */}
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                aria-label="Conteúdos recomendados"
              >
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div>
                    {/* Título muda se a recomendação é personalizada pelo interesse */}
                    <h2
                      className="text-base font-bold text-[#0B1020]"
                      style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                    >
                      {isPersonalized
                        ? `Recomendados para você`
                        : 'Conteúdos recomendados'}
                    </h2>
                    {isPersonalized && profile?.interest_area && (
                      <p className="mt-0.5 text-xs text-[#005BFF]">
                        Baseado no seu interesse em{' '}
                        <span className="font-semibold">{profile.interest_area}</span>
                      </p>
                    )}
                  </div>
                  <Link
                    href="/recursos"
                    className="flex shrink-0 items-center gap-1 text-xs font-semibold text-[#005BFF] transition-all hover:gap-2"
                  >
                    Ver todos
                    <ArrowRight size={11} aria-hidden="true" />
                  </Link>
                </div>

                {/* Grade 2 colunas de cards de recursos */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {recommended.map((res, i) => (
                    <motion.article
                      key={res.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.45 + i * 0.07 }}
                      className="group overflow-hidden rounded-3xl border border-[#E3E7F0] bg-white/90 shadow-[0_8px_40px_rgba(11,16,32,0.05)] transition-all duration-300 hover:-translate-y-1 hover:border-[#005BFF]/20 hover:shadow-[0_20px_60px_rgba(0,91,255,0.10)]"
                    >
                      {/* Capa visual do recurso com zoom no hover */}
                      <div className="relative h-28 w-full overflow-hidden">
                        <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-105">
                          <ResourceCover category={res.coverCategory} />
                        </div>
                      </div>

                      <div className="p-4">
                        {/* Badge de formato (PDF, E-book, Guia) */}
                        <span className="mb-2 inline-block rounded-full bg-[#005BFF]/[0.08] px-2.5 py-0.5 text-[10px] font-semibold text-[#005BFF]">
                          {res.badge}
                        </span>

                        <h3
                          className="mb-1.5 text-xs font-bold leading-snug text-[#0B1020]"
                          style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                        >
                          {res.title}
                        </h3>

                        <p className="mb-3 text-[11px] leading-relaxed text-[#5D6475]">
                          {res.description}
                        </p>

                        {/* Tags de metadados (formato, tempo de leitura, nível) */}
                        <div className="mb-3 flex flex-wrap gap-1">
                          {res.tags.map(tag => (
                            <span
                              key={tag}
                              className="rounded-full border border-[#E3E7F0] bg-[#F7F8FC] px-2 py-0.5 text-[9px] font-medium text-[#5D6475]"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>

                        <Link
                          href="/recursos"
                          className="flex items-center gap-1 text-xs font-bold text-[#005BFF] transition-all hover:gap-2"
                        >
                          Baixar agora
                          <ArrowRight
                            size={11}
                            className="transition-transform duration-300 group-hover:translate-x-1"
                            aria-hidden="true"
                          />
                        </Link>
                      </div>
                    </motion.article>
                  ))}
                </div>
              </motion.section>
            </div>

            {/* ── CTA DE DIAGNÓSTICO GRATUITO ───────────────────── */}
            {/* Seção de conversão ao final da página — incentiva o cliente
                a solicitar análise personalizada do negócio */}
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="relative overflow-hidden rounded-3xl border border-[#E3E7F0] bg-gradient-to-br from-[#F0F4FF] via-white to-[#EEF0FF] p-6 shadow-[0_18px_60px_rgba(11,16,32,0.06)] sm:p-8"
              aria-label="Diagnóstico gratuito"
            >
              <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 rounded-full bg-[#7B2CFF]/6 blur-3xl" aria-hidden="true" />
              <div className="pointer-events-none absolute -bottom-8 left-20 h-48 w-48 rounded-full bg-[#005BFF]/6 blur-3xl" aria-hidden="true" />

              <div className="relative z-10 flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-5">
                  {/* Ícone com gradiente lobby */}
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl lobby-gradient shadow-[0_8px_24px_rgba(0,91,255,0.30)]">
                    <Sparkles size={22} className="text-white" aria-hidden="true" />
                  </div>
                  <div>
                    <h3
                      className="mb-1.5 text-lg font-bold text-[#0B1020]"
                      style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                    >
                      Quer uma análise personalizada para a sua empresa?
                    </h3>
                    <p className="mb-4 max-w-lg text-sm text-[#5D6475]">
                      Receba um diagnóstico gratuito com insights e recomendações personalizadas para impulsionar seus resultados.
                    </p>
                    {/* Lista de benefícios do diagnóstico */}
                    <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                      {['Diagnóstico gratuito', 'Recomendações personalizadas', 'Plano inicial de ação'].map(b => (
                        <span key={b} className="flex items-center gap-1.5 text-xs font-medium text-[#0B1020]">
                          <CheckCircle2 size={12} className="text-[#10B981]" aria-hidden="true" />
                          {b}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <Link
                  href="/contato"
                  className="shrink-0 inline-flex items-center gap-2 rounded-2xl lobby-gradient px-6 py-3.5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(0,91,255,0.28)] transition-all hover:-translate-y-0.5 hover:opacity-90 hover:shadow-[0_12px_32px_rgba(0,91,255,0.38)]"
                >
                  Solicitar diagnóstico gratuito
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </div>
            </motion.section>

    </motion.div>
  )
}
