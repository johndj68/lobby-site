# Promoções — pedido do parceiro com aprovação do admin (Etapa 7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parceiro pede uma promoção pro próprio plano (desconto % ou preço fixo, período, limite de unidades opcional, elegibilidade pra daily deals opcional) — fica invisível pra compradores até o admin aprovar ou rejeitar.

**Architecture:** Reaproveita a tabela `promotions` já em produção (`is_approved=false` já é invisível pro público, a home já filtra por isso) — só 4 colunas novas (`created_by`, `rejected_at`, `rejected_by`, `rejection_reason`) e 2 RLS novas pro dono ver/criar seus próprios pedidos. Nova rota de pedido do parceiro espelha a validação já existente na rota admin de criação (`computePromoPriceFromPercent`/`roundCents`/`checkPromotionOverlap`, reaproveitados sem reimplementar). A rota admin de ciclo de vida já existente (`PATCH .../promotions/[promotionId]`) ganha 2 ações novas (`approve`/`reject`) em vez de rotas separadas — mesmo padrão `action`-dispatch que `pause`/`resume`/`cancel`/`reactivate` já usam ali.

**Tech Stack:** Next.js App Router, Supabase Postgres (RLS), API routes REST (mesmo padrão já usado em toda rota admin de ofertas — `profiles.role === 'technician'`, sem RPC), `lib/services/offers.ts` (funções já existentes, reaproveitadas).

## Global Constraints

- `internal_note` continua campo só do admin — nunca no formulário do parceiro.
- `getPromotionStatus()` e `checkPromotionOverlap()` (`lib/services/offers.ts`) nunca são alteradas — já fazem exatamente o que esta etapa precisa.
- Pedido do parceiro sempre nasce `is_approved: false, is_active: false` — nunca o contrário, mesmo se o formulário tentar enviar isso (RLS `with check` garante isso no banco, não só no código da rota).
- No máximo 1 pedido pendente (`is_approved=false` e `rejected_at is null` e `cancelled_at is null`) por plano por vez — checado explicitamente antes do insert, 409 claro se já existir.
- Resolver um pedido (aprovar/rejeitar) é sempre compare-and-swap (`.eq('is_approved', false)` na condição do `UPDATE`, nunca confiar só na leitura anterior) — lição da review final da Etapa 6 sobre corrida entre admins concorrentes.
- Checagem de admin em toda rota usa `profiles.role === 'technician'`, mesmo padrão já estabelecido em toda rota de `/api/admin/offers/**`.
- `npx tsc --noEmit` limpo e `npx vitest run` 100% passando (baseline 398 testes) antes de cada commit.

---

### Task 1: 4 colunas novas + RLS + novo literal de auditoria (migração SQL)

**Files:**
- Create: `supabase/migrations/20261003100000_promocoes_pedido_parceiro.sql`
- Modify: `lib/services/app-publish.ts`

**Interfaces:**
- Produces as colunas `created_by`/`rejected_at`/`rejected_by`/`rejection_reason` em `promotions`, consumidas pelas Tasks 2-4.
- Produces o literal `'reject_promotion'` no union type de `logAppAdminEvent`, consumido pela Task 3.

- [ ] **Step 1: Escrever a migração completa**

```sql
-- Etapa 7 do roadmap do parceiro — Promoções. A tabela promotions e toda
-- curadoria já existem (Etapas anteriores do marketplace) — só o admin
-- cria hoje, sempre já aprovada (comentário em
-- app/api/admin/offers/[planId]/promotions/route.ts confirma: "não
-- existe fluxo de submissão de promoção pelo parceiro no projeto").
-- Esta migração fecha essa lacuna reaproveitando is_approved (já
-- default false, já invisível pro público via app/page.tsx) — só
-- adiciona o que falta pra rastrear QUEM pediu e PORQUE foi rejeitado.

alter table public.promotions
  add column if not exists created_by       uuid references auth.users(id) on delete set null,
  add column if not exists rejected_at      timestamptz,
  add column if not exists rejected_by      uuid references auth.users(id) on delete set null,
  add column if not exists rejection_reason text;

comment on column public.promotions.created_by is
  'Quem criou a linha — admin (nasce já is_approved=true) ou o próprio dono do app pedindo uma promoção (nasce is_approved=false).';
comment on column public.promotions.rejected_at is
  'Quando o admin rejeitou um pedido do parceiro — diferente de cancelled_at (que é pra uma promoção JÁ aprovada que o admin decide encerrar antes do previsto).';

-- Hoje só existem: leitura pública (aprovada+ativa+na janela) e
-- is_technician() com acesso total. Nenhuma policy deixa o dono ver ou
-- criar seus próprios pedidos — mesmo padrão de posse já usado em toda
-- etapa anterior (via plan_id → app_plans → app_drafts.created_by).

create policy "owner_select_own_promotions" on public.promotions
  for select to authenticated
  using (
    exists (
      select 1 from public.app_plans p
      join public.app_drafts d on d.id = p.app_draft_id
      where p.id = plan_id and d.created_by = auth.uid()
    )
  );

create policy "owner_insert_own_promotions" on public.promotions
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and is_approved = false
    and is_active = false
    and exists (
      select 1 from public.app_plans p
      join public.app_drafts d on d.id = p.app_draft_id
      where p.id = plan_id and d.created_by = auth.uid()
    )
  );
```

- [ ] **Step 2: Adicionar `'reject_promotion'` ao union type de `logAppAdminEvent`**

Antes (`lib/services/app-publish.ts`, dentro da assinatura de `logAppAdminEvent`):
```typescript
      | 'create_promotion' | 'update_promotion' | 'pause_promotion' | 'cancel_promotion' | 'reactivate_promotion'
```

Depois:
```typescript
      | 'create_promotion' | 'update_promotion' | 'pause_promotion' | 'cancel_promotion' | 'reactivate_promotion'
      | 'reject_promotion'
```

