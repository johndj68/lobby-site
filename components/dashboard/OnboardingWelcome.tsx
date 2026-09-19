'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Sparkles, User, BookOpen, MessageSquarePlus,
  ArrowRight, CheckCircle2, Rocket,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'

interface Props {
  userId:    string
  firstName: string
}

const STEPS = [
  {
    icon: User,
    color: '#005BFF',
    bg:   'rgba(0,91,255,0.10)',
    title: 'Complete seu perfil',
    desc:  'Adicione empresa e área de interesse para recomendações personalizadas.',
    href:  '/dashboard/conta',
    cta:   'Completar perfil',
  },
  {
    icon: BookOpen,
    color: '#7B2CFF',
    bg:   'rgba(123,44,255,0.10)',
    title: 'Explore materiais gratuitos',
    desc:  'Guias, checklists e e-books para aplicar na sua empresa agora.',
    href:  '/recursos',
    cta:   'Ver materiais',
  },
  {
    icon: MessageSquarePlus,
    color: '#00A3FF',
    bg:   'rgba(0,163,255,0.10)',
    title: 'Solicite uma solução',
    desc:  'Fale com um especialista e descubra como podemos ajudar o seu negócio.',
    href:  '/contato',
    cta:   'Falar agora',
  },
]

export default function OnboardingWelcome({ userId, firstName }: Props) {
  const [visible,    setVisible]    = useState(true)
  const [dismissing, setDismissing] = useState(false)

  const dismiss = async () => {
    setDismissing(true)
    // Marca onboarding como concluído no banco
    const supabase = createClient()
    await supabase
      .from('profiles')
      .update({ onboarded: true })
      .eq('id', userId)
    setVisible(false)
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20, height: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="relative mb-6 overflow-hidden rounded-[1.75rem] border border-[#E3E7F0] bg-white shadow-[0_20px_70px_rgba(11,16,32,0.08)]"
        >
          {/* Gradient top strip */}
          <div className="h-1 w-full bg-gradient-to-r from-[#005BFF] via-[#7B2CFF] to-[#00A3FF]" />

          {/* Close button */}
          <button
            type="button"
            onClick={dismiss}
            disabled={dismissing}
            aria-label="Fechar boas-vindas"
            className="absolute right-4 top-4 rounded-lg p-1.5 text-[#5D6475] transition-colors hover:bg-[#F7F8FC] hover:text-[#0B1020]"
          >
            <X size={16} aria-hidden="true" />
          </button>

          <div className="p-6 sm:p-8">
            {/* Header */}
            <div className="mb-6 flex items-start gap-4">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white shadow-[0_8px_24px_rgba(0,91,255,0.25)]"
                style={{ background: 'linear-gradient(135deg, #005BFF, #7B2CFF)' }}
              >
                <Rocket size={24} aria-hidden="true" />
              </div>
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <h2
                    className="text-xl font-bold text-[#0B1020] sm:text-2xl"
                    style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                  >
                    Bem-vindo à LOBBY, {firstName}! 🎉
                  </h2>
                </div>
                <p className="text-sm leading-relaxed text-[#5D6475]">
                  Sua conta está pronta. Siga os passos abaixo para aproveitar ao máximo a plataforma.
                </p>
              </div>
            </div>

            {/* Steps */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {STEPS.map(({ icon: Icon, color, bg, title, desc, href, cta }, i) => (
                <motion.div
                  key={title}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.1 }}
                  className="group rounded-2xl border border-[#E3E7F0] bg-[#F7F8FC]/70 p-4 transition-all duration-300 hover:border-[#005BFF]/20 hover:bg-white hover:shadow-md"
                >
                  {/* Step number + icon */}
                  <div className="mb-3 flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105"
                      style={{ background: bg }}
                    >
                      <Icon size={18} style={{ color }} aria-hidden="true" />
                    </div>
                    <span
                      className="text-[10px] font-bold uppercase tracking-widest"
                      style={{ color }}
                    >
                      Passo {i + 1}
                    </span>
                  </div>

                  <h3
                    className="mb-1.5 text-sm font-bold text-[#0B1020]"
                    style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                  >
                    {title}
                  </h3>
                  <p className="mb-3 text-xs leading-relaxed text-[#5D6475]">{desc}</p>

                  <Link
                    href={href}
                    onClick={dismiss}
                    className="inline-flex items-center gap-1 text-xs font-bold transition-all hover:gap-2"
                    style={{ color }}
                  >
                    {cta}
                    <ArrowRight size={11} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </Link>
                </motion.div>
              ))}
            </div>

            {/* Footer actions */}
            <div className="mt-5 flex flex-col items-center justify-between gap-3 border-t border-[#E3E7F0] pt-5 sm:flex-row">
              <div className="flex items-center gap-2 text-xs text-[#5D6475]">
                <CheckCircle2 size={14} className="text-[#10B981]" aria-hidden="true" />
                Conta ativa e pronta para uso
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={dismiss}
                  disabled={dismissing}
                  className="rounded-xl border border-[#E3E7F0] bg-white px-4 py-2 text-xs font-semibold text-[#5D6475] transition-all hover:border-[#005BFF]/30 hover:text-[#005BFF] disabled:opacity-50"
                >
                  {dismissing ? 'Salvando...' : 'Pular por agora'}
                </button>
                <Link
                  href="/dashboard/conta"
                  onClick={dismiss}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-4 py-2 text-xs font-bold text-white shadow-[0_6px_18px_rgba(0,91,255,0.22)] transition-all hover:-translate-y-0.5"
                >
                  <Sparkles size={12} aria-hidden="true" />
                  Completar configuração
                </Link>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
