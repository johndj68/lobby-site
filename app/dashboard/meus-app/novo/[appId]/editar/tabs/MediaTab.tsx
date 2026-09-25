'use client'

import { useState } from 'react'
import { ImagePlus, X, UploadCloud } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import Field from '@/components/vendor/editor/Field'
import type { DraftFormData } from '../types'

interface Props {
  formData: DraftFormData
  onChange: <K extends keyof DraftFormData>(field: K, value: DraftFormData[K]) => void
  appId: string
  onUploadingChange?: (uploading: boolean) => void
}

async function uploadFile(file: File, appId: string): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  form.append('appId', appId)
  const res = await fetch('/api/apps/media/upload', { method: 'POST', body: form })
  if (!res.ok) throw new Error('upload failed')
  const { url } = await res.json()
  return url as string
}

export default function MediaTab({ formData, onChange, appId, onUploadingChange }: Props) {
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingGallery, setUploadingGallery] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingLogo(true)
    onUploadingChange?.(true)
    setUploadError(null)
    try {
      const url = await uploadFile(file, appId)
      onChange('logo_url', url)
    } catch {
      setUploadError('Não foi possível enviar o logo. Tente novamente.')
    } finally {
      setUploadingLogo(false)
      onUploadingChange?.(false)
    }
  }

  async function handleGalleryUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingGallery(true)
    onUploadingChange?.(true)
    setUploadError(null)
    try {
      const url = await uploadFile(file, appId)
      onChange('media_gallery', [...formData.media_gallery, { url, alt_text: file.name, type: formData.media_gallery.length === 0 ? 'main' : 'screenshot' }])
    } catch {
      setUploadError('Não foi possível enviar a imagem. Tente novamente.')
    } finally {
      setUploadingGallery(false)
      onUploadingChange?.(false)
    }
  }

  function removeGalleryImage(idx: number) {
    onChange('media_gallery', formData.media_gallery.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-8">
      <section>
        <Field label="Logo" required help="Aparece na listagem e no cabeçalho do anúncio. Recomendado: imagem quadrada.">
          <div id="f-logo" tabIndex={-1} className="flex items-center gap-4">
            {formData.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={formData.logo_url} alt="Logo atual" className="h-16 w-16 rounded-lg object-cover" style={{ border: `1px solid ${colors.border}` }} />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg" style={{ background: colors.backgroundAlt, border: `1px solid ${colors.border}` }}>
                <ImagePlus size={22} style={{ color: colors.textMuted }} aria-hidden="true" />
              </div>
            )}
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold" style={{ borderColor: colors.border, color: colors.text }}>
              <UploadCloud size={14} aria-hidden="true" />
              {uploadingLogo ? 'Enviando…' : formData.logo_url ? 'Trocar logo' : 'Enviar logo'}
              <input type="file" accept="image/*" hidden disabled={uploadingLogo} onChange={handleLogoUpload} />
            </label>
          </div>
        </Field>
      </section>

      <section className="border-t pt-6" style={{ borderColor: colors.borderLight }}>
        <Field label="Galeria de imagens" required help="Screenshots e imagens do seu app. A primeira imagem é usada como destaque principal na prévia.">
          <label
            id="f-gallery" tabIndex={-1}
            className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed p-8 text-center hover:bg-gray-50"
            style={{ borderColor: colors.border }}
          >
            <p className="font-semibold" style={{ color: colors.text }}>{uploadingGallery ? 'Enviando…' : '+ Clique para adicionar imagens'}</p>
            <p className="text-sm" style={{ color: colors.textSecondary }}>PNG ou JPG</p>
            <input type="file" accept="image/*" hidden disabled={uploadingGallery} onChange={handleGalleryUpload} />
          </label>

          {uploadError && <p className="mt-2 text-xs font-medium" style={{ color: '#DC2626' }}>{uploadError}</p>}

          {formData.media_gallery.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold" style={{ color: colors.text }}>Imagens adicionadas ({formData.media_gallery.length})</p>
              <div className="grid grid-cols-3 gap-3">
                {formData.media_gallery.map((img, i) => (
                  <div key={i} className="group relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={img.alt_text || ''} className="h-24 w-full rounded-lg object-cover" />
                    {img.type === 'main' && (
                      <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">Principal</span>
                    )}
                    <button type="button" onClick={() => removeGalleryImage(i)} aria-label="Remover imagem"
                      className="absolute right-1 top-1 rounded bg-red-500 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <X size={12} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Field>
      </section>

      <section className="border-t pt-6" style={{ borderColor: colors.borderLight }}>
        <Field label="Vídeo de demonstração" help="Opcional. Link do YouTube ou Vimeo." htmlFor="f-video">
          <input id="f-video" type="url" value={formData.video_url || ''} onChange={e => onChange('video_url', e.target.value)}
            placeholder="https://youtube.com/watch?v=…" className="w-full rounded-lg border px-4 py-2 text-sm" style={{ borderColor: colors.border, color: colors.text }} />
        </Field>
      </section>
    </div>
  )
}
