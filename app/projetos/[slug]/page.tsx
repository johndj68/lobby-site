// Página Server Component — sem 'use client', roda no servidor (Next.js App Router)
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, TrendingUp, Tag, DollarSign } from 'lucide-react'
import Container from '@/components/layout/Container'
import ProjectMockup from '@/components/cards/ProjectMockup'
import CTASection from '@/components/sections/CTASection'
import { projects } from '@/lib/data'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { formatCurrencyBRL } from '@/lib/finance'
import { CATEGORY_STYLE } from '@/lib/categories'
import type { Project } from '@/types'

// Props da rota dinâmica — params.slug vem da URL /projetos/[slug]
// É uma Promise no Next.js 15 (params agora são assíncronos)
interface Props {
  params: Promise<{ slug: string }>
}

// Gera todas as rotas estáticas em build time a partir dos projetos em lib/data.ts
// Permite pre-render das páginas de portfólio sem requisição ao banco em produção
export async function generateStaticParams() {
  return projects.map((p) => ({ slug: p.slug }))
}

/** Busca projeto: banco primeiro (reflete edições do painel, inclusive
 *  preço/tipo pago), cai pro estático de lib/data.ts só se a linha ainda
 *  não existir no banco (ex.: seed do /admin/projetos nunca rodou). Antes
 *  isso tentava o estático primeiro e nunca mostrava edições feitas no
 *  painel pra projetos originados de lib/data.ts. */
async function getProject(slug: string): Promise<Project | null> {
  const supabase = await createServerSupabaseClient()
  // maybeSingle() retorna null em vez de erro quando não encontra a linha
  const { data } = await supabase
    .from('lobby_projects')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()

  if (data) {
    // Normaliza os campos do banco para o tipo Project usado na UI
    return {
      id:          data.id,
      title:       data.title,
      description: data.description,
      category:    data.category as Project['category'],
      imageUrl:    data.image_url ?? '',
      slug:        data.slug,
      impact:      data.impact,
      tags:        data.tags ?? [],
      isPaid:      data.is_paid ?? false,  // false quando coluna é null
      price:       data.price ?? null,
    }
  }

  // Fallback: busca no array estático de lib/data.ts (projetos sem linha no banco)
  return projects.find(p => p.slug === slug) ?? null
}

// Gera o <title> e description da página dinamicamente para SEO
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const project = await getProject(slug)
  if (!project) return { title: 'Projeto não encontrado | LOBBY' }
  return {
    title: `${project.title} | LOBBY`,
    description: project.description,
  }
}


