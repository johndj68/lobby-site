'use client'

import { colors } from '@/lib/design-tokens'
import { Image as ImageIcon, Play, Package2 } from 'lucide-react'

interface ProductPreviewProps {
  data: any
}

export default function ProductPreview({ data }: ProductPreviewProps) {
  const mainImage = data?.media_gallery?.find((m: any) => m.type === 'main')
  const screenshots = data?.media_gallery?.filter((m: any) => m.type === 'screenshot') || []

  return (
    <div className="space-y-5 text-sm">
      {/* Logo + Header */}
      <div>
        <div className="flex items-start gap-3 mb-3">
          {data?.logo_url ? (
            <img
              src={data.logo_url}
              alt={data?.name}
              className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
            />
          ) : (
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: colors.backgroundAlt }}
            >
              <Package2 size={24} style={{ color: colors.textMuted }} />
            </div>
          )}

          <div className="flex-1">
            {data?.name ? (
              <h2 className="font-bold line-clamp-1" style={{ color: colors.text }}>
                {data.name}
              </h2>
            ) : (
              <div className="h-5 w-32 rounded bg-gray-200" style={{ backgroundColor: colors.backgroundAlt }} />
            )}

            {data?.category && (
              <p style={{ color: colors.primary }} className="text-xs font-semibold mt-1">
                {data.category}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Short description */}
      {data?.short_description && (
        <p style={{ color: colors.textSecondary }} className="text-xs line-clamp-2">
          {data.short_description}
        </p>
      )}

      {/* Callout */}
      {data?.callout && (
        <div
          className="p-2 rounded-lg text-xs"
          style={{ backgroundColor: `${colors.primary}15`, color: colors.primary }}
        >
          {data.callout}
        </div>
      )}

      {/* Differentiator */}
      {data?.differentiator && (
        <div>
          <p className="text-xs font-semibold mb-1" style={{ color: colors.text }}>
            O diferencial
          </p>
          <p style={{ color: colors.textSecondary }} className="text-xs line-clamp-2">
            {data.differentiator}
          </p>
        </div>
      )}

      {/* Benefits */}
      {(data?.benefit_one || data?.benefit_two) && (
        <div className="space-y-1">
          <p className="text-xs font-semibold" style={{ color: colors.text }}>
            Benefícios
          </p>
          {data?.benefit_one && (
            <p style={{ color: colors.textSecondary }} className="text-xs flex items-start gap-2">
              <span style={{ color: colors.primary }}>✓</span>
              {data.benefit_one}
            </p>
          )}
          {data?.benefit_two && (
            <p style={{ color: colors.textSecondary }} className="text-xs flex items-start gap-2">
              <span style={{ color: colors.primary }}>✓</span>
              {data.benefit_two}
            </p>
          )}
        </div>
      )}

      {/* Divider */}
      <div style={{ borderColor: colors.border }} className="border-t" />

      {/* Main image */}
      {mainImage?.url ? (
        <img
          src={mainImage.url}
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

      {/* Video */}
      {data?.video_url && (
        <div
          className="w-full aspect-video rounded-lg flex items-center justify-center"
          style={{ backgroundColor: colors.backgroundAlt }}
        >
          <Play size={40} style={{ color: colors.primary }} />
        </div>
      )}

      {/* Screenshots gallery */}
      {screenshots.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: colors.text }}>
            Capturas
          </p>
          <div className="grid grid-cols-2 gap-2">
            {screenshots.slice(0, 4).map((img: any, i: number) => (
              <img
                key={i}
                src={img.url}
                alt={`Screenshot ${i + 1}`}
                className="w-full rounded-lg aspect-video object-cover"
              />
            ))}
          </div>
        </div>
      )}

      {/* Features */}
      {data?.features?.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: colors.text }}>
            Funcionalidades principais
          </p>
          <div className="space-y-1">
            {data.features.slice(0, 3).map((f: any, i: number) => (
              <div key={i} className="text-xs" style={{ color: colors.textSecondary }}>
                • {f.title || 'Funcionalidade'}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Integrations */}
      {data?.integrations?.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: colors.text }}>
            Integrações
          </p>
          <div className="flex flex-wrap gap-1">
            {data.integrations.slice(0, 5).map((int: string, i: number) => (
              <span
                key={i}
                className="px-2 py-1 rounded-full text-xs"
                style={{ backgroundColor: colors.backgroundAlt, color: colors.text }}
              >
                {int}
              </span>
            ))}
          </div>
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

      {/* Languages */}
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

      {/* Trust signals */}
      {data?.trust_signals?.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: colors.text }}>
            Sobre
          </p>
          <div className="space-y-1">
            {data.trust_signals.slice(0, 3).map((signal: any, i: number) => (
              <a
                key={i}
                href={signal.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs underline block"
                style={{ color: colors.primary }}
              >
                {signal.title}
              </a>
            ))}
          </div>
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
