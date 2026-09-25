'use client'

import { useState } from 'react'
import { Monitor, Smartphone, Maximize2, Lock, Package2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { colors } from '@/lib/design-tokens'

export interface PreviewData {
  name: string | null
  category: string | null
  vendorName: string | null
  shortDescription: string | null
  logoUrl: string | null
  mainImageUrl: string | null
  benefits: { title: string }[]
  features: { name: string; description?: string }[]
  integrations: { name: string }[]
  targetAudience: string | null
}

/** Prévia ao vivo do anúncio — consome o mesmo estado do formulário
 *  (não um exemplo fixo) e atualiza a cada tecla. "Ampliar" abre a mesma
 *  composição maior, sempre marcada como prévia privada — nunca uma
 *  simulação de compra. */
export default function LivePreviewPanel({ data }: { data: PreviewData }) {
  const [mode, setMode] = useState<'desktop' | 'mobile'>('desktop')
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="lg:sticky lg:top-4">
      <div className="rounded-2xl border bg-white p-4" style={{ borderColor: colors.border, boxShadow: '0 8px 40px rgba(11,16,32,0.06)' }}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold" style={{ color: colors.text }}>Prévia do anúncio</p>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setMode('desktop')} aria-pressed={mode === 'desktop'}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
              style={{ background: mode === 'desktop' ? '#EFF6FF' : colors.backgroundAlt, color: mode === 'desktop' ? colors.primary : colors.textSecondary }}>
              <Monitor size={13} aria-hidden="true" /> Desktop
            </button>
            <button type="button" onClick={() => setMode('mobile')} aria-pressed={mode === 'mobile'}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
              style={{ background: mode === 'mobile' ? '#EFF6FF' : colors.backgroundAlt, color: mode === 'mobile' ? colors.primary : colors.textSecondary }}>
              <Smartphone size={13} aria-hidden="true" /> Mobile
            </button>
            <button type="button" onClick={() => setExpanded(true)}
              className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: colors.primary }}>
              <Maximize2 size={12} aria-hidden="true" /> Ampliar
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1 text-[11px] font-medium" style={{ color: colors.textSecondary }}>
          <Lock size={11} aria-hidden="true" /> Prévia privada
        </div>

        <div className="mt-3 overflow-y-auto rounded-xl border" style={{ borderColor: colors.borderLight, maxHeight: 560 }}>
          <div className={mode === 'mobile' ? 'mx-auto max-w-[320px]' : ''}>
            <PreviewCard data={data} />
          </div>
        </div>
      </div>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-lg border" style={{ borderColor: colors.border }}>
          <DialogHeader>
            <DialogTitle style={{ color: colors.text }}>Prévia privada — {mode === 'mobile' ? 'Mobile' : 'Desktop'}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[75vh] overflow-y-auto">
            <div className={mode === 'mobile' ? 'mx-auto max-w-[320px]' : ''}>
              <PreviewCard data={data} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PreviewCard({ data }: { data: PreviewData }) {
  return (
    <div className="space-y-4 p-5 text-sm">
      <div className="flex items-start gap-3 border-b pb-4" style={{ borderColor: colors.borderLight }}>
        {data.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg" style={{ background: colors.backgroundAlt }}>
            <Package2 size={20} style={{ color: colors.textMuted }} aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate font-bold" style={{ color: colors.text }}>{data.name || 'Nome do aplicativo'}</p>
          <p className="truncate text-xs" style={{ color: colors.textSecondary }}>
            Por {data.vendorName || '—'}{data.category ? ` · ${data.category}` : ''}
          </p>
        </div>
      </div>

      <p className="font-semibold" style={{ color: data.shortDescription ? colors.text : colors.textMuted }}>
        {data.shortDescription || 'Descrição curta aparecerá aqui.'}
      </p>

      {data.mainImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.mainImageUrl} alt="" className="aspect-video w-full rounded-lg object-cover" />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-lg" style={{ background: colors.backgroundAlt }}>
          <p className="text-xs" style={{ color: colors.textMuted }}>Imagem principal</p>
        </div>
      )}

      {data.benefits.filter(b => b.title?.trim()).length > 0 && (
        <div className="space-y-1">
          {data.benefits.filter(b => b.title?.trim()).map((b, i) => (
            <div key={i} className="flex items-start gap-2 text-xs" style={{ color: colors.textSecondary }}>
              <span style={{ color: colors.primary }}>✓</span> {b.title}
            </div>
          ))}
        </div>
      )}

      {data.features.filter(f => f.name?.trim()).length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold" style={{ color: colors.text }}>Funcionalidades</p>
          <ul className="space-y-0.5 text-xs" style={{ color: colors.textSecondary }}>
            {data.features.filter(f => f.name?.trim()).map((f, i) => <li key={i}>• {f.name}</li>)}
          </ul>
        </div>
      )}

      {data.integrations.filter(i => i.name?.trim()).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.integrations.filter(i => i.name?.trim()).map((i, idx) => (
            <span key={idx} className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: colors.backgroundAlt, color: colors.text }}>{i.name}</span>
          ))}
        </div>
      )}

      {data.targetAudience?.trim() && (
        <div>
          <p className="mb-0.5 text-xs font-semibold" style={{ color: colors.text }}>Ideal para</p>
          <p className="text-xs" style={{ color: colors.textSecondary }}>{data.targetAudience}</p>
        </div>
      )}

      <p className="pt-2 text-right text-[10px]" style={{ color: colors.textMuted }}>Planos e preços serão configurados na próxima etapa.</p>
    </div>
  )
}
