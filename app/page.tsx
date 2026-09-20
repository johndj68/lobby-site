/* Página inicial do marketplace (rota: /)
 *
 * Exibe catálogo de aplicativos (LOBBY + parceiros), promoções e campanhas patrocinadas.
 *
 * Estrutura:
 *  1. MarketplaceHero       — hero com busca principal
 *  2. Categorias            — atalhos para categorias de apps
 *  3. SponsoredCarousel     — carrossel de apps patrocinados
 *  4. PromotionsSection     — apps em promoção
 *  5. ExploreAllAppsSection — grade com filtros e ordenação
 *  6. Footer                — (do layout.tsx)
 */
import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import MarketplaceHero from '@/components/sections/MarketplaceHero'
import MarketplaceCategoriesSection from '@/components/sections/MarketplaceCategoriesSection'
import SponsoredCarouselSection from '@/components/sections/SponsoredCarouselSection'
import PromotionsSection from '@/components/sections/PromotionsSection'
import ExploreAllAppsSection from '@/components/sections/ExploreAllAppsSection'

export const metadata: Metadata = {
  title: 'LOBBY — Marketplace de Apps e Ferramentas',
  description:
    'Descubra aplicativos e ferramentas da LOBBY e de parceiros para trabalhar melhor e fazer seu negócio crescer.',
}

async function loadMarketplaceData() {
  try {
    const supabase = await createServerSupabaseClient()

    // Fetch all published applications
    const { data: apps = [] } = await supabase
      .from('applications')
      .select('id, name, slug, description, short_description, category, developer_name, logo_url, preview_image_url, price, billing_period, is_lobby_made')
      .eq('is_published', true)
      .order('created_at', { ascending: false })

    // Fetch active sponsored campaigns within date range
    const { data: campaigns = [] } = await supabase
      .from('sponsored_campaigns')
      .select(
        `
        id,
        application_id,
        title,
        description,
        campaign_image_url,
        starts_at,
        ends_at,
        application:applications(
          id,
          name,
          slug,
          category,
          logo_url,
          price,
          billing_period
        )
      `
      )
      .eq('is_approved', true)
      .eq('is_active', true)
      .lte('starts_at', new Date().toISOString())
      .gte('ends_at', new Date().toISOString())
      .order('display_order', { ascending: true })

    // Fetch active promotions within date range
    const { data: promotions = [] } = await supabase
      .from('promotions')
      .select(
        `
        id,
        application_id,
        promo_price,
        original_price,
        discount_percentage,
        starts_at,
        ends_at,
        application:applications(
          id,
          slug,
          name,
          category,
          logo_url,
          preview_image_url,
          price,
          billing_period
        )
      `
      )
      .eq('is_approved', true)
      .eq('is_active', true)
      .lte('starts_at', new Date().toISOString())
      .gte('ends_at', new Date().toISOString())
      .order('display_order', { ascending: true })

    return {
      apps: apps || [],
      campaigns: campaigns || [],
      promotions: promotions || [],
    }
  } catch (error) {
    console.error('Error loading marketplace data:', error)
    return { apps: [], campaigns: [], promotions: [] }
  }
}

export default async function HomePage() {
  const { apps, campaigns, promotions } = await loadMarketplaceData()

  return (
    <>
      <MarketplaceHero />
      <MarketplaceCategoriesSection />
      <SponsoredCarouselSection campaigns={campaigns} />
      <PromotionsSection promotions={promotions} />
      <ExploreAllAppsSection initialApps={apps} />
    </>
  )
}
