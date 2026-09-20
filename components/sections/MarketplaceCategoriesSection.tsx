'use client'

import Link from 'next/link'
import { Zap, Settings2, BarChart3, Shield, Sparkles, TrendingUp } from 'lucide-react'
import Container from '@/components/layout/Container'
import { colors } from '@/lib/design-tokens'

const categories = [
  {
    name: 'Inteligência artificial',
    slug: 'inteligencia-artificial',
    icon: Sparkles,
    color: '#005BFF',
  },
  {
    name: 'Automação',
    slug: 'automacao',
    icon: Settings2,
    color: '#7B2CFF',
  },
  {
    name: 'Marketing',
    slug: 'marketing',
    icon: TrendingUp,
    color: '#00A3FF',
  },
  {
    name: 'Gestão e finanças',
    slug: 'gestao-finanças',
    icon: BarChart3,
    color: '#059669',
  },
  {
    name: 'Dados e BI',
    slug: 'dados-bi',
    icon: Zap,
    color: '#D97706',
  },
  {
    name: 'Segurança',
    slug: 'seguranca',
    icon: Shield,
    color: '#DC2626',
  },
]

export default function MarketplaceCategoriesSection() {
  return (
    <section className="py-16 lg:py-20 bg-white">
      <Container>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {categories.map(({ name, slug, icon: Icon, color }) => (
            <Link
              key={slug}
              href={`#explore-apps?category=${slug}`}
              className="group flex flex-col items-center text-center p-6 rounded-2xl border transition-all hover:shadow-md"
              style={{ borderColor: colors.border }}
            >
              <div
                className="p-3 rounded-full mb-3 group-hover:scale-110 transition-transform"
                style={{ backgroundColor: `${color}15` }}
              >
                <Icon size={24} style={{ color }} />
              </div>
              <h3 className="font-semibold text-sm" style={{ color: colors.text }}>
                {name}
              </h3>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  )
}
