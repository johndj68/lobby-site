# Preços publicados — aprovação de mudança de preço (Etapa 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toda mudança de `price`/`billing_period` num plano já existente passa a exigir aprovação do admin antes de valer — hoje é instantânea e sem histórico, inclusive em app publicado e vendendo.

**Architecture:** Tabela nova `plan_price_change_requests` registra o pedido (snapshot do valor atual + valor pedido). `PATCH /api/apps/plans/[id]` para de aplicar `price`/`billing_period` direto quando mudam — cria um pedido `pendente` em vez disso (outros campos continuam diretos). Admin aprova/rejeita numa página nova (`/admin/marketplace/precos`); aprovar aplica de verdade no `app_plans`. Dono vê o status direto no card do plano, na aba "Oferta e planos" — sem área nova no dashboard do cliente.

**Tech Stack:** Next.js App Router, Supabase Postgres (RLS, índice único parcial), API routes REST (mesmo padrão já usado nas rotas admin de ofertas — checagem `profiles.role === 'technician'`, sem RPC).

## Global Constraints

- Só `price` e `billing_period` entram no gate de aprovação — nome, descrição, features, `users_limit`, `support_level` continuam edição direta e instantânea, sem exceção.
- Criar um plano **novo** nunca passa por aprovação — só editar um plano que **já existe**. O gate vive inteiramente dentro do handler `PATCH`, nunca no `POST` de criação.
- Se o preço/periodicidade pedido é **igual** ao atual, não cria pedido nenhum — trata como "sem mudança real", aplica o resto do payload normalmente.
- No máximo 1 pedido `pendente` por plano — um segundo pedido enquanto o primeiro está pendente retorna 409, nunca empilha.
- Aprovar só marca `status='aprovado'` depois que o `UPDATE` em `app_plans` realmente afetou uma linha — nunca marcar resolvido um pedido cuja aplicação falhou silenciosamente.
- Checagem de admin em toda rota nova usa o mesmo padrão já estabelecido em `app/api/admin/offers/route.ts`: `profiles.role === 'technician'`, não `is_leader` (ação de curadoria de catálogo, não movimentação financeira).
- `npx tsc --noEmit` limpo e `npx vitest run` 100% passando (baseline 398 testes) antes de cada commit.

---

### Task 1: Tabela `plan_price_change_requests` (migração SQL)

**Files:**
- Create: `supabase/migrations/20261002150000_precos_publicados.sql`

**Interfaces:**
- Produces a tabela `plan_price_change_requests` que as Tasks 2 e 3 vão ler/escrever direto via Supabase client (sem RPC — mesmo padrão REST já usado nas rotas admin existentes).

- [ ] **Step 1: Escrever a migração completa**

```sql
-- Etapa 6 do roadmap do parceiro — Preços publicados. Hoje PATCH
-- /api/apps/plans/[id] deixa o dono mudar price/billing_period de um
-- plano instantaneamente, sem revisão, mesmo em app já publicado e
-- vendendo. Esta migração só cria a tabela de pedidos — o gate em si
-- (Task 2) e a tela de aprovação (Task 3) vêm depois.

create table public.plan_price_change_requests (
  id                        uuid primary key default gen_random_uuid(),
  app_plan_id               uuid not null references public.app_plans(id) on delete cascade,
  requested_by              uuid not null references auth.users(id),
  status                    text not null default 'pendente'
                              check (status in ('pendente', 'aprovado', 'rejeitado')),
  current_price             numeric(10,2),
  requested_price           numeric(10,2) not null,
  current_billing_period    text,
  requested_billing_period  text not null,
  reviewed_by               uuid references auth.users(id),
  reviewed_at               timestamptz,
  review_notes              text,
  created_at                timestamptz not null default now()
);

-- No máximo 1 pedido pendente por plano por vez — evita empilhar
-- pedidos conflitantes pro mesmo plano (spec: "no máximo 1 pendente").
create unique index plan_price_change_requests_one_pending_per_plan
  on public.plan_price_change_requests (app_plan_id)
  where status = 'pendente';

create index plan_price_change_requests_app_plan_idx
  on public.plan_price_change_requests (app_plan_id, created_at desc);

comment on table public.plan_price_change_requests is
  'Pedido de mudança de price/billing_period de um plano já existente — nasce pendente, só aplica em app_plans depois de aprovado pelo admin (Etapa 6 "Preços publicados"). current_* é snapshot do valor antes do pedido, pro admin comparar sem depender do valor antigo ainda existir em algum lugar depois de aprovado.';

alter table public.plan_price_change_requests enable row level security;

grant select, insert on table public.plan_price_change_requests to authenticated;
grant all on table public.plan_price_change_requests to service_role;

-- Dono do app (mesma checagem de posse que PATCH /api/apps/plans/[id]
-- já faz hoje — created_by literal, nunca membro de equipe, gap
-- pré-existente fora de escopo aqui) vê e cria seus próprios pedidos.
create policy "owner_select_own_price_requests" on public.plan_price_change_requests
  for select to authenticated
  using (
    exists (
      select 1 from public.app_plans p
      join public.app_drafts d on d.id = p.app_draft_id
      where p.id = app_plan_id and d.created_by = auth.uid()
    )
  );

create policy "owner_insert_own_price_requests" on public.plan_price_change_requests
  for insert to authenticated
  with check (
    requested_by = auth.uid()
    and exists (
      select 1 from public.app_plans p
      join public.app_drafts d on d.id = p.app_draft_id
      where p.id = app_plan_id and d.created_by = auth.uid()
    )
  );

-- Admin (role='technician') vê e resolve tudo. Dono nunca faz UPDATE
-- aqui — status/reviewed_* só mudam via rota admin (service-role
-- client, Task 3), nenhuma policy de UPDATE pro dono.
create policy "technician_select_all_price_requests" on public.plan_price_change_requests
  for select to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'technician')
  );
```

