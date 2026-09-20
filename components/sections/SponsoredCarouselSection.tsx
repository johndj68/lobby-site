'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import Container from '@/components/layout/Container'
import { colors } from '@/lib/design-tokens'

interface SponsoredApp {
  id: string
  application_id: string
  title: string
  description: string
  campaign_image_url?: string
  starts_at: string
  ends_at: string
  application: Array<{
    id: string
    name: string
    slug: string
    category: string
    logo_url?: string
    price?: number
    billing_period?: string
  }>
}

const AUTOPLAY_INTERVAL = 6000

export default function SponsoredCarouselSection({
  campaigns = [],
}: {
  campaigns?: SponsoredApp[]
}) {
  if (!campaigns || campaigns.length === 0) return null

  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const [isPaused, setIsPaused] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const pageVisibilityRef = useRef(!document.hidden)

  const goToSlide = (index: number) => {
    setCurrentIndex(index % campaigns.length)
  }

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % campaigns.length)
  }, [campaigns.length])

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + campaigns.length) % campaigns.length)
  }

  const handlePlay = () => {
    setIsPaused(false)
    setIsPlaying(true)
  }

  const handlePause = () => {
    setIsPaused(true)
    setIsPlaying(false)
  }

  // Autoplay logic
  useEffect(() => {
    if (!isPlaying || isPaused || !pageVisibilityRef.current) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    intervalRef.current = setInterval(nextSlide, AUTOPLAY_INTERVAL)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isPlaying, isPaused, nextSlide])

  // Page visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      pageVisibilityRef.current = !document.hidden
      if (document.hidden) {
        if (intervalRef.current) clearInterval(intervalRef.current)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // Respect prefers-reduced-motion
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (mediaQuery.matches) {
      setIsPlaying(false)
    }

    const handleChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsPlaying(false)
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  // Handle mouse enter/leave
  const handleMouseEnter = () => handlePause()
  const handleMouseLeave = () => !isPaused && handlePlay()

  const current = campaigns[currentIndex]
  const app = current?.application?.[0]

  if (!current || !app) return null

  return (
    <section
      className="py-16 lg:py-20"
      style={{ backgroundColor: colors.backgroundAlt }}
    >
      <Container>
        <div className="space-y-6">
          {/* Header */}
          <div className="space-y-2">
            <h2 className="text-2xl lg:text-3xl font-bold" style={{ color: colors.text }}>
              Apps em destaque
            </h2>
            <p style={{ color: colors.textSecondary }}>
              Conheça as soluções dos nossos parceiros
            </p>
          </div>

          {/* Carousel */}
          <div
            className="relative rounded-3xl overflow-hidden border p-8 lg:p-12 flex flex-col lg:flex-row gap-8 items-center"
            style={{
              borderColor: colors.border,
              backgroundColor: colors.background,
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {/* "Patrocinado" badge */}
            <div
              className="absolute top-4 left-4 text-xs font-semibold px-3 py-1 rounded-full"
              style={{
                backgroundColor: `${colors.primary}20`,
                color: colors.primary,
              }}
            >
              Patrocinado
            </div>

            {/* Left: App info */}
            <div className="flex-1 space-y-4">
              {/* Logo and name */}
              <div className="flex items-start gap-4">
                {app.logo_url && (
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden border" style={{ borderColor: colors.border }}>
                    <Image
                      src={app.logo_url}
                      alt={app.name}
                      fill
                      className="object-cover"
                    />
                  </div>
                )}
                <div>
                  <h3 className="text-2xl font-bold" style={{ color: colors.text }}>
                    {app.name}
                  </h3>
                  <p style={{ color: colors.textSecondary }}>
                    Por {app.name}
                  </p>
                </div>
              </div>

              {/* Headline and description */}
              <div className="space-y-2">
                <h4 className="text-xl font-semibold" style={{ color: colors.text }}>
                  {current.title}
                </h4>
                <p style={{ color: colors.textSecondary }}>
                  {current.description}
                </p>
              </div>

              {/* Pricing */}
              {app.price && (
                <div className="pt-4">
                  <div className="text-lg font-bold" style={{ color: colors.primary }}>
                    R$ {app.price.toFixed(2).replace('.', ',')}
                    {app.billing_period && (
                      <span className="text-sm font-normal ml-2" style={{ color: colors.textSecondary }}>
                        · {app.billing_period === 'one-time' ? 'pagamento único' : `por ${app.billing_period}`}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* CTA */}
              <Link
                href={`/app/${app.slug}`}
                className="inline-flex items-center justify-center px-6 py-3 rounded-full font-semibold text-white transition-all hover:shadow-lg"
                style={{ backgroundColor: colors.primary }}
              >
                Conhecer aplicativo
              </Link>
            </div>

            {/* Right: Image placeholder */}
            <div className="hidden lg:block flex-1">
              {current.campaign_image_url ? (
                <div className="relative w-full h-64 rounded-2xl overflow-hidden">
                  <Image
                    src={current.campaign_image_url}
                    alt={current.application.name}
                    fill
                    className="object-cover"
                  />
                </div>
              ) : (
                <div
                  className="w-full h-64 rounded-2xl border flex items-center justify-center"
                  style={{
                    borderColor: colors.border,
                    backgroundColor: colors.backgroundAlt,
                  }}
                >
                  <div className="text-center">
                    <div className="text-4xl opacity-20 mb-2">📱</div>
                    <p
                      className="text-sm"
                      style={{ color: colors.textMuted }}
                    >
                      Imagem do app
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
              <div className="flex gap-2">
                <button
                  onClick={prevSlide}
                  aria-label="Slide anterior"
                  className="p-2 rounded-full border transition-all hover:bg-gray-50"
                  style={{ borderColor: colors.border }}
                >
                  <ChevronLeft size={20} style={{ color: colors.text }} />
                </button>
                <button
                  onClick={nextSlide}
                  aria-label="Próximo slide"
                  className="p-2 rounded-full border transition-all hover:bg-gray-50"
                  style={{ borderColor: colors.border }}
                >
                  <ChevronRight size={20} style={{ color: colors.text }} />
                </button>
              </div>

              {/* Indicators */}
              <div className="flex items-center gap-2">
                {campaigns.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => goToSlide(index)}
                    aria-label={`Ir para slide ${index + 1}`}
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: index === currentIndex ? '24px' : '8px',
                      backgroundColor:
                        index === currentIndex ? colors.primary : colors.border,
                    }}
                  />
                ))}
              </div>

              {/* Play/Pause */}
              <div className="flex gap-2">
                {isPlaying && !isPaused ? (
                  <button
                    onClick={handlePause}
                    aria-label="Pausar carrossel"
                    className="p-2 rounded-full border transition-all hover:bg-gray-50"
                    style={{ borderColor: colors.border }}
                  >
                    <Pause size={20} style={{ color: colors.text }} />
                  </button>
                ) : (
                  <button
                    onClick={handlePlay}
                    aria-label="Reproduzir carrossel"
                    className="p-2 rounded-full border transition-all hover:bg-gray-50"
                    style={{ borderColor: colors.border }}
                  >
                    <Play size={20} style={{ color: colors.text }} />
                  </button>
                )}
              </div>
            </div>

            {/* Counter */}
            <div
              className="absolute top-4 right-4 text-xs font-semibold px-3 py-1 rounded-full"
              style={{
                backgroundColor: colors.backgroundAlt,
                color: colors.textSecondary,
              }}
            >
              {String(currentIndex + 1).padStart(2, '0')}/{String(campaigns.length).padStart(2, '0')}
            </div>
          </div>
        </div>
      </Container>
    </section>
  )
}
