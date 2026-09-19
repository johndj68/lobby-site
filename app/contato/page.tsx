/* Página de contato (rota: /contato)
 *
 * Server Component estático — sem busca de dados no servidor.
 * ContactForm (Client Component) é envolvido em Suspense para
 * habilitar streaming e leitura de searchParams no cliente.
 *
 * Estrutura visual:
 *  - Hero com headline e badge
 *  - Card principal de duas colunas:
 *      Esquerda: info de contato (e-mail, telefone, localização) + diagnóstico + redes sociais
 *      Direita:  formulário de contato (ContactForm)
 *  - Seção "O que acontece depois?" com 3 passos numerados e linha conectora
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import {
  Mail, Phone, MapPin, MessageCircle,
  BarChart3, Check, ArrowRight,
} from 'lucide-react'
import Container from '@/components/layout/Container'
import ContactForm from '@/components/forms/ContactForm'

export const metadata: Metadata = {
  title: 'Contato | LOBBY',
  description: 'Fale com a LOBBY e descubra como transformar tecnologia em resultado para sua empresa.',
}

/* Canais de contato exibidos na coluna esquerda do card principal.
   href=null indica item sem link (ex: localização). */
const contactInfo = [
  { icon: Mail,       label: 'E-mail',              value: 'contato@lobbytech.com', href: 'mailto:contato@lobbytech.com'     },
  { icon: Phone,      label: 'Telefone / WhatsApp',  value: '(11) 99999-9999',       href: 'https://wa.me/5511999999999'     },
  { icon: MapPin,     label: 'Localização',           value: 'São Paulo, SP — Brasil', href: null                              },
]

const diagnosticBenefits = [
  'Sem compromisso',
  'Resposta em até 24h',
  'Plano inicial personalizado',
]

const socialLinks = [
  {
    label: 'LinkedIn',
    href: '#',
    path: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
    hoverColor: 'hover:bg-[#0077B5] hover:text-white hover:border-[#0077B5]',
  },
  {
    label: 'Instagram',
    href: '#',
    path: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z',
    hoverColor: 'hover:bg-gradient-to-br hover:from-[#F77737] hover:to-[#E1306C] hover:text-white hover:border-transparent',
  },
]

const nextSteps = [
  {
    n: 1,
    title: 'Analisamos sua mensagem',
    desc: 'Nosso time avalia seu cenário e entende os desafios do seu negócio com atenção.',
  },
  {
    n: 2,
    title: 'Entramos em contato',
    desc: 'Faremos contato rápido para alinharmos expectativas e próximos passos.',
  },
  {
    n: 3,
    title: 'Indicamos o melhor caminho',
    desc: 'Você recebe um direcionamento claro com soluções e oportunidades de crescimento.',
  },
]

