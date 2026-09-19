'use client'

import { useState } from 'react'
import { ChevronDown, CheckCircle2, AlertTriangle } from 'lucide-react'
import type { ClientProgress } from '@/types'

interface Props {
  value:    ClientProgress
  onChange: (next: ClientProgress) => void
}

const SUMMARY_TEMPLATES = [
  { label: 'Projeto iniciado', text: 'Seu projeto foi iniciado. Nossa equipe está organizando as primeiras etapas e preparando a estrutura principal.' },
  { label: 'Em desenvolvimento', text: 'Estamos avançando na etapa de desenvolvimento. As fases iniciais já foram concluídas e agora estamos construindo as principais funcionalidades do sistema.' },
  { label: 'Etapa concluída', text: 'Finalizamos uma etapa importante do projeto e seguimos para a próxima fase conforme o planejamento.' },
  { label: 'Aguardando validação', text: 'Precisamos da sua validação para avançar com segurança para a próxima etapa.' },
  { label: 'Próxima entrega', text: 'A próxima entrega será apresentada em breve para validação, com uma visão clara do que foi desenvolvido.' },
  { label: 'Ajustes em andamento', text: 'Estamos realizando ajustes para melhorar a experiência e garantir que a entrega atenda ao esperado.' },
]

const TECHNICAL_TERMS = /\bapi\b|\bschema\b|\bmiddleware\b|\bdeploy\b/i

function getSummaryQualityChecks(text: string): { label: string; ok: boolean; hint?: string }[] {
  const t = text.toLowerCase()
  const checks = [
    { label: 'Informa a etapa atual',      ok: /etapa|fase/.test(t) },
    { label: 'Explica o que está sendo feito', ok: /finalizamos|conclu|construindo|desenvolvendo|organizando|realizando/.test(t) },
    { label: 'Indica o próximo passo',     ok: /próxima|próximo|seguir|avançar|será/.test(t) },
    { label: 'Usa linguagem simples',      ok: !TECHNICAL_TERMS.test(t) },
    { label: 'Evita termos técnicos',      ok: !TECHNICAL_TERMS.test(t), hint: TECHNICAL_TERMS.test(t) ? 'Considere explicar este termo em linguagem simples para o cliente.' : undefined },
  ]
  return checks
}

const inputClass = 'h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50'
const labelClass = 'mb-1.5 block text-xs font-semibold text-white/60'

export default function ProjectProgressSummary({ value, onChange }: Props) {
  const [showTemplates, setShowTemplates] = useState(false)
  const summary = value.projectSummary ?? ''

  const set = <K extends keyof ClientProgress>(key: K, v: ClientProgress[K]) =>
    onChange({ ...value, [key]: v })

  const checks = getSummaryQualityChecks(summary)
  const tooShort = summary.trim().length > 0 && summary.trim().length < 40
  const empty = summary.trim().length === 0

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#111C2E] p-4">
      <p className="text-sm font-bold text-white/85">Resumo do andamento para o cliente</p>
      <p className="mb-3 text-[11px] text-white/35">Explique de forma simples o momento atual do projeto.</p>

      <div className="relative mb-2">
        <button type="button" onClick={() => setShowTemplates(v => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-semibold text-white/60 transition-colors hover:border-[#005BFF]/40 hover:text-[#60A5FA]">
          Usar modelo
          <ChevronDown size={11} className={`transition-transform ${showTemplates ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {showTemplates && (
          <ul className="absolute z-20 mt-1.5 w-72 max-w-[90vw] overflow-hidden rounded-xl border border-white/[0.08] bg-[#0D1428] shadow-[0_12px_40px_rgba(0,0,0,0.40)]">
            {SUMMARY_TEMPLATES.map(t => (
              <li key={t.label}>
                <button type="button"
                  onClick={() => { set('projectSummary', t.text); setShowTemplates(false) }}
                  className="block w-full px-3 py-2.5 text-left text-xs text-white/80 transition-colors hover:bg-white/[0.06]">
                  <span className="font-semibold">{t.label}</span>
                  <span className="mt-0.5 block text-[10px] text-white/35 line-clamp-2">{t.text}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <textarea rows={3} maxLength={800}
        placeholder="Ex: Estamos avançando na etapa de desenvolvimento. As fases iniciais já foram concluídas e agora estamos construindo as principais funcionalidades do sistema."
        value={summary} onChange={e => set('projectSummary', e.target.value)}
        className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50" />
      <p className={`mt-1 text-right text-[10px] ${summary.length > 500 ? 'text-[#F59E0B]' : 'text-white/25'}`}>{summary.length}/500</p>

      {(empty || tooShort) && (
        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[#FBBF24]">
          <AlertTriangle size={11} className="shrink-0" aria-hidden="true" />
          {empty ? 'O resumo está vazio.' : 'O resumo do andamento está muito curto. Escreva uma explicação mais clara para o cliente.'}
        </p>
      )}

      {!empty && (
        <div className="mt-3 border-t border-white/[0.06] pt-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/25">Clareza da atualização</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {checks.map(c => (
              <div key={c.label} className="flex items-center gap-1.5 text-[11px]" title={c.hint}>
                {c.ok
                  ? <CheckCircle2 size={12} className="shrink-0 text-[#10B981]" aria-hidden="true" />
                  : <AlertTriangle size={12} className="shrink-0 text-[#F59E0B]" aria-hidden="true" />}
                <span className={c.ok ? 'text-white/60' : 'text-white/35'}>{c.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Próximo marco */}
      <div className="mt-4 grid gap-3 border-t border-white/[0.06] pt-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelClass}>Próximo marco</label>
          <input type="text" placeholder="Ex: Finalizar desenvolvimento da área do cliente" value={value.nextMilestone ?? ''}
            onChange={e => set('nextMilestone', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Previsão do marco</label>
          <input type="date" value={value.nextMilestoneDate ?? ''}
            onChange={e => set('nextMilestoneDate', e.target.value)}
            className="h-11 w-full rounded-xl border border-white/[0.08] bg-[#0D1428] px-3 text-sm text-white outline-none focus:border-[#005BFF]/50 [color-scheme:dark]" />
        </div>
        <div>
          <label className={labelClass}>Descrição simples para o cliente</label>
          <input type="text" placeholder="Ex: Uma prévia navegável da área do cliente." value={value.nextMilestoneDescription ?? ''}
            onChange={e => set('nextMilestoneDescription', e.target.value)} className={inputClass} />
        </div>
        {!value.nextMilestone && (
          <p className="sm:col-span-2 flex items-center gap-1.5 text-[11px] text-[#FBBF24]">
            <AlertTriangle size={11} className="shrink-0" aria-hidden="true" />
            Informe o próximo marco para o cliente saber o que vem depois.
          </p>
        )}
      </div>
    </div>
  )
}
