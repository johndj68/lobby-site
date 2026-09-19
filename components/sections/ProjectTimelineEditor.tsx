'use client'

import { Check, Pencil, AlertTriangle } from 'lucide-react'
import { PHASE_STATUS_STYLE, isDeadlineOverdue, getDeadlineOverdueDays, getProgressStatusWarning } from '@/lib/project-status'
import { DEFAULT_PROJECT_PHASES } from '@/types'
import type { ClientProgress, ProjectPhase, ProjectPhaseStatus } from '@/types'

interface Props {
  value:          ClientProgress
  onChange:       (next: ClientProgress) => void
  selectedPhase:  string | null
  onSelectPhase:  (title: string) => void
  deadline?:      string
  status?:        string
  progress?:      number
}

const PHASE_STATUS_OPTIONS: { value: ProjectPhaseStatus; label: string }[] = [
  { value: 'concluido',          label: 'Concluído'          },
  { value: 'atual',              label: 'Etapa atual'        },
  { value: 'proximo',            label: 'Próximo'            },
  { value: 'aguardando_cliente', label: 'Aguardando cliente' },
  { value: 'bloqueado',          label: 'Bloqueado'          },
]

const PHASE_SUGGESTED_DESCRIPTIONS: Record<string, string> = {
  'Diagnóstico':          'Entendemos as necessidades do projeto e levantamos os principais objetivos.',
  'Planejamento':         'Definimos as etapas, módulos e prioridades para orientar o desenvolvimento.',
  'Design / Protótipo':   'Criamos os protótipos das telas e validamos o layout e a experiência.',
  'Desenvolvimento':      'Estamos construindo as funcionalidades principais e organizando os dados do sistema.',
  'Testes':               'Realizaremos testes internos para garantir qualidade e estabilidade.',
  'Homologação':          'Você irá validar o sistema e nos dar o retorno final.',
  'Entrega':              'Faremos os ajustes finais e entregaremos o projeto completo.',
  'Suporte inicial':      'Acompanharemos os primeiros usos após a entrega para ajustes e suporte.',
}

export default function ProjectTimelineEditor({ value, onChange, selectedPhase, onSelectPhase, deadline, status, progress }: Props) {
  const phases = value.phases?.length ? value.phases : DEFAULT_PROJECT_PHASES

  const setPhases = (next: ProjectPhase[]) => onChange({ ...value, phases: next })

  const setPhaseStatus = (index: number, newStatus: ProjectPhaseStatus) => {
    const next = phases.map((p, i) => {
      if (i === index) return { ...p, status: newStatus }
      if (newStatus === 'atual' && p.status === 'atual') return { ...p, status: 'proximo' as ProjectPhaseStatus }
      return p
    })
    setPhases(next)
  }

  const setPhaseDescription = (index: number, description: string) => {
    setPhases(phases.map((p, i) => i === index ? { ...p, description } : p))
  }

  const applySuggestedDescription = (index: number, title: string) => {
    const suggested = PHASE_SUGGESTED_DESCRIPTIONS[title]
    if (suggested) setPhaseDescription(index, suggested)
  }

  const currentCount = phases.filter(p => p.status === 'atual').length
  const alerts: { text: string }[] = []
  if (isDeadlineOverdue(deadline)) {
    alerts.push({ text: `Prazo vencido há ${getDeadlineOverdueDays(deadline)} dia${getDeadlineOverdueDays(deadline) > 1 ? 's' : ''}. Atualize a data antes de publicar para o cliente.` })
  }
  if (status && progress !== undefined) {
    const w = getProgressStatusWarning(status, progress)
    if (w) alerts.push({ text: w })
  }
  if ((value.projectSummary ?? '').trim().length > 0 && (value.projectSummary ?? '').trim().length < 40) {
    alerts.push({ text: 'O resumo do andamento está muito curto. Escreva uma explicação mais clara para o cliente.' })
  }
  if (currentCount > 1) {
    alerts.push({ text: 'Existem várias etapas marcadas como atuais. Escolha apenas uma para deixar a visão do cliente mais clara.' })
  }
  if (!value.nextMilestone) {
    alerts.push({ text: 'Informe o próximo marco para o cliente saber o que vem depois.' })
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#111C2E] p-4">
      <p className="mb-3 text-sm font-bold text-white/85">Linha do tempo do projeto</p>

      {alerts.length > 0 && (
        <div className="mb-3 space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className="flex items-start gap-2 rounded-xl border border-[#F59E0B]/25 bg-[#F59E0B]/[0.06] px-3.5 py-2.5 text-xs text-[#FBBF24]">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              {a.text}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {phases.map((phase, i) => {
          const style = PHASE_STATUS_STYLE[phase.status] ?? PHASE_STATUS_STYLE.proximo
          const isSelected = selectedPhase === phase.title
          return (
            <div key={phase.title}
              className={`rounded-xl border px-3.5 py-2.5 transition-colors ${isSelected ? 'border-[#005BFF]/50 bg-[#005BFF]/[0.06]' : 'border-white/[0.06] bg-white/[0.02]'}`}>
              <div className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                  style={{ background: style.bg, color: style.color }}>
                  {phase.status === 'concluido' ? <Check size={12} aria-hidden="true" /> : i + 1}
                </span>
                <span className="flex-1 text-sm font-medium text-white/80">{phase.title}</span>
                <select
                  value={phase.status}
                  onChange={e => setPhaseStatus(i, e.target.value as ProjectPhaseStatus)}
                  className="h-9 rounded-lg border px-2.5 text-xs font-bold outline-none"
                  style={{ background: style.bg, borderColor: style.border, color: style.color }}
                >
                  {PHASE_STATUS_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value} className="bg-[#0D1428] text-white">{opt.label}</option>
                  ))}
                </select>
                <button type="button" onClick={() => onSelectPhase(phase.title)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[11px] font-semibold text-white/50 transition-colors hover:border-[#005BFF]/40 hover:text-[#60A5FA]">
                  <Pencil size={11} aria-hidden="true" />Editar
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input type="text" placeholder="Descrição curta pro cliente (opcional)" value={phase.description ?? ''}
                  onChange={e => setPhaseDescription(i, e.target.value)}
                  className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 text-xs text-white placeholder:text-white/25 outline-none focus:border-[#005BFF]/50" />
                {PHASE_SUGGESTED_DESCRIPTIONS[phase.title] && (
                  <button type="button" onClick={() => applySuggestedDescription(i, phase.title)}
                    className="shrink-0 whitespace-nowrap rounded-lg border border-white/[0.08] px-2.5 py-2 text-[10px] font-semibold text-white/40 transition-colors hover:border-[#005BFF]/40 hover:text-[#60A5FA]">
                    Usar sugestão
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
