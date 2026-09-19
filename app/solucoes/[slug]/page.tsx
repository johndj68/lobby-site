import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Check, Rocket } from 'lucide-react'
import { Code2, Settings2, BarChart3, Shield } from 'lucide-react'
import Container from '@/components/layout/Container'
import CTASection from '@/components/sections/CTASection'
import { services, howWeWorkSteps } from '@/lib/data'

/* Mapa de ícones disponíveis para os serviços.
   A chave é o campo `icon` do objeto de serviço em /lib/data.
   Code2 é o fallback quando o ícone não for encontrado. */
const iconMap: Record<string, React.ElementType> = { Code2, Settings2, BarChart3, Shield }

/* Props da página: params é uma Promise porque no Next.js App Router
   os parâmetros de rota dinâmica são resolvidos de forma assíncrona. */
interface Props { params: Promise<{ slug: string }> }

/* Gera os parâmetros estáticos para todas as páginas de serviço.
   Permite que o Next.js pré-renderize as rotas em build time (SSG).
   Apenas serviços com `slug` definido são incluídos. */
export async function generateStaticParams() {
  return services.filter(s => s.slug).map(s => ({ slug: s.slug! }))
}

/* Gera os metadados (<title> e <description>) dinamicamente por slug.
   Retorna objeto vazio se o serviço não for encontrado
   (o notFound() abaixo trata o 404 antes da renderização). */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const s = services.find(s => s.slug === slug)
  if (!s) return {}
  return { title: `${s.title} | LOBBY`, description: s.description }
}

/* Paleta de cores de destaque por tema do serviço.
   Cada entrada define: cor principal, fundo translúcido, borda e gradiente.
   Usada para personalizar visualmente cada página de solução. */
const ACCENT_COLORS: Record<string, { color: string; bg: string; border: string; grad: string }> = {
  blue:   { color: '#005BFF', bg: 'rgba(0,91,255,0.08)',   border: 'rgba(0,91,255,0.20)',   grad: 'from-[#005BFF] to-[#00A3FF]' },
  purple: { color: '#7B2CFF', bg: 'rgba(123,44,255,0.08)', border: 'rgba(123,44,255,0.20)', grad: 'from-[#7B2CFF] to-[#005BFF]' },
  cyan:   { color: '#00A3FF', bg: 'rgba(0,163,255,0.08)',  border: 'rgba(0,163,255,0.20)',  grad: 'from-[#00A3FF] to-[#7B2CFF]' },
  mixed:  { color: '#005BFF', bg: 'rgba(0,91,255,0.08)',   border: 'rgba(91,77,255,0.20)',  grad: 'from-[#005BFF] to-[#7B2CFF]' },
}

/* Página de detalhe de um serviço/solução (rota: /solucoes/[slug]).
   Renderizada em build time via SSG (generateStaticParams).
   Retorna 404 automaticamente se o slug não corresponder a nenhum serviço. */
