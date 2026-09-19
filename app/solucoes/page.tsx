'use client'

// Componente Client: usa useState para o diagnóstico interativo
import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Sparkles, Settings2, Database, LayoutDashboard, ShieldAlert, MessageCircle, Check } from 'lucide-react'
import Container from '@/components/layout/Container'
import SolutionsHero from '@/components/sections/SolutionsHero'
import CTASection from '@/components/sections/CTASection'
import ServiceCard from '@/components/cards/ServiceCard'
import { services } from '@/lib/data'

/* Mapeamento de desafios do cliente para soluções recomendadas.
 * Cada item representa um "pain point" (dor) clicável no diagnóstico rápido.
 * recommendation: nome da solução que aparece no bloco de recomendação
 * description: texto explicativo exibido ao selecionar o desafio */
const painPoints = [
  { id: 'manual', label: 'Processos manuais',    icon: Settings2,     recommendation: 'Automação empresarial', description: 'Sua empresa pode ganhar eficiência e reduzir erros automatizando tarefas repetitivas e integrando sistemas.' },
  { id: 'data',   label: 'Dados desorganizados', icon: Database,       recommendation: 'Dados e inteligência',  description: 'Transforme seus dados em dashboards claros e tome decisões estratégicas com base em informações confiáveis.' },
  { id: 'system', label: 'Falta de sistema',     icon: LayoutDashboard,recommendation: 'Software sob medida',  description: 'Desenvolvemos o sistema ideal para o seu negócio, do zero, integrado à sua operação.' },
  { id: 'attack', label: 'Medo de ataques',      icon: ShieldAlert,    recommendation: 'Cibersegurança',        description: 'Protegemos seus dados, sistemas e reputação com auditorias, testes e conformidade com a LGPD.' },
  { id: 'slow',   label: 'Atendimento lento',    icon: MessageCircle,  recommendation: 'Automação empresarial', description: 'Automatize o atendimento e reduza o tempo de resposta com fluxos inteligentes de qualificação e distribuição.' },
]

