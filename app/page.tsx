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
import { computeCampaignEligibility } from '@/lib/services/campaigns'

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

    // Campanhas de destaque patrocinado — candidatas via SQL (aprovada,
    // ativa, no período, com anúncio aprovado), elegibilidade final
    // (pagamento confirmado/isento, reserva confirmada, app publicado,
    // parceiro não bloqueado) calculada em JS via computeCampaignEligibility
    // (mesmo critério usado no admin, nunca duplicado).
    const { data: campaignCandidates = [] } = await supabase
      .from('sponsored_campaigns')
      .select(`
        id, application_id, app_draft_id, live_creative_id, starts_at, ends_at, review_status, paused_at, cancelled_at,
        ad_creatives!sponsored_campaigns_live_creative_id_fkey(id, title, description, image_url, image_alt, cta_label, cta_href),
        app_drafts(created_by),
        application:applications(id, name, slug, category, logo_url, price, billing_period, is_published, suspended_at)
      `)
      .eq('is_approved', true)
      .eq('review_status', 'aprovado')
      .not('live_creative_id', 'is', null)
      .lte('starts_at', new Date().toISOString())
      .gte('ends_at', new Date().toISOString())
      .order('display_order', { ascending: true })

    const campaignIds = (campaignCandidates ?? []).map(c => c.id)
    const [{ data: reservations = [] }, { data: purchases = [] }, { data: partners = [] }] = campaignIds.length
      ? await Promise.all([
          supabase.from('ad_reservations').select('campaign_id, status, starts_at, ends_at').in('campaign_id', campaignIds).eq('status', 'confirmed'),
          supabase.from('campaign_purchases').select('campaign_id, status').in('campaign_id', campaignIds).in('status', ['paid', 'isento']),
          supabase.from('profiles').select('id, marketplace_new_apps_blocked'),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }]

    const reservationByCampaign = new Map((reservations ?? []).map(r => [r.campaign_id, r]))
    const paidByCampaign = new Set((purchases ?? []).map(p => p.campaign_id))
    const blockedPartners = new Set((partners ?? []).filter(p => p.marketplace_new_apps_blocked).map(p => p.id))

    type CandidateApp = { id: string; name: string; slug: string; category: string; logo_url: string | null; price: number | null; billing_period: string | null; is_published: boolean; suspended_at: string | null }
    const now = new Date()
    const eligibleCampaigns = (campaignCandidates ?? []).filter(c => {
      const app = Array.isArray(c.application) ? c.application[0] : (c.application as CandidateApp | null)
      const draft = Array.isArray(c.app_drafts) ? c.app_drafts[0] : (c.app_drafts as { created_by: string } | null)
      const reservation = reservationByCampaign.get(c.id)
      const eligibility = computeCampaignEligibility({
        reviewStatus: c.review_status as 'aprovado',
        hasLiveCreative: !!c.live_creative_id,
        appPublished: !!app?.is_published,
        appSuspended: !!app?.suspended_at,
        partnerBlocked: draft ? blockedPartners.has(draft.created_by) : false,
        spaceActive: true,
        paymentStatus: paidByCampaign.has(c.id) ? 'paid' : null,
        reservationStatus: reservation ? 'confirmed' : null,
        reservationCoversNow: !!reservation && new Date(reservation.starts_at) <= now && now < new Date(reservation.ends_at),
        pausedAt: c.paused_at, cancelledAt: c.cancelled_at, startsAt: c.starts_at, endsAt: c.ends_at, now,
      })
      return eligibility.key === 'em_exibicao'
    })

    // Embaralha uma vez por request (a home já é dinâmica) — variação
    // equilibrada do primeiro anúncio entre acessos, participação igual
    // entre campanhas elegíveis (seção 16).
    const campaigns = [...eligibleCampaigns].sort(() => Math.random() - 0.5).map(c => {
      const app = Array.isArray(c.application) ? c.application[0] : (c.application as CandidateApp)
      const creative = Array.isArray(c.ad_creatives) ? c.ad_creatives[0] : c.ad_creatives
      return {
        id: c.id,
        application_id: c.application_id,
        title: creative?.title ?? '',
        description: creative?.description ?? '',
        campaign_image_url: creative?.image_url ?? undefined,
        image_alt: creative?.image_alt ?? '',
        cta_label: creative?.cta_label ?? 'Conhecer aplicativo',
        cta_href: creative?.cta_href ?? `/app/${app.slug}`,
        creative_id: creative?.id ?? null,
        starts_at: c.starts_at,
        ends_at: c.ends_at,
        application: [{ id: app.id, name: app.name, slug: app.slug, category: app.category, logo_url: app.logo_url ?? undefined, price: app.price ?? undefined, billing_period: app.billing_period ?? undefined }],
      }
    })

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
