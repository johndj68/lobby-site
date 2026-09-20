# Marketplace da LOBBY

## Visão Geral

A página inicial foi transformada em um marketplace de aplicativos, exibindo produtos próprios da LOBBY e de parceiros.

## O que foi implementado

### 1. Novas Tabelas do Banco de Dados

**Migration**: `supabase/migrations/20260920225514_marketplace_apps_promotions.sql`

- **applications**: Catálogo de aplicativos
  - `id, name, slug, description, short_description, category, developer_name`
  - `logo_url, preview_image_url`
  - `price, price_currency, billing_period, is_free`
  - `is_published, is_lobby_made`

- **promotions**: Descontos temporários
  - `application_id, promo_price, original_price, discount_percentage`
  - `starts_at, ends_at`
  - `is_approved, is_active, display_order`

- **sponsored_campaigns**: Anúncios pagos no carrossel
  - `application_id`
  - `title, description, campaign_image_url, call_to_action`
  - `starts_at, ends_at`
  - `is_approved, is_active, is_paid, payment_status, display_order`

### 2. Novos Componentes

#### MarketplaceHero (`components/sections/MarketplaceHero.tsx`)
Hero principal com:
- Headline colorido "Grandes apps. Novas possibilidades."
- Campo de busca integrado
- Botões CTA: "Explorar aplicativos" e "Ver ofertas"

#### MarketplaceCategoriesSection (`components/sections/MarketplaceCategoriesSection.tsx`)
Grade de 6 categorias com ícones:
- Inteligência artificial
- Automação
- Marketing
- Gestão e finanças
- Dados e BI
- Segurança

#### SponsoredCarouselSection (`components/sections/SponsoredCarouselSection.tsx`)
Carrossel avançado com:
- Um app por slide
- Rotação automática a cada 6 segundos (configurável)
- Controles: anterior/próximo, play/pause
- Indicadores clicáveis
- Contador (01/04)
- Respeita preferência por movimento reduzido
- Pausa ao mouse over
- Suporta arrastar no mobile
- Oculta-se automaticamente se sem anúncios

#### PromotionsSection (`components/sections/PromotionsSection.tsx`)
Grid 4 colunas de apps em promoção:
- Badge "Oferta do dia"
- Preço anterior riscado
- Preço promocional em destaque
- Botão "Ver oferta"

#### ExploreAllAppsSection (`components/sections/ExploreAllAppsSection.tsx`)
Grade completa com filtros:
- Filtros por categoria
- Ordenação (mais recentes, preço asc/desc)
- Busca (via URL, integrada ao header)
- Botão "Carregar mais"
- 4 colunas em desktop, 2 em tablet, 1 em mobile

### 3. Página Home Atualizada

**Arquivo**: `app/page.tsx`

Agora Server Component que:
1. Busca aplicativos publicados
2. Busca campanhas patrocinadas ativas
3. Busca promoções ativas
4. Renderiza novas seções do marketplace

Ordem das seções:
1. MarketplaceHero
2. MarketplaceCategoriesSection
3. SponsoredCarouselSection
4. PromotionsSection
5. ExploreAllAppsSection

### 4. Scripts de Administração

#### `scripts/seed-marketplace-data.mjs`
Popular banco com dados de exemplo para desenvolvimento e testes.

```bash
node --env-file=.env.local scripts/seed-marketplace-data.mjs
```

Insere:
- 8 aplicativos de exemplo
- 2 promoções
- 1 campanha patrocinada

#### `scripts/apply-migration.mjs`
Aplica as migrations ao Supabase (ainda em desenvolvimento).

## Como Configurar

### 1. Aplicar a Migration

A migration deve ser aplicada manualmente via Supabase Dashboard:

1. Acesse https://app.supabase.com/
2. Selecione seu projeto
3. Vá para SQL Editor
4. Copie o conteúdo de `supabase/migrations/20260920225514_marketplace_apps_promotions.sql`
5. Execute

### 2. Popular com Dados de Exemplo (Opcional)

```bash
cd lobby-site
node --env-file=.env.local scripts/seed-marketplace-data.mjs
```

### 3. Iniciar Dev Server

```bash
npm run dev
```

Acesse http://localhost:3000