export default async function ProjectDetailPage({ params }: Props) {
  const { slug } = await params
  const project = await getProject(slug)
  // Retorna 404 se o slug não corresponde a nenhum projeto no banco nem no estático
  if (!project) notFound()

  const cat   = project.category as string
  // Obtém as cores/estilos do badge de categoria (fundo, texto, borda)
  const style = CATEGORY_STYLE[cat] ?? CATEGORY_STYLE['Software']

  // Projetos relacionados: mesma categoria, excluindo o projeto atual, até 3
  const related = projects.filter(p => p.category === project.category && p.slug !== slug).slice(0, 3)

  return (
    <>
      {/* ── SEÇÃO PRINCIPAL: hero + detalhes do projeto ──────────── */}
      <section className="relative overflow-hidden bg-[#F7F8FC] py-16 lg:py-20">
        {/* Decoração de fundo: gradientes radiais + grid de pontos */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,91,255,0.07),transparent_35%),radial-gradient(circle_at_80%_80%,rgba(123,44,255,0.08),transparent_38%)]" />
          <div className="absolute inset-0 opacity-[0.18] bg-[radial-gradient(circle_at_1px_1px,rgba(0,91,255,0.14)_1px,transparent_0)] bg-[size:28px_28px]" />
        </div>

        <Container className="relative z-10">
          {/* Link de volta para a listagem de projetos */}
          <Link
            href="/projetos"
            className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-[#5D6475] transition-colors hover:text-[#005BFF]"
          >
            <ArrowLeft size={15} aria-hidden="true" />
            Voltar aos projetos
          </Link>

          {/* Grade: imagem do projeto (esquerda) + informações (direita) */}
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16 items-start">
            {/* Mockup / imagem do projeto */}
            <div className="overflow-hidden rounded-3xl border border-[#E3E7F0] shadow-[0_20px_70px_rgba(11,16,32,0.10)]">
              <div className="relative h-72 lg:h-96">
                {/* Usa Image do Next.js para URLs externas; fallback para mockup SVG local */}
                {project.imageUrl?.startsWith('http') ? (
                  <Image
                    src={project.imageUrl}
                    alt={project.title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    priority // carrega com prioridade (above the fold)
                  />
                ) : (
                  // Componente de mockup gerado programaticamente quando não há imagem real
                  <ProjectMockup slug={project.slug} category={cat} />
                )}
              </div>
            </div>

            {/* Painel de informações do projeto */}
            <div>
              {/* Badge de categoria com cores dinâmicas por tipo (Software, Automação etc.) */}
              <span
                className="mb-4 inline-flex rounded-full border px-3 py-1 text-xs font-semibold"
                style={{ background: style.bg, color: style.text, borderColor: style.border }}
              >
                {cat}
              </span>

              <h1
                className="text-3xl font-bold leading-tight text-[#0B1020] lg:text-4xl"
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
              >
                {project.title}
              </h1>

              <p className="mt-4 text-base leading-relaxed text-[#5D6475] lg:text-lg">
                {project.description}
              </p>

              {/* Destaque de impacto — ex: "Redução de 40% no tempo de processo" */}
              {project.impact && (
                <div className="mt-6 inline-flex items-center gap-2 rounded-2xl border border-[#005BFF]/15 bg-[#005BFF]/[0.07] px-4 py-2.5 text-sm font-bold text-[#005BFF]">
                  <TrendingUp size={15} aria-hidden="true" />
                  {project.impact}
                </div>
              )}

              {/* Preço — só projetos marcados como pagos pelo Técnico Líder */}
              {/* isPaid é setado no painel /admin/projetos, não diretamente no código */}
              {project.isPaid && (
                <div className="mt-6 inline-flex items-center gap-2 rounded-2xl border border-[#D97706]/20 bg-[#D97706]/[0.06] px-4 py-2.5 text-sm font-bold text-[#D97706]">
                  <DollarSign size={15} aria-hidden="true" />
                  {project.price != null ? formatCurrencyBRL(project.price) : 'Projeto pago'}
                </div>
              )}

              {/* Tags de tecnologia/ferramentas usadas no projeto */}
              {project.tags && project.tags.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {project.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#E3E7F0] bg-white px-3 py-1 text-xs font-medium text-[#5D6475]"
                    >
                      <Tag size={10} aria-hidden="true" />
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* CTAs — projeto pago manda pro contato com a mensagem
                  pré-preenchida; portfólio comum mantém o CTA de sempre. */}
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                {/* CTA primário: "Comprar" ou "Quero algo parecido" conforme isPaid */}
                <Link
                  href={
                    project.isPaid
                      // Para projetos pagos: abre /contato com mensagem pré-preenchida
                      ? `/contato?mensagem=${encodeURIComponent(`Tenho interesse no projeto "${project.title}". Pode me passar mais detalhes sobre valores e prazo?`)}`
                      : '/contato'
                  }
                  className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-7 py-4 text-sm font-bold text-white shadow-[0_18px_40px_rgba(0,91,255,0.22)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(123,44,255,0.28)]"
                >
                  {project.isPaid ? 'Comprar este projeto' : 'Quero algo parecido'}
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </Link>
                {/* CTA secundário: sempre direciona para /contato */}
                <Link
                  href="/contato"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E3E7F0] bg-white px-7 py-4 text-sm font-bold text-[#0B1020] shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#005BFF]/30 hover:text-[#005BFF]"
                >
                  Falar com especialista
                </Link>
              </div>
            </div>
          </div>

          {/* ── PROJETOS RELACIONADOS ─────────────────────────────── */}
          {/* Exibe até 3 projetos da mesma categoria, buscados do array estático */}
          {related.length > 0 && (
            <div className="mt-20">
              <h2
                className="mb-6 text-xl font-bold text-[#0B1020]"
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
              >
                Outros projetos em {cat}
              </h2>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {related.map((p) => (
                  // Card clicável que navega para a página de detalhe do projeto relacionado
                  <Link
                    key={p.id}
                    href={`/projetos/${p.slug}`}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-[#E3E7F0] bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#005BFF]/25 hover:shadow-md"
                  >
                    {/* Miniatura do mockup do projeto relacionado */}
                    <div className="relative h-36 overflow-hidden">
                      <ProjectMockup slug={p.slug} category={p.category as string} />
                    </div>
                    <div className="p-4">
                      <p className="text-sm font-bold text-[#0B1020] group-hover:text-[#005BFF] transition-colors" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                        {p.title}
                      </p>
                      {/* line-clamp-2 corta a descrição em 2 linhas para manter altura uniforme */}
                      <p className="mt-1 text-xs text-[#5D6475] line-clamp-2">{p.description}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </Container>
      </section>

      {/* ── SEÇÃO CTA FINAL ──────────────────────────────────────── */}
      {/* Banner de chamada para ação exibido no rodapé da página */}
      <CTASection
        title="Pronto para transformar sua ideia em solução?"
        description="Fale com um especialista e descubra como a LOBBY pode impulsionar seu negócio."
        buttonLabel="Solicitar diagnóstico gratuito"
        benefits={['Diagnóstico gratuito', 'Plano de ação inicial', 'Resultado mensurável']}
      />
    </>
  )
}
