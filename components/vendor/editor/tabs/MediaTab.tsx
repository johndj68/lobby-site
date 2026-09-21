'use client'

import { useState, useRef } from 'react'
import { colors } from '@/lib/design-tokens'
import { Upload, X, Check, AlertCircle, Loader } from 'lucide-react'

interface MediaTabProps {
  formData: any
  onFieldChange: (field: string, value: any) => void
  draftId: string
}

export default function MediaTab({
  formData,
  onFieldChange,
  draftId,
}: MediaTabProps) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (file: File, type: 'logo' | 'main' | 'gallery') => {
    try {
      setUploading(true)
      setUploadError('')

      const formData = new FormData()
      formData.append('file', file)
      formData.append('draftId', draftId)
      formData.append('type', type)

      const response = await fetch('/api/upload-app-media', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        setUploadError(data.error || 'Erro ao fazer upload')
        return
      }

      // Update form data with new media
      if (type === 'logo') {
        onFieldChange('logo_url', data.url)
      } else if (type === 'main') {
        onFieldChange('media_gallery', [
          { url: data.url, type: 'main', alt: file.name },
        ])
      } else if (type === 'gallery') {
        const gallery = formData?.media_gallery || []
        onFieldChange('media_gallery', [
          ...gallery,
          { url: data.url, type: 'screenshot', alt: file.name },
        ])
      }
    } catch (err) {
      setUploadError((err as Error).message)
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  return (
    <div className="space-y-6">
      {/* Logo */}
      <div>
        <label className="block text-sm font-semibold mb-3" style={{ color: colors.text }}>
          Logo do aplicativo *
        </label>

        {formData?.logo_url ? (
          <div className="flex items-center gap-3 p-4 rounded-lg border" style={{ borderColor: colors.border }}>
            <img
              src={formData.logo_url}
              alt="Logo"
              className="w-16 h-16 rounded object-cover"
            />
            <div className="flex-1">
              <p style={{ color: colors.text }} className="text-sm font-semibold">
                Logo enviado
              </p>
              <p style={{ color: colors.textMuted }} className="text-xs">
                PNG, JPEG ou WebP
              </p>
            </div>
            <button
              onClick={() => onFieldChange('logo_url', null)}
              style={{ color: '#DC2626' }}
            >
              <X size={18} />
            </button>
          </div>
        ) : (
          <div
            className="p-8 border-2 border-dashed rounded-lg text-center cursor-pointer hover:opacity-70 transition"
            style={{ borderColor: colors.border }}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={40} style={{ color: colors.textMuted }} className="mx-auto mb-3" />
            <p style={{ color: colors.text }} className="font-semibold mb-1">
              Clique para upload
            </p>
            <p style={{ color: colors.textMuted }} className="text-sm">
              PNG, JPEG ou WebP (máx. 10MB)
            </p>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFileUpload(file, 'logo')
          }}
          hidden
        />
      </div>

      {/* Imagem Principal */}
      <div>
        <label className="block text-sm font-semibold mb-3" style={{ color: colors.text }}>
          Imagem principal *
        </label>

        {formData?.media_gallery?.find((m: any) => m.type === 'main')?.url ? (
          <div className="relative rounded-lg overflow-hidden">
            <img
              src={formData.media_gallery.find((m: any) => m.type === 'main')?.url}
              alt="Principal"
              className="w-full aspect-video object-cover"
            />
            <button
              onClick={() =>
                onFieldChange(
                  'media_gallery',
                  formData.media_gallery.filter((m: any) => m.type !== 'main')
                )
              }
              className="absolute top-2 right-2 p-2 rounded-lg bg-black/50"
              style={{ color: '#FFF' }}
            >
              <X size={18} />
            </button>
          </div>
        ) : (
          <div
            className="p-8 border-2 border-dashed rounded-lg text-center cursor-pointer hover:opacity-70 transition"
            style={{ borderColor: colors.border }}
            onClick={() => {
              const input = document.createElement('input')
              input.type = 'file'
              input.accept = 'image/png,image/jpeg,image/webp'
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0]
                if (file) handleFileUpload(file, 'main')
              }
              input.click()
            }}
          >
            <Upload size={40} style={{ color: colors.textMuted }} className="mx-auto mb-3" />
            <p style={{ color: colors.text }} className="font-semibold mb-1">
              Proporção 16:9 recomendada
            </p>
            <p style={{ color: colors.textMuted }} className="text-sm">
              PNG, JPEG ou WebP
            </p>
          </div>
        )}
      </div>

      {/* Galeria */}
      <div>
        <label className="block text-sm font-semibold mb-3" style={{ color: colors.text }}>
          Galeria de capturas (até 4)
        </label>

        {formData?.media_gallery?.filter((m: any) => m.type === 'screenshot').length > 0 && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            {formData.media_gallery
              .filter((m: any) => m.type === 'screenshot')
              .slice(0, 4)
              .map((img: any, idx: number) => (
                <div key={idx} className="relative rounded-lg overflow-hidden">
                  <img
                    src={img.url}
                    alt="Screenshot"
                    className="w-full aspect-video object-cover"
                  />
                  <button
                    onClick={() =>
                      onFieldChange(
                        'media_gallery',
                        formData.media_gallery.filter((_: any, i: number) => i !== idx)
                      )
                    }
                    className="absolute top-2 right-2 p-2 rounded-lg bg-black/50"
                    style={{ color: '#FFF' }}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
          </div>
        )}

        {formData?.media_gallery?.filter((m: any) => m.type === 'screenshot').length < 4 && (
          <div
            className="p-8 border-2 border-dashed rounded-lg text-center cursor-pointer hover:opacity-70 transition"
            style={{ borderColor: colors.border }}
            onClick={() => {
              const input = document.createElement('input')
              input.type = 'file'
              input.accept = 'image/png,image/jpeg,image/webp'
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0]
                if (file) handleFileUpload(file, 'gallery')
              }
              input.click()
            }}
          >
            <Upload size={40} style={{ color: colors.textMuted }} className="mx-auto mb-3" />
            <p style={{ color: colors.text }} className="font-semibold mb-1">
              Adicione capturas de tela
            </p>
            <p style={{ color: colors.textMuted }} className="text-sm">
              {4 - (formData?.media_gallery?.filter((m: any) => m.type === 'screenshot').length || 0)} restantes
            </p>
          </div>
        )}
      </div>

      {/* Vídeo */}
      <div>
        <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
          Vídeo demonstrativo
        </label>
        <input
          type="url"
          value={formData?.video_url || ''}
          onChange={(e) => onFieldChange('video_url', e.target.value)}
          placeholder="https://youtube.com/watch?v=..."
          className="w-full px-4 py-2 border rounded-lg text-sm"
          style={{ borderColor: colors.border }}
        />
        <p className="text-xs mt-1" style={{ color: colors.textMuted }}>
          URL do YouTube ou Vimeo.
        </p>
      </div>

      {/* Upload Status */}
      {uploading && (
        <div className="flex items-center gap-2 p-3 rounded-lg" style={{ backgroundColor: colors.backgroundAlt }}>
          <Loader size={16} className="animate-spin" style={{ color: colors.primary }} />
          <span style={{ color: colors.text }} className="text-sm">
            Enviando… {uploadProgress}%
          </span>
        </div>
      )}

      {uploadError && (
        <div
          className="p-3 rounded-lg flex gap-2"
          style={{ backgroundColor: '#FEE2E2' }}
        >
          <AlertCircle size={16} style={{ color: '#DC2626' }} />
          <p style={{ color: '#991B1B' }} className="text-sm">
            {uploadError}
          </p>
        </div>
      )}
    </div>
  )
}