- [ ] **Step 2: Rodar `supabase db push --linked` (confirmar com o usuário antes)**

Não aplicar sem confirmação explícita — mesmo protocolo das migrações anteriores.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261002150000_precos_publicados.sql
git commit -m "feat: tabela plan_price_change_requests pra aprovação de mudança de preço (Etapa 6)"
```

---

### Task 2: Gate no PATCH de plano

**Files:**
- Modify: `app/api/apps/plans/[id]/route.ts`

**Interfaces:**
- Produces: resposta do `PATCH` muda de forma — de `{ ...plan }` direto pra `{ plan: {...}, pending_request: {...} | null }`. A Task 4 (client) depende desse formato novo.
- Consumes: tabela `plan_price_change_requests` (Task 1).

- [ ] **Step 1: Substituir o handler `PATCH`**

Antes (arquivo inteiro — o `DELETE` abaixo não muda, só o `PATCH`):
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership via draft
  const { data: plan } = await supabase
    .from('app_plans')
    .select('app_draft_id')
    .eq('id', id)
    .single()

  if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: draft } = await supabase
    .from('app_drafts')
    .select('id')
    .eq('id', plan.app_draft_id)
    .eq('created_by', user.id)
    .single()

  if (!draft) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const updates = await req.json()

  const { data, error } = await supabase
    .from('app_plans')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[plans PATCH]', error)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  return NextResponse.json(data)
}
```

