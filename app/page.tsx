/* Página inicial do site (rota: /)
 *
 * Server Component estático — sem busca de dados ao banco.
 * Todos os dados (serviços, projetos, métricas, passos) vêm de /lib/data.ts.
 *
 * Estrutura de seções na ordem de renderização:
 *  1. HomeHero              — hero principal com headline e visual animado
 *  2. Pillar strip          — 4 pilares da LOBBY (Software, Automação, Dados, Ciberseg.)
 *  3. Serviços + Benefícios — grade de soluções + cards de benefícios
 *  4. HowWeWorkSection      — processo de trabalho em passos
 *  5. HomeProjects          — 3 projetos em destaque do portfólio
 *  6. Métricas              — números de impacto (StatCard por coluna)
 *  7. CTASection            — banner final de chamada para ação
 */
import type { Metadata } from 'next'
import { Code2, Settings2, BarChart3, Shield, Zap, FileX, TrendingUp, Lock } from 'lucide-react'
import Container from '@/components/layout/Container'
import SectionTitle from '@/components/sections/SectionTitle'
import CTASection from '@/components/sections/CTASection'
import StatCard from '@/components/cards/StatCard'
import ServicesGrid from '@/components/sections/ServicesGrid'
import HowWeWorkSection from '@/components/sections/HowWeWorkSection'
import { services, howWeWorkSteps, projects, metrics } from '@/lib/data'
import HomeHero from '@/components/sections/HomeHero'
import HomeProjects from '@/components/sections/HomeProjects'
import BaseCard from '@/components/ui/base-card'
import { colors, borderRadius } from '@/lib/design-tokens'

export const metadata: Metadata = {
  title: 'Home | LOBBY — Software, Automação, Dados e Cibersegurança',
  description:
    'A LOBBY combina software sob medida, automação, análise de dados e cibersegurança para impulsionar a eficiência, reduzir riscos e acelerar o crescimento do seu negócio.',
}

/* Os 4 pilares de atuação da LOBBY exibidos no strip abaixo do hero.
   Cada item mostra ícone + rótulo + descrição curta em card horizontal. */
const pillars = [
  { icon: Code2, label: 'Software', description: 'Soluções personalizadas' },
  { icon: Settings2, label: 'Automação', description: 'Processos mais eficientes' },
  { icon: BarChart3, label: 'Dados', description: 'Decisões inteligentes' },
  { icon: Shield, label: 'Cibersegurança', description: 'Negócios protegidos' },
]

/* Benefícios exibidos no card de benefícios abaixo da grade de serviços.
   Reforçam o valor da parceria com a LOBBY de forma direta. */
const benefits = [
  { icon: Zap, title: 'Mais eficiência', description: 'Processos otimizados' },
  { icon: FileX, title: 'Menos processos manuais', description: 'Automação inteligente' },
  { icon: TrendingUp, title: 'Decisões melhores', description: 'Dados que direcionam' },
  { icon: Lock, title: 'Segurança total', description: 'Proteção de ponta a ponta' },
]

export default function HomePage() {
  return (
    <>
      <HomeHero />

      {/* ── Pillar strip ──────────────────────────────────────────── */}
      <section className="py-8" style={{ backgroundColor: colors.backgroundAlt }}>
        <Container>
          <div className="overflow-hidden rounded-3xl border" style={{ borderColor: colors.border, backgroundColor: 'white' }}>
            <div className="grid grid-cols-2 md:grid-cols-4">
              {pillars.map(({ icon: Icon, label, description }, i) => (
                <BaseCard
                  key={label}
                  variant="pillar"
                  icon={<Icon size={20} />}
                  label={label}
                  description={description}
                  className={i < pillars.length - 1 ? `border-r border-[${colors.border}]` : ''}
                />
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* ── O que fazemos + Benefits ───────────────────────────────── */}
      <section className="relative overflow-hidden py-20 lg:py-24" style={{ backgroundColor: colors.backgroundAlt }}>
        {/* Radial gradient zones */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(0,91,255,0.08),transparent_30%),radial-gradient(circle_at_85%_30%,rgba(123,44,255,0.10),transparent_35%),radial-gradient(circle_at_50%_100%,rgba(0,163,255,0.08),transparent_40%)]" />
        {/* Dot grid */}
        <div className="absolute inset-0 opacity-[0.30] bg-[radial-gradient(circle_at_1px_1px,rgba(0,91,255,0.16)_1px,transparent_0)] bg-[size:26px_26px]" />
        {/* Blur blobs */}
        <div className="absolute -left-32 top-20 h-72 w-72 rounded-full bg-[#005BFF]/[0.08] blur-3xl" aria-hidden="true" />
        <div className="absolute -right-32 bottom-10 h-96 w-96 rounded-full bg-[#7B2CFF]/[0.09] blur-3xl" aria-hidden="true" />

        <Container className="relative z-10">
          <SectionTitle
            eyebrow="Soluções que geram impacto"
            title="O que fazemos"
            subtitle="Combinamos software, automação, dados e segurança para transformar sua operação."
            accentLine
          />

          <ServicesGrid services={services} />

          {/* Benefits card — using BaseCard for consistency */}
          <div className="mt-12 overflow-hidden rounded-3xl border" style={{ borderColor: colors.border, backgroundColor: 'white' }}>
            <div className="grid grid-cols-2 md:grid-cols-4">
              {benefits.map(({ icon: Icon, title, description }, i) => (
                <BaseCard
                  key={title}
                  variant="benefit"
                  icon={<Icon size={20} />}
                  title={title}
                  description={description}
                  className={i < benefits.length - 1 ? `border-r border-[${colors.border}]` : ''}
                />
              ))}
            </div>
          </div>
        </Container>
      </section>

      <HowWeWorkSection steps={howWeWorkSteps} />

      {/* Projetos em destaque */}
      <HomeProjects projects={projects.slice(0, 3)} />

      {/* Métricas */}
      <section className="py-14 bg-white border-y border-[#E3E7F0]">
        <Container>
          <div className="grid grid-cols-2 md:grid-cols-4">
            {metrics.map((m, i) => (
              <div
                key={m.label}
                className={i < metrics.length - 1 ? 'border-r border-[#E3E7F0]' : ''}
              >
                <StatCard metric={m} index={i} />
              </div>
            ))}
          </div>
        </Container>
      </section>

      <CTASection />
    </>
  )
}
