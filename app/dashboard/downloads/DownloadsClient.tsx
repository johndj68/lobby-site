'use client'

// Página "Meus downloads" do dashboard.
// Mostra os materiais que o cliente já baixou e exibe a biblioteca
// completa de recursos (gratuitos e pagos) para novos downloads.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Download, BookOpen, ArrowRight, ChevronDown,
  Search,
} from 'lucide-react'
import ResourceCover from '@/components/cards/ResourceCover'
import ResourceCard from '@/components/cards/ResourceCard'
import { createClient } from '@/lib/supabase'
import { resources as staticResources } from '@/lib/data'
import type { Resource } from '@/types'
import { CATEGORY_STYLE } from '@/lib/categories'
import type { User as SupabaseUser } from '@supabase/supabase-js'

// Lazy load — modais são pesados e só montados após interação do usuário,
// então não faz sentido incluí-los no bundle inicial da página.
const DownloadLeadForm   = dynamic(() => import('@/components/forms/DownloadLeadForm'), { ssr: false })
const EbookPurchaseModal = dynamic(() => import('@/components/forms/EbookPurchaseModal'), { ssr: false })

/* ── Tipos ─────────────────────────────────────────────────────── */

// Linha da tabela download_leads do Supabase
interface DownloadRow {
  id: string
  email: string
  resource_id: string
  created_at: string
}

// Props recebidas do Server Component (page.tsx)
interface Props {
  user: SupabaseUser
  profile: { full_name?: string; company_name?: string } | null
  downloads: DownloadRow[] | null // histórico de downloads do cliente (pode ser null se nenhum)
}

/* ── Constantes de configuração ─────────────────────────────────── */

// Categorias disponíveis para filtrar a grade de recursos
const CATEGORIES = ['Todos', 'Automação', 'Cibersegurança', 'Dados', 'Software']

// Passos da seção "Como funciona sua biblioteca" — informativo, sem lógica
const HOW_IT_WORKS = [
  {
    step: 1,
    icon: Search,
    title: 'Baixe materiais gratuitos',
    description: 'Explore nossa biblioteca e baixe materiais que agregam valor ao seu negócio.',
  },
  {
    step: 2,
    icon: Download,
    title: 'Seus downloads aparecem aqui',
    description: 'Todos os materiais baixados ficam salvos nesta área para fácil acesso.',
  },
  {
    step: 3,
    icon: BookOpen,
    title: 'Consulte sempre que precisar',
    description: 'Acesse seus guias, checklists e e-books quando quiser, de onde estiver.',
  },
]

