'use client'

import { useState } from 'react'
import { colors } from '@/lib/design-tokens'

interface MediaTabProps {
  formData: any
  onChange: (field: string, value: any) => void
  appId: string
}

export default function MediaTab({ formData, onChange, appId }: MediaTabProps) {
  const [uploading, setUploading] = useState(false)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('appId', appId)

      const res = await fetch('/api/apps/media/upload', {
        method: 'POST',
        body: form,
      })

      if (!res.ok) throw new Error('Upload failed')

      const { url } = await res.json()

      const images = formData.images || []
      onChange('images', [...images, { url, name: file.name }])
    } catch (err) {
      alert('Erro ao fazer upload')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
          Galeria de imagens
        </label>
        <p className="text-xs mb-4" style={{ color: colors.textSecondary }}>
          Adicione screenshots, logos e imagens do seu app.
        </p>

        <div
          className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-gray-50"
          style={{ borderColor: colors.border }}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <p style={{ color: colors.text }} className="font-semibold">
            + Clique para adicionar imagens
          </p>
          <p style={{ color: colors.textSecondary }} className="text-sm">
            Ou arraste arquivos aqui
          </p>
        </div>

        <input
          id="file-input"
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          disabled={uploading}
          hidden
        />
      </div>

      {formData.images && formData.images.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-3" style={{ color: colors.text }}>
            Imagens adicionadas ({formData.images.length})
          </p>
          <div className="grid grid-cols-3 gap-4">
            {formData.images.map((img: any, i: number) => (
              <div key={i} className="relative group">
                <img
                  src={img.url}
                  alt={img.name}
                  className="w-full h-32 object-cover rounded-lg"
                />
                <button
                  onClick={() => {
                    onChange(
                      'images',
                      formData.images.filter((_: any, idx: number) => idx !== i)
                    )
                  }}
                  className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded opacity-0 group-hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
