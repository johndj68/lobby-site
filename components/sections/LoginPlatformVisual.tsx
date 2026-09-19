'use client'

/**
 * LoginPlatformVisual
 *
 * Mini ecossistema da plataforma LOBBY para a coluna esquerda da tela de login.
 * Visível apenas em lg+ (hidden lg:block no container pai em AuthLayout).
 *
 * Estrutura de camadas (z-index):
 *   z-0  — glows de fundo
 *   z-10 — órbitas (SVG) + linhas de conexão + pontos luminosos
 *   z-20 — card central LOBBY
 *   z-30 — floating cards (Projetos, Materiais, Suporte, Segurança)
 *
 * Onde ajustar:
 *   Tamanho do container: h-[280px] na div mais externa
 *   Intensidade do glow:  bg-[#005BFF]/[X] blur-3xl nos dois divs de glow
 *   Órbitas:              rx/ry nos <ellipse> do SVG
 *   Linhas de conexão:    paths do SVG + stopOpacity no gradient
 *   Card central:         h/w + shadow-[...rgba(...)] + animationDuration
 *   Float speed:          lobby-float_Xs nos FloatingCards (globals.css define frames)
 *   Float distance:       translate3d(0, -Xpx, 0) em globals.css @keyframes lobby-float
 *   Pontos luminosos:     shadow-[0_0_Xpx_rgba(...)] + lobby-pulse_Xs
 */

import Image from 'next/image'
import { FolderKanban, FileText, Headphones, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── FloatingCard ───────────────────────────────────────────────── */

interface FloatingCardProps {
  icon: React.ElementType
  title: string
  description: string
  /** Tailwind absolute position classes, e.g. "left-4 top-6" */
  position: string
  /** CSS animationDelay for staggered lobby-float */
  delay?: string
}

function FloatingCard({ icon: Icon, title, description, position, delay = '0s' }: FloatingCardProps) {
  return (
    <div
      className={cn(
        /* Layout */
        'absolute z-30 flex items-center gap-3 rounded-2xl',
        /* Visual */
        'border border-[#E3E7F0] bg-white/90 px-4 py-3',
        'shadow-[0_14px_40px_rgba(11,16,32,0.10)] backdrop-blur',
        /* Hover — border + shadow only (no translate: float anim owns Y) */
        'transition-shadow duration-300 hover:border-[#005BFF]/30',
        'hover:shadow-[0_18px_50px_rgba(0,91,255,0.16)]',
        /* Float animation — respects prefers-reduced-motion */
        'motion-safe:animate-[lobby-float_7s_ease-in-out_infinite]',
        position
      )}
      style={{ animationDelay: delay }}
    >
      {/* Icon badge */}
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{ background: 'linear-gradient(135deg, rgba(0,91,255,0.10), rgba(123,44,255,0.10))' }}
        aria-hidden="true"
      >
        <Icon size={18} style={{ color: '#005BFF' }} />
      </div>

      {/* Text */}
      <div>
        <p
          className="text-xs font-bold text-[#0B1020]"
          style={{ fontFamily: 'Space Grotesk, sans-serif' }}
        >
          {title}
        </p>
        <p className="mt-0.5 text-[11px] leading-tight text-[#5D6475]">{description}</p>
      </div>
    </div>
  )
}

/* ── Main component ─────────────────────────────────────────────── */

