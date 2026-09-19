'use client'

import { useRef, useState } from 'react'
import { Trash2, Upload, Loader2 } from 'lucide-react'
import { getVisualStatusStyles, VISUAL_STATUS_STYLES } from '@/lib/project-status'
import { uploadProjectVisual } from '@/lib/project-visuals-upload'
import SignedVisualImage from './SignedVisualImage'
import type { VisualImage, VisualDocument, FlowStep, OrgChartRole, ScreenMapGroup, Deliverable } from '@/types'

export type SelectedVisualItem =
  | { kind: 'image';       item: VisualImage }
  | { kind: 'document';    item: VisualDocument }
  | { kind: 'flow';        item: FlowStep }
  | { kind: 'org';         item: OrgChartRole }
  | { kind: 'screen';      item: ScreenMapGroup }
  | { kind: 'deliverable'; item: Deliverable }

interface Props {
  selected: SelectedVisualItem | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUpdate: (patch: Record<string, any>) => void
  onRemove: () => void
  onClose:  () => void
}

const STATUS_OPTIONS = Object.entries(VISUAL_STATUS_STYLES).map(([value, s]) => ({ value, label: s.label }))

const inputClass = 'h-10 w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-2.5 text-xs text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50'
const textareaClass = 'w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.05] px-2.5 py-2 text-xs text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50'
const labelClass = 'mb-1.5 block text-xs font-semibold text-white/60'

function linesToArray(text: string): string[] {
  return text.split('\n').map(l => l.trim()).filter(Boolean)
}

const KIND_LABEL: Record<SelectedVisualItem['kind'], string> = {
  image: 'Imagem', document: 'Documento', flow: 'Etapa do fluxo',
  org: 'Papel do organograma', screen: 'Módulo de telas', deliverable: 'Entrega',
}

