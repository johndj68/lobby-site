'use client'

import { colors } from '@/lib/design-tokens'
import { Upload } from 'lucide-react'

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
  return (
    <div className="space-y-6">
      <div
        className="p-8 border-2 border-dashed rounded-lg text-center"
        style={{ borderColor: colors.border }}
      >
        <Upload size={40} style={{ color: colors.textMuted }} className="mx-auto mb-3" />
        <p style={{ color: colors.text }} className="font-semibold mb-1">
          Logo do aplicativo
        </p>
        <p style={{ color: colors.textMuted }} className="text-sm">
          PNG, JPEG ou WebP (máx. 5MB)
        </p>
      </div>

      <div
        className="p-8 border-2 border-dashed rounded-lg text-center"
        style={{ borderColor: colors.border }}
      >
        <Upload size={40} style={{ color: colors.textMuted }} className="mx-auto mb-3" />
        <p style={{ color: colors.text }} className="font-semibold mb-1">
          Imagem principal
        </p>
        <p style={{ color: colors.textMuted }} className="text-sm">
          Proporção 16:9 recomendada
        </p>
      </div>

      <div>
        <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
          Galeria de capturas
        </label>
        <div
          className="p-8 border-2 border-dashed rounded-lg text-center"
          style={{ borderColor: colors.border }}
        >
          <Upload size={40} style={{ color: colors.textMuted }} className="mx-auto mb-3" />
          <p style={{ color: colors.textMuted }} className="text-sm">
            Arraste até 4 capturas de tela
          </p>
        </div>
      </div>

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
    </div>
  )
}
