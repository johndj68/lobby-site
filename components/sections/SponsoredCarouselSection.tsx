'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import Container from '@/components/layout/Container'
import { colors } from '@/lib/design-tokens'

/** next/image só aceita hosts declarados em next.config.ts (hoje só o
 *  storage do Supabase) e LANÇA um erro (derruba a página inteira, não só a
 *  imagem) pra qualquer outro host — diferente de um <img> comum, que só
 *  falha silenciosamente. app_drafts.logo_url e ad_creatives.image_url
 *  podem conter qualquer URL (ex.: fixture antiga de QA em
 *  via.placeholder.com); mesmo critério de lib/services/app-publish.ts#isAllowedImageUrl. */
function isAllowedImageHost(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const allowedHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname
    return new URL(url).hostname === allowedHost
  } catch {
    return false
  }
}

interface SponsoredApp {
  id: string
  application_id: string
  title: string
  description: string
  campaign_image_url?: string
  image_alt?: string
  cta_label?: string
  cta_href?: string
  creative_id?: string | null
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
const IMPRESSION_VISIBLE_MS = 1000
const IMPRESSION_THRESHOLD = 0.5

/** Impressão contada só quando ≥50% do anúncio ficou visível por ≥1s
 *  contínuo, com a aba visível — nunca em prévia administrativa (seção 19).
 *  Dispara no máximo 1x por (viewId, campaignId): o servidor deduplica de
 *  qualquer forma via índice único, isto é só pra não fazer requisição à
 *  toa. */
function useAdImpressionTracking(campaignId: string | undefined, creativeId: string | null | undefined, viewId: string, enabled: boolean) {
  const elementRef = useRef<HTMLDivElement | null>(null)
  const firedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!enabled || !campaignId || !creativeId || typeof IntersectionObserver === 'undefined') return
    const el = elementRef.current
    if (!el) return
    if (firedRef.current.has(campaignId)) return

    let timer: ReturnType<typeof setTimeout> | null = null

    const fire = () => {
      if (firedRef.current.has(campaignId)) return
      firedRef.current.add(campaignId)
      fetch('/api/public/ad-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, creativeId, eventType: 'impression', viewId }),
        keepalive: true,
      }).catch(() => {})
    }

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting && document.visibilityState === 'visible') {
            if (!timer) timer = setTimeout(fire, IMPRESSION_VISIBLE_MS)
          } else if (timer) {
            clearTimeout(timer)
            timer = null
          }
        }
      },
      { threshold: IMPRESSION_THRESHOLD },
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (timer) clearTimeout(timer)
    }
  }, [campaignId, creativeId, viewId, enabled])

  return elementRef
}