export default function SelectedVisualItemPanel({ selected, onUpdate, onRemove, onClose }: Props) {
  const replaceImageRef = useRef<HTMLInputElement>(null)
  const [replacing, setReplacing] = useState(false)

  if (!selected) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-[#111C2E] p-4">
        <p className="text-sm font-bold text-white/70">Detalhes do item selecionado</p>
        <p className="mt-2 text-xs text-white/35">Selecione um item para editar os detalhes.</p>
      </div>
    )
  }

  const { kind, item } = selected
  const visible = item.visibleToClient ?? true
  const status: string | undefined = 'status' in item ? item.status : undefined

  const handleReplaceImage = async (files: FileList | null) => {
    if (!files || files.length === 0 || kind !== 'image') return
    setReplacing(true)
    try {
      const url = await uploadProjectVisual(files[0], 'image')
      onUpdate({ url })
    } finally {
      setReplacing(false)
      if (replaceImageRef.current) replaceImageRef.current.value = ''
    }
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#111C2E] p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25">{KIND_LABEL[kind]}</p>
        <button type="button" onClick={onRemove} aria-label="Remover item"
          className="text-white/30 transition-colors hover:text-red-400"><Trash2 size={14} aria-hidden="true" /></button>
      </div>

      <div className="space-y-3">
        {kind === 'image' && (
          <div>
            <SignedVisualImage src={item.url} alt={item.title} className="mb-2 h-32 w-full rounded-lg object-cover" />
            <button type="button" disabled={replacing} onClick={() => replaceImageRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-semibold text-white/60 hover:bg-white/[0.10] disabled:opacity-50">
              {replacing ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} aria-hidden="true" />}Trocar imagem
            </button>
            <input ref={replaceImageRef} type="file" accept="image/*" className="hidden" onChange={e => handleReplaceImage(e.target.files)} />
          </div>
        )}

        {/* Título */}
        {'title' in item && (
          <div>
            <label className={labelClass}>Título</label>
            <input type="text" value={item.title} onChange={e => onUpdate({ title: e.target.value })} className={inputClass} />
          </div>
        )}
        {kind === 'flow' && (
          <div>
            <label className={labelClass}>Título</label>
            <input type="text" value={item.title} onChange={e => onUpdate({ title: e.target.value })} className={inputClass} />
          </div>
        )}
        {kind === 'org' && (
          <>
            <div>
              <label className={labelClass}>Papel</label>
              <input type="text" value={item.role} onChange={e => onUpdate({ role: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Responsável</label>
              <input type="text" value={item.name ?? ''} onChange={e => onUpdate({ name: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Nível <span className="font-normal text-white/30">(0 = topo)</span></label>
              <input type="number" min={0} value={item.level ?? 0} onChange={e => onUpdate({ level: Number(e.target.value) })} className={inputClass} />
            </div>
          </>
        )}
        {kind === 'screen' && (
          <div>
            <label className={labelClass}>Módulo</label>
            <input type="text" value={item.module} onChange={e => onUpdate({ module: e.target.value })} className={inputClass} />
          </div>
        )}

        {/* Descrição */}
        {(kind === 'image' || kind === 'document' || kind === 'flow' || kind === 'org' || kind === 'screen' || kind === 'deliverable') && (
          <div>
            <label className={labelClass}>Descrição {kind !== 'org' && kind !== 'screen' && 'para o cliente'}</label>
            <textarea rows={2} placeholder="Linguagem simples" value={item.description ?? ''}
              onChange={e => onUpdate({ description: e.target.value })} className={textareaClass} />
          </div>
        )}

        {kind === 'screen' && (
          <div>
            <label className={labelClass}>Telas <span className="font-normal text-white/30">(1 por linha)</span></label>
            <textarea rows={4} value={item.screens.join('\n')}
              onChange={e => onUpdate({ screens: linesToArray(e.target.value) })} className={textareaClass} />
          </div>
        )}

        {(kind === 'image' || kind === 'document' || kind === 'deliverable') && (
          <div>
            <label className={labelClass}>Fase</label>
            <input type="text" placeholder="Ex: Design / Protótipo" value={item.phase ?? ''}
              onChange={e => onUpdate({ phase: e.target.value })} className={inputClass} />
          </div>
        )}

        {kind === 'document' && (
          <div>
            <label className={labelClass}>Tipo de documento</label>
            <input type="text" placeholder="Ex: Escopo, Relatório, Manual" value={item.documentType ?? ''}
              onChange={e => onUpdate({ documentType: e.target.value })} className={inputClass} />
          </div>
        )}

        {kind === 'deliverable' && (
          <div>
            <label className={labelClass}>Previsão</label>
            <input type="date" value={item.dueDate ?? ''} onChange={e => onUpdate({ dueDate: e.target.value })}
              className={inputClass + ' [color-scheme:dark]'} />
          </div>
        )}

        {/* Status */}
        {status !== undefined && (
          <div>
            <label className={labelClass}>Status</label>
            <select value={status} onChange={e => onUpdate({ status: e.target.value })}
              className="h-10 rounded-lg border px-2.5 text-xs font-bold outline-none"
              style={{ background: getVisualStatusStyles(status).bg, borderColor: getVisualStatusStyles(status).border, color: getVisualStatusStyles(status).color }}>
              {STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value} className="bg-[#0D1428] text-white">{opt.label}</option>)}
            </select>
          </div>
        )}

        {/* Visível para o cliente */}
        <div className="border-t border-white/[0.06] pt-3">
          <label className="flex items-center gap-2.5 text-xs font-medium text-white/60">
            <input type="checkbox" checked={visible} onChange={e => onUpdate({ visibleToClient: e.target.checked })}
              className="h-4 w-4 accent-[#005BFF]" />
            Visível para o cliente
          </label>
          <p className="mt-1.5 text-[10px] text-white/30">
            {visible ? 'Este item será exibido no dashboard do cliente.' : 'Este item ficará oculto para o cliente.'}
          </p>
        </div>

        <button type="button" onClick={onClose}
          className="w-full rounded-lg border border-white/[0.08] py-2 text-xs font-semibold text-white/50 hover:text-white transition-colors">
          Fechar
        </button>
      </div>
    </div>
  )
}