- [ ] **Step 3: Rodar `supabase db push --linked` (confirmar com o usuário antes)**

Não aplicar sem confirmação explícita — mesmo protocolo das migrações anteriores.

- [ ] **Step 4: `npx tsc --noEmit`**

Expected: limpo.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261003100000_promocoes_pedido_parceiro.sql lib/services/app-publish.ts
git commit -m "feat: colunas de pedido/rejeição em promotions + RLS do dono + ação reject_promotion (Etapa 7)"
```

---

### Task 2: Rota de pedido do parceiro

**Files:**
- Create: `app/api/apps/plans/[planId]/promotions/route.ts`

**Interfaces:**
- Consumes: `computePromoPriceFromPercent`/`roundCents`/`checkPromotionOverlap` de `lib/services/offers.ts` (já existentes, não tocados).
- Produces: nada consumido por outra task diretamente (a Task 4 chama esta rota via `fetch`).

- [ ] **Step 1: Criar a rota completa**

```typescript
// app/api/apps/plans/[planId]/promotions/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkPromotionOverlap, computePromoPriceFromPercent, roundCents } from '@/lib/services/offers'

/**
 * Pedido de promoção pelo PRÓPRIO dono do plano — nasce sempre
 * is_approved=false, is_active=false (invisível pro público até o
 * admin aprovar, mesma proteção que app/page.tsx já usa pra decidir o
 * que mostrar). Espelha a validação de
 * app/api/admin/offers/[planId]/promotions/route.ts (a rota admin
 * equivalente, que cria já aprovada) — mesmas funções de
 * lib/services/offers.ts, nunca reimplementadas aqui.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  const { planId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: plan } = await supabase
    .from('app_plans')
    .select('id, app_draft_id, price, currency, status, app_drafts(created_by, application_id)')
    .eq('id', planId)
    .single()
  if (!plan) return NextResponse.json({ error: 'Oferta não encontrada.' }, { status: 404 })

  const draft = Array.isArray(plan.app_drafts) ? plan.app_drafts[0] : plan.app_drafts
  if (!draft || draft.created_by !== user.id) {
    return NextResponse.json({ error: 'Sem permissão para pedir promoção pra este plano.' }, { status: 403 })
  }
  if (plan.status === 'archived') {
    return NextResponse.json({ error: 'Oferta arquivada não pode receber promoção.' }, { status: 400 })
  }
  const applicationId = draft.application_id
  if (!applicationId) {
    return NextResponse.json({ error: 'O aplicativo desta oferta ainda não foi publicado — publique antes de pedir uma promoção.' }, { status: 400 })
  }
  if (plan.price == null) {
    return NextResponse.json({ error: 'Defina o preço regular da oferta antes de pedir uma promoção.' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  const { discountPercent, promoPrice: promoPriceInput, startsAt, endsAt, timezone, unitLimit, eligibleForDailyDeals } = body

  if (!startsAt || !endsAt || isNaN(Date.parse(startsAt)) || isNaN(Date.parse(endsAt))) {
    return NextResponse.json({ error: 'Informe início e término válidos.' }, { status: 400 })
  }
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    return NextResponse.json({ error: 'O término precisa ser posterior ao início.' }, { status: 400 })
  }

  let promoPrice: number
  let discountPercentage: number | null = null
  if (typeof discountPercent === 'number' && discountPercent > 0 && discountPercent < 100) {
    promoPrice = computePromoPriceFromPercent(plan.price, discountPercent)
    discountPercentage = Math.round(discountPercent)
  } else if (typeof promoPriceInput === 'number' && promoPriceInput >= 0) {
    promoPrice = roundCents(promoPriceInput)
    discountPercentage = plan.price > 0 ? Math.round((1 - promoPrice / plan.price) * 100) : null
  } else {
    return NextResponse.json({ error: 'Informe um desconto percentual ou um preço promocional.' }, { status: 400 })
  }
  if (promoPrice >= plan.price) {
    return NextResponse.json({ error: 'O preço promocional precisa ser menor que o preço regular atual.' }, { status: 400 })
  }
  if (promoPrice < 0) {
    return NextResponse.json({ error: 'Preço promocional inválido.' }, { status: 400 })
  }

  // No máximo 1 pedido pendente por plano por vez — checkPromotionOverlap
  // cobre sobreposição de DATAS, não "já existe QUALQUER pendente" (ex:
  // um pedido pendente com datas futuras bem distantes de um novo pedido
  // também futuro, sem sobreposição de data, ainda deveria ser bloqueado).
  const { data: existingPending } = await supabase
    .from('promotions')
    .select('id')
    .eq('plan_id', planId)
    .eq('is_approved', false)
    .is('rejected_at', null)
    .is('cancelled_at', null)
    .maybeSingle()
  if (existingPending) {
    return NextResponse.json({ error: 'Já existe um pedido de promoção aguardando aprovação pra este plano.' }, { status: 409 })
  }

  const overlap = await checkPromotionOverlap(supabase, { applicationId, planId, startsAt, endsAt })
  if (overlap.conflict) {
    return NextResponse.json({ error: 'Já existe uma promoção vigente ou pendente pra esta oferta nesse período.', conflictPromotionId: overlap.withPromotionId }, { status: 409 })
  }

  const { data: created, error } = await supabase
    .from('promotions')
    .insert({
      application_id: applicationId,
      plan_id: planId,
      created_by: user.id,
      promo_price: promoPrice,
      original_price: plan.price,
      discount_percentage: discountPercentage,
      starts_at: startsAt,
      ends_at: endsAt,
      timezone: typeof timezone === 'string' && timezone ? timezone : 'America/Sao_Paulo',
      unit_limit: typeof unitLimit === 'number' && unitLimit > 0 ? Math.round(unitLimit) : null,
      eligible_for_daily_deals: !!eligibleForDailyDeals,
      is_approved: false,
      is_active: false,
    })
    .select('id')
    .single()

  if (error || !created) {
    console.error('[plan promotions POST]', error)
    return NextResponse.json({ error: 'Não foi possível registrar o pedido de promoção. Tente novamente.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id: created.id })
}
```

- [ ] **Step 2: `npx tsc --noEmit`**

Expected: limpo.

- [ ] **Step 3: Commit**

```bash
git add "app/api/apps/plans/[planId]/promotions/route.ts"
git commit -m "feat: rota de pedido de promoção pelo dono do plano (Etapa 7)"
```

---

### Task 3: Aprovar/rejeitar (rota admin existente + nova página de fila)

**Files:**
- Modify: `app/api/admin/offers/promotions/[promotionId]/route.ts` (adicionar ações `approve`/`reject`)
- Create: `app/admin/marketplace/promocoes/page.tsx`
- Create: `app/admin/marketplace/promocoes/PromocoesClient.tsx`
- Modify: `app/admin/marketplace/MarketplaceClient.tsx` (adicionar aba "Promoções" ao `NAV_TABS`)
- Modify: `app/admin/marketplace/ofertas/OfertasClient.tsx` (idem)
- Modify: `app/admin/marketplace/comissoes/ComissoesClient.tsx` (idem)
- Modify: `app/admin/marketplace/aplicativos/AplicativosClient.tsx` (idem)
- Modify: `app/admin/marketplace/parceiros/ParceirosClient.tsx` (idem)
- Modify: `app/admin/marketplace/destaques/DestaquesClient.tsx` (idem)
- Modify: `app/admin/marketplace/categorias/CategoriasClient.tsx` (idem)
- Modify: `app/admin/marketplace/repasses/RepassesClient.tsx` (idem)
- Modify: `app/admin/marketplace/precos/PrecosClient.tsx` (idem)

**Interfaces:**
- Consumes: colunas novas de `promotions` (Task 1), `checkPromotionOverlap` (`lib/services/offers.ts`), `logAppAdminEvent` com o novo literal `'reject_promotion'` (Task 1).

- [ ] **Step 1: Adicionar as ações `approve`/`reject` na rota existente**

Antes (início do arquivo até a linha 40, resto do arquivo — `pause`/`resume`/`cancel`/`reactivate` — fica intocado):
```typescript
  const { data: promo } = await supabase
    .from('promotions')
    .select('id, application_id, plan_id, ends_at, cancelled_at, paused_at, app_plans(app_draft_id)')
    .eq('id', promotionId)
    .single()
  if (!promo) return NextResponse.json({ error: 'Promoção não encontrada.' }, { status: 404 })
  const appDraftId = Array.isArray(promo.app_plans) ? promo.app_plans[0]?.app_draft_id : (promo.app_plans as { app_draft_id: string } | null)?.app_draft_id ?? null

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  const { action } = body

  if (action === 'pause') {
```

Depois:
```typescript
  const { data: promo } = await supabase
    .from('promotions')
    .select('id, application_id, plan_id, promo_price, starts_at, ends_at, is_approved, cancelled_at, paused_at, rejected_at, app_plans(app_draft_id, price)')
    .eq('id', promotionId)
    .single()
  if (!promo) return NextResponse.json({ error: 'Promoção não encontrada.' }, { status: 404 })
  const planInfo = Array.isArray(promo.app_plans) ? promo.app_plans[0] : promo.app_plans
  const appDraftId = planInfo?.app_draft_id ?? null

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  const { action } = body

  if (action === 'approve') {
    if (promo.is_approved) return NextResponse.json({ error: 'Este pedido já foi aprovado.' }, { status: 409 })
    if (promo.cancelled_at || promo.rejected_at) return NextResponse.json({ error: 'Este pedido já foi resolvido.' }, { status: 409 })

    // O preço regular do plano pode ter mudado desde o pedido (ex: uma
    // mudança de preço da Etapa 6 foi aprovada nesse meio-tempo) — nunca
    // aprovar um "desconto" que virou preço igual ou maior que o atual.
    if (planInfo?.price != null && promo.promo_price >= planInfo.price) {
      return NextResponse.json({ error: 'O preço regular da oferta mudou desde o pedido — peça uma nova promoção com o preço atual.' }, { status: 400 })
    }

    const overlap = await checkPromotionOverlap(supabase, { applicationId: promo.application_id, planId: promo.plan_id, startsAt: promo.starts_at, endsAt: promo.ends_at, excludePromotionId: promotionId })
    if (overlap.conflict) {
      return NextResponse.json({ error: 'Já existe uma promoção vigente pra esta oferta nesse período — não dá pra aprovar agora.', conflictPromotionId: overlap.withPromotionId }, { status: 409 })
    }

    const { data: resolved, error: approveError } = await supabase
      .from('promotions')
      .update({ is_approved: true, is_active: true })
      .eq('id', promotionId)
      .eq('is_approved', false)
      .select('id')
      .single()
    if (approveError || !resolved) {
      return NextResponse.json({ error: 'Este pedido já foi resolvido.' }, { status: 409 })
    }

    await logAppAdminEvent(supabase, { appDraftId, applicationId: promo.application_id, planId: promo.plan_id, promotionId, actorId: user.id, action: 'create_promotion', reason: null, previousStatus: 'pendente', newStatus: `promoção ${promo.promo_price} aprovada` })
    return NextResponse.json({ ok: true })
  }

  if (action === 'reject') {
    if (promo.is_approved) return NextResponse.json({ error: 'Este pedido já foi aprovado — não pode mais ser rejeitado.' }, { status: 409 })
    if (promo.rejected_at) return NextResponse.json({ error: 'Este pedido já foi rejeitado.' }, { status: 409 })
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    if (!reason) return NextResponse.json({ error: 'Informe o motivo da rejeição.' }, { status: 400 })

    const { data: resolved, error: rejectError } = await supabase
      .from('promotions')
      .update({ rejected_at: new Date().toISOString(), rejected_by: user.id, rejection_reason: reason })
      .eq('id', promotionId)
      .eq('is_approved', false)
      .is('rejected_at', null)
      .select('id')
      .single()
    if (rejectError || !resolved) {
      return NextResponse.json({ error: 'Este pedido já foi resolvido.' }, { status: 409 })
    }

    await logAppAdminEvent(supabase, { appDraftId, applicationId: promo.application_id, planId: promo.plan_id, promotionId, actorId: user.id, action: 'reject_promotion', reason, previousStatus: 'pendente', newStatus: 'rejeitada' })
    return NextResponse.json({ ok: true })
  }

  if (action === 'pause') {
```

(a checagem `role === 'technician'` já existe antes desse trecho, intocada — `user` já está em escopo. O resto do arquivo, abaixo de `if (action === 'pause') {`, fica exatamente como está hoje.)

- [ ] **Step 2: Criar `app/admin/marketplace/promocoes/page.tsx`**

```tsx
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireTechnicianSession } from '@/lib/services/profile'
import PromocoesClient from './PromocoesClient'

export default async function PromocoesPage() {
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireTechnicianSession(supabase)

  const { data: rows, error: loadError } = await supabase
    .from('promotions')
    .select(`
      id, promo_price, original_price, discount_percentage, starts_at, ends_at,
      is_approved, rejected_at, rejection_reason, created_by, created_at,
      app_plans ( id, name, price, currency, billing_period, app_draft_id, app_drafts ( id, name ) )
    `)
    .is('cancelled_at', null)
    .order('created_at', { ascending: false })
    .limit(200)

  const requesterIds = [...new Set((rows ?? []).map(r => r.created_by).filter(Boolean))]
  const { data: requesterProfiles } = requesterIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', requesterIds)
    : { data: [] }
  const requesterById = new Map((requesterProfiles ?? []).map(p => [p.id, p]))

  const mapped = (rows ?? []).map(r => {
    const plan = Array.isArray(r.app_plans) ? r.app_plans[0] : r.app_plans
    const draft = plan ? (Array.isArray(plan.app_drafts) ? plan.app_drafts[0] : plan.app_drafts) : null
    const requester = requesterById.get(r.created_by)
    return {
      id: r.id,
      status: (r.is_approved ? 'aprovado' : r.rejected_at ? 'rejeitado' : 'pendente') as 'pendente' | 'aprovado' | 'rejeitado',
      appName: draft?.name ?? 'Aplicativo removido',
      planName: plan?.name ?? 'Plano removido',
      currency: plan?.currency ?? 'BRL',
      billingPeriod: plan?.billing_period ?? null,
      originalPrice: r.original_price,
      promoPrice: r.promo_price,
      discountPercentage: r.discount_percentage,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      rejectionReason: r.rejection_reason,
      requesterName: requester?.full_name || requester?.email || 'Desconhecido',
      createdAt: r.created_at,
    }
  })

  const pending = mapped.filter(r => r.status === 'pendente')
  const history = mapped.filter(r => r.status !== 'pendente')

  return <PromocoesClient user={user} profile={profile} pending={pending} history={history} loadError={!!loadError} />
}
```

- [ ] **Step 3: Criar `app/admin/marketplace/promocoes/PromocoesClient.tsx`**

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, X, Loader2, AlertTriangle } from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import AdminShell from '@/components/layout/AdminShell'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { MARKETPLACE_COLORS as C, formatDateTimeBR } from '@/lib/marketplace'
import { formatOfferPrice } from '@/lib/services/offers'

const NAV_TABS = [
  { label: 'Visão geral', href: '/admin/marketplace', enabled: true },
  { label: 'Aplicativos', href: '/admin/marketplace/aplicativos', enabled: true },
  { label: 'Solicitações', href: '/admin/marketplace/solicitacoes', enabled: true },
  { label: 'Ofertas', href: '/admin/marketplace/ofertas', enabled: true },
  { label: 'Destaques', href: '/admin/marketplace/destaques', enabled: true },
  { label: 'Categorias', href: '/admin/marketplace/categorias', enabled: true },
  { label: 'Parceiros', href: '/admin/marketplace/parceiros', enabled: true },
  { label: 'Comissões', href: '/admin/marketplace/comissoes', enabled: true },
  { label: 'Repasses', href: '/admin/marketplace/repasses', enabled: true },
  { label: 'Preços', href: '/admin/marketplace/precos', enabled: true },
  { label: 'Promoções', href: '/admin/marketplace/promocoes', enabled: true },
]

interface Row {
  id: string
  status: 'pendente' | 'aprovado' | 'rejeitado'
  appName: string
  planName: string
  currency: string
  billingPeriod: string | null
  originalPrice: number | null
  promoPrice: number
  discountPercentage: number | null
  startsAt: string
  endsAt: string
  rejectionReason: string | null
  requesterName: string
  createdAt: string
}

interface Props {
  user: SupabaseUser
  profile: { full_name?: string; email?: string } | null
  pending: Row[]
  history: Row[]
  loadError: boolean
}

function priceLabel(row: Row): string {
  const promo = formatOfferPrice(row.promoPrice, row.currency, row.billingPeriod)
  const original = row.originalPrice != null ? formatOfferPrice(row.originalPrice, row.currency, row.billingPeriod) : '—'
  const pct = row.discountPercentage != null ? ` (-${row.discountPercentage}%)` : ''
  return `${original} → ${promo}${pct}`
}

export default function PromocoesClient({ user, profile, pending: initialPending, history, loadError }: Props) {
  const router = useRouter()
  const [pending, setPending] = useState(initialPending)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<Row | null>(null)
  const [rejectNotes, setRejectNotes] = useState('')

  async function handleApprove(row: Row) {
    setBusyId(row.id)
    try {
      const res = await fetch(`/api/admin/offers/promotions/${row.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Falha ao aprovar.')
      setPending(prev => prev.filter(r => r.id !== row.id))
      toast.success(`Promoção de "${row.planName}" aprovada.`)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível aprovar.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleReject() {
    if (!rejecting || !rejectNotes.trim()) return
    setBusyId(rejecting.id)
    try {
      const res = await fetch(`/api/admin/offers/promotions/${rejecting.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reject', reason: rejectNotes.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Falha ao rejeitar.')
      setPending(prev => prev.filter(r => r.id !== rejecting.id))
      toast.success('Pedido rejeitado.')
      setRejecting(null)
      setRejectNotes('')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível rejeitar.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <AdminShell user={user} profile={profile}>
      <div style={{ background: C.bg, minHeight: '100vh' }} className="px-4 py-6 sm:px-6 lg:px-8">
        <p className="mb-2 text-xs" style={{ color: C.textSecondary }}>
          <Link href="/admin/marketplace" className="hover:underline">Marketplace</Link> / Promoções
        </p>

        <div className="mb-5">
          <h1 className="text-2xl font-bold sm:text-3xl" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Promoções</h1>
          <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>Pedidos de promoção de parceiros aguardando aprovação.</p>
        </div>

        <nav aria-label="Seções do marketplace" className="mb-6 flex flex-wrap gap-1 border-b" style={{ borderColor: C.border }}>
          {NAV_TABS.map(tab => {
            const active = tab.href === '/admin/marketplace/promocoes'
            if (!tab.enabled) return <span key={tab.href} title="Esta área ainda não foi implementada." aria-disabled="true" className="cursor-not-allowed px-3 py-2.5 text-sm font-medium opacity-40" style={{ color: C.textSecondary }}>{tab.label}</span>
            return <Link key={tab.href} href={tab.href} className="px-3 py-2.5 text-sm font-medium" style={{ color: active ? C.primary : C.textSecondary, borderBottom: active ? `2px solid ${C.primary}` : '2px solid transparent' }}>{tab.label}</Link>
          })}
        </nav>

        {loadError && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: C.error, background: 'rgba(239,68,68,0.08)', color: C.text }}>
            <AlertTriangle size={16} style={{ color: C.error }} aria-hidden="true" />
            Não foi possível carregar os pedidos agora. Recarregue a página para tentar de novo.
          </div>
        )}

        <div className="space-y-6">
          <div className="rounded-2xl border p-5" style={{ borderColor: C.border, background: C.card }}>
            <h2 className="mb-3 text-base font-bold" style={{ color: C.text }}>Pendentes ({pending.length})</h2>
            {pending.length === 0 ? (
              <p className="text-sm" style={{ color: C.textSecondary }}>Nenhum pedido pendente.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {pending.map(row => (
                  <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3" style={{ borderColor: C.border }}>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: C.text }}>{row.appName} — {row.planName}</p>
                      <p className="text-xs" style={{ color: C.textSecondary }}>
                        {priceLabel(row)} · {formatDateTimeBR(row.startsAt)} → {formatDateTimeBR(row.endsAt)} · pedido por {row.requesterName} em {formatDateTimeBR(row.createdAt)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" disabled={busyId === row.id} onClick={() => handleApprove(row)}
                        className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50" style={{ background: '#10B981' }}>
                        {busyId === row.id ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Check size={12} aria-hidden="true" />}
                        Aprovar
                      </button>
                      <button type="button" disabled={busyId === row.id} onClick={() => setRejecting(row)}
                        className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-50" style={{ borderColor: '#EF4444', color: '#EF4444' }}>
                        <X size={12} aria-hidden="true" />
                        Rejeitar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border p-5" style={{ borderColor: C.border, background: C.card }}>
            <h2 className="mb-3 text-base font-bold" style={{ color: C.text }}>Histórico</h2>
            {history.length === 0 ? (
              <p className="text-sm" style={{ color: C.textSecondary }}>Nenhum pedido resolvido ainda.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr style={{ color: C.textSecondary }}>
                      <th className="pb-2 pr-3 font-semibold">App / Plano</th>
                      <th className="pb-2 pr-3 font-semibold">Promoção</th>
                      <th className="pb-2 pr-3 font-semibold">Status</th>
                      <th className="pb-2 font-semibold">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(row => (
                      <tr key={row.id} className="border-t" style={{ borderColor: C.border }}>
                        <td className="py-2 pr-3" style={{ color: C.text }}>{row.appName} — {row.planName}</td>
                        <td className="py-2 pr-3" style={{ color: C.textSecondary }}>{priceLabel(row)}</td>
                        <td className="py-2 pr-3">
                          <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ color: row.status === 'aprovado' ? '#10B981' : '#EF4444', background: row.status === 'aprovado' ? '#10B9811A' : '#EF44441A' }}>
                            {row.status === 'aprovado' ? 'Aprovado' : 'Rejeitado'}
                          </span>
                          {row.status === 'rejeitado' && row.rejectionReason && (
                            <p className="mt-1 text-xs" style={{ color: C.textSecondary }}>{row.rejectionReason}</p>
                          )}
                        </td>
                        <td className="py-2" style={{ color: C.textSecondary }}>{formatDateTimeBR(row.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!rejecting}
        onOpenChange={next => { if (!next) { setRejecting(null); setRejectNotes('') } }}
        title="Rejeitar pedido de promoção?"
        description={rejecting ? <>
          {rejecting.appName} — {rejecting.planName}: {priceLabel(rejecting)}
          <textarea
            value={rejectNotes}
            onChange={e => setRejectNotes(e.target.value)}
            placeholder="Motivo da rejeição (obrigatório)"
            className="mt-3 w-full rounded-lg border p-2 text-sm"
            style={{ borderColor: C.border, color: C.text }}
            rows={3}
          />
        </> : ''}
        confirmLabel="Rejeitar"
        confirmingLabel="Rejeitando…"
        icon={X}
        variant="destructive"
        busy={busyId === rejecting?.id}
        onConfirm={handleReject}
      />
    </AdminShell>
  )
}
```

**Nota de implementação:** `ConfirmDialog`'s real prop interface foi verificada na Etapa 6 (`components/admin/ConfirmDialog.tsx`) — `icon`/`confirmingLabel` são obrigatórios, `description` aceita `ReactNode` (por isso o `<textarea>` vai dentro do `description` acima, não como `children` — não existe prop `children` nesse componente), não existe `confirmDisabled`. **Ler o componente real antes de usar** pra confirmar que nada mudou desde a Etapa 6, e ajustar se divergir — não adivinhar. Se o botão de confirmar precisar ficar desabilitado sem motivo preenchido (já que não existe `confirmDisabled`), replicar a mesma solução já usada em `PrecosClient.tsx`: `handleReject` retorna cedo com `toast.error(...)` quando `rejectNotes.trim()` está vazio, em vez de depender de um prop que não existe.

- [ ] **Step 4: Adicionar a aba "Promoções" ao `NAV_TABS` dos outros 9 arquivos admin**

Em cada um dos arquivos abaixo, adicionar a linha `{ label: 'Promoções', href: '/admin/marketplace/promocoes', enabled: true },` logo depois da linha `{ label: 'Preços', href: '/admin/marketplace/precos', enabled: true },` dentro do array `NAV_TABS` já existente (mesmo formato, mesma posição relativa — só acrescentar a linha):

- `app/admin/marketplace/MarketplaceClient.tsx`
- `app/admin/marketplace/ofertas/OfertasClient.tsx`
- `app/admin/marketplace/comissoes/ComissoesClient.tsx`
- `app/admin/marketplace/aplicativos/AplicativosClient.tsx`
- `app/admin/marketplace/parceiros/ParceirosClient.tsx`
- `app/admin/marketplace/destaques/DestaquesClient.tsx`
- `app/admin/marketplace/categorias/CategoriasClient.tsx`
- `app/admin/marketplace/repasses/RepassesClient.tsx`
- `app/admin/marketplace/precos/PrecosClient.tsx`

(`PromocoesClient.tsx`, criado no Step 3, já nasce com a aba incluída — não editar de novo.)

- [ ] **Step 5: `npx tsc --noEmit`**

Expected: limpo.

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/offers/promotions app/admin/marketplace/promocoes app/admin/marketplace/MarketplaceClient.tsx app/admin/marketplace/ofertas/OfertasClient.tsx app/admin/marketplace/comissoes/ComissoesClient.tsx app/admin/marketplace/aplicativos/AplicativosClient.tsx app/admin/marketplace/parceiros/ParceirosClient.tsx app/admin/marketplace/destaques/DestaquesClient.tsx app/admin/marketplace/categorias/CategoriasClient.tsx app/admin/marketplace/repasses/RepassesClient.tsx app/admin/marketplace/precos/PrecosClient.tsx
git commit -m "feat: aprovar/rejeitar pedido de promoção + página admin de fila + aba Promoções na navegação (Etapa 7)"
```

---

### Task 4: Página "Ofertas e promoções" do parceiro

**Files:**
- Modify: `app/dashboard/financeiro/ofertas/page.tsx`
- Create: `app/dashboard/financeiro/ofertas/OfertasPromocoesClient.tsx`

**Interfaces:**
- Consumes: a rota de pedido (Task 2), colunas novas de `promotions` (Task 1), `getPromotionStatus`/`formatOfferPrice` (`lib/services/offers.ts`, já existentes).

- [ ] **Step 1: Substituir `page.tsx`**

Antes (arquivo inteiro):
```tsx
import type { Metadata } from 'next'
import { colors } from '@/lib/design-tokens'

export const metadata: Metadata = { title: 'Ofertas e promoções | LOBBY', robots: { index: false, follow: false } }

export default function FinanceiroOfertasPage() {
  return (
    <div>
      <h2 className="mb-2 text-lg font-bold" style={{ color: colors.text }}>Ofertas e promoções</h2>
      <p className="text-sm" style={{ color: colors.textSecondary }}>
        Em construção — essa área está sendo desenvolvida.
      </p>
    </div>
  )
}
```

Depois (arquivo inteiro):
```tsx
import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { colors } from '@/lib/design-tokens'
import OfertasPromocoesClient, { type PlanOption, type PromotionRow } from './OfertasPromocoesClient'

export const metadata: Metadata = { title: 'Ofertas e promoções | LOBBY', robots: { index: false, follow: false } }

export default async function FinanceiroOfertasPage() {
  const supabase = await createServerSupabaseClient()
  const { user } = await requireClientSession(supabase)

  // Todos os planos de todos os apps deste dono — mesma checagem de
  // posse (app_drafts.created_by) já usada em toda rota de edição de
  // plano, sem precisar de RPC.
  const { data: drafts } = await supabase.from('app_drafts').select('id, name').eq('created_by', user.id)
  const draftIds = (drafts ?? []).map(d => d.id)
  const draftNameById = new Map((drafts ?? []).map(d => [d.id, d.name]))

  const { data: plans } = draftIds.length
    ? await supabase.from('app_plans').select('id, app_draft_id, name, price, currency, billing_period').in('app_draft_id', draftIds)
    : { data: [] }

  const planOptions: PlanOption[] = (plans ?? []).map(p => ({
    id: p.id,
    appName: draftNameById.get(p.app_draft_id) ?? 'Aplicativo sem nome',
    planName: p.name,
    price: p.price,
    currency: p.currency ?? 'BRL',
    billingPeriod: p.billing_period,
  }))

  const planIds = planOptions.map(p => p.id)
  const { data: promotions, error: loadError } = planIds.length
    ? await supabase
        .from('promotions')
        .select('id, plan_id, promo_price, original_price, discount_percentage, starts_at, ends_at, is_approved, is_active, cancelled_at, paused_at, rejected_at, rejection_reason')
        .in('plan_id', planIds)
        .order('created_at', { ascending: false })
    : { data: [] as never[], error: null }

  const promotionRows: PromotionRow[] = (promotions ?? []).map(p => {
    const plan = planOptions.find(opt => opt.id === p.plan_id)
    return {
      id: p.id,
      planId: p.plan_id,
      appName: plan?.appName ?? '—',
      planName: plan?.planName ?? '—',
      currency: plan?.currency ?? 'BRL',
      billingPeriod: plan?.billingPeriod ?? null,
      promoPrice: p.promo_price,
      originalPrice: p.original_price,
      discountPercentage: p.discount_percentage,
      startsAt: p.starts_at,
      endsAt: p.ends_at,
      isApproved: p.is_approved,
      isActive: p.is_active,
      cancelledAt: p.cancelled_at,
      pausedAt: p.paused_at,
      rejectedAt: p.rejected_at,
      rejectionReason: p.rejection_reason,
    }
  })

  return (
    <div>
      <h2 className="mb-2 text-lg font-bold" style={{ color: colors.text }}>Ofertas e promoções</h2>
      <p className="mb-5 text-sm" style={{ color: colors.textSecondary }}>
        Peça um desconto por tempo limitado pra um dos seus planos — fica invisível pra compradores até o admin aprovar.
      </p>
      <OfertasPromocoesClient plans={planOptions} promotions={promotionRows} loadError={!!loadError} />
    </div>
  )
}
```

- [ ] **Step 2: Criar `OfertasPromocoesClient.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Loader2 } from 'lucide-react'
import { colors, shadows } from '@/lib/design-tokens'
import { getPromotionStatus, formatOfferPrice } from '@/lib/services/offers'

export interface PlanOption {
  id: string
  appName: string
  planName: string
  price: number | null
  currency: string
  billingPeriod: string | null
}

export interface PromotionRow {
  id: string
  planId: string
  appName: string
  planName: string
  currency: string
  billingPeriod: string | null
  promoPrice: number
  originalPrice: number | null
  discountPercentage: number | null
  startsAt: string
  endsAt: string
  isApproved: boolean
  isActive: boolean
  cancelledAt: string | null
  pausedAt: string | null
  rejectedAt: string | null
  rejectionReason: string | null
}

const STATUS_LABEL_OVERRIDE: Record<string, string> = { rascunho: 'Aguardando aprovação' }

interface Props {
  plans: PlanOption[]
  promotions: PromotionRow[]
  loadError: boolean
}

export default function OfertasPromocoesClient({ plans, promotions: initialPromotions, loadError }: Props) {
  const [promotions, setPromotions] = useState(initialPromotions)
  const [showForm, setShowForm] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState(plans[0]?.id ?? '')
  const [discountPercent, setDiscountPercent] = useState('')
  const [promoPrice, setPromoPrice] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [unitLimit, setUnitLimit] = useState('')
  const [eligibleForDailyDeals, setEligibleForDailyDeals] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selectedPlan = plans.find(p => p.id === selectedPlanId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedPlanId) { setError('Selecione um plano.'); return }
    if (!startsAt || !endsAt) { setError('Informe início e término.'); return }
    if (!discountPercent && !promoPrice) { setError('Informe um desconto percentual ou um preço promocional.'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/apps/plans/${selectedPlanId}/promotions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discountPercent: discountPercent ? Number(discountPercent) : undefined,
          promoPrice: promoPrice ? Number(promoPrice) : undefined,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          unitLimit: unitLimit ? Number(unitLimit) : undefined,
          eligibleForDailyDeals,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Não foi possível enviar o pedido.')
      toast.success('Pedido de promoção enviado pra aprovação.')
      setShowForm(false)
      setDiscountPercent(''); setPromoPrice(''); setStartsAt(''); setEndsAt(''); setUnitLimit(''); setEligibleForDailyDeals(false)
      setPromotions(prev => [{
        id: data.id, planId: selectedPlanId,
        appName: selectedPlan?.appName ?? '—', planName: selectedPlan?.planName ?? '—',
        currency: selectedPlan?.currency ?? 'BRL', billingPeriod: selectedPlan?.billingPeriod ?? null,
        promoPrice: discountPercent ? 0 : Number(promoPrice), originalPrice: selectedPlan?.price ?? null,
        discountPercentage: discountPercent ? Number(discountPercent) : null,
        startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(),
        isApproved: false, isActive: false, cancelledAt: null, pausedAt: null, rejectedAt: null, rejectionReason: null,
      }, ...prev])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível enviar o pedido.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {loadError && (
        <p className="mb-4 text-sm" style={{ color: '#EF4444' }}>Não foi possível carregar suas promoções agora. Recarregue a página.</p>
      )}

      {plans.length === 0 ? (
        <p className="text-sm" style={{ color: colors.textSecondary }}>Cadastre um plano com preço definido antes de pedir uma promoção.</p>
      ) : (
        <>
          {!showForm ? (
            <button type="button" onClick={() => setShowForm(true)}
              className="mb-5 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white" style={{ background: colors.primary }}>
              <Plus size={14} aria-hidden="true" /> Pedir promoção
            </button>
          ) : (
            <form onSubmit={handleSubmit} className="mb-5 space-y-3 rounded-2xl border p-5" style={{ borderColor: colors.border, background: colors.backgroundAlt }}>
              <div>
                <label className="mb-1 block text-xs font-semibold" style={{ color: colors.text }}>Plano</label>
                <select value={selectedPlanId} onChange={e => setSelectedPlanId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: colors.border, color: colors.text }}>
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>{p.appName} — {p.planName} ({p.price != null ? formatOfferPrice(p.price, p.currency, p.billingPeriod) : 'sem preço'})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold" style={{ color: colors.text }}>Desconto percentual</label>
                  <input type="number" min={1} max={99} value={discountPercent} onChange={e => { setDiscountPercent(e.target.value); setPromoPrice('') }} placeholder="Ex: 30" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: colors.border, color: colors.text }} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold" style={{ color: colors.text }}>Ou preço promocional</label>
                  <input type="number" min={0} step="0.01" value={promoPrice} onChange={e => { setPromoPrice(e.target.value); setDiscountPercent('') }} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: colors.border, color: colors.text }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold" style={{ color: colors.text }}>Início</label>
                  <input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: colors.border, color: colors.text }} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold" style={{ color: colors.text }}>Término</label>
                  <input type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: colors.border, color: colors.text }} />
                </div>
              </div>
              <p className="text-[11px]" style={{ color: colors.textMuted }}>Fuso: America/Sao_Paulo · início inclusivo, término exclusivo.</p>
              <div>
                <label className="mb-1 block text-xs font-semibold" style={{ color: colors.text }}>Limite de unidades (opcional)</label>
                <input type="number" min={1} value={unitLimit} onChange={e => setUnitLimit(e.target.value)} placeholder="Sem limite" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: colors.border, color: colors.text }} />
              </div>
              <label className="flex items-start gap-2 text-xs" style={{ color: colors.text }}>
                <input type="checkbox" checked={eligibleForDailyDeals} onChange={e => setEligibleForDailyDeals(e.target.checked)} className="mt-0.5" />
                <span>Elegível para promoções do dia<br /><span style={{ color: colors.textSecondary }}>Não garante exibição — depende de disponibilidade na curadoria.</span></span>
              </label>
              {error && <p className="text-sm font-medium" style={{ color: '#DC2626' }}>{error}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowForm(false)} disabled={saving} className="flex-1 rounded-xl border py-2.5 text-sm font-semibold disabled:opacity-60" style={{ borderColor: colors.border, color: colors.text }}>Cancelar</button>
                <button type="submit" disabled={saving} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-60" style={{ background: colors.primary }}>
                  {saving && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} {saving ? 'Enviando…' : 'Enviar pedido'}
                </button>
              </div>
            </form>
          )}

          {promotions.length === 0 ? (
            <p className="text-sm" style={{ color: colors.textSecondary }}>Nenhuma promoção pedida ainda.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {promotions.map(p => {
                const status = getPromotionStatus({ is_approved: p.isApproved, is_active: p.isActive, starts_at: p.startsAt, ends_at: p.endsAt, cancelled_at: p.cancelledAt, paused_at: p.pausedAt })
                const label = STATUS_LABEL_OVERRIDE[status.key] ?? status.label
                return (
                  <div key={p.id} className="rounded-2xl border p-4" style={{ borderColor: colors.border, background: colors.card, boxShadow: shadows.card }}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold" style={{ color: colors.text }}>{p.appName} — {p.planName}</p>
                      <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ color: status.color, background: `${status.color}1A` }}>{label}</span>
                    </div>
                    <p className="mt-1 text-xs" style={{ color: colors.textSecondary }}>
                      {formatOfferPrice(p.promoPrice, p.currency, p.billingPeriod)}{p.discountPercentage != null && ` (-${p.discountPercentage}%)`} · {new Date(p.startsAt).toLocaleDateString('pt-BR')} → {new Date(p.endsAt).toLocaleDateString('pt-BR')}
                    </p>
                    {p.rejectedAt && p.rejectionReason && (
                      <p className="mt-1 text-xs" style={{ color: '#EF4444' }}>Motivo da rejeição: {p.rejectionReason}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: `npx tsc --noEmit`**

Expected: limpo.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/financeiro/ofertas/page.tsx app/dashboard/financeiro/ofertas/OfertasPromocoesClient.tsx
git commit -m "feat: página Ofertas e promoções do parceiro — pedir e acompanhar promoções (Etapa 7)"
```

---

### Task 5: Verificação manual no navegador

**Files:** nenhum arquivo novo — só dados de teste temporários + checagem.

**Interfaces:** nenhuma — task de verificação, não de código.

- [ ] **Step 1: Criar conta de teste (parceiro com app + plano com preço) + conta admin**

Mesmo padrão das etapas anteriores. Reaproveitar uma conta admin
(`role='technician'`) já existente se ainda houver uma de uma etapa
anterior, ou criar nova.

- [ ] **Step 2: Login como parceiro, pedir uma promoção**

Em `/dashboard/financeiro/ofertas`: pedir um desconto (ex: 30%) com
período futuro. Confirmar: a promoção aparece na lista com status
"Aguardando aprovação", **não aparece na home** (`/`) mesmo que o
período já tenha começado agora. Tentar pedir outra promoção pro mesmo
plano antes de resolver a primeira → bloqueado com 409 claro.

- [ ] **Step 3: Login como admin, abrir `/admin/marketplace/promocoes`**

Confirmar: o pedido aparece em "Pendentes" com os valores certos.
Rejeitar com um motivo.

- [ ] **Step 4: Parceiro vê a rejeição, pede de novo, admin aprova**

Recarregar `/dashboard/financeiro/ofertas` como parceiro — confirmar
"Rejeitado" + motivo visível. Pedir de novo (agora desbloqueado) com um
período que já começou. Admin aprova em `/admin/marketplace/promocoes`.
Confirmar: a promoção aparece na home (`/`) dentro do preço
promocional, e no detalhe da oferta do admin
(`/admin/marketplace/ofertas/[offerId]`, aba Promoções) com status
"Ativa".

- [ ] **Step 5: Limpar os dados de teste**

Apagar `promotions`/`app_plans`/`app_drafts`/`applications`/contas de
teste criadas — mesmo cuidado das etapas anteriores. Não apagar a conta
admin se for reaproveitada de uma etapa anterior.
