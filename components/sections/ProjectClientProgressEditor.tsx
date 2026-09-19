'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { ClientProgress, ProjectUpdateEntry } from '@/types'
import ProjectProgressSummary from './ProjectProgressSummary'
import ProjectTimelineEditor from './ProjectTimelineEditor'
import CurrentPhaseEditor from './CurrentPhaseEditor'

interface Props {
  value:     ClientProgress
  onChange:  (next: ClientProgress) => void
  deadline?: string
  status?:   string
  progress?: number
}

const HISTORY_TYPES = ['Atualização', 'Entrega', 'Segurança', 'Bloqueio', 'Próximo passo', 'Feedback do cliente']

const textareaClass = 'w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50'
const labelClass = 'mb-1.5 block text-xs font-semibold text-white/60'

function linesToArray(text: string): string[] {
  return text.split('\n').map(l => l.trim()).filter(Boolean)
}

export default function ProjectClientProgressEditor({ value, onChange, deadline, status, progress }: Props) {
  const [selectedPhase, setSelectedPhase] = useState<string | null>(null)
  const [newEntry, setNewEntry] = useState<ProjectUpdateEntry>({
    date: new Date().toISOString().slice(0, 10), type: HISTORY_TYPES[0], title: '', description: '',
  })

  const set = <K extends keyof ClientProgress>(key: K, v: ClientProgress[K]) =>
    onChange({ ...value, [key]: v })

  const addHistoryEntry = () => {
    if (!newEntry.title.trim()) return
    set('updateHistory', [newEntry, ...(value.updateHistory ?? [])])
    setNewEntry({ date: new Date().toISOString().slice(0, 10), type: HISTORY_TYPES[0], title: '', description: '' })
  }

  return (
    <div className="space-y-6">
      {/* Acompanhamento visual: resumo + timeline | editor de etapa */}
      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="space-y-4">
          <ProjectProgressSummary value={value} onChange={onChange} />
          <ProjectTimelineEditor
            value={value} onChange={onChange}
            selectedPhase={selectedPhase} onSelectPhase={setSelectedPhase}
            deadline={deadline} status={status} progress={progress}
          />
        </div>
        <aside>
          <CurrentPhaseEditor value={value} onChange={onChange} selectedPhase={selectedPhase} onClose={() => setSelectedPhase(null)} />
        </aside>
      </div>

      {/* Feito / Fazendo / Próximos passos */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={labelClass}>O que já foi feito <span className="text-white/30 font-normal">(1 item por linha)</span></label>
          <textarea rows={4} placeholder={'Levantamento de requisitos\nProtótipo aprovado'}
            value={(value.completedItems ?? []).join('\n')}
            onChange={e => set('completedItems', linesToArray(e.target.value))}
            className={textareaClass} />
        </div>
        <div>
          <label className={labelClass}>O que estamos fazendo agora</label>
          <textarea rows={4} placeholder={'Desenvolvimento da área do cliente\nIntegração com banco de dados'}
            value={(value.inProgressItems ?? []).join('\n')}
            onChange={e => set('inProgressItems', linesToArray(e.target.value))}
            className={textareaClass} />
        </div>
        <div>
          <label className={labelClass}>Próximos passos</label>
          <textarea rows={4} placeholder={'Finalizar módulo de projetos\nIniciar testes internos'}
            value={(value.nextSteps ?? []).join('\n')}
            onChange={e => set('nextSteps', linesToArray(e.target.value))}
            className={textareaClass} />
        </div>
      </div>

      {/* Pendências do cliente */}
      <div>
        <label className={labelClass}>Pendências do cliente <span className="text-white/30 font-normal">(1 item por linha)</span></label>
        <textarea rows={3} placeholder={'Aprovar protótipo\nEnviar logo final'}
          value={(value.clientPendingItems ?? []).join('\n')}
          onChange={e => set('clientPendingItems', linesToArray(e.target.value))}
          className={textareaClass} />
      </div>

      {/* Histórico */}
      <div>
        <p className={labelClass}>Histórico de atualizações</p>

        <div className="mb-3 grid gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 sm:grid-cols-2">
          <input type="date" value={newEntry.date} onChange={e => setNewEntry(v => ({ ...v, date: e.target.value }))}
            className="h-10 rounded-lg border border-white/[0.08] bg-[#0D1428] px-2.5 text-xs text-white outline-none [color-scheme:dark]" />
          <select value={newEntry.type} onChange={e => setNewEntry(v => ({ ...v, type: e.target.value }))}
            className="h-10 rounded-lg border border-white/[0.08] bg-[#0D1428] px-2.5 text-xs text-white outline-none">
            {HISTORY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="text" placeholder="Título curto" value={newEntry.title}
            onChange={e => setNewEntry(v => ({ ...v, title: e.target.value }))}
            className="h-10 rounded-lg border border-white/[0.08] bg-[#0D1428] px-2.5 text-xs text-white placeholder:text-white/20 outline-none sm:col-span-2" />
          <textarea rows={2} placeholder="Descrição curta" value={newEntry.description}
            onChange={e => setNewEntry(v => ({ ...v, description: e.target.value }))}
            className="resize-none rounded-lg border border-white/[0.08] bg-[#0D1428] px-2.5 py-2 text-xs text-white placeholder:text-white/20 outline-none sm:col-span-2" />
          <button type="button" onClick={addHistoryEntry}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] py-2 text-xs font-bold text-white transition-all hover:-translate-y-0.5 sm:col-span-2">
            <Plus size={13} aria-hidden="true" />
            Adicionar ao histórico
          </button>
        </div>

        {(value.updateHistory ?? []).length > 0 && (
          <ul className="space-y-2">
            {(value.updateHistory ?? []).map((entry, i) => (
              <li key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
                <div className="flex items-center gap-2 text-[10px] text-white/35">
                  <span>{new Date(entry.date).toLocaleDateString('pt-BR')}</span>
                  <span>·</span>
                  <span className="font-semibold text-[#60A5FA]">{entry.type}</span>
                </div>
                <p className="mt-1 text-sm font-semibold text-white/85">{entry.title}</p>
                {entry.description && <p className="mt-0.5 text-xs text-white/45">{entry.description}</p>}
                {entry.responsavel && <p className="mt-0.5 text-[10px] text-white/30">Responsável: {entry.responsavel}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