/* ── Ilustração decorativa ─────────────────────────────────────── */
// Componente visual da área vazia — simula documentos em uma pasta.
// Visível apenas no desktop (lg:block) para não poluir mobile.
function DownloadLibraryIllustration() {
  return (
    <div className="relative mx-auto hidden h-64 w-full max-w-xs select-none lg:block" aria-hidden="true">
      {/* Brilhos ambiente */}
      <div className="absolute left-1/2 top-1/2 h-48 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#005BFF]/10 blur-3xl" />
      <div className="absolute right-4 top-8 h-28 w-28 rounded-full bg-[#7B2CFF]/10 blur-2xl" />

      {/* Documento PDF — esquerda, inclinado para dar profundidade */}
      <motion.div
        initial={{ opacity: 0, y: 10, rotate: -8 }}
        animate={{ opacity: 1, y: 0, rotate: -8 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="absolute left-2 top-4 h-36 w-[5.5rem] rounded-2xl border border-[#E3E7F0] bg-white/95 p-3 shadow-[0_8px_28px_rgba(0,91,255,0.14)]"
      >
        <span className="inline-flex rounded-md bg-[#EF4444] px-1.5 py-0.5 text-[9px] font-bold text-white">
          PDF
        </span>
        <div className="mt-4 space-y-1.5">
          <div className="h-1.5 rounded-full bg-[#005BFF]/15" />
          <div className="h-1.5 w-4/5 rounded-full bg-[#005BFF]/10" />
          <div className="h-1.5 w-3/5 rounded-full bg-[#005BFF]/08" />
          <div className="h-1.5 w-4/5 rounded-full bg-[#005BFF]/06" />
        </div>
        <div className="mt-3 flex gap-1">
          <div className="h-3 w-3 rounded-sm bg-[#005BFF]/12" />
          <div className="h-3 w-3 rounded-sm bg-[#005BFF]/08" />
        </div>
      </motion.div>

      {/* Guia/checklist — direita, inclinado no sentido oposto */}
      <motion.div
        initial={{ opacity: 0, y: 10, rotate: 8 }}
        animate={{ opacity: 1, y: 0, rotate: 8 }}
        transition={{ delay: 0.45, duration: 0.5 }}
        className="absolute right-2 top-4 h-36 w-[5.5rem] rounded-2xl border border-[#E3E7F0] bg-white/95 p-3 shadow-[0_8px_28px_rgba(123,44,255,0.14)]"
      >
        <span className="inline-flex rounded-md bg-[#7B2CFF] px-1.5 py-0.5 text-[9px] font-bold text-white">
          GUIA
        </span>
        <div className="mt-4 space-y-2.5">
          {[true, true, false].map((checked, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div
                className={`h-3 w-3 shrink-0 rounded-full border flex items-center justify-center ${
                  checked ? 'border-[#10B981] bg-[#10B981]/15' : 'border-[#E3E7F0]'
                }`}
              >
                {checked && <div className="h-1 w-1 rounded-full bg-[#10B981]" />}
              </div>
              <div className="h-1.5 flex-1 rounded-full bg-[#5D6475]/12" />
            </div>
          ))}
        </div>
      </motion.div>

      {/* Pasta central com ícone de download — elemento principal da ilustração */}
      <motion.div
        initial={{ opacity: 0, scale: 0.88 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.6, duration: 0.5 }}
        className="absolute bottom-2 left-1/2 z-20 h-28 w-52 -translate-x-1/2"
      >
        {/* Aba da pasta */}
        <div className="absolute left-8 top-[-13px] h-6 w-20 rounded-t-xl bg-gradient-to-r from-[#EEF4FF] to-[#F0EEFF]" />
        {/* Corpo da pasta */}
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-[#EEF4FF] to-[#F4EEFF] shadow-[0_20px_56px_rgba(0,91,255,0.18)]" />
        {/* Círculo com ícone de download centralizado */}
        <div className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-white shadow-[0_4px_18px_rgba(0,91,255,0.18)]">
          <Download size={22} className="text-[#005BFF]" />
        </div>
      </motion.div>
    </div>
  )
}

/* ── Componente principal ──────────────────────────────────────── */
export default function DownloadsClient({ user, downloads }: Props) {
  // Categoria selecionada no filtro da grade de recursos
  const [activeCategory, setActiveCategory] = useState('Todos')

  // Recursos buscados do banco (resource_metadata) — sobrescreve os estáticos
  const [dbResources, setDbResources]       = useState<Resource[]>([])

  // IDs de e-books que o cliente já pagou (controla o botão de acesso)
  const [purchasedIds, setPurchasedIds]     = useState<Set<string>>(new Set())

  // Saldo de créditos atual — exibido no botão "Comprar com créditos"
  const [creditBalance, setCreditBalance]   = useState<number | null>(null)

  // Recurso gratuito selecionado para formulário de lead antes do download
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null)

  // Recurso pago selecionado para modal de compra
  const [purchaseResource, setPurchaseResource] = useState<Resource | null>(null)

  /* ── Busca recursos publicados pelo técnico no banco ────────────
     Sem isso, a aba só mostrava os 6 recursos estáticos de lib/data.ts
     e nunca refletia o que o líder publicava pelo painel admin.
     Recursos inativos (is_paid && sale_status === 'inactive') são filtrados. */
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('resource_metadata')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!data || data.length === 0) return
        const mapped: Resource[] = data
          .filter(row => !row.is_paid || row.sale_status !== 'inactive')
          .map(row => ({
            id:          row.id,
            title:       row.title,
            description: row.description || '',
            category:    row.category as Resource['category'],
            // URL pública do arquivo no bucket materials do Supabase Storage
            fileUrl:     supabase.storage.from('materials').getPublicUrl(row.file_name).data.publicUrl,
            coverUrl:    '',
            format:      row.format,
            readTime:    row.read_time,
            level:       row.level,
            isPaid:             row.is_paid ?? false,
            price:              row.price ?? null,
            saleDescription:    row.sale_description ?? null,
            saleStatus:         row.sale_status ?? 'active',
            deliveryType:       row.delivery_type ?? 'automatic',
            protectedFilePath:  row.protected_file_path ?? null,
            creditPrice:        row.credit_price ?? null,
          }))
        setDbResources(mapped)
      })
  }, [])

  /* ── Busca e-books comprados pelo cliente ───────────────────────
     Controla o gate de download: apenas itens com status 'paid' liberam
     o acesso ao arquivo protegido. */
  useEffect(() => {
    createClient()
      .from('ebook_purchases')
      .select('ebook_id')
      .eq('user_id', user.id)
      .eq('status', 'paid')
      .then(({ data }) => setPurchasedIds(new Set((data ?? []).map(r => r.ebook_id as string))))
  }, [user.id])

  /* ── Busca saldo de créditos do cliente ─────────────────────────
     Alimenta o botão "Comprar com créditos" nos cards de recursos pagos. */
  useEffect(() => {
    createClient()
      .from('client_credit_wallets')
      .select('balance')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => setCreditBalance(data?.balance ?? 0))
  }, [user.id])

  // Atualiza estado local após resgate com créditos (sem recarregar a página)
  const handleRedeemedWithCredits = (resource: Resource) => {
    setPurchasedIds(prev => new Set(prev).add(resource.id))
    // Desconta o preço em créditos do saldo local para feedback imediato
    setCreditBalance(prev => prev != null && resource.creditPrice != null ? prev - resource.creditPrice : prev)
  }

  /* DB tem prioridade sobre estáticos — mesmo critério de /recursos.
     Se o técnico cadastrou recursos no banco, os estáticos somem para
     evitar duplicação ou conflito de dados. */
  const resources = dbResources.length > 0 ? dbResources : staticResources

  // true quando o cliente tem ao menos um download registrado
  const hasDownloads = downloads && downloads.length > 0

  // Filtra recursos pela categoria selecionada (ou mostra todos)
  const filteredResources = activeCategory === 'Todos'
    ? resources
    : resources.filter(r => r.category === activeCategory)

  return (
    <>
    <div className="space-y-10">

        {/* ── CABEÇALHO DA PÁGINA ───────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between"
        >
          <div>
            <h1
              className="text-3xl font-bold tracking-tight text-[#0B1020]"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              Meus downloads
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#5D6475]">
              Aqui ficam salvos os materiais que você baixou para consultar sempre que precisar.
            </p>
          </div>

          {/* CTA para explorar mais materiais na biblioteca pública */}
          <Link
            href="/recursos"
            className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-6 py-3 text-sm font-bold text-white shadow-[0_8px_24px_rgba(0,91,255,0.25)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_40px_rgba(123,44,255,0.28)]"
          >
            Explorar materiais gratuitos
            <ArrowRight
              size={15}
              className="transition-transform group-hover:translate-x-1"
              aria-hidden="true"
            />
          </Link>
        </motion.div>

        {/* ── LISTA DE DOWNLOADS OU ESTADO VAZIO ───────────────────
            Exibe histórico se há downloads, caso contrário exibe
            seção hero convidando o cliente a explorar a biblioteca. */}
        {hasDownloads ? (
          /* Lista de downloads: cada item mostra capa, título, categoria
             e botão de re-download direto do storage */
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-3"
          >
            <h2
              className="text-sm font-semibold uppercase tracking-widest text-[#5D6475]"
            >
              {downloads.length} {downloads.length === 1 ? 'material baixado' : 'materiais baixados'}
            </h2>
            {downloads.map((dl) => {
              // Cruza o download com os metadados do recurso (id correspondente)
              const resource = resources.find((r) => r.id === dl.resource_id)
              if (!resource) return null
              // Estilo visual da categoria (cor, borda, fundo)
              const catStyle = CATEGORY_STYLE[resource.category as string] ?? CATEGORY_STYLE['Software']
              return (
                <div
                  key={dl.id}
                  className="group flex items-center gap-4 rounded-2xl border border-[#E3E7F0] bg-white/90 p-4 shadow-[0_4px_20px_rgba(11,16,32,0.05)] transition-all hover:-translate-y-0.5 hover:border-[#005BFF]/20 hover:shadow-[0_8px_32px_rgba(0,91,255,0.10)]"
                >
                  {/* Mini capa do recurso */}
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl">
                    <ResourceCover category={resource.category as string} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-bold text-[#0B1020]"
                      style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                    >
                      {resource.title}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      {/* Pill de categoria com cores específicas */}
                      <span
                        className="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                        style={{ background: catStyle.bg, color: catStyle.text, borderColor: catStyle.border }}
                      >
                        {resource.category}
                      </span>
                      {/* Data de download formatada no padrão brasileiro */}
                      <span className="text-[10px] text-[#5D6475]">
                        Baixado em {new Date(dl.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  </div>

                  {/* Botão de re-download — link direto para o arquivo */}
                  <a
                    href={resource.fileUrl}
                    download
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[#E3E7F0] bg-white px-3 py-2 text-xs font-semibold text-[#005BFF] transition-all hover:border-[#005BFF]/30 hover:bg-[#005BFF]/5"
                  >
                    <Download size={13} aria-hidden="true" />
                    Baixar
                  </a>
                </div>
              )
            })}
          </motion.div>
        ) : (
          /* Estado vazio: biblioteca ainda vazia — hero com ilustração desktop */
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="relative overflow-hidden rounded-[2rem] border border-[#E3E7F0] bg-white/90 p-8 shadow-[0_24px_80px_rgba(11,16,32,0.07)] backdrop-blur md:p-10"
            aria-label="Biblioteca vazia"
          >
            {/* Gradientes decorativos de fundo */}
            <div
              className="pointer-events-none absolute inset-0 rounded-[2rem]"
              style={{ background: 'radial-gradient(circle at 80% 40%,rgba(123,44,255,0.09) 0%,transparent 35%),radial-gradient(circle at 45% 110%,rgba(0,91,255,0.07) 0%,transparent 40%)' }}
              aria-hidden="true"
            />
            {/* Grid de pontos decorativos no canto direito */}
            <div
              className="pointer-events-none absolute right-0 top-0 h-full w-1/2 opacity-20"
              style={{ backgroundImage: 'radial-gradient(circle at 1px 1px,rgba(0,91,255,0.18) 1px,transparent 0)', backgroundSize: '24px 24px' }}
              aria-hidden="true"
            />

            <div className="relative z-10 grid items-center gap-8 lg:grid-cols-[1fr_0.85fr]">
              {/* Coluna esquerda: texto e CTAs */}
              <div>
                {/* Ícone de download em container gradiente */}
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#005BFF]/10 to-[#7B2CFF]/10">
                  <Download size={28} className="text-[#005BFF]" aria-hidden="true" />
                </div>

                <h2
                  className="text-2xl font-bold text-[#0B1020] md:text-3xl"
                  style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                >
                  Sua biblioteca ainda está vazia
                </h2>

                <p className="mt-3 max-w-lg text-sm leading-relaxed text-[#5D6475] md:text-[15px]">
                  Baixe guias, checklists e e-books gratuitos para começar a montar sua central de conhecimento LOBBY.
                </p>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  {/* CTA principal: vai para a biblioteca pública */}
                  <Link
                    href="/recursos"
                    className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-6 py-3 text-sm font-bold text-white shadow-[0_8px_24px_rgba(0,91,255,0.25)] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_40px_rgba(123,44,255,0.28)]"
                  >
                    Explorar materiais gratuitos
                    <ArrowRight
                      size={14}
                      className="transition-transform group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </Link>
                  {/* CTA secundário: rola para a seção de recomendados abaixo */}
                  <a
                    href="#recomendados"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E3E7F0] bg-white px-6 py-3 text-sm font-semibold text-[#0B1020] shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#005BFF]/30 hover:shadow-md"
                  >
                    Ver recomendações
                  </a>
                </div>
              </div>

              {/* Coluna direita: ilustração animada (desktop apenas) */}
              <DownloadLibraryIllustration />
            </div>
          </motion.section>
        )}

        {/* ── RECURSOS RECOMENDADOS ─────────────────────────────────
            Seção sempre visível — permite baixar novos materiais mesmo
            quando o cliente já tem downloads. A grade usa os mesmos
            ResourceCard de /recursos com suporte a compra por créditos. */}
        <motion.section
          id="recomendados"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          aria-label="Materiais recomendados"
        >
          {/* Cabeçalho da seção */}
          <div className="mb-6">
            <h2
              className="text-xl font-bold text-[#0B1020]"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              Recomendados para começar
            </h2>
            <p className="mt-1 text-sm text-[#5D6475]">
              Selecionamos alguns conteúdos úteis para você iniciar sua biblioteca.
            </p>
          </div>

          {/* Filtros de categoria e botão de ordenação */}
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Botões de filtro por categoria */}
            <div
              className="flex flex-wrap items-center gap-2"
              role="group"
              aria-label="Filtrar por categoria"
            >
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  aria-pressed={activeCategory === cat}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-150 ${
                    activeCategory === cat
                      ? 'bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] text-white shadow-[0_4px_12px_rgba(0,91,255,0.25)]'
                      : 'border border-[#E3E7F0] bg-white text-[#5D6475] hover:border-[#005BFF]/30 hover:text-[#005BFF]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Botão de ordenação (visual apenas — sem lógica implementada ainda) */}
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-xl border border-[#E3E7F0] bg-white px-3 py-1.5 text-xs font-semibold text-[#5D6475] transition-all hover:border-[#005BFF]/30 hover:text-[#005BFF] sm:self-auto"
            >
              Mais recentes
              <ChevronDown size={13} aria-hidden="true" />
            </button>
          </div>

          {/* Grade de cards de recursos — usa os mesmos componentes de /recursos.
              Passes isPurchased e creditBalance para controlar acesso a pagos. */}
          {filteredResources.length > 0 ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {filteredResources.map((resource, i) => (
                <ResourceCard
                  key={resource.id}
                  resource={resource}
                  onDownload={setSelectedResource}       // abre formulário de lead (gratuito)
                  onBuyClick={setPurchaseResource}       // abre modal de compra (pago)
                  isLoggedIn
                  isPurchased={purchasedIds.has(resource.id)}
                  creditBalance={creditBalance}
                  onRedeemedWithCredits={handleRedeemedWithCredits}
                  index={i}
                />
              ))}
            </div>
          ) : (
            // Nenhum resultado para a categoria — oferece limpar filtro
            <div className="rounded-3xl border border-[#E3E7F0] bg-white/90 p-10 text-center shadow-sm">
              <p className="text-sm font-medium text-[#5D6475]">
                Nenhum material encontrado nesta categoria.
              </p>
              <button
                type="button"
                onClick={() => setActiveCategory('Todos')}
                className="mt-3 text-sm font-bold text-[#005BFF] hover:underline"
              >
                Ver todos os materiais
              </button>
            </div>
          )}
        </motion.section>

        {/* ── COMO FUNCIONA SUA BIBLIOTECA ─────────────────────────
            Seção educativa de três passos — ajuda o cliente a entender
            o fluxo de download e re-acesso a materiais. */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          aria-label="Como funciona a biblioteca"
        >
          <div className="mb-6">
            <h2
              className="text-xl font-bold text-[#0B1020]"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              Como funciona sua biblioteca
            </h2>
          </div>

          {/* Grade de 3 cards com numeração, ícone, título e descrição */}
          <div className="grid gap-5 lg:grid-cols-3">
            {HOW_IT_WORKS.map(({ step, icon: Icon, title, description }, i) => (
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="rounded-3xl border border-[#E3E7F0] bg-white/90 p-6 shadow-[0_4px_24px_rgba(11,16,32,0.05)] transition-all hover:border-[#005BFF]/20 hover:shadow-[0_8px_40px_rgba(0,91,255,0.08)]"
              >
                <div className="mb-5 flex items-center gap-3">
                  {/* Número do passo com gradiente lobby */}
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#005BFF] to-[#7B2CFF] text-xs font-bold text-white shadow-[0_2px_8px_rgba(0,91,255,0.25)]">
                    {step}
                  </span>
                  {/* Ícone ilustrativo do passo */}
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#005BFF]/8">
                    <Icon size={20} className="text-[#005BFF]" aria-hidden="true" />
                  </div>
                </div>
                <h3
                  className="mb-2 text-base font-bold text-[#0B1020]"
                  style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                >
                  {title}
                </h3>
                <p className="text-sm leading-relaxed text-[#5D6475]">
                  {description}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.section>

      </div>

    {/* Modal de formulário de lead para download gratuito */}
    <AnimatePresence>
      {selectedResource && (
        <DownloadLeadForm
          resource={selectedResource}
          onClose={() => setSelectedResource(null)}
        />
      )}
    </AnimatePresence>

    {/* Modal de compra de e-book pago */}
    <AnimatePresence>
      {purchaseResource && (
        <EbookPurchaseModal
          resource={purchaseResource}
          userId={user.id}
          onClose={() => setPurchaseResource(null)}
        />
      )}
    </AnimatePresence>
    </>
  )
}
