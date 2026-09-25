'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Check, HelpCircle } from 'lucide-react'
import { colors } from '@/lib/design-tokens'

export interface StepDef { step: 1 | 2 | 3 | 4; label: string; href: string }

export function stepHrefs(appId: string): StepDef[] {
  return [
    { step: 1, label: 'Começar', href: `/dashboard/meus-app/novo/${appId}/comecar` },
    { step: 2, label: 'Produto e mídia', href: `/dashboard/meus-app/novo/${appId}/editar` },
    { step: 3, label: 'Oferta e planos', href: `/dashboard/meus-app/novo/${appId}/planos` },
    { step: 4, label: 'Revisão', href: `/dashboard/meus-app/novo/${appId}/revisao` },
  ]
}

interface EditorChromeProps {
  appId: string
  appName: string
  breadcrumbLabel: string
  currentStep: 1 | 2 | 3 | 4
  completed: { 1: boolean; 2: boolean; 3: boolean }
  /** Quando definido, cliques nos passos (exceto o atual) passam por aqui em
   *  vez de navegar direto — usado pra oferecer salvar/descartar quando há
   *  alterações não salvas. Retornar não navega (a própria página decide). */
  onStepIntercept?: (href: string) => void
}

/** Cabeçalho + indicador de etapas compartilhado pelas 4 rotas do editor
 *  (comecar/editar/planos/revisao). Cada etapa é uma rota real (<Link>),
 *  não estado interno — recarregar ou usar voltar/avançar do navegador
 *  continua na mesma etapa e no mesmo aplicativo de graça. */
export default function EditorChrome({ appId, appName, breadcrumbLabel, currentStep, completed, onStepIntercept }: EditorChromeProps) {
  const steps = stepHrefs(appId)

  return (
    <div className="bg-white border-b" style={{ borderColor: colors.border }}>
      {/* Topo: logo + voltar/ajuda */}
      <div className="flex items-center justify-between px-4 py-2.5 sm:px-8">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="shrink-0">
            <Image src="/logowhite.svg" alt="LOBBY" width={110} height={28} className="h-6 w-auto object-contain" priority />
          </Link>
          <span className="hidden rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide sm:inline" style={{ background: colors.backgroundAlt, color: colors.textSecondary }}>
            Parceiros
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link href={`/dashboard/meus-app/${appId}`} className="hidden text-xs font-semibold sm:inline" style={{ color: colors.text }}>
            Voltar aos meus aplicativos
          </Link>
          <Link href="/dashboard/suporte" className="flex items-center gap-1 text-xs font-semibold" style={{ color: colors.textSecondary }}>
            <HelpCircle size={13} aria-hidden="true" /> <span className="hidden sm:inline">Ajuda</span>
          </Link>
        </div>
      </div>

      {/* Breadcrumb + indicador de etapas */}
      <div className="border-t px-4 py-3 sm:px-8" style={{ borderColor: colors.border }}>
        <p className="mb-3 text-xs" style={{ color: colors.textSecondary }}>
          <Link href="/dashboard/meus-app" className="hover:underline">Meus aplicativos</Link> / {appName} / {breadcrumbLabel}
        </p>
        <nav aria-label="Etapas do cadastro" className="flex flex-wrap items-center gap-x-1 gap-y-2">
          {steps.map((s, i) => {
            const isCurrent = s.step === currentStep
            const isDone = s.step < 4 ? completed[s.step as 1 | 2 | 3] : false
            const content = (
              <span className="flex items-center gap-2 rounded-full px-3 py-1.5"
                style={{ background: isCurrent ? '#EFF6FF' : 'transparent' }}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={{
                    background: isDone ? '#16A34A' : isCurrent ? colors.primary : '#E5E7EB',
                    color: isDone || isCurrent ? '#FFFFFF' : '#6B7280',
                  }}>
                  {isDone ? <Check size={13} aria-hidden="true" /> : s.step}
                </span>
                <span className="text-sm font-semibold" style={{ color: isCurrent ? colors.primary : isDone ? colors.text : colors.textSecondary }}>
                  {s.label}
                </span>
              </span>
            )
            return (
              <div key={s.step} className="flex items-center">
                {onStepIntercept && !isCurrent ? (
                  <button type="button" onClick={() => onStepIntercept(s.href)}
                    aria-current={isCurrent ? 'step' : undefined}
                    className="rounded-full transition-colors hover:bg-[#F7F8FC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005BFF]">
                    {content}
                  </button>
                ) : (
                  <Link href={s.href} aria-current={isCurrent ? 'step' : undefined}
                    className="rounded-full transition-colors hover:bg-[#F7F8FC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005BFF]">
                    {content}
                  </Link>
                )}
                {i < steps.length - 1 && <span className="mx-1 hidden h-px w-6 sm:block" style={{ background: '#E5E7EB' }} aria-hidden="true" />}
              </div>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