export default function LoginPlatformVisual() {
  return (
    <div className="relative h-[280px] overflow-hidden">

      {/* ── Glow backgrounds (z-0) ─────────────────────────────────
           Tune: /[X] opacity + blur-[Xpx] per blob                */}
      <div
        className="absolute left-1/2 top-1/2 h-56 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#005BFF]/[0.16] blur-3xl"
        aria-hidden="true"
      />
      <div
        className="absolute left-1/2 top-1/2 h-40 w-60 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#7B2CFF]/[0.14] blur-2xl"
        aria-hidden="true"
      />

      {/* ── SVG — orbital rings + connection lines (z-10) ───────────
           viewBox matches container proportions (width ≈ 460, h = 280)
           Center point: cx=230 cy=140
           Tune: rx/ry on ellipses | path curves | stopOpacity        */}
      <svg
        className="absolute inset-0 z-10 h-full w-full"
        viewBox="0 0 460 280"
        fill="none"
        aria-hidden="true"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="lgLine" x1="0" y1="0" x2="460" y2="280" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#005BFF" stopOpacity="0.04" />
            <stop offset="50%"  stopColor="#00A3FF" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#7B2CFF" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {/* Outer orbit — solid ellipse */}
        <ellipse cx="230" cy="140" rx="195" ry="108" stroke="#005BFF" strokeOpacity="0.12" strokeWidth="1" />
        {/* Inner orbit — replaced by logohome */}

        {/* Connection lines — card corner → center (tune path curves) */}
        {/* Top-left  → center */}
        <path d="M 88 62  C 155 115 190 128 230 140" stroke="url(#lgLine)" strokeWidth="1" strokeDasharray="4 6" />
        {/* Top-right → center */}
        <path d="M 372 62  C 305 115 270 128 230 140" stroke="url(#lgLine)" strokeWidth="1" strokeDasharray="4 6" />
        {/* Bottom-left  → center */}
        <path d="M 88 218 C 155 165 190 152 230 140" stroke="url(#lgLine)" strokeWidth="1" strokeDasharray="4 6" />
        {/* Bottom-right → center */}
        <path d="M 372 218 C 305 165 270 152 230 140" stroke="url(#lgLine)" strokeWidth="1" strokeDasharray="4 6" />
      </svg>

      {/* ── Luminous orbit dots (z-10) ──────────────────────────────
           Tune: position %, color, shadow-glow, pulse timing        */}
      <span
        className="absolute left-[16%] top-[42%] z-10 h-2 w-2 rounded-full bg-[#00A3FF] shadow-[0_0_14px_rgba(0,163,255,0.85)] motion-safe:animate-[lobby-pulse_3s_ease-in-out_infinite]"
        style={{ animationDelay: '0s' }}
        aria-hidden="true"
      />
      <span
        className="absolute right-[18%] top-[35%] z-10 h-2 w-2 rounded-full bg-[#7B2CFF] shadow-[0_0_14px_rgba(123,44,255,0.85)] motion-safe:animate-[lobby-pulse_3.5s_ease-in-out_infinite]"
        style={{ animationDelay: '1.2s' }}
        aria-hidden="true"
      />
      <span
        className="absolute bottom-[26%] left-[44%] z-10 h-1.5 w-1.5 rounded-full bg-[#005BFF] shadow-[0_0_12px_rgba(0,91,255,0.85)] motion-safe:animate-[lobby-pulse_2.8s_ease-in-out_infinite]"
        style={{ animationDelay: '0.6s' }}
        aria-hidden="true"
      />
      <span
        className="absolute right-[36%] top-[18%] z-10 h-1.5 w-1.5 rounded-full bg-[#00A3FF] shadow-[0_0_10px_rgba(0,163,255,0.80)] motion-safe:animate-[lobby-pulse_4s_ease-in-out_infinite]"
        style={{ animationDelay: '2.1s' }}
        aria-hidden="true"
      />

      {/* logohome — central (z-20) with rounded border like sobre page */}
      <div className="absolute left-1/2 top-1/2 z-20 flex h-[100px] w-[100px] -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden rounded-3xl border border-[#E3E7F0] bg-white shadow-[0_24px_70px_rgba(0,91,255,0.28)] motion-safe:animate-[lobby-float_6s_ease-in-out_infinite]">
        <Image
          src="/logohome.png"
          alt="LOBBY"
          width={320}
          height={320}
          className="h-full w-full object-contain p-2"
          priority
        />
      </div>

      {/* ── Floating cards (z-30) ────────────────────────────────────
           Tune: position prop | delay for stagger | icon | text      */}
      <FloatingCard
        icon={FolderKanban}
        title="Projetos"
        description="Acompanhe o status"
        position="left-3 top-5"
        delay="0s"
      />
      <FloatingCard
        icon={FileText}
        title="Materiais"
        description="Acesse conteúdos"
        position="right-3 top-5"
        delay="1.75s"
      />
      <FloatingCard
        icon={Headphones}
        title="Suporte"
        description="Fale com nosso time"
        position="left-3 bottom-5"
        delay="0.9s"
      />
      <FloatingCard
        icon={ShieldCheck}
        title="Segurança"
        description="Seus dados protegidos"
        position="right-3 bottom-5"
        delay="2.6s"
      />
    </div>
  )
}
