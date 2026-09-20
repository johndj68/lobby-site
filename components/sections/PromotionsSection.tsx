'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Heart, ArrowRight } from 'lucide-react'
import Container from '@/components/layout/Container'
import { colors } from '@/lib/design-tokens'

interface PromotionApp {
  id: string
  promo_price: number
  original_price?: number
  discount_percentage?: number
  application: Array<{
    id: string
    slug: string
    name: string
    category: string
    logo_url?: string
    preview_image_url?: string
    price?: number
    billing_period?: string
  }>
}

export default function PromotionsSection({
  promotions = [],
}: {
  promotions?: PromotionApp[]
}) {
  if (!promotions || promotions.length === 0) return null

  return (
    <section
      id="promotions"
      className="py-16 lg:py-20 bg-white"
    >
      <Container>
        <div className="space-y-8">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <h2 className="text-2xl lg:text-3xl font-bold" style={{ color: colors.text }}>
                Apps em promoção hoje
              </h2>
              <p style={{ color: colors.textSecondary }}>
                Ofertas para encontrar sua próxima ferramenta.
              </p>
            </div>
            <Link
              href="/promocoes"
              className="flex items-center gap-1 font-semibold text-sm transition-colors hover:opacity-70"
              style={{ color: colors.primary }}
            >
              Ver promoções
              <ArrowRight size={16} />
            </Link>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {promotions.slice(0, 4).map((promo) => {
              const app = promo.application?.[0]
              if (!app) return null
              return (
                <Link
                key={promo.id}
                href={`/app/${app.slug}`}
                className="group flex flex-col overflow-hidden rounded-2xl border transition-all hover:shadow-lg hover:border-opacity-50"
                style={{ borderColor: colors.border }}
              >
                {/* Image */}
                <div className="relative w-full aspect-square overflow-hidden" style={{ backgroundColor: colors.backgroundAlt }}>
                  {app.preview_image_url ? (
                    <Image
                      src={app.preview_image_url}
                      alt={app.name}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-4xl opacity-20 mb-2">📦</div>
                        <p className="text-xs" style={{ color: colors.textMuted }}>
                          Sem preview
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Promo badge */}
                  <div
                    className="absolute top-3 right-3 text-xs font-bold px-3 py-1 rounded-full"
                    style={{
                      backgroundColor: '#FEA000',
                      color: 'white',
                    }}
                  >
                    Oferta do dia
                  </div>

                  {/* Favorite button */}
                  <button
                    className="absolute top-3 left-3 p-2 rounded-full bg-white/80 backdrop-blur transition-colors hover:bg-white"
                    aria-label="Favoritar"
                    onClick={(e) => e.preventDefault()}
                  >
                    <Heart size={18} style={{ color: colors.primary }} />
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 p-4 flex flex-col gap-3">
                  {/* Category */}
                  <div
                    className="text-xs font-semibold px-2 py-1 rounded-full w-fit"
                    style={{
                      backgroundColor: `${colors.primary}15`,
                      color: colors.primary,
                    }}
                  >
                    {app.category}
                  </div>

                  {/* Name */}
                  <div>
                    <h3 className="font-semibold line-clamp-2" style={{ color: colors.text }}>
                      {app.name}
                    </h3>
                  </div>

                  {/* Pricing */}
                  <div className="pt-2 border-t mt-auto" style={{ borderColor: colors.border }}>
                    <div className="flex items-baseline gap-2">
                      <div className="text-lg font-bold" style={{ color: colors.primary }}>
                        R$ {promo.promo_price.toFixed(2).replace('.', ',')}
                      </div>
                      {promo.original_price && promo.original_price > promo.promo_price && (
                        <div className="text-sm line-through" style={{ color: colors.textMuted }}>
                          R$ {promo.original_price.toFixed(2).replace('.', ',')}
                        </div>
                      )}
                    </div>
                    {app.billing_period && (
                      <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                        {app.billing_period === 'one-time' ? 'pagamento único' : `por ${app.billing_period}`}
                      </p>
                    )}
                  </div>

                  {/* CTA */}
                  <button
                    className="w-full mt-4 px-4 py-2 rounded-full font-semibold text-white text-sm transition-all hover:shadow-md"
                    style={{ backgroundColor: colors.primary }}
                  >
                    Ver oferta
                  </button>
                </div>
              </Link>
            )
            })}
          </div>
        </div>
      </Container>
    </section>
  )
}
