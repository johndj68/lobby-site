/**
 * Script para popular banco com dados de exemplo para o marketplace
 *
 * Uso: node --env-file=.env.local scripts/seed-marketplace-data.mjs
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

const sampleApps = [
  {
    name: 'FlowPilot',
    slug: 'flowpilot',
    category: 'Automação',
    developer_name: 'FlowPilot Co.',
    description: 'Sua rotina no piloto automático. Conecte suas ferramentas e automatize tarefas em um só lugar.',
    short_description: 'Automação de fluxos de trabalho',
    price: 149,
    billing_period: 'monthly',
    is_lobby_made: false,
    is_published: true,
  },
  {
    name: 'Claro CRM',
    slug: 'claro-crm',
    category: 'Gestão e finanças',
    developer_name: 'Claro CRM',
    description: 'Organize contatos e acompanhe oportunidades de vendas com facilidade.',
    short_description: 'CRM para gerenciar vendas',
    price: 249,
    billing_period: 'monthly',
    is_lobby_made: false,
    is_published: true,
  },
  {
    name: 'Drafty AI',
    slug: 'drafty-ai',
    category: 'Inteligência artificial',
    developer_name: 'Drafty',
    description: 'Crie conteúdos com IA para sua próxima campanha de marketing.',
    short_description: 'Gerador de conteúdo com IA',
    price: 79,
    billing_period: 'monthly',
    is_lobby_made: false,
    is_published: true,
  },
  {
    name: 'Mailmst',
    slug: 'mailmst',
    category: 'Marketing',
    developer_name: 'Mailmst',
    description: 'Crie e gerencie campanhas de email com facilidade e rastreie resultados.',
    short_description: 'Plataforma de email marketing',
    price: 99,
    billing_period: 'monthly',
    is_lobby_made: false,
    is_published: true,
  },
  {
    name: 'SecureKit',
    slug: 'securekit',
    category: 'Segurança',
    developer_name: 'SecureKit',
    description: 'Proteção completa para o que importa no seu negócio.',
    short_description: 'Solução de segurança integrada',
    price: 129,
    billing_period: 'monthly',
    is_lobby_made: false,
    is_published: true,
  },
  {
    name: 'Tasklane',
    slug: 'tasklane',
    category: 'Produtividade',
    developer_name: 'Tasklane',
    description: 'Organize tarefas e projetos para manter sua equipe no foco.',
    short_description: 'Gerenciador de tarefas e projetos',
    price: 39,
    billing_period: 'monthly',
    is_lobby_made: false,
    is_published: true,
  },
  {
    name: 'LOBBY Insights',
    slug: 'lobby-insights',
    category: 'Dados e BI',
    developer_name: 'LOBBY',
    description: 'Analise dados do seu negócio e tome decisões com clareza.',
    short_description: 'Dashboard de dados e relatórios',
    price: 299,
    billing_period: 'monthly',
    is_lobby_made: true,
    is_published: true,
  },
  {
    name: 'SocialDesk',
    slug: 'socialdesk',
    category: 'Marketing',
    developer_name: 'SocialDesk',
    description: 'Gerencie suas redes sociais e publique em todos os canais desde um único painel.',
    short_description: 'Gerenciador de redes sociais',
    price: 69,
    billing_period: 'monthly',
    is_lobby_made: false,
    is_published: true,
  },
]

const samplePromotions = [
  {
    application_id: null, // será preenchido depois
    promo_price: 199,
    original_price: 249,
    discount_percentage: 20,
    starts_at: new Date(),
    ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    is_approved: true,
    is_active: true,
    display_order: 0,
  },
  {
    application_id: null,
    promo_price: 59,
    original_price: 79,
    discount_percentage: 25,
    starts_at: new Date(),
    ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    is_approved: true,
    is_active: true,
    display_order: 1,
  },
]

const sampleCampaigns = [
  {
    application_id: null,
    title: 'Sua rotina no piloto automático.',
    description: 'Conecte suas ferramentas e automatize tarefas em um só lugar.',
    call_to_action: 'Conhecer aplicativo',
    starts_at: new Date(),
    ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    is_approved: true,
    is_active: true,
    is_paid: false,
    payment_status: 'pending',
    display_order: 0,
  },
]

async function seedData() {
  console.log('🌱 Iniciando seed do marketplace...')

  try {
    // Insert applications
    console.log('📱 Inserindo aplicativos...')
    const { data: appsData, error: appsError } = await supabase
      .from('applications')
      .insert(sampleApps)
      .select()

    if (appsError) throw appsError

    console.log(`✅ ${appsData.length} aplicativos inseridos`)

    // Insert promotions with app IDs
    if (appsData && appsData.length >= 2) {
      console.log('🎉 Inserindo promoções...')
      samplePromotions[0].application_id = appsData[1].id // Claro CRM
      samplePromotions[1].application_id = appsData[2].id // Drafty AI

      const { data: promosData, error: promosError } = await supabase
        .from('promotions')
        .insert(samplePromotions)
        .select()

      if (promosError) throw promosError
      console.log(`✅ ${promosData.length} promoções inseridas`)
    }

    // Insert campaigns with app IDs
    if (appsData && appsData.length >= 1) {
      console.log('⭐ Inserindo campanhas patrocinadas...')
      sampleCampaigns[0].application_id = appsData[0].id // FlowPilot

      const { data: campaignsData, error: campaignsError } = await supabase
        .from('sponsored_campaigns')
        .insert(sampleCampaigns)
        .select()

      if (campaignsError) throw campaignsError
      console.log(`✅ ${campaignsData.length} campanhas inseridas`)
    }

    console.log('\n✨ Seed concluído com sucesso!')
  } catch (error) {
    console.error('❌ Erro:', error.message)
    process.exit(1)
  }
}

seedData()
