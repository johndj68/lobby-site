'use client'

import { useRef, useState } from 'react'
import {
  Image as ImageIcon, FileText, Link2, Upload, Loader2, Trash2, Eye, Download as DownloadIcon, X,
} from 'lucide-react'
import { uploadProjectVisual } from '@/lib/project-visuals-upload'
import { DEFAULT_PROJECT_PHASES } from '@/types'
import type { ClientProgress, ProjectPhaseStatus, VisualImage, VisualDocument } from '@/types'

interface Props {
  value:         ClientProgress
  onChange:      (next: ClientProgress) => void
  selectedPhase: string | null
  onClose:       () => void
}

const PHASE_STATUS_OPTIONS: { value: ProjectPhaseStatus; label: string }[] = [
  { value: 'concluido',          label: 'Concluído'          },
  { value: 'atual',              label: 'Etapa atual'        },
  { value: 'proximo',            label: 'Próximo'            },
  { value: 'aguardando_cliente', label: 'Aguardando cliente' },
  { value: 'bloqueado',          label: 'Bloqueado'          },
]

const inputClass = 'h-10 w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-2.5 text-xs text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50'
const textareaClass = 'w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.05] px-2.5 py-2 text-xs text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50'

export default function CurrentPhaseEditor({ value, onChange, selectedPhase, onClose }: Props) {
  const imageInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [showLinkForm, setShowLinkForm] = useState(false)
  const [linkTitle, setLinkTitle] = useState('')
  const [linkUrl, setLinkUrl] = useState('')

  const phases = value.phases?.length ? value.phases : DEFAULT_PROJECT_PHASES
  const index = phases.findIndex(p => p.title === selectedPhase)
  const phase = index >= 0 ? phases[index] : null

  const images = value.clientVisualAssets?.images ?? []
  const documents = value.clientVisualAssets?.documents ?? []
  const phaseImages = phase ? images.filter(i => i.phase === phase.title) : []
  const phaseDocuments = phase ? documents.filter(d => d.phase === phase.title) : []

  if (!phase) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-[#111C2E] p-4">
        <p className="text-sm font-bold text-white/70">Detalhes da etapa</p>
        <p className="mt-2 text-xs text-white/35">Selecione uma etapa na linha do tempo para editar os detalhes.</p>
      </div>
    )
  }

  const updatePhase = (patch: Partial<typeof phase>) => {
    const next = phases.map((p, i) => i === index ? { ...p, ...patch } : p)
    onChange({ ...value, phases: next })
  }

  const setAssets = (patch: Partial<NonNullable<ClientProgress['clientVisualAssets']>>) => {
    onChange({ ...value, clientVisualAssets: { ...value.clientVisualAssets, ...patch } })
  }

  const handleImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploadingImage(true)
    try {
      const file = files[0]
      const url = await uploadProjectVisual(file, 'image')
      const newImage: VisualImage = {
        id: crypto.randomUUID(), title: file.name, description: '', url,
        phase: phase.title, status: 'planejado', createdAt: new Date().toISOString(),
      }
      setAssets({ images: [...images, newImage] })
    } finally {
      setUploadingImage(false)
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  const handleDocUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploadingDoc(true)
    try {
      const file = files[0]
      const url = await uploadProjectVisual(file, 'document')
      const newDoc: VisualDocument = {
        id: crypto.randomUUID(), title: file.name, description: '', fileUrl: url,
        type: file.type || 'application/octet-stream', phase: phase.title, status: 'planejado',
        createdAt: new Date().toISOString(),
      }
      setAssets({ documents: [...documents, newDoc] })
    } finally {
      setUploadingDoc(false)
      if (docInputRef.current) docInputRef.current.value = ''
    }
  }

  const addLink = () => {
    if (!linkUrl.trim()) return
    const newDoc: VisualDocument = {
      id: crypto.randomUUID(), title: linkTitle.trim() || linkUrl.trim(), description: '', fileUrl: linkUrl.trim(),
      type: 'link', phase: phase.title, status: 'planejado', createdAt: new Date().toISOString(),
    }
    setAssets({ documents: [...documents, newDoc] })
    setLinkTitle(''); setLinkUrl(''); setShowLinkForm(false)
  }

  const removeImage = (id: string) => setAssets({ images: images.filter(i => i.id !== id) })
  const removeDoc = (id: string) => setAssets({ documents: documents.filter(d => d.id !== id) })

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#111C2E] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25">Detalhes da etapa</p>
          <p className="text-sm font-bold text-white/85">{phase.title}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar editor de etapa"
          className="text-white/30 hover:text-white/70 transition-colors"><X size={16} aria-hidden="true" /></button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-white/60">Status</label>
          <select value={phase.status} onChange={e => updatePhase({ status: e.target.value as ProjectPhaseStatus })}
            className={inputClass + ' h-10'}>
            {PHASE_STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-white/60">Descrição para o cliente</label>
          <textarea rows={2} placeholder="Linguagem simples, sem termos técnicos" value={phase.description ?? ''}
            onChange={e => updatePhase({ description: e.target.value })} className={textareaClass} />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-white/60">
            Nota interna <span className="font-normal text-white/30">(não aparece pro cliente)</span>
          </label>
          <textarea rows={2} placeholder="Uso apenas da equipe técnica" value={phase.internalNote ?? ''}
            onChange={e => updatePhase({ internalNote: e.target.value })} className={textareaClass} />
        </div>

        <label className="flex items-center gap-2.5 text-xs font-medium text-white/60">
          <input type="checkbox" checked={phase.visibleToClient ?? true}
            onChange={e => updatePhase({ visibleToClient: e.target.checked })}
            className="h-4 w-4 accent-[#005BFF]" />
          Visível para o cliente
        </label>

        {/* Anexos */}
        <div className="border-t border-white/[0.06] pt-3">
          <p className="mb-2 text-xs font-bold text-white/70">Anexos desta etapa</p>

          {phaseImages.length === 0 && phaseDocuments.length === 0 ? (
            <p className="mb-2 text-[11px] text-white/30">Nenhum anexo ainda.</p>
          ) : (
            <ul className="mb-2 space-y-1.5">
              {phaseImages.map(img => (
                <li key={img.id} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 text-[11px]">
                  <ImageIcon size={13} className="shrink-0 text-[#60A5FA]" aria-hidden="true" />
                  <span className="flex-1 truncate text-white/70">{img.title}</span>
                  <a href={img.url} target="_blank" rel="noopener noreferrer" aria-label="Ver imagem" className="text-white/30 hover:text-white/70"><Eye size={12} aria-hidden="true" /></a>
                  <button type="button" onClick={() => removeImage(img.id)} aria-label="Remover" className="text-white/30 hover:text-red-400"><Trash2 size={12} aria-hidden="true" /></button>
                </li>
              ))}
              {phaseDocuments.map(doc => (
                <li key={doc.id} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 text-[11px]">
                  {doc.type === 'link' ? <Link2 size={13} className="shrink-0 text-[#A78BFA]" aria-hidden="true" /> : <FileText size={13} className="shrink-0 text-[#F87171]" aria-hidden="true" />}
                  <span className="flex-1 truncate text-white/70">{doc.title}</span>
                  <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" aria-label="Ver" className="text-white/30 hover:text-white/70"><Eye size={12} aria-hidden="true" /></a>
                  {doc.type !== 'link' && (
                    <a href={doc.fileUrl} download aria-label="Baixar" className="text-white/30 hover:text-white/70"><DownloadIcon size={12} aria-hidden="true" /></a>
                  )}
                  <button type="button" onClick={() => removeDoc(doc.id)} aria-label="Remover" className="text-white/30 hover:text-red-400"><Trash2 size={12} aria-hidden="true" /></button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-1.5">
            <button type="button" disabled={uploadingImage} onClick={() => imageInputRef.current?.click()}
              className="inline-flex items-center gap-1 rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-semibold text-white/60 hover:bg-white/[0.10] disabled:opacity-50">
              {uploadingImage ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} aria-hidden="true" />}Imagem
            </button>
            <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e.target.files)} />

            <button type="button" disabled={uploadingDoc} onClick={() => docInputRef.current?.click()}
              className="inline-flex items-center gap-1 rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-semibold text-white/60 hover:bg-white/[0.10] disabled:opacity-50">
              {uploadingDoc ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} aria-hidden="true" />}PDF
            </button>
            <input ref={docInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" className="hidden" onChange={e => handleDocUpload(e.target.files)} />

            <button type="button" onClick={() => setShowLinkForm(v => !v)}
              className="inline-flex items-center gap-1 rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-semibold text-white/60 hover:bg-white/[0.10]">
              <Link2 size={11} aria-hidden="true" />Link
            </button>
          </div>

          {showLinkForm && (
            <div className="mt-2 space-y-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
              <input type="text" placeholder="Título (opcional)" value={linkTitle} onChange={e => setLinkTitle(e.target.value)} className={inputClass} />
              <input type="url" placeholder="https://..." value={linkUrl} onChange={e => setLinkUrl(e.target.value)} className={inputClass} />
              <button type="button" onClick={addLink}
                className="w-full rounded-lg bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] py-1.5 text-[11px] font-bold text-white">
                Adicionar link
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
