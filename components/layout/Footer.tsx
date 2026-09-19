'use client'

import Link from 'next/link'
import Image from 'next/image'
// usePathname: detecta rota atual para não renderizar o rodapé em /dashboard e /admin
import { usePathname } from 'next/navigation'
import { Mail, Phone, MapPin } from 'lucide-react'
import Container from './Container'

/* ── Links organizados por coluna do rodapé ──────────────────────────────── */
// Cada grupo corresponde a uma coluna da grade do rodapé
const footerLinks = {
  // Coluna "Soluções": links ancorados nas seções da página /solucoes
  solucoes: [
    { label: 'Software sob medida', href: '/solucoes#software' },
    { label: 'Automação de processos', href: '/solucoes#automacao' },
    { label: 'Análise de dados', href: '/solucoes#dados' },
    { label: 'Cibersegurança', href: '/solucoes#ciberseguranca' },
  ],
  // Coluna "Recursos": blog, guias, webinars e cases
  recursos: [
    { label: 'Blog', href: '/recursos' },
    { label: 'Guias e materiais', href: '/recursos' },
    { label: 'Webinars', href: '/recursos' },
    { label: 'Cases', href: '/projetos' },
  ],
  // Coluna "Empresa": sobre, carreiras, parcerias e contato
  empresa: [
    { label: 'Sobre a LOBBY', href: '/sobre' },
    { label: 'Carreiras', href: '/sobre' },
    { label: 'Parcerias', href: '/contato' },
    { label: 'Contato', href: '/contato' },
  ],
}

export default function Footer() {
  const pathname = usePathname()

  /* ── Não renderiza o rodapé nas áreas autenticadas ───────────────────────
     Dashboard e Admin têm seus próprios rodapés internos nos shells         */
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/admin')) return null

  return (
  <footer className="relative overflow-hidden border-t border-[#E3E7F0] bg-[#F7F8FC]">
    {/* Linha decorativa com gradiente azul→roxo no topo do rodapé */}
    <div
      className="absolute inset-x-0 top-0 h-px opacity-[0.55]"
      style={{ background: 'linear-gradient(to right, transparent, #005BFF, #7B2CFF, transparent)' }}
      aria-hidden="true"
    />
    {/* Blobs de fundo com blur: elementos decorativos sutis nos cantos */}
    <div className="absolute -left-32 bottom-0 h-72 w-72 rounded-full bg-[#005BFF]/[0.04] blur-3xl" aria-hidden="true" />
    <div className="absolute -right-32 top-0 h-72 w-72 rounded-full bg-[#7B2CFF]/[0.04] blur-3xl" aria-hidden="true" />

    {/* Conteúdo do rodapé — relative z-10 para ficar acima dos blobs */}
    <Container className="relative z-10">
      {/* Grade responsiva: 1 coluna mobile → 2 colunas sm → 6 colunas lg */}
      <div className="py-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-7 lg:gap-8">

        {/* ── Coluna da marca (ocupa 2 colunas em lg) ──────────────────── */}
        <div className="sm:col-span-2 lg:col-span-2">
          {/* Logo com link para a home */}
          <Link href="/" className="inline-flex items-center group mb-3 -ml-5">
            <div className="w-[132px] h-[52px] rounded-lg overflow-hidden flex items-center justify-center">
              <Image
                src="/logowhite.svg"
                alt="Logo Lobby"
                width={264}
                height={104}
                className="w-full h-full object-contain"
                priority
                quality={100}
              />
            </div>
          </Link>

          {/* Tagline da empresa */}
          <p className="text-sm text-[#5D6475] max-w-[280px] leading-relaxed mb-4">
            Tecnologia estratégica para acelerar negócios com software,
            automação, dados e cibersegurança.
          </p>

          {/* Ícones de redes sociais — SVGs inline para evitar dependência externa */}
          <div className="flex items-center gap-2.5">
            {[
              {
                label: 'LinkedIn',
                href: '#',
                // SVG do logo do LinkedIn
                svg: <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />,
              },
              {
                label: 'Instagram',
                href: '#',
                // SVG do logo do Instagram
                svg: <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />,
              },
              {
                label: 'YouTube',
                href: '#',
                // SVG do logo do YouTube
                svg: <path d="M23.495 6.205a3.007 3.007 0 00-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 00.527 6.205a31.247 31.247 0 00-.522 5.805 31.247 31.247 0 00.522 5.783 3.007 3.007 0 002.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 002.088-2.088 31.247 31.247 0 00.5-5.783 31.247 31.247 0 00-.5-5.805zM9.609 15.601V8.408l6.264 3.602z" />,
              },
            ].map(({ label, href, svg }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                // Ao hover: fundo azul e ícone branco
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E3E7F0] bg-white text-[#5D6475] shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#005BFF] hover:bg-[#005BFF] hover:text-white"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  {svg}
                </svg>
              </a>
            ))}
          </div>
        </div>

        {/* ── Colunas de links (Soluções, Recursos, Empresa) ───────────────
            Iteração sobre os grupos para evitar repetição de markup         */}
        {[
          { title: 'Soluções', links: footerLinks.solucoes },
          { title: 'Recursos', links: footerLinks.recursos },
          { title: 'Empresa', links: footerLinks.empresa },
        ].map(({ title, links }) => (
          <div key={title}>
            <h4
              className="text-sm font-semibold text-[#0B1020] mb-3"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              {title}
            </h4>

            {/* Lista de links da coluna */}
            <ul className="space-y-2">
              {links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-[#5D6475] hover:text-[#005BFF] transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {/* ── Coluna de contato: e-mail, telefone e localização ─────────── */}
        <div>
          <h4
            className="text-sm font-semibold text-[#0B1020] mb-3"
            style={{ fontFamily: 'Space Grotesk, sans-serif' }}
          >
            Fale conosco
          </h4>

          <ul className="space-y-2.5">
            {/* E-mail de contato */}
            <li className="flex items-center gap-2 text-sm text-[#5D6475]">
              <Mail size={14} className="text-[#005BFF] shrink-0" />
              <span className="truncate">contato@lobby.com</span>
            </li>

            {/* Telefone */}
            <li className="flex items-center gap-2 text-sm text-[#5D6475]">
              <Phone size={14} className="text-[#005BFF] shrink-0" />
              <span>(11) 99999-9999</span>
            </li>

            {/* Localização */}
            <li className="flex items-start gap-2 text-sm text-[#5D6475]">
              <MapPin size={14} className="text-[#005BFF] shrink-0 mt-0.5" />
              <span>São Paulo, SP</span>
            </li>
          </ul>
        </div>
      </div>

      {/* ── Barra inferior: copyright + links legais ──────────────────────── */}
      <div className="py-4 border-t border-[#E3E7F0] flex flex-col sm:flex-row justify-between items-center gap-2">
        <p className="text-xs text-[#5D6475]">
          © 2024 LOBBY. Todos os direitos reservados.
        </p>

        {/* Links de política de privacidade e termos de uso */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <Link
            href="/sobre#privacidade"
            className="text-xs text-[#5D6475] hover:text-[#005BFF] transition-colors"
          >
            Política de Privacidade
          </Link>

          <Link
            href="/sobre#termos"
            className="text-xs text-[#5D6475] hover:text-[#005BFF] transition-colors"
          >
            Termos de Uso
          </Link>
        </div>
      </div>
    </Container>
  </footer>
 )
}