export default async function SolucaoDetailPage({ params }: Props) {
  // Resolve o slug da URL a partir dos params assíncronos do App Router
  const { slug } = await params
  // Busca o serviço correspondente ao slug; chama notFound() se não existir
  const service = services.find(s => s.slug === slug)
  if (!service) notFound()

  // Resolve o componente de ícone a partir do mapa (Code2 como fallback)
  const Icon   = iconMap[service.icon] ?? Code2
  // Tema de cor do serviço; padrão 'blue' se não definido
  const accent = service.accent ?? 'blue'
  // Objeto com todas as variáveis de cor para o tema escolhido
  const ac     = ACCENT_COLORS[accent]

  return (
    <>
      {/* ── Seção Hero ──
          Fundo escuro com blobs de luz decorativos nas extremidades.
          Exibe ícone, título, descrição, CTA principal e resultado esperado. */}
      <section className="relative overflow-hidden bg-[#0B1020] py-24">
        {/* Blobs decorativos de luz — puramente visuais, ocultos para leitores de tela */}
        <div className="absolute inset-0" aria-hidden="true">
          <div className="absolute left-1/4 top-0 h-96 w-96 rounded-full blur-3xl opacity-20" style={{ background: ac.color }} />
          <div className="absolute right-1/4 bottom-0 h-64 w-64 rounded-full blur-3xl opacity-10" style={{ background: ac.color }} />
        </div>
        <Container>
          {/* Link de navegação de volta para a listagem de soluções */}
          <Link href="/solucoes" className="mb-8 inline-flex items-center gap-1.5 text-xs font-semibold text-white/40 transition-colors hover:text-white/70">
            <ArrowLeft size={13} aria-hidden="true" />
            Todas as soluções
          </Link>
          {/* Layout lado a lado em desktop: texto à esquerda, card de resultado à direita */}
          <div className="flex flex-col items-start gap-8 lg:flex-row lg:items-center lg:gap-16">
            <div className="flex-1">
              {/* Ícone do serviço com fundo e borda na cor de destaque */}
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border" style={{ background: ac.bg, borderColor: ac.border }}>
                <Icon size={28} style={{ color: ac.color }} aria-hidden="true" />
              </div>
              {/* Título principal da solução */}
              <h1 className="mb-4 text-4xl font-bold text-white sm:text-5xl" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                {service.title}
              </h1>
              {/* Descrição curta do serviço */}
              <p className="max-w-xl text-lg leading-relaxed text-white/60">{service.description}</p>
              {/* CTA principal: leva para a página de contato */}
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/contato"
                  className={`inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r ${ac.grad} px-6 py-3 text-sm font-bold text-white shadow-[0_8px_24px_rgba(0,91,255,0.25)] transition-all hover:-translate-y-0.5`}>
                  {service.cta}
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </div>
            </div>
            {/* Card de "Resultado esperado" — exibido apenas quando o serviço define `result` */}
            {service.result && (
              <div className="shrink-0 rounded-3xl border p-6 text-center" style={{ background: ac.bg, borderColor: ac.border }}>
                <Rocket size={24} style={{ color: ac.color }} className="mx-auto mb-2" aria-hidden="true" />
                <p className="text-xs font-semibold uppercase tracking-wider text-white/40">Resultado esperado</p>
                <p className="mt-1 text-xl font-bold text-white">{service.result}</p>
              </div>
            )}
          </div>
        </Container>
      </section>

      {/* ── Seção "O que entregamos" ──
          Grade de entregáveis do serviço com checkmarks na cor de destaque.
          Fundo claro (#F7F8FC) para contraste com o hero escuro. */}
      <section className="py-20 bg-[#F7F8FC]">
        <Container>
          <h2 className="mb-3 text-3xl font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            O que entregamos
          </h2>
          <p className="mb-10 max-w-xl text-[#5D6475]">Cada projeto é único, mas esses são os pilares que sustentam nossa entrega nessa área.</p>
          {/* Grade responsiva: 1 coluna → 2 → 4 colunas conforme largura de tela */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {service.items.map(item => (
              <div key={item} className="flex items-start gap-3 rounded-2xl border border-[#E3E7F0] bg-white p-5">
                {/* Checkmark colorido na cor de destaque do serviço */}
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: ac.bg }}>
                  <Check size={12} style={{ color: ac.color }} strokeWidth={2.5} aria-hidden="true" />
                </span>
                <p className="text-sm font-semibold text-[#0B1020]">{item}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Seção "Como funciona" ──
          Passos do processo de trabalho da LOBBY, compartilhados entre todos os serviços
          (importados de /lib/data via howWeWorkSteps).
          Fundo branco para alternância visual com a seção anterior. */}
      <section className="py-20 bg-white">
        <Container>
          <h2 className="mb-3 text-3xl font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Como funciona
          </h2>
          <p className="mb-10 max-w-xl text-[#5D6475]">Nosso processo garante clareza, qualidade e entregas no prazo.</p>
          {/* Grade de passos: 1 → 2 → 4 colunas; número do passo em gradiente */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {howWeWorkSteps.map(step => (
              <div key={step.number} className="relative rounded-2xl border border-[#E3E7F0] bg-[#F7F8FC] p-6">
                {/* Número do passo com gradiente linear na cor de destaque */}
                <span className="mb-4 flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: `linear-gradient(to right, ${ac.color}, ${ac.color}99)` }}>
                  {step.number}
                </span>
                <h3 className="mb-1 text-sm font-bold text-[#0B1020]">{step.title}</h3>
                <p className="text-xs leading-relaxed text-[#5D6475]">{step.description}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Seção de CTA global ──
          Componente reutilizável de chamada para ação, compartilhado em várias páginas. */}
      <CTASection />
    </>
  )
}