export default function SolucoesPage() {
  // Conjunto de IDs dos desafios selecionados pelo visitante no diagnóstico
  // Usa Set para permitir múltiplas seleções sem duplicatas
  const [selected, setSelected] = useState<Set<string>>(new Set())

  /* Toggle de seleção de desafio: adiciona se não selecionado, remove se já selecionado.
   * Retorna um novo Set para garantir re-render correto (imutabilidade de estado). */
  const toggleSelected = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Filtra os pain points selecionados para montar o bloco de recomendação
  const selectedItems        = painPoints.filter(p => selected.has(p.id))
  // Deduplica recomendações — ex: "manual" e "slow" ambos recomendam "Automação empresarial"
  const uniqueRecommendations = [...new Set(selectedItems.map(p => p.recommendation))]
  // Flag de controle: só exibe o bloco de recomendação quando há pelo menos 1 selecionado
  const hasRecommendation    = selectedItems.length > 0

  return (
    <>
      {/* Hero da página de soluções — componente separado com conteúdo estático */}
      <SolutionsHero />

      {/* ── CARDS DE SERVIÇOS ────────────────────────────────────── */}
      {/* Grade com os 4 tipos de solução: Software, Automação, Dados, Cibersegurança */}
      <section className="py-20 bg-[#F7F8FC]">
        <Container>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {/* Cada card de serviço entra com animação escalonada (delay por índice) */}
            {services.map((s, i) => (
              <motion.div
                key={s.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} // anima apenas uma vez ao entrar na viewport
                transition={{ delay: i * 0.1 }}
              >
                <ServiceCard {...s} />
              </motion.div>
            ))}
          </div>
        </Container>
      </section>

      {/* ── DIAGNÓSTICO RÁPIDO ─────────────────────────────────────── */}
      {/*
           Background tune:
             gradients:  rgba() third value in bg-[radial-gradient(...)]
             dot grid:   opacity-[X] on the dot div
             blobs:      bg-[COLOR]/[X] + blur-[Xpx]
           Card tune:
             shadow:     shadow-[0_24px_80px_rgba(11,16,32, X)]
             padding:    p-8 md:p-12
      */}
      {/* Seção interativa: visitante seleciona dores e recebe recomendação personalizada */}
      <section className="relative overflow-hidden bg-[#F7F8FC] py-20 lg:py-24">
        {/* Decoração de fundo: gradientes + grid de pontos + blobs desfocados */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,91,255,0.08),transparent_32%),radial-gradient(circle_at_85%_50%,rgba(123,44,255,0.10),transparent_36%),radial-gradient(circle_at_50%_100%,rgba(0,163,255,0.08),transparent_40%)]" />
          <div className="absolute inset-0 opacity-[0.26] bg-[radial-gradient(circle_at_1px_1px,rgba(0,91,255,0.14)_1px,transparent_0)] bg-[size:26px_26px]" />
          <div className="absolute -left-32 top-20 h-80 w-80 rounded-full bg-[#005BFF]/[0.08] blur-3xl" />
          <div className="absolute -right-32 bottom-10 h-96 w-96 rounded-full bg-[#7B2CFF]/[0.09] blur-3xl" />
        </div>

        <Container className="relative z-10">
          {/* Card central do diagnóstico */}
          <div className="mx-auto max-w-5xl rounded-[2rem] border border-[#E3E7F0] bg-white/85 p-8 text-center shadow-[0_24px_80px_rgba(11,16,32,0.08)] backdrop-blur md:p-12">

            {/* Badge identificador da seção */}
            <span className="inline-flex items-center gap-2 rounded-full border border-[#005BFF]/15 bg-[#005BFF]/[0.08] px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-[#005BFF]">
              <Sparkles size={13} aria-hidden="true" />
              Diagnóstico rápido
            </span>

            <h2
              className="mt-4 text-3xl font-bold tracking-tight text-[#0B1020] md:text-4xl"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              Qual solução é ideal para você?
            </h2>

            <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-[#5D6475]">
              Selecione os desafios que mais combinam com sua operação e descubra por onde começar.
            </p>

            {/* Chips de desafio — clicáveis, múltipla seleção permitida */}
            {/* Tune active gradient, hover colors, icon size */}
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {painPoints.map((p) => {
                const Icon = p.icon
                const isActive = selected.has(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={isActive} // acessibilidade: indica estado selecionado/não
                    onClick={() => toggleSelected(p.id)}
                    className={
                      isActive
                        // Chip ativo: gradiente azul/roxo com sombra
                        ? 'inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-transparent bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-5 py-3 text-sm font-bold text-white shadow-[0_8px_24px_rgba(0,91,255,0.22)] transition-all duration-300'
                        // Chip inativo: borda cinza, hover com cor azul
                        : 'group inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-[#E3E7F0] bg-white px-5 py-3 text-sm font-semibold text-[#5D6475] shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#005BFF]/30 hover:bg-[#005BFF]/[0.05] hover:text-[#005BFF]'
                    }
                  >
                    {/* Ativo: mostra check; inativo: mostra ícone do pain point */}
                    {isActive
                      ? <Check size={15} aria-hidden="true" />
                      : <Icon size={15} className="text-[#005BFF]" aria-hidden="true" />
                    }
                    {p.label}
                  </button>
                )
              })}
            </div>

            {/* Bloco de recomendação — anima ao mudar a seleção com AnimatePresence */}
            {/* A key muda quando a seleção muda, forçando re-animação */}
            <AnimatePresence mode="wait">
              <motion.div
                key={hasRecommendation ? uniqueRecommendations.join('+') : 'empty'}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="mt-8"
              >
                {hasRecommendation ? (
                  /* Card de recomendação — exibe quando pelo menos 1 desafio está selecionado */
                  /* Tune border, gradient, icon, colors */
                  <div className="rounded-3xl border border-[#005BFF]/15 bg-gradient-to-br from-[#005BFF]/[0.05] to-[#7B2CFF]/[0.05] p-6 text-left">
                    <div className="flex items-start gap-4">
                      <div
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white"
                        style={{ background: 'linear-gradient(135deg, #005BFF, #7B2CFF)' }}
                        aria-hidden="true"
                      >
                        <Sparkles size={20} />
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#005BFF]">
                          Recomendação
                        </p>
                        {/* Junta múltiplas recomendações com " + " quando há mais de uma */}
                        <h3
                          className="mt-1.5 text-lg font-bold text-[#0B1020]"
                          style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                        >
                          {uniqueRecommendations.join(' + ')}
                        </h3>
                        {/* Exibe a descrição do primeiro desafio selecionado */}
                        <p className="mt-2 text-sm leading-relaxed text-[#5D6475]">
                          {selectedItems[0].description}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Estado vazio: nenhum desafio selecionado ainda */
                  <div className="rounded-3xl border border-[#E3E7F0] bg-[#F7F8FC]/70 p-5">
                    <p className="text-sm text-[#5D6475]">
                      Selecione um ou mais desafios acima para receber uma recomendação personalizada.
                    </p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {/* CTA: direciona para /contato após o visitante ver a recomendação */}
            {/* Tune gradient, shadow, hover shadow */}
            <Link
              href="/contato"
              className="group mt-8 inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-7 py-4 text-sm font-bold text-white shadow-[0_18px_40px_rgba(0,91,255,0.22)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(123,44,255,0.28)]"
            >
              Receber diagnóstico gratuito
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </Link>
          </div>
        </Container>
      </section>

      {/* ── SEÇÃO CTA FINAL ──────────────────────────────────────── */}
      {/* Banner de chamada para ação exibido no rodapé da página */}
      <CTASection
        title="Pronto para transformar sua operação?"
        description="Receba um diagnóstico rápido e descubra onde software, dados, automação e segurança podem gerar mais resultado."
        buttonLabel="Falar com especialista"
        buttonHref="/contato"
        benefits={['Diagnóstico gratuito', 'Plano de ação inicial', 'Solução sob medida']}
      />
    </>
  )
}
