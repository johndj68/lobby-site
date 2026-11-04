# Vendas e financeiro — Repasses e extrato com dados reais (Etapa 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o placeholder da página Repasses e extrato por dado real — fila de repasse principal e de reserva de disputa (cada venda com data exata de liberação, nunca um número presumido) + extrato completo de repasses já confirmados/revertidos com drill-down.

**Architecture:** 3 RPCs novas (`security definer`, auto-restritas a `partner_id = auth.uid()`) — 2 para as filas (principal/reserva), 1 para o histórico (uma linha por item de repasse, agrupada no client por `payout_id`). Server Component busca as 3 em paralelo; Client Component novo renderiza as 3 seções com estado de erro independente por bloco.

**Tech Stack:** Next.js App Router, Supabase Postgres (plpgsql RPCs), `lib/finance.ts` (`formatCurrencyBRL`, `formatDateBR`), `lib/design-tokens.ts`.

## Global Constraints

- Nenhuma tabela nova — só funções SQL sobre tabelas já existentes.
- Toda janela usa a coluna snapshot da venda (`app_purchases.retention_days`/`reserve_window_days`), nunca um literal fixo. `subscription_invoices` não tem snapshot — usa `interval '16 days'` fixo, mesma assimetria já existente em `create_partner_payout` e nas RPCs da Etapa 3.
- Toda query sobre `app_purchases`/`subscription_invoices` paga guarda `paid_at is not null` explicitamente (lição da review final da Etapa 3 — toda RPC irmã já faz isso, nenhuma exceção nova).
- Todo "líquido" usa a fórmula exata já em produção: principal = `(partner_amount - reserve_amount) - round(refunded_amount * (partner_amount - reserve_amount) / amount, 2)`; reserva = `reserve_amount - round(refunded_amount * reserve_amount / amount, 2)`. Nunca reimplementar com arredondamento diferente.
- Toda RPC nova é `security definer`, `set search_path to 'public'`, filtra por `partner_id = auth.uid()` (ou via join em `subscriptions.partner_id`) internamente — nunca recebe `p_partner_id`. Toda RPC recebe `revoke execute on function ... from public, anon, authenticated;` imediatamente antes do `grant ... to authenticated;` (mesma correção retroativa aplicada às RPCs da Etapa 3 — nunca esquecer de novo).
- Reserva de disputa e reembolso só existem em `app_purchases` — nunca inventar equivalente pra `subscription_invoices`.
- `days_remaining` sempre `greatest(0, ceil(...))` — nunca negativo, nunca trunca pra baixo (ver spec: "mostrar 1 dia é mais honesto que sugerir que já liberou").
- `npx tsc --noEmit` limpo e `npx vitest run` 100% passando (baseline 398 testes) antes de cada commit.

---

### Task 1: RPCs de fila de repasse e extrato (migração SQL)

**Files:**
- Create: `supabase/migrations/20261002130000_repasses_extrato_parceiro.sql`

**Interfaces:**
- Produces 3 RPCs que a Task 2 vai chamar via `supabase.rpc('<nome>')`:
  - `get_partner_payout_queue_main()` → N linhas `{ sale_id, sale_kind, application_name, plan_name, net_amount, paid_at, release_date, days_remaining, status }`.
  - `get_partner_payout_queue_reserve()` → N linhas `{ sale_id, application_name, plan_name, net_amount, paid_at, release_date, days_remaining, status }` (sem `sale_kind` — só `app_purchases`).
  - `get_partner_payout_history()` → N linhas, uma por item de repasse: `{ payout_id, reference, notes, payout_status, total_amount, created_at, reverted_at, revert_reason, item_id, item_kind, item_amount, application_name, plan_name, sale_paid_at }`.

- [ ] **Step 1: Escrever a migração completa**

