'use client'
import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, Code2, BarChart3, Zap, Globe, Lock, Database } from 'lucide-react'
import Container from '@/components/layout/Container'
import HeroBackground from './HeroBackground'

/* Ícones flutuantes dispostos em formato hexagonal ao redor do logo central.
   Cada item define: ícone, rótulo exibido abaixo, posição X/Y em % dentro do
   container circular, e delay da animação de entrada (spring). */
const floatingIcons = [
  { icon: Code2,     label: 'Software',   x: '50%', y: '7%',  delay: 0    },
  { icon: BarChart3, label: 'Dashboards', x: '87%', y: '23%', delay: 0.15 },
  { icon: Database,  label: 'Dados',      x: '87%', y: '77%', delay: 0.3  },
  { icon: Globe,     label: 'APIs',       x: '50%', y: '93%', delay: 0.45 },
  { icon: Zap,       label: 'Automação',  x: '13%', y: '77%', delay: 0.6  },
  { icon: Lock,      label: 'Segurança',  x: '13%', y: '23%', delay: 0.75 },
]

/* Métricas exibidas na faixa inferior da seção hero.
   value: número/porcentagem em destaque | label: descrição da métrica. */
const metrics = [
  { value: '+120', label: 'Projetos entregues' },
  { value: '+80',  label: 'Empresas atendidas' },
  { value: '+98%', label: 'Satisfação dos clientes' },
  { value: '-35%', label: 'Tempo médio de execução' },
]

/* Seção hero principal da home pública.
   Layout em duas colunas (texto + ilustração visual animada) com faixa de
   métricas ao final. Usa Framer Motion para as animações de entrada. */