Depois:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership via draft — já busca price/billing_period atuais
  // pra comparar com o payload (Etapa 6: mudança nesses dois campos
  // exige aprovação do admin, nunca aplica direto).
  const { data: plan } = await supabase
    .from('app_plans')
    .select('app_draft_id, price, billing_period')
    .eq('id', id)
    .single()

  if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: draft } = await supabase
    .from('app_drafts')
    .select('id')
    .eq('id', plan.app_draft_id)
    .eq('created_by', user.id)
    .single()

  if (!draft) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const updates = await req.json()

  const priceChanged = Object.prototype.hasOwnProperty.call(updates, 'price') && updates.price !== plan.price
  const billingChanged = Object.prototype.hasOwnProperty.call(updates, 'billing_period') && updates.billing_period !== plan.billing_period
  // price/billing_period nunca vão no UPDATE direto — ou não mudaram
  // (otherUpdates já reflete isso, sem efeito) ou mudaram e precisam
  // virar pedido (abaixo), nunca os dois ao mesmo tempo.
  const { price: _price, billing_period: _billingPeriod, ...otherUpdates } = updates

  let pendingRequest = null
  if (priceChanged || billingChanged) {
    const { data: existingPending } = await supabase
      .from('plan_price_change_requests')
      .select('id')
      .eq('app_plan_id', id)
      .eq('status', 'pendente')
      .maybeSingle()

    if (existingPending) {
      return NextResponse.json(
        { error: 'Já existe um pedido de mudança de preço aguardando aprovação pra este plano.' },
        { status: 409 }
      )
    }

    const { data: request, error: requestError } = await supabase
      .from('plan_price_change_requests')
      .insert({
        app_plan_id: id,
        requested_by: user.id,
        current_price: plan.price,
        requested_price: updates.price ?? plan.price,
        current_billing_period: plan.billing_period,
        requested_billing_period: updates.billing_period ?? plan.billing_period,
      })
      .select()
      .single()

    if (requestError || !request) {
      console.error('[plans PATCH] failed to create price change request', requestError)
      return NextResponse.json({ error: 'Não foi possível registrar o pedido de mudança de preço.' }, { status: 500 })
    }
    pendingRequest = request
  }

  const { data, error } = await supabase
    .from('app_plans')
    .update(otherUpdates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[plans PATCH]', error)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  return NextResponse.json({ plan: data, pending_request: pendingRequest })
}
```

- [ ] **Step 2: `npx tsc --noEmit`**

Expected: limpo. A resposta do `PATCH` mudou de forma (`{ plan, pending_request }` em vez do plano direto) — a Task 4 depende disso, mas como esta task só mexe na rota, nenhum consumidor foi atualizado ainda; isso é esperado e corrigido na Task 4 (o client atual vai quebrar temporariamente até lá — normal num plano com tasks sequenciais, cada task roda sua própria verificação).

- [ ] **Step 3: Commit**

```bash
git add "app/api/apps/plans/[id]/route.ts"
git commit -m "feat: PATCH de plano cria pedido de aprovação ao mudar price/billing_period (Etapa 6)"
```

---

### Task 3: Página admin de aprovação + rotas de aprovar/rejeitar

**Files:**
- Create: `app/api/admin/price-requests/[id]/approve/route.ts`
- Create: `app/api/admin/price-requests/[id]/reject/route.ts`
- Create: `app/admin/marketplace/precos/page.tsx`
- Create: `app/admin/marketplace/precos/PrecosClient.tsx`
- Modify: `app/admin/marketplace/MarketplaceClient.tsx` (adicionar aba "Preços" ao `NAV_TABS`)
- Modify: `app/admin/marketplace/ofertas/OfertasClient.tsx` (idem)
- Modify: `app/admin/marketplace/comissoes/ComissoesClient.tsx` (idem)
- Modify: `app/admin/marketplace/aplicativos/AplicativosClient.tsx` (idem)
- Modify: `app/admin/marketplace/parceiros/ParceirosClient.tsx` (idem)
- Modify: `app/admin/marketplace/destaques/DestaquesClient.tsx` (idem)
- Modify: `app/admin/marketplace/categorias/CategoriasClient.tsx` (idem)
- Modify: `app/admin/marketplace/repasses/RepassesClient.tsx` (idem)

**Interfaces:**
- Consumes: tabela `plan_price_change_requests` (Task 1).
- Produces: nada consumido por outra task.

- [ ] **Step 1: Criar a rota de aprovação**

```typescript
// app/api/admin/price-requests/[id]/approve/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'technician') {
    return NextResponse.json({ error: 'Sem permissão para aprovar mudança de preço.' }, { status: 403 })
  }

  const { data: request } = await supabase
    .from('plan_price_change_requests')
    .select('id, app_plan_id, status, requested_price, requested_billing_period')
    .eq('id', id)
    .single()

  if (!request) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })
  if (request.status !== 'pendente') {
    return NextResponse.json({ error: 'Este pedido já foi resolvido.' }, { status: 409 })
  }

  // Aplica de verdade — só marca o pedido como aprovado depois de
  // confirmar que o UPDATE realmente afetou o plano (nunca marcar
  // resolvido se a aplicação falhou silenciosamente).
  const { data: updatedPlan, error: planError } = await supabase
    .from('app_plans')
    .update({ price: request.requested_price, billing_period: request.requested_billing_period })
    .eq('id', request.app_plan_id)
    .select('id')
    .single()

  if (planError || !updatedPlan) {
    console.error('[price-requests approve] failed to apply plan update', planError)
    return NextResponse.json({ error: 'Não foi possível aplicar o novo preço. O plano pode ter sido removido.' }, { status: 500 })
  }

  const { error: requestError } = await supabase
    .from('plan_price_change_requests')
    .update({ status: 'aprovado', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq('id', id)

  if (requestError) {
    console.error('[price-requests approve] plan updated but request status failed', requestError)
    return NextResponse.json({ error: 'Preço aplicado, mas não foi possível atualizar o status do pedido. Avise o time técnico.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Criar a rota de rejeição**

```typescript
// app/api/admin/price-requests/[id]/reject/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'technician') {
    return NextResponse.json({ error: 'Sem permissão para rejeitar mudança de preço.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const notes = typeof body?.notes === 'string' ? body.notes.trim() : ''
  if (!notes) return NextResponse.json({ error: 'Informe o motivo da rejeição.' }, { status: 400 })

  const { data: request } = await supabase
    .from('plan_price_change_requests')
    .select('id, status')
    .eq('id', id)
    .single()

  if (!request) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })
  if (request.status !== 'pendente') {
    return NextResponse.json({ error: 'Este pedido já foi resolvido.' }, { status: 409 })
  }

  const { error } = await supabase
    .from('plan_price_change_requests')
    .update({ status: 'rejeitado', reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_notes: notes })
    .eq('id', id)

  if (error) {
    console.error('[price-requests reject]', error)
    return NextResponse.json({ error: 'Não foi possível rejeitar o pedido.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Criar `app/admin/marketplace/precos/page.tsx`**

```tsx
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireTechnicianSession } from '@/lib/services/profile'
import PrecosClient from './PrecosClient'

export default async function PrecosPage() {
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireTechnicianSession(supabase)

  const { data: rows } = await supabase
    .from('plan_price_change_requests')
    .select(`
      id, status, current_price, requested_price, current_billing_period, requested_billing_period,
      requested_by, reviewed_by, reviewed_at, review_notes, created_at,
      app_plans ( id, name, app_draft_id, app_drafts ( id, name ) )
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  const requesterIds = [...new Set((rows ?? []).map(r => r.requested_by).filter(Boolean))]
  const { data: requesterProfiles } = requesterIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', requesterIds)
    : { data: [] }
  const requesterById = new Map((requesterProfiles ?? []).map(p => [p.id, p]))

  const mapped = (rows ?? []).map(r => {
    const plan = Array.isArray(r.app_plans) ? r.app_plans[0] : r.app_plans
    const draft = plan ? (Array.isArray(plan.app_drafts) ? plan.app_drafts[0] : plan.app_drafts) : null
    const requester = requesterById.get(r.requested_by)
    return {
      id: r.id,
      status: r.status as 'pendente' | 'aprovado' | 'rejeitado',
      appName: draft?.name ?? 'Aplicativo removido',
      planName: plan?.name ?? 'Plano removido',
      currentPrice: r.current_price,
      requestedPrice: r.requested_price,
      currentBillingPeriod: r.current_billing_period,
      requestedBillingPeriod: r.requested_billing_period,
      requesterName: requester?.full_name || requester?.email || 'Desconhecido',
      reviewNotes: r.review_notes,
      createdAt: r.created_at,
    }
  })

  const pending = mapped.filter(r => r.status === 'pendente')
  const history = mapped.filter(r => r.status !== 'pendente')

  return <PrecosClient user={user} profile={profile} pending={pending} history={history} />
}
```

- [ ] **Step 4: Criar `app/admin/marketplace/precos/PrecosClient.tsx`**

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, X, Loader2 } from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import AdminShell from '@/components/layout/AdminShell'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { MARKETPLACE_COLORS as C, formatDateTimeBR } from '@/lib/marketplace'
import { formatCurrencyBRL } from '@/lib/finance'

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
]

const BILLING_LABEL: Record<string, string> = { 'one-time': 'Pagamento único', monthly: 'Mensal', yearly: 'Anual', lifetime: 'Vitalício' }

interface Row {
  id: string
  status: 'pendente' | 'aprovado' | 'rejeitado'
  appName: string
  planName: string
  currentPrice: number | null
  requestedPrice: number
  currentBillingPeriod: string | null
  requestedBillingPeriod: string
  requesterName: string
  reviewNotes: string | null
  createdAt: string
}

interface Props {
  user: SupabaseUser
  profile: { full_name?: string; email?: string } | null
  pending: Row[]
  history: Row[]
}

function priceChangeLabel(row: Row): string {
  const fromPrice = row.currentPrice != null ? formatCurrencyBRL(row.currentPrice) : '—'
  const toPrice = formatCurrencyBRL(row.requestedPrice)
  const fromBilling = row.currentBillingPeriod ? BILLING_LABEL[row.currentBillingPeriod] ?? row.currentBillingPeriod : '—'
  const toBilling = BILLING_LABEL[row.requestedBillingPeriod] ?? row.requestedBillingPeriod
  if (row.currentPrice === row.requestedPrice) {
    return `${fromPrice} (${fromBilling} → ${toBilling})`
  }
  if (row.currentBillingPeriod === row.requestedBillingPeriod) {
    return `${fromPrice} → ${toPrice} (${toBilling})`
  }
  return `${fromPrice} (${fromBilling}) → ${toPrice} (${toBilling})`
}

export default function PrecosClient({ user, profile, pending: initialPending, history }: Props) {
  const router = useRouter()
  const [pending, setPending] = useState(initialPending)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<Row | null>(null)
  const [rejectNotes, setRejectNotes] = useState('')

  async function handleApprove(row: Row) {
    setBusyId(row.id)
    try {
      const res = await fetch(`/api/admin/price-requests/${row.id}/approve`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || 'Falha ao aprovar.')
      }
      setPending(prev => prev.filter(r => r.id !== row.id))
      toast.success(`Preço de "${row.planName}" atualizado.`)
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
      const res = await fetch(`/api/admin/price-requests/${rejecting.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: rejectNotes.trim() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || 'Falha ao rejeitar.')
      }
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
          <Link href="/admin/marketplace" className="hover:underline">Marketplace</Link> / Preços
        </p>

        <div className="mb-5">
          <h1 className="text-2xl font-bold sm:text-3xl" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Preços</h1>
          <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>Pedidos de mudança de preço/periodicidade aguardando aprovação.</p>
        </div>

        <nav aria-label="Seções do marketplace" className="mb-6 flex flex-wrap gap-1 border-b" style={{ borderColor: C.border }}>
          {NAV_TABS.map(tab => {
            const active = tab.href === '/admin/marketplace/precos'
            if (!tab.enabled) return <span key={tab.href} title="Esta área ainda não foi implementada." aria-disabled="true" className="cursor-not-allowed px-3 py-2.5 text-sm font-medium opacity-40" style={{ color: C.textSecondary }}>{tab.label}</span>
            return <Link key={tab.href} href={tab.href} className="px-3 py-2.5 text-sm font-medium" style={{ color: active ? C.primary : C.textSecondary, borderBottom: active ? `2px solid ${C.primary}` : '2px solid transparent' }}>{tab.label}</Link>
          })}
        </nav>

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
                    <p className="text-xs" style={{ color: C.textSecondary }}>{priceChangeLabel(row)} · pedido por {row.requesterName} em {formatDateTimeBR(row.createdAt)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => handleApprove(row)}
                      className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                      style={{ background: '#10B981' }}
                    >
                      {busyId === row.id ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Check size={12} aria-hidden="true" />}
                      Aprovar
                    </button>
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => setRejecting(row)}
                      className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-50"
                      style={{ borderColor: '#EF4444', color: '#EF4444' }}
                    >
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
                    <th className="pb-2 pr-3 font-semibold">Mudança</th>
                    <th className="pb-2 pr-3 font-semibold">Status</th>
                    <th className="pb-2 font-semibold">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(row => (
                    <tr key={row.id} className="border-t" style={{ borderColor: C.border }}>
                      <td className="py-2 pr-3" style={{ color: C.text }}>{row.appName} — {row.planName}</td>
                      <td className="py-2 pr-3" style={{ color: C.textSecondary }}>{priceChangeLabel(row)}</td>
                      <td className="py-2 pr-3">
                        <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ color: row.status === 'aprovado' ? '#10B981' : '#EF4444', background: row.status === 'aprovado' ? '#10B9811A' : '#EF44441A' }}>
                          {row.status === 'aprovado' ? 'Aprovado' : 'Rejeitado'}
                        </span>
                        {row.status === 'rejeitado' && row.reviewNotes && (
                          <p className="mt-1 text-xs" style={{ color: C.textSecondary }}>{row.reviewNotes}</p>
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
        title="Rejeitar pedido de preço?"
        description={rejecting ? `${rejecting.appName} — ${rejecting.planName}: ${priceChangeLabel(rejecting)}` : ''}
        confirmLabel="Rejeitar"
        confirmDisabled={!rejectNotes.trim()}
        busy={busyId === rejecting?.id}
        onConfirm={handleReject}
      >
        <textarea
          value={rejectNotes}
          onChange={e => setRejectNotes(e.target.value)}
          placeholder="Motivo da rejeição (obrigatório)"
          className="mt-3 w-full rounded-lg border p-2 text-sm"
          style={{ borderColor: C.border, color: C.text }}
          rows={3}
        />
      </ConfirmDialog>
    </AdminShell>
  )
}
```

**Nota de implementação:** `ConfirmDialog` já existe (`@/components/admin/ConfirmDialog`, já importado em `OfertasClient.tsx`) — ler sua interface de props atual (`open`, `onOpenChange`, `title`, `description`, `confirmLabel`, `onConfirm`, possivelmente `busy`/`confirmDisabled`/`children`) antes de usar, e ajustar os nomes de prop acima pra bater exatamente com o componente real caso divirjam do que está escrito aqui — não adivinhar uma prop que não existe.

- [ ] **Step 5: Adicionar a aba "Preços" ao `NAV_TABS` dos outros 8 arquivos admin**

Em cada um dos arquivos abaixo, adicionar a linha `{ label: 'Preços', href: '/admin/marketplace/precos', enabled: true },` logo depois da linha `{ label: 'Repasses', href: '/admin/marketplace/repasses', enabled: true },` dentro do array `NAV_TABS` já existente (mesmo formato, mesma posição relativa — só acrescentar a linha, não reordenar nem tocar em mais nada):

- `app/admin/marketplace/MarketplaceClient.tsx`
- `app/admin/marketplace/ofertas/OfertasClient.tsx`
- `app/admin/marketplace/comissoes/ComissoesClient.tsx`
- `app/admin/marketplace/aplicativos/AplicativosClient.tsx`
- `app/admin/marketplace/parceiros/ParceirosClient.tsx`
- `app/admin/marketplace/destaques/DestaquesClient.tsx`
- `app/admin/marketplace/categorias/CategoriasClient.tsx`
- `app/admin/marketplace/repasses/RepassesClient.tsx`

(`PrecosClient.tsx`, criado no Step 4 acima, já nasce com a aba "Preços" incluída no seu próprio `NAV_TABS` — não precisa editar de novo.)

- [ ] **Step 6: `npx tsc --noEmit`**

Expected: limpo.

- [ ] **Step 7: Commit**

```bash
git add app/api/admin/price-requests app/admin/marketplace/precos app/admin/marketplace/MarketplaceClient.tsx app/admin/marketplace/ofertas/OfertasClient.tsx app/admin/marketplace/comissoes/ComissoesClient.tsx app/admin/marketplace/aplicativos/AplicativosClient.tsx app/admin/marketplace/parceiros/ParceirosClient.tsx app/admin/marketplace/destaques/DestaquesClient.tsx app/admin/marketplace/categorias/CategoriasClient.tsx app/admin/marketplace/repasses/RepassesClient.tsx
git commit -m "feat: página admin de aprovação de mudança de preço + aba Preços na navegação (Etapa 6)"
```

---

### Task 4: Status do pedido no card do plano (client do dono)

**Files:**
- Modify: `app/dashboard/meus-app/novo/[appId]/planos/page.tsx`
- Modify: `app/dashboard/meus-app/novo/[appId]/planos/PlanosClient.tsx`

**Interfaces:**
- Consumes: resposta nova do `PATCH /api/apps/plans/[id]` (Task 2: `{ plan, pending_request }`), tabela `plan_price_change_requests` (Task 1, leitura direta via RLS).

- [ ] **Step 1: Editar `page.tsx` pra buscar o pedido mais recente de cada plano**

Antes (arquivo inteiro):
```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { getStepCompletion } from '@/lib/services/app-draft-steps'
import PlanosClient from './PlanosClient'

export const metadata: Metadata = { title: 'Oferta e planos | LOBBY', robots: { index: false, follow: false } }

export default async function PlanosPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params
  const supabase = await createServerSupabaseClient()
  await requireClientSession(supabase)

  // RLS (dono ou app_team_members) decide o acesso.
  const { data: draft, error } = await supabase.from('app_drafts').select('*').eq('id', appId).single()
  if (error || !draft) notFound()

  const [{ data: plans }, completion] = await Promise.all([
    supabase.from('app_plans').select('*').eq('app_draft_id', appId).order('display_order', { ascending: true }),
    getStepCompletion(supabase, draft),
  ])

  return (
    <PlanosClient
      appId={appId}
      appName={draft.name || 'Aplicativo sem nome'}
      initialPlans={(plans ?? []).map(p => ({
        id: p.id, name: p.name, currency: p.currency || 'BRL', price: p.price, billing_period: p.billing_period,
        features: p.features ?? [], users_limit: p.users_limit, support_level: p.support_level,
      }))}
      completion={{ 1: completion.step1, 2: completion.step2, 3: completion.step3 }}
    />
  )
}
```

Depois:
```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { getStepCompletion } from '@/lib/services/app-draft-steps'
import PlanosClient, { type PendingRequest } from './PlanosClient'

export const metadata: Metadata = { title: 'Oferta e planos | LOBBY', robots: { index: false, follow: false } }

export default async function PlanosPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params
  const supabase = await createServerSupabaseClient()
  await requireClientSession(supabase)

  // RLS (dono ou app_team_members) decide o acesso.
  const { data: draft, error } = await supabase.from('app_drafts').select('*').eq('id', appId).single()
  if (error || !draft) notFound()

  const [{ data: plans }, completion] = await Promise.all([
    supabase.from('app_plans').select('*').eq('app_draft_id', appId).order('display_order', { ascending: true }),
    getStepCompletion(supabase, draft),
  ])

  const planIds = (plans ?? []).map(p => p.id)
  const { data: priceRequests } = planIds.length
    ? await supabase
        .from('plan_price_change_requests')
        .select('id, app_plan_id, status, current_price, requested_price, current_billing_period, requested_billing_period, review_notes')
        .in('app_plan_id', planIds)
        .order('created_at', { ascending: false })
    : { data: [] as never[] }

  // Pedido mais recente de cada plano (já veio ordenado desc) — só
  // pendente/rejeitado viram badge; aprovado já está refletido no
  // price/billing_period atual do plano, não precisa de badge.
  const pendingByPlan: Record<string, PendingRequest> = {}
  for (const r of priceRequests ?? []) {
    if (pendingByPlan[r.app_plan_id]) continue
    if (r.status === 'pendente' || r.status === 'rejeitado') {
      pendingByPlan[r.app_plan_id] = {
        id: r.id, status: r.status as 'pendente' | 'rejeitado',
        current_price: r.current_price, requested_price: r.requested_price,
        current_billing_period: r.current_billing_period, requested_billing_period: r.requested_billing_period,
        review_notes: r.review_notes,
      }
    }
  }

  return (
    <PlanosClient
      appId={appId}
      appName={draft.name || 'Aplicativo sem nome'}
      initialPlans={(plans ?? []).map(p => ({
        id: p.id, name: p.name, currency: p.currency || 'BRL', price: p.price, billing_period: p.billing_period,
        features: p.features ?? [], users_limit: p.users_limit, support_level: p.support_level,
      }))}
      initialPendingByPlan={pendingByPlan}
      completion={{ 1: completion.step1, 2: completion.step2, 3: completion.step3 }}
    />
  )
}
```

- [ ] **Step 2: Editar `PlanosClient.tsx`**

Adicionar, logo depois da interface `Plan` existente (linha 12-15):
```tsx
export interface PendingRequest {
  id: string
  status: 'pendente' | 'rejeitado'
  current_price: number | null
  requested_price: number
  current_billing_period: string | null
  requested_billing_period: string
  review_notes: string | null
}
```

Mudar a assinatura da função principal — antes:
```tsx
export default function PlanosClient({ appId, appName, initialPlans, completion }: {
  appId: string; appName: string; initialPlans: Plan[]; completion: { 1: boolean; 2: boolean; 3: boolean }
}) {
  const [plans, setPlans] = useState<Plan[]>(initialPlans)
  const [editing, setEditing] = useState<Plan | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Plan | null>(null)
  const [busy, setBusy] = useState(false)
```

Depois:
```tsx
export default function PlanosClient({ appId, appName, initialPlans, initialPendingByPlan, completion }: {
  appId: string; appName: string; initialPlans: Plan[]; initialPendingByPlan: Record<string, PendingRequest>
  completion: { 1: boolean; 2: boolean; 3: boolean }
}) {
  const [plans, setPlans] = useState<Plan[]>(initialPlans)
  const [pendingByPlan, setPendingByPlan] = useState<Record<string, PendingRequest>>(initialPendingByPlan)
  const [editing, setEditing] = useState<Plan | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Plan | null>(null)
  const [busy, setBusy] = useState(false)
```

Mudar `handleSaved` — antes:
```tsx
  function handleSaved(plan: Plan) {
    setPlans(prev => {
      const exists = prev.some(p => p.id === plan.id)
      return exists ? prev.map(p => (p.id === plan.id ? plan : p)) : [...prev, plan]
    })
    setEditing(null)
  }
```

Depois:
```tsx
  function handleSaved(plan: Plan, pendingRequest?: PendingRequest | null) {
    setPlans(prev => {
      const exists = prev.some(p => p.id === plan.id)
      return exists ? prev.map(p => (p.id === plan.id ? plan : p)) : [...prev, plan]
    })
    setPendingByPlan(prev => {
      const next = { ...prev }
      if (pendingRequest) next[plan.id] = pendingRequest
      else delete next[plan.id]
      return next
    })
    setEditing(null)
  }
```

No card do plano, adicionar o badge de status logo depois do bloco de preço existente (entre o `<p>` de preço/periodicidade e o bloco de `features`) — antes:
```tsx
                <p className="mt-1 text-lg font-bold" style={{ color: '#16A34A' }}>
                  {plan.price != null ? (plan.currency === 'BRL' ? formatCurrencyBRL(plan.price) : `${plan.currency} ${plan.price}`) : 'Sem preço definido'}
                  {plan.billing_period && <span className="text-xs font-normal" style={{ color: colors.textSecondary }}> / {BILLING_LABEL[plan.billing_period] ?? plan.billing_period}</span>}
                </p>
                {plan.features.length > 0 && (
```

Depois:
```tsx
                <p className="mt-1 text-lg font-bold" style={{ color: '#16A34A' }}>
                  {plan.price != null ? (plan.currency === 'BRL' ? formatCurrencyBRL(plan.price) : `${plan.currency} ${plan.price}`) : 'Sem preço definido'}
                  {plan.billing_period && <span className="text-xs font-normal" style={{ color: colors.textSecondary }}> / {BILLING_LABEL[plan.billing_period] ?? plan.billing_period}</span>}
                </p>
                {pendingByPlan[plan.id] && (
                  <p className="mt-1 rounded-lg px-2 py-1 text-xs font-semibold"
                    style={pendingByPlan[plan.id].status === 'pendente'
                      ? { background: '#F59E0B1A', color: '#F59E0B' }
                      : { background: '#EF44441A', color: '#EF4444' }}>
                    {pendingByPlan[plan.id].status === 'pendente'
                      ? `Aguardando aprovação: ${formatCurrencyBRL(pendingByPlan[plan.id].requested_price)}`
                      : `Pedido rejeitado: ${formatCurrencyBRL(pendingByPlan[plan.id].requested_price)}${pendingByPlan[plan.id].review_notes ? ` — ${pendingByPlan[plan.id].review_notes}` : ''}`}
                  </p>
                )}
                {plan.features.length > 0 && (
```

- [ ] **Step 3: Editar `handleSubmit` dentro de `PlanFormDialog`**

Antes:
```tsx
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Informe o nome do plano.'); return }
    if (!price.trim() || isNaN(Number(price))) { setError('Informe um preço válido.'); return }
    setSaving(true)
    setError('')
    const body = {
      app_draft_id: appId, name: name.trim(), currency, price: Number(price), billing_period: billingPeriod,
      features, users_limit: usersLimit ? Number(usersLimit) : null, support_level: supportLevel || null,
    }
    try {
      const res = await fetch(plan ? `/api/apps/plans/${plan.id}` : '/api/apps/plans', {
        method: plan ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plan ? { ...body, app_draft_id: undefined } : body),
      })
      if (!res.ok) throw new Error()
      const saved = await res.json()
      onSaved({ id: saved.id, name: saved.name, currency: saved.currency, price: saved.price, billing_period: saved.billing_period, features: saved.features ?? [], users_limit: saved.users_limit, support_level: saved.support_level })
      toast.success('Plano salvo.')
    } catch {
      setError('Não foi possível salvar. Seus dados foram preservados — tente novamente.')
    } finally {
      setSaving(false)
    }
  }
```

Depois:
```tsx
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Informe o nome do plano.'); return }
    if (!price.trim() || isNaN(Number(price))) { setError('Informe um preço válido.'); return }
    setSaving(true)
    setError('')
    const body = {
      app_draft_id: appId, name: name.trim(), currency, price: Number(price), billing_period: billingPeriod,
      features, users_limit: usersLimit ? Number(usersLimit) : null, support_level: supportLevel || null,
    }
    try {
      const res = await fetch(plan ? `/api/apps/plans/${plan.id}` : '/api/apps/plans', {
        method: plan ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plan ? { ...body, app_draft_id: undefined } : body),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => null)
        throw new Error(errBody?.error || undefined)
      }
      const saved = await res.json()
      // PATCH (editar plano existente) devolve { plan, pending_request }
      // desde a Etapa 6 — price/billing_period só mudam de verdade
      // depois do admin aprovar. POST (plano novo) continua devolvendo
      // o plano direto, nunca passa por aprovação.
      const savedPlan = plan ? saved.plan : saved
      const pendingRequest = plan ? saved.pending_request : null
      onSaved({ id: savedPlan.id, name: savedPlan.name, currency: savedPlan.currency, price: savedPlan.price, billing_period: savedPlan.billing_period, features: savedPlan.features ?? [], users_limit: savedPlan.users_limit, support_level: savedPlan.support_level }, pendingRequest)
      toast.success(pendingRequest ? 'Pedido de mudança de preço enviado pra aprovação.' : 'Plano salvo.')
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Não foi possível salvar. Seus dados foram preservados — tente novamente.')
    } finally {
      setSaving(false)
    }
  }
```

(a assinatura de `PlanFormDialog`'s `onSaved` prop — `onSaved: (p: Plan) => void` na definição da função — também precisa virar `onSaved: (p: Plan, pendingRequest?: PendingRequest | null) => void`, já que `handleSaved` em `PlanosClient` passado como essa prop agora aceita o segundo parâmetro.)

- [ ] **Step 4: `npx tsc --noEmit`**

Expected: limpo.

- [ ] **Step 5: Commit**

```bash
git add "app/dashboard/meus-app/novo/[appId]/planos/page.tsx" "app/dashboard/meus-app/novo/[appId]/planos/PlanosClient.tsx"
git commit -m "feat: card do plano mostra status do pedido de mudança de preço (Etapa 6)"
```

---

### Task 5: Verificação manual no navegador

**Files:** nenhum arquivo novo — só dados de teste temporários + checagem.

**Interfaces:** nenhuma — task de verificação, não de código.

- [ ] **Step 1: Criar conta de teste (parceiro com app + plano) + conta admin**

Mesmo padrão das etapas anteriores pro parceiro (service-role, app_drafts/app_plans). Pro admin, reaproveitar a conta já existente usada em testes anteriores desta sessão (`profiles.role='technician'`) se ainda existir, ou criar uma nova com `role='technician'`.

- [ ] **Step 2: Login como parceiro, editar o preço de um plano existente**

Em `/dashboard/meus-app/novo/{appId}/planos`, clicar editar, mudar o preço, salvar. Confirmar: o card mostra "Aguardando aprovação: R$novo" — o preço "oficial" exibido continua o antigo até aprovar (checar que o valor antigo ainda é o que aparece como preço principal do card). Tentar editar de novo o mesmo plano (preço, de novo) antes de resolver o primeiro pedido — confirmar erro 409 claro.

- [ ] **Step 3: Login como admin, abrir `/admin/marketplace/precos`**

Confirmar: o pedido aparece em "Pendentes" com os valores certos (de quanto pra quanto). Rejeitar com um motivo — confirmar que o plano original testado volta a aparecer editável (ou que pode criar um NOVO pedido agora que o anterior foi resolvido) e o parceiro, ao recarregar `/planos`, vê "Pedido rejeitado: ... — {motivo}".

- [ ] **Step 4: Criar outro pedido e aprovar**

Parceiro edita o mesmo plano de novo (preço diferente). Admin aprova em `/admin/marketplace/precos`. Confirmar: o preço realmente mudou em `app_plans` (recarregar `/planos` como parceiro, o card mostra o novo preço como principal, sem badge de pendente/rejeitado).

- [ ] **Step 5: Limpar os dados de teste**

Apagar `plan_price_change_requests`/`app_plans`/`app_drafts`/`applications`/contas de teste criadas — mesmo cuidado das etapas anteriores. Não apagar a conta admin se for uma já reaproveitada de uma etapa anterior.