export default function ContatoPage() {
  return (
    <>
      {/* ── Main section ──────────────────────────────────────────────────
           Background tune:
             Gradients:    rgba() inside bg-[radial-gradient(...)]
             Dot grid:     opacity-[X] on the dot div
             Blobs:        bg-[COLOR]/[X] + blur-[Xpx]
             Orbital rings: border-[COLOR]/[X] + size h/w
      ──────────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#F7F8FC] py-20 lg:py-28">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(0,91,255,0.08),transparent_32%),radial-gradient(circle_at_85%_30%,rgba(123,44,255,0.14),transparent_36%),radial-gradient(circle_at_55%_95%,rgba(0,163,255,0.10),transparent_42%)]" />
          <div className="absolute inset-0 opacity-[0.26] bg-[radial-gradient(circle_at_1px_1px,rgba(0,91,255,0.16)_1px,transparent_0)] bg-[size:28px_28px]" />
          <div className="absolute -left-40 top-20 h-[480px] w-[480px] rounded-full bg-[#00A3FF]/[0.08] blur-3xl" />
          <div className="absolute -right-40 top-10 h-[560px] w-[560px] rounded-full bg-[#7B2CFF]/[0.12] blur-3xl" />
          <div className="absolute right-0 -bottom-40 h-[420px] w-[700px] rounded-full bg-[#005BFF]/[0.07] blur-3xl" />
          <div className="absolute -right-[120px] top-20 hidden h-[520px] w-[520px] rounded-full border border-[#005BFF]/[0.08] lg:block" />
          <div className="absolute -right-[60px] top-32 hidden h-[380px] w-[380px] rounded-full border border-dashed border-[#7B2CFF]/[0.14] lg:block" />
        </div>

        <Container className="relative z-10">

          {/* ── Hero ──────────────────────────────────────────────────── */}
          <div className="mx-auto max-w-4xl text-center">
            {/* Badge — tune: icon, text, colors */}
            <span className="inline-flex items-center gap-2 rounded-full border border-[#005BFF]/15 bg-white/70 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#005BFF] shadow-sm backdrop-blur">
              <MessageCircle size={13} aria-hidden="true" />
              Fale com um especialista
            </span>

            {/* H1 — tune gradient word */}
            <h1
              className="mt-6 text-4xl font-bold leading-tight text-[#0B1020] sm:text-5xl lg:text-[54px]"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              Vamos transformar tecnologia em{' '}
              <span
                style={{
                  background: 'linear-gradient(135deg, #005BFF, #7B2CFF)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                resultado
              </span>{' '}
              para sua empresa.
            </h1>

            <p className="mx-auto mt-5 max-w-3xl text-base leading-relaxed text-[#5D6475] md:text-lg">
              Fale com a LOBBY e descubra como software, automação, dados e cibersegurança
              podem impulsionar o crescimento do seu negócio.
            </p>
          </div>

          {/* ── Main card ─────────────────────────────────────────────────
               Tune: rounded-[2rem] | shadow | grid cols ratio
          ──────────────────────────────────────────────────────────────── */}
          <div className="mt-12 overflow-hidden rounded-[2rem] border border-[#E3E7F0] bg-white/90 shadow-[0_30px_100px_rgba(11,16,32,0.10)] backdrop-blur">
            <div className="grid grid-cols-1 lg:grid-cols-[0.85fr_1.4fr]">

              {/* ── Left column — info ───────────────────────────── */}
              <aside className="border-b border-[#E3E7F0] bg-gradient-to-br from-white via-white to-[#F7F8FC] p-7 lg:border-b-0 lg:border-r lg:p-9">

                {/* Column title */}
                <h2
                  className="text-2xl font-bold text-[#0B1020]"
                  style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                >
                  Fale com a{' '}
                  <span
                    style={{
                      background: 'linear-gradient(135deg, #005BFF, #7B2CFF)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}
                  >
                    LOBBY
                  </span>
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[#5D6475]">
                  Escolha o canal mais conveniente e nossa equipe responde rapidamente.
                </p>

                {/* Contact mini cards — tune: gradient, hover shadow */}
                <div className="mt-6 space-y-3">
                  {contactInfo.map(({ icon: Icon, label, value, href }) => (
                    <div
                      key={label}
                      className="group flex items-center gap-4 rounded-2xl border border-[#E3E7F0] bg-white/85 p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#005BFF]/25 hover:shadow-md"
                    >
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-[0_8px_20px_rgba(0,91,255,0.20)]"
                        style={{ background: 'linear-gradient(135deg, #005BFF, #7B2CFF)' }}
                        aria-hidden="true"
                      >
                        <Icon size={18} />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-[#5D6475]">{label}</p>
                        {href ? (
                          <a
                            href={href}
                            target={href.startsWith('http') ? '_blank' : undefined}
                            rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
                            className="mt-0.5 block text-sm font-bold text-[#0B1020] transition-colors hover:text-[#005BFF]"
                            style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                          >
                            {value}
                          </a>
                        ) : (
                          <p className="mt-0.5 text-sm font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{value}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Diagnostic card — tune: gradient opacity, benefits */}
                <div className="mt-6 rounded-3xl border border-[#005BFF]/15 p-5" style={{ background: 'linear-gradient(135deg, rgba(0,91,255,0.05), rgba(123,44,255,0.05))' }}>
                  <div className="flex items-start gap-4">
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-[0_8px_20px_rgba(0,91,255,0.20)]"
                      style={{ background: 'linear-gradient(135deg, #005BFF, #7B2CFF)' }}
                      aria-hidden="true"
                    >
                      <BarChart3 size={18} />
                    </div>
                    <div>
                      <h3
                        className="text-sm font-bold text-[#005BFF]"
                        style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                      >
                        Diagnóstico gratuito
                      </h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-[#5D6475]">
                        Receba uma análise inicial da sua operação e descubra onde podemos gerar mais eficiência e resultado.
                      </p>
                      <ul className="mt-3 space-y-1.5">
                        {diagnosticBenefits.map(b => (
                          <li key={b} className="flex items-center gap-2 text-xs text-[#5D6475]">
                            <span
                              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                              style={{ background: 'rgba(0,91,255,0.10)' }}
                              aria-hidden="true"
                            >
                              <Check size={10} style={{ color: '#005BFF' }} strokeWidth={2.5} />
                            </span>
                            {b}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Social links */}
                <div className="mt-6">
                  <p className="mb-3 text-xs font-semibold text-[#5D6475]">Acompanhe a LOBBY</p>
                  <div className="flex gap-2.5">
                    {socialLinks.map(({ label, href, path, hoverColor }) => (
                      <a
                        key={label}
                        href={href}
                        aria-label={label}
                        className={`flex h-10 w-10 items-center justify-center rounded-xl border border-[#E3E7F0] bg-white text-[#5D6475] shadow-sm transition-all duration-300 hover:-translate-y-0.5 ${hoverColor}`}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d={path} />
                        </svg>
                      </a>
                    ))}
                  </div>
                </div>

                {/* WhatsApp CTA */}
                <Link
                  href="https://wa.me/5511999999999"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group mt-5 flex items-center justify-between gap-4 rounded-2xl border border-[#E3E7F0] bg-white/85 p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#25D366]/30 hover:shadow-md"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white"
                      style={{ background: '#25D366' }}
                      aria-hidden="true"
                    >
                      <MessageCircle size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                        Prefere falar agora?
                      </p>
                      <p className="text-xs text-[#5D6475]">Chame no WhatsApp</p>
                    </div>
                  </div>
                  <ArrowRight
                    size={16}
                    className="shrink-0 text-[#5D6475] transition-transform group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </Link>
              </aside>

              {/* ── Right column — form ──────────────────────────── */}
              <div className="p-7 lg:p-10">
                <h2
                  className="mb-1 text-xl font-bold text-[#0B1020]"
                  style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                >
                  Envie sua mensagem
                </h2>
                <p className="mb-7 text-sm text-[#5D6475]">
                  Preencha os dados abaixo e nossa equipe entrará em contato.
                </p>
                <Suspense fallback={null}>
                  <ContactForm />
                </Suspense>
              </div>
            </div>
          </div>

          {/* ── O que acontece depois? ────────────────────────────────────
               Tune: step card shadow | number circle | gradient accent
          ──────────────────────────────────────────────────────────────── */}
          <div className="mt-16">
            <h2
              className="text-center text-2xl font-bold text-[#0B1020] md:text-3xl"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              O que acontece depois?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-sm leading-relaxed text-[#5D6475]">
              Processo claro e rápido do primeiro contato ao plano de ação.
            </p>

            <div className="relative mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
              {/* Connector line — desktop only */}
              <div
                className="absolute left-[16.5%] right-[16.5%] top-[2.25rem] hidden h-px md:block"
                style={{ background: 'linear-gradient(to right, transparent, rgba(0,91,255,0.35), rgba(123,44,255,0.45), rgba(0,91,255,0.35), transparent)' }}
                aria-hidden="true"
              />

              {nextSteps.map(({ n, title, desc }) => (
                <div
                  key={n}
                  className="group flex flex-col items-center rounded-3xl border border-[#E3E7F0] bg-white/90 p-6 text-center shadow-[0_8px_40px_rgba(11,16,32,0.06)] transition-all duration-300 hover:-translate-y-1 hover:border-[#005BFF]/20 hover:shadow-[0_16px_60px_rgba(0,91,255,0.10)]"
                >
                  {/* Number circle */}
                  <div
                    className="relative z-10 flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-white shadow-lg transition-transform duration-300 group-hover:scale-105"
                    style={{ background: 'linear-gradient(135deg, #005BFF, #7B2CFF)' }}
                  >
                    {n}
                  </div>
                  <h3
                    className="mt-4 text-base font-bold text-[#0B1020]"
                    style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                  >
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#5D6475]">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>
    </>
  )
}
