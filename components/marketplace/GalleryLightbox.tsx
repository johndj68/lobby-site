'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, ImageOff, RotateCcw } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { colors } from '@/lib/design-tokens'

export interface GalleryImage { url: string; altText: string | null }

interface Props {
  images: GalleryImage[]
  openIndex: number | null
  onClose: () => void
  onNavigate: (index: number) => void
}

/** Ampliação de galeria — Dialog do projeto já cuida de foco/scroll-lock/Esc;
 *  aqui só somamos navegação por seta do teclado e por botão. */
export default function GalleryLightbox({ images, openIndex, onClose, onNavigate }: Props) {
  const [failedIdx, setFailedIdx] = useState<Set<number>>(new Set())
  const [retryKey, setRetryKey] = useState(0)
  if (openIndex === null) return null
  const current = images[openIndex]
  if (!current) return null

  function go(delta: number) {
    if (openIndex === null) return
    const next = (openIndex + delta + images.length) % images.length
    onNavigate(next)
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent
        className="max-w-4xl border-0 bg-transparent p-0 shadow-none ring-0"
        onKeyDown={e => {
          if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1) }
          if (e.key === 'ArrowRight') { e.preventDefault(); go(1) }
        }}
      >
        <DialogTitle className="sr-only">{current.altText || 'Imagem ampliada'}</DialogTitle>
        <div className="relative flex items-center justify-center rounded-xl bg-black/90 p-2">
          {failedIdx.has(openIndex) ? (
            <div className="flex aspect-video w-full max-w-3xl flex-col items-center justify-center gap-2 rounded-lg bg-white/10 text-white">
              <ImageOff size={32} aria-hidden="true" />
              <p className="text-sm">Não foi possível carregar esta imagem.</p>
              <button type="button"
                onClick={() => { setFailedIdx(prev => { const s = new Set(prev); s.delete(openIndex); return s }); setRetryKey(k => k + 1) }}
                className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-white/30 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10">
                <RotateCcw size={12} aria-hidden="true" /> Tentar novamente
              </button>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={`${openIndex}-${retryKey}`} src={current.url} alt={current.altText || ''}
              className="max-h-[80vh] w-full max-w-3xl rounded-lg object-contain"
              onError={() => setFailedIdx(prev => new Set(prev).add(openIndex))} />
          )}

          {images.length > 1 && (
            <>
              <button type="button" onClick={() => go(-1)} aria-label="Imagem anterior"
                className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ outlineColor: colors.primary }}>
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => go(1)} aria-label="Próxima imagem"
                className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ outlineColor: colors.primary }}>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
              <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
                {openIndex + 1} / {images.length}
              </span>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
