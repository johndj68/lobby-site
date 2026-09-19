'use client'

import { toast } from 'sonner'
import { Eye, Download as DownloadIcon, Link2, CheckCircle2, AlertTriangle, Loader2, FileText } from 'lucide-react'
import { getVisualStatusStyles } from '@/lib/project-status'
import { useProjectVisualUrl } from '@/hooks/useProjectVisualUrl'
import SignedVisualImage from '@/components/sections/SignedVisualImage'
import type { VisualImage, VisualDocument } from '@/types'

export function VisualImageGalleryCard({
  img, busy, onApprove,
}: {
  img:       VisualImage
  busy:      boolean
  onApprove: (decision: 'aprovado' | 'ajuste_solicitado') => void
}) {
  const resolvedLink = useProjectVisualUrl(img.url)
  const st = getVisualStatusStyles(img.status)
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E3E7F0] bg-white">
      <SignedVisualImage src={img.url} alt={img.title} className="h-36 w-full object-cover" />
      <div className="p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-[#0B1020]">{img.title}</p>
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: st.bg, color: st.color }}>{st.label}</span>
        </div>
        {img.description && <p className="mb-2 text-xs text-[#5D6475]">{img.description}</p>}
        {img.phase && <p className="mb-2 text-[10px] font-semibold text-[#005BFF]">{img.phase}</p>}
        {resolvedLink && (
          <a href={resolvedLink} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#005BFF] hover:underline">
            <Eye size={11} aria-hidden="true" />Ver imagem
          </a>
        )}
        {img.status === 'em_validacao' && (
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy} onClick={() => onApprove('aprovado')}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#10B981]/10 py-1.5 text-[11px] font-bold text-[#10B981] hover:bg-[#10B981]/20 disabled:opacity-50">
              {busy ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}Aprovar
            </button>
            <button type="button" disabled={busy} onClick={() => onApprove('ajuste_solicitado')}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#F59E0B]/10 py-1.5 text-[11px] font-bold text-[#F59E0B] hover:bg-[#F59E0B]/20 disabled:opacity-50">
              <AlertTriangle size={11} />Ajuste
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function VisualDocumentRow({
  doc, busy, onApprove,
}: {
  doc:       VisualDocument
  busy:      boolean
  onApprove: (decision: 'aprovado' | 'ajuste_solicitado') => void
}) {
  const resolved = useProjectVisualUrl(doc.fileUrl)
  const st = getVisualStatusStyles(doc.status)
  return (
    <div className="rounded-2xl border border-[#E3E7F0] bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <FileText size={20} className="shrink-0 text-[#EF4444]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-[#0B1020]">{doc.title}</p>
            <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: st.bg, color: st.color }}>{st.label}</span>
          </div>
          {doc.phase && <p className="text-[10px] font-semibold text-[#005BFF]">{doc.phase}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {resolved === undefined && <span className="text-[11px] text-[#94A3B8]">Carregando…</span>}
          {resolved === null && <span className="text-[11px] text-[#94A3B8]">Sem acesso</span>}
          {resolved && (
            <>
              <a href={resolved} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-[#E3E7F0] px-2.5 py-1.5 text-[11px] font-semibold text-[#5D6475] hover:border-[#005BFF]/30 hover:text-[#005BFF]">
                <Eye size={11} aria-hidden="true" />Visualizar
              </a>
              <a href={resolved} download
                className="inline-flex items-center gap-1 rounded-lg border border-[#E3E7F0] px-2.5 py-1.5 text-[11px] font-semibold text-[#5D6475] hover:border-[#005BFF]/30 hover:text-[#005BFF]">
                <DownloadIcon size={11} aria-hidden="true" />Baixar
              </a>
              <button type="button" onClick={() => { navigator.clipboard.writeText(resolved); toast.success('URL copiada') }}
                className="inline-flex items-center gap-1 rounded-lg border border-[#E3E7F0] px-2.5 py-1.5 text-[11px] font-semibold text-[#5D6475] hover:border-[#005BFF]/30 hover:text-[#005BFF]">
                <Link2 size={11} aria-hidden="true" />Copiar URL
              </button>
            </>
          )}
        </div>
      </div>
      {doc.status === 'em_validacao' && (
        <div className="mt-3 flex gap-2">
          <button type="button" disabled={busy} onClick={() => onApprove('aprovado')}
            className="inline-flex items-center gap-1 rounded-lg bg-[#10B981]/10 px-3 py-1.5 text-[11px] font-bold text-[#10B981] hover:bg-[#10B981]/20 disabled:opacity-50">
            {busy ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}Aprovar
          </button>
          <button type="button" disabled={busy} onClick={() => onApprove('ajuste_solicitado')}
            className="inline-flex items-center gap-1 rounded-lg bg-[#F59E0B]/10 px-3 py-1.5 text-[11px] font-bold text-[#F59E0B] hover:bg-[#F59E0B]/20 disabled:opacity-50">
            <AlertTriangle size={11} />Solicitar ajuste
          </button>
        </div>
      )}
    </div>
  )
}
