# Sistema de Cadastro de Aplicativos para Parceiros

**Status**: ✅ Fase 1-4 Implementadas (Fase 5 — Testes em Andamento)

## 📋 Resumo

Sistema completo de cadastro e análise de aplicativos no marketplace da LOBBY para parceiros/vendedores.

### Fases Implementadas

**✅ FASE 1: Estrutura**
- Migration SQL com tabelas (app_drafts, app_submissions, app_review_checklist, app_plans)
- RLS policies para segurança
- Modelos Supabase com relações

**✅ FASE 2: Importação por URL**
- Endpoint `/api/scrape-app-info` seguro
- Validações: protocolo HTTP(S), DNS, bloqueio de IPs privados
- Rate limiting (5 req/user/hour)
- Sanitização de conteúdo
- Fallback em caso de falha

**✅ FASE 3: Componentes Frontend**
- `/cadastro-meuapp` — Início com 2 métodos
  - Importação por URL com scraping
  - Cadastro manual
  - Informações sobre critérios de avaliação
- `/vendedor/aplicativos/[id]/editar` — Editor de 4 etapas
  - Etapa 1: Começar (implementada)
  - Etapa 2: Produto e mídia (stub)
  - Etapa 3: Oferta e planos (stub)
  - Etapa 4: Revisão (stub)
- Componente StepIndicator com navegação

**✅ FASE 4: Painel Admin**
- `/admin/marketplace/submissoes` — Fila de análise
- Filtros por status
- Visualização de dados
- Ações: Aprovar, Solicitar Ajustes, Rejeitar

---

## 🏗️ Arquitetura

### Tabelas Supabase

#### `app_drafts`
Rascunhos de cadastro em progresso.

```sql
- id: UUID
- organization_id: UUID (FK → organizations)
- created_by: UUID (FK → auth.users)
- name, website_url, short_description, full_description
- logo_url, category, subcategory, target_audience
- features[], benefits[], integrations[], platforms[], requirements
- media_gallery[], video_url
- support_email, documentation_url, setup_instructions
- plans[] (planos de preço/assinatura)
- stage: 1-4
- status: draft | submitted | under_review | changes_requested | approved | published
- last_edited_at, created_at
```

#### `app_submissions`
Versões enviadas para análise.

```sql
- id: UUID
- app_draft_id: UUID (FK → app_drafts)
- submitted_by: UUID (FK → auth.users)
- data: JSONB (snapshot completo)
- status: pending | approved | rejected | changes_requested
- reviewer_id: UUID (FK → auth.users)
- reviewer_notes, public_feedback, internal_notes
- submitted_at, reviewed_at
```

#### `app_review_checklist`
Itens de análise administrativa.

```sql
- id: UUID
- submission_id: UUID (FK → app_submissions)
- category: functionality | images | identity | support | pricing
- item: text
- checked: boolean
- notes: text
- created_at
```

#### `app_plans`
Planos de precificação normalizados.

```sql
- id: UUID
- app_draft_id: UUID
- name, currency, price
- billing_period: one-time | monthly | yearly | lifetime
- features[], limits{}
- users_limit, support_level
- activation_method, activation_instructions
- display_order, created_at
```

---

## 🔐 Segurança

### RLS Policies

- **Vendedores**: Veem somente rascunhos da própria organização
- **Admins**: Veem todas as submissões
- **Checklist**: Apenas admins podem gerenciar

### Scraping de URL

✅ **Protocolo**: HTTP(S) somente  
✅ **Bloqueados**: 127.*, 192.168.*, 10.*, 172.16-31.*, ::1, fc00:, fd00:, 169.254.*  
✅ **DNS Revalidado**: Previne TOCTOU  
✅ **Redirects**: Máximo 5  
✅ **Timeout**: 10 segundos  
✅ **Tamanho**: Máximo 5MB  
✅ **Content-Type**: HTML validado  
✅ **Rate Limit**: 5 req/user/hour  

---

## 📄 Rotas

### Para Parceiros

| Rota | Descrição |
|------|-----------|
| `/cadastro-meuapp` | Página inicial de cadastro |
| `/vendedor/aplicativos` | Lista de rascunhos e submissões |
| `/vendedor/aplicativos/[id]/editar` | Editor de 4 etapas |
| `/vendedor/aplicativos/[id]/preview` | Prévia privada |

### Para Admin

| Rota | Descrição |
|------|-----------|
| `/admin/marketplace/submissoes` | Fila de análise |
| `/admin/marketplace/submissoes/[id]` | Detalhe (futuro) |

---

## 🚀 Como Usar

### 1. Aplicar Migration

```bash
# Copiar SQL para Supabase Dashboard → SQL Editor
cat supabase/migrations/20260920230000_app_vendor_marketplace.sql
```

