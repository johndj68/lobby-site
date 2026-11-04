'use client'

import Link from 'next/link'
import Container from '@/components/layout/Container'
import { colors } from '@/lib/design-tokens'
import { CATEGORY_ICON_MAP, DEFAULT_CATEGORY_ICON } from '@/lib/category-icons'

interface Category { id: string; name: string; slug: string; icon: string | null }

export default function MarketplaceCategoriesSection({ categories }: { categories: Category[] }) {
  if (categories.length === 0) return null

  return (
    <section className="py-16 lg:py-20 bg-white">
      <Container>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {categories.map(({ id, name, slug, icon }, index) => {
            const Icon = (icon && CATEGORY_ICON_MAP[icon]) || DEFAULT_CATEGORY_ICON
            // Alterna preto/petróleo entre os cards — mesma variação usada nos cards de Soluções
            const accent = index % 2 === 0 ? colors.primary : colors.secondaryLight
            return (
              <Link
                key={id}
                href={`/?categoria=${slug}#explore-apps`}
                className="group flex flex-col items-center text-center p-6 rounded-2xl border transition-all hover:shadow-md"
                style={{ borderColor: colors.border }}
              >
                <div
                  className="p-3 rounded-full mb-3 group-hover:scale-110 transition-transform"
                  style={{ backgroundColor: `${accent}15` }}
                >
                  <Icon size={24} style={{ color: accent }} />
                </div>
                <h3 className="font-semibold text-sm" style={{ color: colors.text }}>
                  {name}
                </h3>
              </Link>
            )
          })}
        </div>
      </Container>
    </section>
  )
}