```sql
-- RPCs de leitura da fila de repasse e do extrato pro próprio parceiro
-- (Etapa 4 do roadmap "Vendas e financeiro" — Repasses e extrato).
-- Mesmo padrão de auto-escopo da Etapa 3 (20261002110000/20261002120000):
-- auth.uid() direto, sem p_partner_id, revoke+grant explícitos.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) get_partner_payout_queue_main — vendas (compra única + assinatura)
--    ainda não cobertas por repasse confirmado da fatia principal, com
--    data exata de liberação (nunca um número presumido).
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.get_partner_payout_queue_main()
returns table (
  sale_id          uuid,
  sale_kind        text,
  application_name text,
  plan_name        text,
  net_amount       numeric(12,2),
  paid_at          timestamptz,
  release_date     timestamptz,
  days_remaining   integer,
  status           text
)
language plpgsql stable security definer
set search_path to 'public'
as $$
begin
  return query
  select
    combined.sale_id,
    combined.sale_kind,
    combined.application_name,
    combined.plan_name,
    combined.net_amount,
    combined.paid_at,
    combined.release_date,
    greatest(0, ceil(extract(epoch from (combined.release_date - now())) / 86400.0))::integer as days_remaining,
    case when combined.release_date <= now() then 'elegivel' else 'retido' end as status
  from (
    select
      ap.id as sale_id,
      'app_purchase'::text as sale_kind,
      ap.application_name,
      ap.plan_name,
      (ap.partner_amount - ap.reserve_amount) - round(ap.refunded_amount * (ap.partner_amount - ap.reserve_amount) / ap.amount, 2) as net_amount,
      ap.paid_at,
      ap.paid_at + (ap.retention_days || ' days')::interval as release_date
    from public.app_purchases ap
    where ap.partner_id = auth.uid()
      and ap.status = 'paid'
      and ap.paid_at is not null
      and not exists (
        select 1 from public.partner_payout_items pi
        join public.partner_payouts po on po.id = pi.payout_id
        where pi.app_purchase_id = ap.id and pi.kind = 'main' and po.status = 'confirmado'
      )

    union all

    select
      si.id as sale_id,
      'subscription_invoice'::text as sale_kind,
      a.name as application_name,
      s.plan_name,
      si.partner_amount as net_amount,
      si.paid_at,
      si.paid_at + interval '16 days' as release_date
    from public.subscription_invoices si
    join public.subscriptions s on s.id = si.subscription_id
    left join public.app_plans p on p.id = s.app_plan_id
    left join public.app_drafts d on d.id = p.app_draft_id
    left join public.applications a on a.id = d.application_id
    where s.partner_id = auth.uid()
      and s.product_type = 'app_plan'
      and si.paid_at is not null
      and not exists (
        select 1 from public.partner_payout_items pi
        join public.partner_payouts po on po.id = pi.payout_id
        where pi.subscription_invoice_id = si.id and po.status = 'confirmado'
      )
  ) combined
  order by combined.release_date asc, combined.sale_id;
end;
$$;

revoke execute on function public.get_partner_payout_queue_main() from public, anon, authenticated;
grant execute on function public.get_partner_payout_queue_main() to authenticated;

comment on function public.get_partner_payout_queue_main() is
  'Fila de vendas (compra única + fatura de assinatura) ainda não cobertas por repasse confirmado da fatia principal, com data exata de liberação (paid_at + retention_days, snapshot — nunca presumido). Exclui compras totalmente reembolsadas.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) get_partner_payout_queue_reserve — reserva de disputa ainda retida
--    (reserve_status='held'), só app_purchases.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.get_partner_payout_queue_reserve()
returns table (
  sale_id          uuid,
  application_name text,
  plan_name        text,
  net_amount       numeric(12,2),
  paid_at          timestamptz,
  release_date     timestamptz,
  days_remaining   integer,
  status           text
)
language plpgsql stable security definer
set search_path to 'public'
as $$
begin
  return query
  select
    combined.sale_id,
    combined.application_name,
    combined.plan_name,
    combined.net_amount,
    combined.paid_at,
    combined.release_date,
    greatest(0, ceil(extract(epoch from (combined.release_date - now())) / 86400.0))::integer as days_remaining,
    case when combined.release_date <= now() then 'elegivel' else 'retido' end as status
  from (
    select
      ap.id as sale_id,
      ap.application_name,
      ap.plan_name,
      ap.reserve_amount - round(ap.refunded_amount * ap.reserve_amount / ap.amount, 2) as net_amount,
      ap.paid_at,
      ap.paid_at + (ap.reserve_window_days || ' days')::interval as release_date
    from public.app_purchases ap
    where ap.partner_id = auth.uid()
      and ap.status = 'paid'
      and ap.paid_at is not null
      and ap.reserve_status = 'held'
  ) combined
  order by combined.release_date asc, combined.sale_id;
end;
$$;

revoke execute on function public.get_partner_payout_queue_reserve() from public, anon, authenticated;
grant execute on function public.get_partner_payout_queue_reserve() to authenticated;

comment on function public.get_partner_payout_queue_reserve() is
  'Fila de reserva de disputa (10% retido por até reserve_window_days) ainda não liberada nem perdida em disputa. reserve_status=held já basta como filtro — create_partner_payout vira released no momento do repasse, não existe estado intermediário coberto-mas-ainda-held.';

-- ─────────────────────────────────────────────────────────────────────────
-- 3) get_partner_payout_history — uma linha por item de repasse; o client
--    agrupa por payout_id pro drill-down. Inclui repasses revertidos
--    (transparência do histórico completo, nunca esconder um estorno).
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.get_partner_payout_history()
returns table (
  payout_id        uuid,
  reference        text,
  notes            text,
  payout_status    text,
  total_amount     numeric(12,2),
  created_at       timestamptz,
  reverted_at      timestamptz,
  revert_reason    text,
  item_id          uuid,
  item_kind        text,
  item_amount      numeric(12,2),
  application_name text,
  plan_name        text,
  sale_paid_at     timestamptz
)
language plpgsql stable security definer
set search_path to 'public'
as $$
begin
  return query
  select
    po.id as payout_id,
    po.reference,
    po.notes,
    po.status as payout_status,
    po.total_amount,
    po.created_at,
    po.reverted_at,
    po.revert_reason,
    pi.id as item_id,
    case
      when pi.subscription_invoice_id is not null then 'subscription_invoice'
      when pi.kind = 'reserve' then 'app_purchase_reserve'
      else 'app_purchase_main'
    end as item_kind,
    pi.amount as item_amount,
    coalesce(ap.application_name, a.name) as application_name,
    coalesce(ap.plan_name, s.plan_name) as plan_name,
    coalesce(ap.paid_at, si.paid_at) as sale_paid_at
  from public.partner_payouts po
  left join public.partner_payout_items pi on pi.payout_id = po.id
  left join public.app_purchases ap on ap.id = pi.app_purchase_id
  left join public.subscription_invoices si on si.id = pi.subscription_invoice_id
  left join public.subscriptions s on s.id = si.subscription_id
  left join public.app_plans p on p.id = s.app_plan_id
  left join public.app_drafts d on d.id = p.app_draft_id
  left join public.applications a on a.id = d.application_id
  where po.partner_id = auth.uid()
  order by po.created_at desc, pi.id;
end;
$$;

revoke execute on function public.get_partner_payout_history() from public, anon, authenticated;
grant execute on function public.get_partner_payout_history() to authenticated;

comment on function public.get_partner_payout_history() is
  'Extrato de repasses do parceiro (confirmados e revertidos), uma linha por item coberto — client agrupa por payout_id pro drill-down. LEFT JOIN nos itens: um repasse sem item nenhum (não deveria existir) ainda aparece.';
```