export default function HomeHero() {
  return (
    // Seção de tela cheia com fundo claro e espaçamento responsivo
    <section className="relative min-h-[calc(100vh-64px)] flex items-center overflow-hidden bg-[#F7F8FC] pt-16 lg:pt-20">
      {/* Fundo decorativo (gradientes, grid de pontos, blobs) */}
      <HeroBackground />

      <Container className="relative z-10">
        {/* Grid principal: 1 coluna em mobile, 2 colunas em desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 xl:gap-16 2xl:gap-24 items-center py-8 md:py-10 lg:py-12">

          {/* ── Coluna esquerda: bloco de texto ───────────────────────────
               Animação: desliza de baixo para cima com fade (y: 32 → 0). */}
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            {/* Supertítulo em caixa alta — aparece com pequeno delay */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-xs font-bold tracking-widest uppercase mb-4"
              style={{ color: '#005BFF', letterSpacing: '0.18em' }}
            >
              Tecnologia que gera resultados
            </motion.p>

            {/* H1 principal com palavra "estratégica" em gradiente azul/roxo */}
            <h1
              className="text-4xl sm:text-5xl xl:text-[60px] 2xl:text-[68px] font-bold leading-[1.05] text-[#0B1020] mb-5"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              Tecnologia{' '}
              <span
                style={{
                  background: 'linear-gradient(135deg, #005BFF, #7B2CFF)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                estratégica
              </span>{' '}
              para empresas que querem crescer com inteligência.
            </h1>

            {/* Subtítulo descritivo — cor cinza suave */}
            <p className="text-base md:text-lg text-[#5D6475] leading-relaxed mb-7 max-w-xl">
              A LOBBY combina software sob medida, automação, análise de dados e
              cibersegurança para impulsionar eficiência, reduzir riscos e acelerar
              o crescimento do seu negócio.
            </p>

            {/* CTAs: primário (gradient) + secundário (borda) */}
            <div className="flex flex-col sm:flex-row gap-3 mb-7">
              <Link
                href="/contato"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 lobby-gradient text-white font-semibold rounded-xl hover:opacity-90 transition-opacity text-sm shadow-lg shadow-[#005BFF]/15"
              >
                Solicitar diagnóstico gratuito
                <ArrowRight size={15} />
              </Link>
              <Link
                href="/solucoes"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 border border-[#E3E7F0] text-[#0B1020] font-semibold rounded-xl hover:border-[#005BFF]/30 hover:bg-[#F7F8FC] transition-all text-sm"
              >
                Conhecer soluções
              </Link>
            </div>

            {/* Tags de área de atuação — pílulas com borda fina */}
            <div className="flex flex-wrap gap-2">
              {['Software', 'Automação', 'Dados', 'Cibersegurança'].map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-3 py-1.5 rounded-full border border-[#E3E7F0] bg-white/70 text-xs font-medium text-[#5D6475]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </motion.div>

          {/* ── Coluna direita: ilustração visual animada ─────────────────
               Animação de entrada: escala de 0.95 → 1 com fade. */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2, ease: 'easeOut' }}
            className="relative flex items-center justify-center lg:justify-end"
          >
            {/* Container quadrado responsivo para o visual orbital */}
            <div className="relative w-[300px] h-[300px] sm:w-[370px] sm:h-[370px] lg:w-[450px] lg:h-[450px] xl:w-[510px] xl:h-[510px]">

              {/* Anel externo tracejado girando lentamente (22s de rotação) */}
              <div
                className="absolute inset-0 rounded-full border-2 border-dashed opacity-20 animate-spin"
                style={{ borderColor: '#005BFF', animationDuration: '22s' }}
              />

              {/* Anel intermediário estático */}
              <div className="absolute inset-[13%] rounded-full border border-[#E3E7F0]" />

              {/* Brilho interno central com gradiente azul/roxo */}
              <div
                className="absolute inset-[32%] rounded-full opacity-[0.07]"
                style={{ background: 'linear-gradient(135deg, #005BFF, #7B2CFF)' }}
              />

              {/* Logo central dentro de card branco arredondado */}
              <div className="absolute inset-0 flex items-center justify-center">
                <Link href="/" className="inline-flex items-center justify-center">
                  <div className="w-[136px] h-[136px] sm:w-[156px] sm:h-[156px] lg:w-[180px] lg:h-[180px] xl:w-[200px] xl:h-[200px] rounded-3xl overflow-hidden flex items-center justify-center bg-white shadow-xl shadow-[#005BFF]/10 border border-[#E3E7F0]">
                    <Image
                      src="/logorgb.png"
                      alt="Logo Lobby Rgb"
                      width={400}
                      height={400}
                      className="w-full h-full object-contain p-3"
                      priority
                      quality={100}
                    />
                  </div>
                </Link>
              </div>

              {/* Cards de ícone flutuantes em layout hexagonal.
                  Cada card entra com animação spring (escala 0 → 1) com delay escalonado. */}
              {floatingIcons.map(({ icon: Icon, label, x, y, delay }, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5 + delay, type: 'spring', stiffness: 180, damping: 14 }}
                  className="absolute flex flex-col items-center gap-1"
                  style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
                >
                  {/* Card quadrado com ícone azul */}
                  <div className="w-11 h-11 sm:w-12 sm:h-12 xl:w-14 xl:h-14 rounded-2xl bg-white border border-[#E3E7F0] shadow-lg flex items-center justify-center">
                    <Icon size={19} style={{ color: '#005BFF' }} />
                  </div>
                  {/* Rótulo visível apenas em sm+ */}
                  <span className="hidden sm:block text-[9px] font-semibold text-[#5D6475] whitespace-nowrap leading-none">
                    {label}
                  </span>
                </motion.div>
              ))}

              {/* Card de dado flutuante — esquerda inferior (projetos entregues)
                  Animação: desliza da esquerda com delay de 0.9s. */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.9 }}
                className="absolute -left-2 sm:-left-5 lg:-left-8 xl:-left-10 bottom-[16%] bg-white rounded-2xl border border-[#E3E7F0] shadow-xl px-4 py-3 min-w-[132px]"
              >
                <p className="text-xs text-[#5D6475] mb-0.5">Projetos entregues</p>
                <p className="text-2xl font-bold text-[#005BFF]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  +120
                </p>
              </motion.div>

              {/* Card de dado flutuante — direita superior (satisfação)
                  Animação: desliza da direita com delay de 1.1s. */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.1 }}
                className="absolute -right-2 sm:-right-5 lg:-right-8 xl:-right-10 top-[16%] bg-white rounded-2xl border border-[#E3E7F0] shadow-xl px-4 py-3 min-w-[120px]"
              >
                <p className="text-xs text-[#5D6475] mb-0.5">Satisfação</p>
                <p className="text-2xl font-bold text-[#7B2CFF]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  +98%
                </p>
              </motion.div>
            </div>
          </motion.div>
        </div>

        {/* ── Faixa inferior de métricas ─────────────────────────────────
             Animação: desliza de baixo com delay de 0.75s.
             Grid de 2 colunas em mobile, 4 em sm+. */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.75, duration: 0.5 }}
          className="border-t border-[#E3E7F0] py-7 pb-10 lg:pb-8"
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8">
            {metrics.map(({ value, label }, i) => (
              // Cada métrica entra com delay escalonado de 0.07s por item
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.85 + i * 0.07 }}
                className="flex flex-col"
              >
                {/* Valor numérico em gradiente azul/roxo */}
                <span
                  className="text-2xl sm:text-3xl font-bold mb-0.5"
                  style={{
                    fontFamily: 'Space Grotesk, sans-serif',
                    background: 'linear-gradient(135deg, #005BFF, #7B2CFF)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  {value}
                </span>
                {/* Rótulo descritivo da métrica */}
                <span className="text-xs text-[#5D6475] leading-snug">{label}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </Container>
    </section>
  )
}