## Estrutura de Dados para Aplicativos

### Criar Aplicativo

Inserir em `applications`:

```sql
INSERT INTO applications (
  name, slug, category, developer_name, description, 
  price, billing_period, is_published
) VALUES (
  'Meu App', 'meu-app', 'Automação', 'Minha Empresa',
  'Descrição do app',
  99.00, 'monthly', true
);
```

### Criar Promoção

Inserir em `promotions`:

```sql
INSERT INTO promotions (
  application_id, promo_price, original_price, discount_percentage,
  starts_at, ends_at, is_approved, is_active, display_order
) VALUES (
  '...',  -- app ID
  79.00, 99.00, 20,
  NOW(), NOW() + interval '7 days',
  true, true, 0
);
```

Importante:
- `starts_at` e `ends_at` definem o período ativo
- Apenas promoções `is_approved=true` e `is_active=true` aparecem
- `display_order` controla a posição (0 = primeiro)

### Criar Campanha Patrocinada

Inserir em `sponsored_campaigns`:

```sql
INSERT INTO sponsored_campaigns (
  application_id, title, description,
  starts_at, ends_at, is_approved, is_active, display_order
) VALUES (
  '...',  -- app ID
  'Título do anúncio', 'Descrição',
  NOW(), NOW() + interval '30 days',
  true, true, 0
);
```

Importante:
- Apenas campanhas `is_approved=true` e `is_active=true` aparecem
- Data range deve estar vigente (`starts_at <= NOW() <= ends_at`)
- `display_order` controla posição no carrossel

## Segurança e RLS

Todas as tabelas têm Row Level Security habilitado:

- **Leitura pública**: Aplicativos, promoções e campanhas aparecem para todos quando aprovados e ativos
- **Escrita admin**: Apenas administradores podem criar/editar/deletar
- **Validação serverside**: RLS policies verificam `auth.jwt() ->> 'role' = 'admin'`

Certifique-se de:
- Nunca expor dados privados (rascunhos, não-aprovados)
- Validar conteúdo de descrições contra XSS
- Usar slugs únicos para aplicativos

## Integração com Admin

Futura seção em `/admin/marketplace` ou `/admin/aplicativos` para:
- Listar e criar aplicativos
- Gerenciar promoções
- Gerenciar campanhas patrocinadas
- Visualizar preview antes de publicar
- Ativar/desativar conteúdo

## Responsividade

### Desktop (1440px)
- ExploreAllAppsSection: 4 colunas
- Cards legíveis
- Filtros horizontais

### Tablet (768px)
- ExploreAllAppsSection: 2-3 colunas
- Filtros em grupo
- Busca acessível

### Mobile (390px)
- ExploreAllAppsSection: 1 coluna
- Categorias em scroll horizontal
- Filtros adaptativos
- Carrossel com gesto de arrastar

## Acessibilidade

- Títulos com nível apropriado (H1, H2, etc.)
- Labels em inputs de busca
- Aria-labels em botões de ícone
- Foco visível em controles
- Contraste WCAG AA
- Navegação por teclado no carrossel

## Próximas Etapas

1. ✅ Migração de banco
2. ✅ Componentes marketplace
3. ✅ Nova home
4. ⏳ Admin para gerenciar apps/promoções
5. ⏳ Página de detalhes do app
6. ⏳ Checkout/compra de apps
7. ⏳ Integração Stripe para pagamentos
8. ⏳ Sistema de afiliados
9. ⏳ Avaliações de apps
10. ⏳ Notificações de promoções

## Troubleshooting

### Seção de Promoções não aparece
- Verificar se tem promoções com `is_approved=true` e `is_active=true`
- Verificar se data range inclui agora (`starts_at <= NOW() <= ends_at`)
- Verificar RLS policies nas table `promotions`

### Carrossel patrocinado vazio
- Mesmo verificar acima para `sponsored_campaigns`
- Verificar se aplicativo associado está `is_published=true`

### Aplicativos não aparecem na grade
- Verificar se `is_published=true` no banco
- Verificar RLS policy em `applications`
- Verificar console do browser para erros na query

## Referências

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [Next.js Server Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components)
- [Design Tokens](./lib/design-tokens.ts)
