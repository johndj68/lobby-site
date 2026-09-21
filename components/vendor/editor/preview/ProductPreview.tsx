'use client'

import { colors } from '@/lib/design-tokens'
import { Image as ImageIcon, Play } from 'lucide-react'

interface ProductPreviewProps {
  data: any
}

export default function ProductPreview({ data }: ProductPreviewProps) {
  return (
    <div className="space-y-4">
      {/* Logo */}
      {data?.logo_url ? (
        <img
          src={data.logo_url}
          alt={data?.name}
          className="w-12 h-12 rounded-lg object-cover"
        />
      ) : (
        <div
          className="w-12 h-12 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: colors.backgroundAlt }}
        >
          <ImageIcon size={24} style={{ color: colors.textMuted }} />
        </div>
      )}

      {/* Nome */}
      {data?.name ? (
        <h2
          className="text-lg font-bold line-clamp-2"
          style={{ color: colors.text }}
        >
          {data.name}
        </h2>
      ) : (
        <div
          className="h-6 rounded bg-gray-200"
          style={{ backgroundColor: colors.backgroundAlt }}
        />
      )}

      {/* Categoria */}
      {data?.category && (
        <p style={{ color: colors.primary }} className="text-xs font-semibold">
          {data.category}
        </p>
      )}

      {/* Descrição curta */}
      {data?.short_description ? (
        <p style={{ color: colors.textSecondary }} className="text-sm line-clamp-2">
          {data.short_description}
        </p>
      ) : (
        <div
          className="h-10 rounded bg-gray-200"
          style={{ backgroundColor: colors.backgroundAlt }}
        />
      )}

      {/* Descrição completa */}
      {data?.full_description && (
        <p style={{ color: colors.textMuted }} className="text-xs line-clamp-3">
          {data.full_description}
        </p>
      )}

      {/* Imagem principal */}
      {data?.media_gallery?.[0]?.url ? (
        <img
          src={data.media_gallery[0].url}
          alt="Prévia"
          className="w-full rounded-lg aspect-video object-cover"
        />
      ) : (
        <div
          className="w-full aspect-video rounded-lg flex items-center justify-center"
          style={{ backgroundColor: colors.backgroundAlt }}
        >
          <ImageIcon size={40} style={{ color: colors.textMuted }} />
        </div>
      )}

      {/* Vídeo */}
      {data?.video_url && (
        <div
          className="w-full aspect-video rounded-lg flex items-center justify-center bg-black/10"
          style={{ backgroundColor: colors.backgroundAlt }}
        >
          <Play size={40} style={{ color: colors.primary }} />
        </div>
      )}

      {/* Funcionalidades */}
      {data?.features?.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold" style={{ color: colors.text }}>
            Funcionalidades
          </p>
          {data.features.slice(0, 3).map((f: any, i: number) => (
            <div key={i} className="text-xs" style={{ color: colors.textSecondary }}>
              • {f.title || 'Funcionalidade'}
            </div>
          ))}
        </div>
      )}

      {/* Público-alvo */}
      {data?.target_audience && (
        <div>
          <p className="text-xs font-semibold mb-1" style={{ color: colors.text }}>
            Ideal para
          </p>
          <p className="text-xs" style={{ color: colors.textSecondary }}>
            {data.target_audience}
          </p>
        </div>
      )}

      {/* Idiomas */}
      {data?.languages?.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-1" style={{ color: colors.text }}>
            Idiomas
          </p>
          <p className="text-xs" style={{ color: colors.textSecondary }}>
            {data.languages.join(', ')}
          </p>
        </div>
      )}

      {/* Status */}
      <div
        className="p-3 rounded-lg mt-4"
        style={{ backgroundColor: colors.backgroundAlt }}
      >
        <p className="text-xs font-semibold" style={{ color: colors.text }}>
          Rascunho
        </p>
        <p className="text-xs mt-1" style={{ color: colors.textMuted }}>
          Seu rascunho ainda não está publicado.
        </p>
      </div>
    </div>
  )
}
