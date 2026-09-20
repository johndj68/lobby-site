'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { ArrowRight, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Container from '@/components/layout/Container'
import { colors } from '@/lib/design-tokens'

export default function MarketplaceHero() {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const term = searchTerm.trim()
    if (!term) return
    router.push(`/busca?q=${encodeURIComponent(term)}`)
  }

  useEffect(() => {
    searchInputRef.current?.focus()
  }, [])

  return (
    <section className="relative overflow-hidden pt-8 pb-16 lg:pb-24" style={{ backgroundColor: colors.backgroundAlt }}>
      <Container className="relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left: Text content */}
          <div className="space-y-8">
            {/* Eyebrow */}
            <div className="text-sm font-semibold tracking-wide uppercase" style={{ color: colors.textSecondary }}>
              Software para o seu próximo passo
            </div>

            {/* Main headline — split color */}
            <h1 className="leading-tight">
              <div className="text-4xl md:text-5xl lg:text-6xl font-bold mb-2" style={{ color: colors.text }}>
                Grandes apps.
              </div>
              <div className="text-4xl md:text-5xl lg:text-6xl font-bold" style={{ color: colors.primary }}>
                Novas possibilidades.
              </div>
            </h1>

            {/* Subtitle */}
            <p className="text-lg leading-relaxed" style={{ color: colors.textSecondary, maxWidth: '480px' }}>
              Descubra ferramentas da LOBBY e de parceiros para trabalhar melhor e fazer seu negócio crescer.
            </p>

            {/* Search bar */}
            <form onSubmit={handleSearch} className="relative">
              <div className="relative flex items-center">
                <Search size={20} className="absolute left-4" style={{ color: colors.textMuted }} />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Busque apps, ferramentas e soluções"
                  className="w-full pl-12 pr-4 py-3 border rounded-2xl text-base focus:outline-none focus:ring-4 focus:ring-[#005BFF]/10 focus:border-[#005BFF]/40"
                  style={{
                    borderColor: colors.border,
                    backgroundColor: 'white',
                  }}
                />
              </div>
            </form>

            {/* CTA buttons */}
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Link
                href="#explore-apps"
                className="inline-flex items-center justify-center px-6 py-3 rounded-full font-semibold text-white gap-2 transition-all hover:shadow-lg"
                style={{ backgroundColor: colors.primary }}
              >
                Explorar aplicativos
                <ArrowRight size={18} />
              </Link>
              <Link
                href="#promotions"
                className="inline-flex items-center justify-center px-6 py-3 rounded-full font-semibold gap-2 transition-all border"
                style={{
                  color: colors.primary,
                  borderColor: colors.primary,
                  backgroundColor: 'white',
                }}
              >
                Ver ofertas
                <ArrowRight size={18} />
              </Link>
            </div>
          </div>

          {/* Right: Visual placeholder (apps showcase) */}
          <div className="relative h-[400px] lg:h-[500px] hidden lg:block">
            <div
              className="absolute inset-0 rounded-3xl border overflow-hidden flex items-center justify-center"
              style={{ borderColor: colors.border, backgroundColor: colors.background }}
            >
              <div className="text-center space-y-4">
                <div
                  className="text-sm font-semibold opacity-50"
                  style={{ color: colors.textSecondary }}
                >
                  Aplicativos em ação
                </div>
                <div
                  className="text-4xl opacity-20"
                  style={{ color: colors.textMuted }}
                >
                  ✨
                </div>
                <p
                  className="text-sm"
                  style={{ color: colors.textMuted }}
                >
                  Imagens e previews dos apps<br />serão exibidas aqui
                </p>
              </div>
            </div>
          </div>
        </div>
      </Container>

      {/* Decorative background elements */}
      <div className="absolute -left-32 top-1/4 h-72 w-72 rounded-full blur-3xl opacity-5" style={{ backgroundColor: colors.primary }} aria-hidden="true" />
      <div className="absolute -right-32 bottom-0 h-96 w-96 rounded-full blur-3xl opacity-5" style={{ backgroundColor: colors.secondary }} aria-hidden="true" />
    </section>
  )
}