### 2. Criar Organização (Pré-requisito)

Usuário precisa estar vinculado a uma organização via `user_organizations`.

### 3. Acessar Fluxo de Cadastro

```
http://localhost:3000/cadastro-meuapp
```

Visitante → Login → Organização → Começar

### 4. Dois Métodos de Início

**Importação por URL**:
- Insira `https://seuapp.com`
- Sistema scrapes informações públicas
- Cria rascunho editável

**Cadastro Manual**:
- Formulário vazio
- Preenchimento progressivo

### 5. Etapas de Edição

1. **Começar** (✅ Implementada): Seleção de método
2. **Produto e mídia** (🔄 Stub): Campos de descrição, imagens
3. **Oferta e planos** (🔄 Stub): Preços e modalidades
4. **Revisão** (🔄 Stub): Prévia e envio

### 6. Análise Administrativa

```
http://localhost:3000/admin/marketplace/submissoes
```

Admin vê:
- Lista de submissões
- Filtros por status
- Detalhes do cadastro
- Ações: Aprovar / Solicitar Ajustes / Rejeitar

---

## 📊 Fluxo de Estados

```
[Rascunho] → (enviar) → [Em análise]
                            ↓
                    [Ajustes solicitados] → (corrigir + reenviar)
                            ↓
                        [Aprovado] → (publicar) → [Publicado]
                            ↓
                        [Rejeitado] (fim)
```

---

## 🧪 Testes (FASE 5)

### Cenários Testados

- ✅ Criar rascunho manual
- ✅ Importação de URL válida
- ✅ URL bloqueada (privada)
- ✅ Falha de scraping com fallback manual
- ✅ Permissões de organização
- ✅ Acesso não autorizado
- ⏳ Salvamento progressivo (próximo)
- ⏳ Envio sem duplicação (próximo)
- ⏳ Workflow de análise (próximo)

### Para Testar

```bash
# 1. Aplicar migration
# (conforme acima)

# 2. Iniciar dev server
npm run dev

# 3. Navegador
http://localhost:3000/cadastro-meuapp

# 4. Testar métodos
- URL: https://google.com → deve importar título/descrição
- URL: http://127.0.0.1 → deve bloquear
- Manual: formulário vazio → deve criar rascunho
```

---

## 📦 Arquivos

### Migrations
- `supabase/migrations/20260920230000_app_vendor_marketplace.sql` (140 linhas)

### API
- `app/api/scrape-app-info/route.ts` (150 linhas)

### Páginas
- `app/cadastro-meuapp/page.tsx`
- `app/admin/marketplace/submissoes/page.tsx`

### Componentes
- `components/vendor/NewAppFlow.tsx` (componente principal)
- `components/vendor/StepIndicator.tsx` (barra de progresso)
- `components/vendor/steps/StepOne.tsx` (✅ completa)
- `components/vendor/steps/StepTwo.tsx` (🔄 stub)
- `components/vendor/steps/StepThree.tsx` (🔄 stub)
- `components/vendor/steps/StepFour.tsx` (🔄 stub)
- `components/admin/SubmissionsPanel.tsx` (✅ completa)

### Documentação
- `VENDOR_MARKETPLACE.md` (este arquivo)

---

## ⚙️ Configuração

### Env Vars (já existentes)
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### Rate Limiting

Usa `rateLimit` do Redis (existente em `/lib/rate-limit-redis.ts`).

Se não estiver configurado:
```bash
# Instalar redis (opcional para desenvolvimento)
# ou comentar rate-limiting temporariamente
```

### Autenticação

Usa Supabase Auth (existente).

Redireciona visitante não autenticado para `/login` com `redirect=...`

---

## 🔍 Próximas Etapas

1. **Implementar Etapa 2** (Produto e mídia)
   - Upload de logo
   - Galeria de screenshots
   - Validação de dimensões

2. **Implementar Etapa 3** (Oferta e planos)
   - CRUD de planos
   - Campos de precificação
   - Testes de validação

3. **Implementar Etapa 4** (Revisão)
   - Prévia comercial
   - Checklist de pendências
   - Envio oficial

4. **Admin Avançado**
   - Edição de feedback
   - Notificações ao parceiro
   - Histórico de decisões

5. **Integração Stripe** (futuro)
   - Validação de planos no Stripe
   - Criação de produtos/preços
   - Webhook de eventos

---

## 📖 Referências

- Design tokens: `/lib/design-tokens.ts`
- Componentes: `/components/layout/Container.tsx`, etc.
- Autenticação: `/lib/supabase-server.ts`
- Rate limiting: `/lib/rate-limit-redis.ts`

---

**Última atualização**: 20/09/2026  
**Versão**: 1.0 (Fase 1-4 completa)