function sendClickBeacon(campaignId: string | undefined, creativeId: string | null | undefined, viewId: string, enabled: boolean) {
  if (!enabled || !campaignId || !creativeId) return
  const payload = JSON.stringify({ campaignId, creativeId, eventType: 'click', viewId })
  if (typeof navigator.sendBeacon === 'function') {
    navigator.sendBeacon('/api/public/ad-events', new Blob([payload], { type: 'application/json' }))
  } else {
    fetch('/api/public/ad-events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {})
  }
}

export default function SponsoredCarouselSection({
  campaigns = [],
  isPreview = false,
}: {
  campaigns?: SponsoredApp[]
  /** true na aba Prévia do admin — nunca gera impressão/clique faturável
   *  (seção 18/19). */
  isPreview?: boolean
}) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const [isPaused, setIsPaused] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const pageVisibilityRef = useRef(true)
  const touchStartX = useRef<number | null>(null)
  const [viewId] = useState<string>(() => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`))

  useEffect(() => { pageVisibilityRef.current = !document.hidden }, [])

  const hasCampaigns = campaigns && campaigns.length > 0

  const goToSlide = (index: number) => {
    if (!campaigns.length) return
    setCurrentIndex(((index % campaigns.length) + campaigns.length) % campaigns.length)
  }

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (campaigns.length ? (prev + 1) % campaigns.length : 0))
  }, [campaigns.length])

  const prevSlide = () => {
    setCurrentIndex((prev) => (campaigns.length ? (prev - 1 + campaigns.length) % campaigns.length : 0))
  }

  const handlePlay = () => { setIsPaused(false); setIsPlaying(true) }
  const handlePause = () => { setIsPaused(true); setIsPlaying(false) }

  useEffect(() => {
    if (!hasCampaigns || !isPlaying || isPaused || !pageVisibilityRef.current) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    intervalRef.current = setInterval(nextSlide, AUTOPLAY_INTERVAL)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [isPlaying, isPaused, nextSlide, hasCampaigns])

  useEffect(() => {
    const handleVisibilityChange = () => {
      pageVisibilityRef.current = !document.hidden
      if (document.hidden && intervalRef.current) clearInterval(intervalRef.current)
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (mediaQuery.matches) setIsPlaying(false)
    const handleChange = (e: MediaQueryListEvent) => { if (e.matches) setIsPlaying(false) }
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const handleMouseEnter = () => handlePause()
  const handleMouseLeave = () => !isPaused && handlePlay()

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); prevSlide() }
    else if (e.key === 'ArrowRight') { e.preventDefault(); nextSlide() }
  }

  function handleTouchStart(e: React.TouchEvent) { touchStartX.current = e.touches[0].clientX }
  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null) return
    const delta = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(delta) > 40) { if (delta > 0) prevSlide(); else nextSlide() }
    touchStartX.current = null
  }

  const current = hasCampaigns ? campaigns[currentIndex] : null
  const app = current?.application?.[0]

  const impressionRef = useAdImpressionTracking(current?.id, current?.creative_id, viewId, !isPreview)

  if (!hasCampaigns) {
    return (
      <section className="py-16 lg:py-20" style={{ backgroundColor: colors.backgroundAlt }}>
        <Container>
          <div className="rounded-3xl border p-8 lg:p-12 text-center" style={{ borderColor: colors.border, backgroundColor: colors.background }}>
            <div className="mb-3 inline-flex text-xs font-semibold px-3 py-1 rounded-full" style={{ backgroundColor: `${colors.primary}20`, color: colors.primary }}>
              Patrocinado
            </div>
            <h3 className="text-xl font-bold mb-2" style={{ color: colors.text }}>Seu app pode estar aqui</h3>
            <p className="mb-4" style={{ color: colors.textSecondary }}>Divulgue seu aplicativo no carrossel principal da home da LOBBY.</p>
            <Link href="/dashboard/destaques" className="inline-flex items-center justify-center px-6 py-3 rounded-full font-semibold text-white" style={{ backgroundColor: colors.primary }}>
              Saiba mais
            </Link>
          </div>
        </Container>
      </section>
    )
  }

  if (!current || !app) return null

  return (
    <section className="py-16 lg:py-20" style={{ backgroundColor: colors.backgroundAlt }}>
      <Container>
        <div className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-2xl lg:text-3xl font-bold" style={{ color: colors.text }}>Apps em destaque</h2>
            <p style={{ color: colors.textSecondary }}>Conheça as soluções dos nossos parceiros</p>
          </div>

          <div
            ref={impressionRef}
            className="relative rounded-3xl overflow-hidden border p-8 lg:p-12 flex flex-col lg:flex-row gap-8 items-center"
            style={{ borderColor: colors.border, backgroundColor: colors.background }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onKeyDown={handleKeyDown}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            role="region"
            aria-roledescription="carrossel"
            aria-label="Aplicativos patrocinados"
          >
            <div className="absolute top-4 left-4 text-xs font-semibold px-3 py-1 rounded-full" style={{ backgroundColor: `${colors.primary}20`, color: colors.primary }}>
              Patrocinado
            </div>

            <div className="flex-1 space-y-4">
              <div className="flex items-start gap-4">
                {isAllowedImageHost(app.logo_url) && (
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden border" style={{ borderColor: colors.border }}>
                    <Image src={app.logo_url!} alt={app.name} fill className="object-cover" />
                  </div>
                )}
                <div>
                  <h3 className="text-2xl font-bold" style={{ color: colors.text }}>{app.name}</h3>
                  <p style={{ color: colors.textSecondary }}>Por {app.name}</p>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xl font-semibold" style={{ color: colors.text }}>{current.title}</h4>
                <p style={{ color: colors.textSecondary }}>{current.description}</p>
              </div>

              {app.price != null && (
                <div className="pt-4">
                  <div className="text-lg font-bold" style={{ color: colors.primary }}>
                    R$ {app.price.toFixed(2).replace('.', ',')}
                    {app.billing_period && (
                      <span className="text-sm font-normal ml-2" style={{ color: colors.textSecondary }}>
                        · {app.billing_period === 'one-time' ? 'pagamento único' : app.billing_period === 'lifetime' ? 'pagamento único (vitalício)' : `por ${app.billing_period}`}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <Link
                href={isPreview ? '#' : (current.cta_href || `/app/${app.slug}`)}
                onClick={e => { if (isPreview) { e.preventDefault(); return } sendClickBeacon(current.id, current.creative_id, viewId, !isPreview) }}
                className="inline-flex items-center justify-center px-6 py-3 rounded-full font-semibold text-white transition-all hover:shadow-lg"
                style={{ backgroundColor: colors.primary }}
              >
                {current.cta_label || 'Conhecer aplicativo'}
              </Link>
            </div>

            <div className="hidden lg:block flex-1">
              {isAllowedImageHost(current.campaign_image_url) ? (
                <div className="relative w-full h-64 rounded-2xl overflow-hidden">
                  <Image src={current.campaign_image_url!} alt={current.image_alt || app.name} fill className="object-cover" />
                </div>
              ) : (
                <div className="w-full h-64 rounded-2xl border flex items-center justify-center" style={{ borderColor: colors.border, backgroundColor: colors.backgroundAlt }}>
                  <p className="text-sm" style={{ color: colors.textMuted }}>Imagem do app</p>
                </div>
              )}
            </div>

            {campaigns.length > 1 && (
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                <div className="flex gap-2">
                  <button onClick={prevSlide} aria-label="Slide anterior" className="p-2 rounded-full border transition-all hover:bg-gray-50" style={{ borderColor: colors.border }}>
                    <ChevronLeft size={20} style={{ color: colors.text }} />
                  </button>
                  <button onClick={nextSlide} aria-label="Próximo slide" className="p-2 rounded-full border transition-all hover:bg-gray-50" style={{ borderColor: colors.border }}>
                    <ChevronRight size={20} style={{ color: colors.text }} />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {campaigns.map((_, index) => (
                    <button key={index} onClick={() => goToSlide(index)} aria-label={`Ir para slide ${index + 1}`}
                      className="h-2 rounded-full transition-all"
                      style={{ width: index === currentIndex ? '24px' : '8px', backgroundColor: index === currentIndex ? colors.primary : colors.border }} />
                  ))}
                </div>

                <div className="flex gap-2">
                  {isPlaying && !isPaused ? (
                    <button onClick={handlePause} aria-label="Pausar carrossel" className="p-2 rounded-full border transition-all hover:bg-gray-50" style={{ borderColor: colors.border }}>
                      <Pause size={20} style={{ color: colors.text }} />
                    </button>
                  ) : (
                    <button onClick={handlePlay} aria-label="Reproduzir carrossel" className="p-2 rounded-full border transition-all hover:bg-gray-50" style={{ borderColor: colors.border }}>
                      <Play size={20} style={{ color: colors.text }} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {campaigns.length > 1 && (
              <div className="absolute top-4 right-4 text-xs font-semibold px-3 py-1 rounded-full" style={{ backgroundColor: colors.backgroundAlt, color: colors.textSecondary }}>
                {String(currentIndex + 1).padStart(2, '0')}/{String(campaigns.length).padStart(2, '0')}
              </div>
            )}
          </div>
        </div>
      </Container>
    </section>
  )
}