- [ ] **Step 2: Rodar `supabase db push --linked` (confirmar com o usuário antes)**

Não aplicar sem confirmação explícita — mesmo protocolo das migrações anteriores.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261002130000_repasses_extrato_parceiro.sql
git commit -m "feat: RPCs de fila de repasse e extrato do parceiro (Etapa 4)"
```

---

### Task 2: Página Repasses e extrato com dado real

**Files:**
- Modify: `app/dashboard/financeiro/repasses/page.tsx` (substituir todo o corpo)
- Create: `app/dashboard/financeiro/repasses/RepassesClient.tsx`

**Interfaces:**
- Consumes: as 3 RPCs da Task 1, chamadas no Server Component (`page.tsx`) via `supabase.rpc(...)`.
- Produces: nada consumido por outra task.

- [ ] **Step 1: Criar `RepassesClient.tsx`**

```tsx
'use client'

import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Clock } from 'lucide-react'
import { colors, shadows } from '@/lib/design-tokens'
import { formatCurrencyBRL, formatDateBR } from '@/lib/finance'

interface QueueRow {
  sale_id:          string
  sale_kind?:       'app_purchase' | 'subscription_invoice'
  application_name: string
  plan_name:        string
  net_amount:       number
  paid_at:          string
  release_date:     string
  days_remaining:   number
  status:           'retido' | 'elegivel'
}

