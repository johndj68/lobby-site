'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Heart, ArrowRight, ChevronDown, Loader } from 'lucide-react'
import Container from '@/components/layout/Container'
import { colors } from '@/lib/design-tokens'

interface AppCard {
  id: string
  slug: string
  name: string
  logo_url?: string
  preview_image_url?: string
  category: string
  developer_name: string
  short_description?: string
  price?: number
  billing_period?: string
  is_lobby_made?: boolean
}

const CATEGORIES = [
  'Todos',
  'Inteligência artificial',
  'Automação',
  'Marketing',
  'Produtividade',
  'Dados',
]

const SORT_OPTIONS = [
  { label: 'Mais recentes', value: 'newest' },
  { label: 'Preço: menor para maior', value: 'price-asc' },
  { label: 'Preço: maior para menor', value: 'price-desc' },
]

export default function ExploreAllAppsSection({
  initialApps = [],
}: {
  initialApps?: AppCard[]
}) {
  const [apps, setApps] = useState<AppCard[]>(initialApps)
  const [selectedCategory, setSelectedCategory] = useState('Todos')
  const [sortBy, setSortBy] = useState('newest')
  const [isLoading, setIsLoading] = useState(false)
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [displayed, setDisplayed] = useState(8)

  // Filter and sort
  const filtered = apps
    .filter(
      (app) =>
        selectedCategory === 'Todos' || app.category === selectedCategory
    )
    .sort((a, b) => {
      if (sortBy === 'price-asc') {
        return (a.price ?? 0) - (b.price ?? 0)
      }
      if (sortBy === 'price-desc') {
        return (b.price ?? 0) - (a.price ?? 0)
      }
      return 0
    })

  const visibleApps = filtered.slice(0, displayed)
  const hasMore = displayed < filtered.length

  return (
    <section
      id="explore-apps"
      className="py-16 lg:py-20"
      style={{ backgroundColor: colors.backgroundAlt }}
    >
      <Container>
        <div className="space-y-8">
          {/* Header */}
          <div className="space-y-2">
            <h2 className="text-2xl lg:text-3xl font-bold" style={{ color: colors.text }}>
              Explore todos os aplicativos
            </h2>
          </div>

          {/* Filters */}
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            {/* Categories */}
            <div className="flex gap-2 overflow-x-auto pb-2 lg:pb-0 w-full lg:w-auto">
              {CATEGORIES.map((category) => (
                <button
                  key={category}
                  onClick={() => {
                    setSelectedCategory(category)
                    setDisplayed(8)
                  }}
                  className="px-4 py-2 rounded-full font-semibold whitespace-nowrap transition-colors text-sm"
                  style={{
                    backgroundColor:
                      selectedCategory === category ? colors.primary : colors.background,
                    color:
                      selectedCategory === category ? 'white' : colors.text,
                    borderColor:
                      selectedCategory === category
                        ? colors.primary
                        : colors.border,
                    border:
                      selectedCategory === category ? 'none' : `1px solid ${colors.border}`,
                  }}
                >
                  {category}
                </button>
              ))}
            </div>

            {/* Sort dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowSortMenu(!showSortMenu)}
                className="flex items-center gap-2 px-4 py-2 rounded-full border font-semibold text-sm transition-colors hover:bg-gray-50"
                style={{ borderColor: colors.border, color: colors.text }}
              >
                {SORT_OPTIONS.find((opt) => opt.value === sortBy)?.label}
                <ChevronDown
                  size={16}
                  style={{
                    transform: showSortMenu ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s',
                  }}
                />
              </button>

              {/* Dropdown menu */}
              {showSortMenu && (
                <div
                  className="absolute top-full mt-2 right-0 rounded-xl border shadow-lg z-10 overflow-hidden"
                  style={{ borderColor: colors.border, backgroundColor: colors.background }}
                >
                  {SORT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setSortBy(option.value)
                        setShowSortMenu(false)
                      }}
                      className="block w-full text-left px-4 py-2 text-sm font-semibold transition-colors hover:bg-gray-50"
                      style={{
                        backgroundColor:
                          sortBy === option.value
                            ? colors.backgroundAlt
                            : colors.background,
                        color: colors.text,
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {visibleApps.length > 0 ? (
              visibleApps.map((app) => (
                <Link
                  key={app.id}
                  href={`/app/${app.slug}`}
                  className="group flex flex-col overflow-hidden rounded-2xl border transition-all hover:shadow-lg"
                  style={{ borderColor: colors.border }}
                >
                  {/* Image */}
                  <div
                    className="relative w-full aspect-square overflow-hidden"
                    style={{ backgroundColor: colors.backgroundAlt }}
                  >
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
                          <div className="text-4xl opacity-20 mb-2">📱</div>
                          <p className="text-xs" style={{ color: colors.textMuted }}>
                            Sem preview
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Favorite button */}
                    <button
                      className="absolute top-3 right-3 p-2 rounded-full bg-white/80 backdrop-blur transition-colors hover:bg-white"
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

                    {/* Name and developer */}
                    <div>
                      <h3
                        className="font-semibold line-clamp-2 mb-1"
                        style={{ color: colors.text }}
                      >
                        {app.name}
                      </h3>
                      <p
                        className="text-xs"
                        style={{ color: colors.textSecondary }}
                      >
                        {app.developer_name}
                        {app.is_lobby_made && (
                          <span
                            className="ml-1 font-bold"
                            style={{ color: colors.primary }}
                          >
                            · Desenvolvido pela LOBBY
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Description */}
                    {app.short_description && (
                      <p
                        className="text-sm line-clamp-2"
                        style={{ color: colors.textSecondary }}
                      >
                        {app.short_description}
                      </p>
                    )}

                    {/* Pricing */}
                    {app.price !== undefined && (
                      <div className="pt-2 border-t mt-auto" style={{ borderColor: colors.border }}>
                        <div className="flex items-baseline gap-2">
                          <div className="font-bold" style={{ color: colors.primary }}>
                            R$ {app.price.toFixed(2).replace('.', ',')}
                          </div>
                        </div>
                        {app.billing_period && (
                          <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                            {app.billing_period === 'one-time' ? 'pagamento único' : `por ${app.billing_period}`}
                          </p>
                        )}
                      </div>
                    )}

                    {/* CTA */}
                    <button
                      className="w-full mt-4 px-4 py-2 rounded-full font-semibold text-white text-sm transition-all hover:shadow-md"
                      style={{ backgroundColor: colors.primary }}
                    >
                      Conhecer app
                    </button>
                  </div>
                </Link>
              ))
            ) : (
              <div
                className="col-span-full text-center py-12"
                style={{ color: colors.textSecondary }}
              >
                <p className="mb-2">Nenhum aplicativo encontrado</p>
                <p className="text-sm">Tente outra categoria ou filtro</p>
              </div>
            )}
          </div>

          {/* Load more button */}
          {hasMore && (
            <div className="text-center pt-4">
              <button
                onClick={() => setDisplayed((prev) => prev + 8)}
                disabled={isLoading}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-semibold border transition-all hover:shadow-md disabled:opacity-50"
                style={{
                  borderColor: colors.primary,
                  color: colors.primary,
                  backgroundColor: 'transparent',
                }}
              >
                {isLoading && <Loader size={18} className="animate-spin" />}
                Carregar mais aplicativos
              </button>
            </div>
          )}
        </div>
      </Container>
    </section>
  )
}