interface HistoryRow {
  payout_id:        string
  reference:        string
  notes:            string | null
  payout_status:    'confirmado' | 'revertido'
  total_amount:     number
  created_at:        string
  reverted_at:       string | null
  revert_reason:     string | null
  item_id:           string | null
  item_kind:         'app_purchase_main' | 'app_purchase_reserve' | 'subscription_invoice' | null
  item_amount:        number | null
  application_name:   string | null
  plan_name:          string | null
  sale_paid_at:       string | null
}

interface GroupedPayout {
  payout_id:     string
  reference:     string
  notes:         string | null
  payout_status: 'confirmado' | 'revertido'
  total_amount:  number
  created_at:    string
  reverted_at:   string | null
  revert_reason: string | null
  items: {
    item_id: string
    item_kind: 'app_purchase_main' | 'app_purchase_reserve' | 'subscription_invoice'
    item_amount: number
    application_name: string
    plan_name: string
    sale_paid_at: string
  }[]
}

function groupHistory(rows: HistoryRow[]): GroupedPayout[] {
  const map = new Map<string, GroupedPayout>()
  for (const r of rows) {
    if (!map.has(r.payout_id)) {
      map.set(r.payout_id, {
        payout_id: r.payout_id, reference: r.reference, notes: r.notes,
        payout_status: r.payout_status, total_amount: r.total_amount,
        created_at: r.created_at, reverted_at: r.reverted_at, revert_reason: r.revert_reason,
        items: [],
      })
    }
    if (r.item_id) {
      map.get(r.payout_id)!.items.push({
        item_id: r.item_id,
        item_kind: r.item_kind!,
        item_amount: r.item_amount!,
        application_name: r.application_name!,
        plan_name: r.plan_name!,
        sale_paid_at: r.sale_paid_at!,
      })
    }
  }
  return Array.from(map.values())
}

const ITEM_KIND_LABEL: Record<string, string> = {
  app_purchase_main: 'Compra única',
  app_purchase_reserve: 'Reserva de disputa',
  subscription_invoice: 'Assinatura',
}

function QueueSection({ title, emptyLabel, rows, error }: { title: string; emptyLabel: string; rows: QueueRow[]; error: boolean }) {
  return (
    <div className="mb-6 rounded-2xl border p-5" style={{ background: colors.card, borderColor: colors.border, boxShadow: shadows.card }}>
      <h3 className="mb-3 text-base font-bold" style={{ color: colors.text }}>{title}</h3>
      {error ? (
        <p className="text-sm" style={{ color: '#EF4444' }}>Não foi possível carregar esta lista. Tente novamente em instantes.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm" style={{ color: colors.textSecondary }}>{emptyLabel}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map(row => {
            const elegivel = row.status === 'elegivel'
            return (
              <div key={row.sale_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3" style={{ borderColor: colors.border }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: colors.text }}>{row.application_name} — {row.plan_name}</p>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>Vendido em {formatDateBR(row.paid_at.slice(0, 10))}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold" style={{ color: colors.text }}>{formatCurrencyBRL(row.net_amount)}</p>
                  <p className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: elegivel ? colors.primary : '#F59E0B' }}>
                    <Clock size={11} aria-hidden="true" />
                    {elegivel ? 'Elegível agora' : `Libera em ${row.days_remaining} dia${row.days_remaining === 1 ? '' : 's'} (${formatDateBR(row.release_date.slice(0, 10))})`}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface Props {
  mainQueue:    QueueRow[]
  mainError:    boolean
  reserveQueue: QueueRow[]
  reserveError: boolean
  history:      HistoryRow[]
  historyError: boolean
}

export default function RepassesClient({ mainQueue, mainError, reserveQueue, reserveError, history, historyError }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const grouped = useMemo(() => groupHistory(history), [history])

  return (
    <div>
      <h2 className="mb-4 text-lg font-bold" style={{ color: colors.text }}>Repasses e extrato</h2>

      <QueueSection title="Repasse principal" emptyLabel="Nenhuma venda retida ou elegível no momento." rows={mainQueue} error={mainError} />
      <QueueSection title="Reserva de disputa" emptyLabel="Nenhuma reserva de disputa em aberto." rows={reserveQueue} error={reserveError} />

      <div className="rounded-2xl border p-5" style={{ background: colors.card, borderColor: colors.border, boxShadow: shadows.card }}>
        <h3 className="mb-3 text-base font-bold" style={{ color: colors.text }}>Histórico de repasses</h3>
        {historyError ? (
          <p className="text-sm" style={{ color: '#EF4444' }}>Não foi possível carregar o histórico. Tente novamente em instantes.</p>
        ) : grouped.length === 0 ? (
          <p className="text-sm" style={{ color: colors.textSecondary }}>Nenhum repasse recebido ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ color: colors.textSecondary }}>
                  <th className="pb-2 pr-3 font-semibold">Data</th>
                  <th className="pb-2 pr-3 font-semibold">Referência</th>
                  <th className="pb-2 pr-3 font-semibold">Valor</th>
                  <th className="pb-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map(payout => {
                  const expanded = expandedId === payout.payout_id
                  const reverted = payout.payout_status === 'revertido'
                  return (
                    <Fragment key={payout.payout_id}>
                      <tr onClick={() => setExpandedId(expanded ? null : payout.payout_id)} className="cursor-pointer border-t" style={{ borderColor: colors.border }}>
                        <td className="py-2 pr-3" style={{ color: colors.text }}>
                          <span className="inline-flex items-center gap-1">
                            {expanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                            {formatDateBR(payout.created_at.slice(0, 10))}
                          </span>
                        </td>
                        <td className="py-2 pr-3" style={{ color: colors.textSecondary }}>{payout.reference}</td>
                        <td className="py-2 pr-3 font-semibold" style={{ color: colors.text }}>{formatCurrencyBRL(payout.total_amount)}</td>
                        <td className="py-2">
                          <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ color: reverted ? '#EF4444' : '#10B981', background: reverted ? '#EF44441A' : '#10B9811A' }}>
                            {reverted ? 'Revertido' : 'Confirmado'}
                          </span>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-t" style={{ borderColor: colors.border }}>
                          <td colSpan={4} className="py-3" style={{ background: colors.backgroundAlt }}>
                            <div className="px-3">
                              {reverted && (
                                <p className="mb-2 text-xs" style={{ color: '#EF4444' }}>Motivo da reversão: {payout.revert_reason ?? '—'}</p>
                              )}
                              {payout.notes && (
                                <p className="mb-2 text-xs" style={{ color: colors.textSecondary }}>Observações: {payout.notes}</p>
                              )}
                              <div className="flex flex-col gap-1">
                                {payout.items.map(item => (
                                  <div key={item.item_id} className="flex flex-wrap items-center justify-between gap-2 text-xs" style={{ color: colors.textSecondary }}>
                                    <span>{item.application_name} — {item.plan_name} ({ITEM_KIND_LABEL[item.item_kind]}, vendido em {formatDateBR(item.sale_paid_at.slice(0, 10))})</span>
                                    <strong style={{ color: colors.text }}>{formatCurrencyBRL(item.item_amount)}</strong>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Substituir o conteúdo de `page.tsx`**

Antes:
```tsx
import type { Metadata } from 'next'
import { colors } from '@/lib/design-tokens'

export const metadata: Metadata = { title: 'Repasses e extrato | LOBBY', robots: { index: false, follow: false } }

export default function FinanceiroRepassesPage() {
  return (
    <div>
      <h2 className="mb-2 text-lg font-bold" style={{ color: colors.text }}>Repasses e extrato</h2>
      <p className="text-sm" style={{ color: colors.textSecondary }}>
        Em construção — essa área está sendo desenvolvida.
      </p>
    </div>
  )
}
```

Depois:
```tsx
import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import RepassesClient from './RepassesClient'

export const metadata: Metadata = { title: 'Repasses e extrato | LOBBY', robots: { index: false, follow: false } }

interface QueueRow {
  sale_id:          string
  sale_kind?:       'app_purchase' | 'subscription_invoice'
  application_name: string
  plan_name:        string
  net_amount:       number
  paid_at:          string
  release_date:     string
  days_remaining:   number
  status:           'retido' | 'elegivel'
}

interface HistoryRow {
  payout_id:        string
  reference:        string
  notes:            string | null
  payout_status:    'confirmado' | 'revertido'
  total_amount:     number
  created_at:        string
  reverted_at:       string | null
  revert_reason:     string | null
  item_id:           string | null
  item_kind:         'app_purchase_main' | 'app_purchase_reserve' | 'subscription_invoice' | null
  item_amount:        number | null
  application_name:   string | null
  plan_name:          string | null
  sale_paid_at:       string | null
}

type RpcResult<T> = { data: T | null; error: { message: string } | null }

export default async function FinanceiroRepassesPage() {
  const supabase = await createServerSupabaseClient()
  await requireClientSession(supabase)

  const [mainRes, reserveRes, historyRes] = await Promise.all([
    supabase.rpc('get_partner_payout_queue_main'),
    supabase.rpc('get_partner_payout_queue_reserve'),
    supabase.rpc('get_partner_payout_history'),
  ]) as unknown as [RpcResult<QueueRow[]>, RpcResult<QueueRow[]>, RpcResult<HistoryRow[]>]

  return (
    <RepassesClient
      mainQueue={mainRes.data ?? []}
      mainError={!!mainRes.error}
      reserveQueue={reserveRes.data ?? []}
      reserveError={!!reserveRes.error}
      history={historyRes.data ?? []}
      historyError={!!historyRes.error}
    />
  )
}
```

- [ ] **Step 3: `npx tsc --noEmit`**

Expected: limpo. Mesma atenção da Etapa 3 — `<Fragment key={payout.payout_id}>` (não o shorthand `<>`), já que o shorthand não aceita `key`.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/financeiro/repasses/page.tsx app/dashboard/financeiro/repasses/RepassesClient.tsx
git commit -m "feat: página Repasses e extrato com filas reais e drill-down do histórico (Etapa 4)"
```

---

### Task 3: Verificação manual no navegador

**Files:** nenhum arquivo novo — só dados de teste temporários + checagem.

**Interfaces:** nenhuma — task de verificação, não de código.

- [ ] **Step 1: Criar conta de teste (parceiro) + dados variados**

Mesmo padrão das Etapas 2 e 3 (service-role `auth.admin.createUser` + insert manual em `profiles`, `applications`, `app_drafts`, `app_plans`). Cobrir:
- 1 `app_purchases` retida (fila principal) — `paid_at = now() - interval '5 days'`.
- 1 `app_purchases` elegível (fila principal) — `paid_at = now() - interval '20 days'`.
- 1 `app_purchases` com `reserve_status='held'`, `paid_at` recente (fila de reserva, retida).
- 1 repasse confirmado (`partner_payouts.status='confirmado'`) cobrindo 1+ `app_purchases` via `partner_payout_items` (`kind='main'`) — pra aparecer no histórico com drill-down.
- 1 repasse revertido (`partner_payouts.status='revertido'`, `reverted_at`/`revert_reason` preenchidos) cobrindo outra `app_purchases` — confirmar que aparece no histórico com o motivo, E que a venda que ele cobria volta a aparecer na fila de repasse principal (já que o filtro de elegibilidade só exclui itens de repasses `confirmado`).

- [ ] **Step 2: Login como o parceiro de teste, abrir `/dashboard/financeiro/repasses`**

Confirmar: as 3 seções (Repasse principal, Reserva de disputa, Histórico) mostram os dados esperados; cada venda retida mostra "Libera em N dias (DD/MM)" com a data certa (`paid_at + retention_days`/`reserve_window_days`); venda elegível mostra "Elegível agora"; clique no repasse confirmado expande e mostra os itens cobertos; o repasse revertido aparece com badge "Revertido" e o motivo; a venda que ele cobria aparece de volta na fila de "Repasse principal". Nenhum erro no console. Testar em mobile (375px) também.

- [ ] **Step 3: Limpar os dados de teste**

Apagar `partner_payout_items`/`partner_payouts`/`app_purchases`/`app_plans`/`app_drafts`/`applications`/`profiles`/contas de teste — mesmo cuidado das etapas anteriores.
