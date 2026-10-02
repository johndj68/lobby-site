# Vendas e Financeiro — Entrada no Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every client sees "Vendas e financeiro" in the dashboard sidebar. A client who already sells at least one app gets into the area (sub-navigation, 5 reachable routes, each a placeholder). A client who doesn't sell yet sees a presentation screen with a "Cadastrar meu aplicativo" CTA. No real financial data in this plan — that's a later stage.

**Architecture:** A new `app/dashboard/financeiro/layout.tsx` (server component) runs the seller-detection query once (reusing the exact RLS-scoped `app_drafts` query pattern already used by `/dashboard/meus-app`) and passes the result into a new client component, `FinanceiroSellerGate`, which either renders the non-seller presentation or wraps `children` in a light-themed horizontal/mobile-select sub-nav. Five near-identical stub pages fill out the 5 routes from the spec. One line added to the existing sidebar (`DashboardShell.tsx`).

**Spec:** `docs/superpowers/specs/2026-10-02-vendas-financeiro-entrada-design.md`

## Global Constraints

- No real financial data anywhere in this plan — every one of the 5 pages under `/dashboard/financeiro/*` is a placeholder ("Em construção"). Do not query `app_purchases`, `partner_payouts`, or any financial table from these pages.
- Seller detection is exactly: does `app_drafts` return at least one row for the current RLS-scoped session (no explicit `created_by`/user-id filter — RLS already restricts to own-or-team-member, same as `/dashboard/meus-app/page.tsx`). No new concept of "seller" is introduced anywhere else.
- Visual: use only the existing `colors`/`shadows` tokens from `lib/design-tokens.ts` — no new color values. `colors.backgroundAlt` for page background, `colors.card` for cards, `colors.text` for titles, `colors.primary` for the active-tab/CTA accent, `colors.border` for borders.
- Do not touch `/admin/financeiro` or any file under `app/admin/**` — this plan is entirely client-dashboard-side.
- No new test files — zero precedent for testing `app/dashboard/**` pages or `DashboardShell.tsx` in this codebase (confirmed during spec design).

---

### Task 1: Sidebar entry — `DashboardShell.tsx`

**Files:**
- Modify: `components/layout/DashboardShell.tsx`

**Interfaces:**
- Produces: new sidebar link to `/dashboard/financeiro` — consumed by nothing in this plan directly (it's the entry point Task 2's layout receives traffic from), but its `href`/`matchPrefix` must match exactly what Task 2's routes are mounted at.

- [ ] **Step 1: Implement**

In `components/layout/DashboardShell.tsx`, the icon import currently reads:

```typescript
import {
  LayoutDashboard, Download, FolderKanban, MessageSquarePlus,
  User, LogOut, Bell, Menu, X, Plus,
  ChevronDown, HelpCircle, Sparkles, ArrowRight, MessageCircle, Coins, History, LayoutGrid, ShoppingBag, RefreshCw,
} from 'lucide-react'
```

Add `Wallet` to that import list:

```typescript
import {
  LayoutDashboard, Download, FolderKanban, MessageSquarePlus,
  User, LogOut, Bell, Menu, X, Plus,
  ChevronDown, HelpCircle, Sparkles, ArrowRight, MessageCircle, Coins, History, LayoutGrid, ShoppingBag, RefreshCw, Wallet,
} from 'lucide-react'
```

The `navItems` array currently reads:

```typescript
const navItems = [
  { icon: LayoutDashboard,   label: 'Dashboard',         href: '/dashboard'            },
  { icon: Download,          label: 'Meus downloads',    href: '/dashboard/downloads'  },
  { icon: FolderKanban,      label: 'Projetos',          href: '/dashboard/projetos'   },
  { icon: LayoutGrid,        label: 'Meus apps',         href: '/dashboard/meus-app', matchPrefix: true },
  { icon: ShoppingBag,       label: 'Minhas compras',    href: '/dashboard/minhas-compras' },
  { icon: RefreshCw,         label: 'Assinaturas',       href: '/dashboard/assinaturas' },
  { icon: History,           label: 'Histórico',         href: '/dashboard/historico'  },
  { icon: Coins,             label: 'Meus créditos',     href: '/dashboard/creditos'   },
  { icon: MessageCircle,     label: 'Mensagens',         href: '/dashboard/mensagens'  },
  { icon: MessageSquarePlus, label: 'Solicitar solução', href: '/contato'              },
  { icon: User,              label: 'Conta',             href: '/dashboard/conta'      },
  { icon: HelpCircle,        label: 'Suporte',           href: '/dashboard/suporte'    },
]
```

Insert the new item right after "Meus apps", before "Minhas compras":

```typescript
const navItems = [
  { icon: LayoutDashboard,   label: 'Dashboard',         href: '/dashboard'            },
  { icon: Download,          label: 'Meus downloads',    href: '/dashboard/downloads'  },
  { icon: FolderKanban,      label: 'Projetos',          href: '/dashboard/projetos'   },
  { icon: LayoutGrid,        label: 'Meus apps',         href: '/dashboard/meus-app', matchPrefix: true },
  { icon: Wallet,            label: 'Vendas e financeiro', href: '/dashboard/financeiro', matchPrefix: true },
  { icon: ShoppingBag,       label: 'Minhas compras',    href: '/dashboard/minhas-compras' },
  { icon: RefreshCw,         label: 'Assinaturas',       href: '/dashboard/assinaturas' },
  { icon: History,           label: 'Histórico',         href: '/dashboard/historico'  },
  { icon: Coins,             label: 'Meus créditos',     href: '/dashboard/creditos'   },
  { icon: MessageCircle,     label: 'Mensagens',         href: '/dashboard/mensagens'  },
  { icon: MessageSquarePlus, label: 'Solicitar solução', href: '/contato'              },
  { icon: User,              label: 'Conta',             href: '/dashboard/conta'      },
  { icon: HelpCircle,        label: 'Suporte',           href: '/dashboard/suporte'    },
]
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` — must be clean.

No new test (zero precedent for this file).

- [ ] **Step 3: Commit**

```bash
git add components/layout/DashboardShell.tsx
git commit -m "feat: item 'Vendas e financeiro' na sidebar do dashboard do cliente"
```

---

### Task 2: Layout + guarda de vendedor + sub-navegação — `app/dashboard/financeiro/layout.tsx` + `FinanceiroSellerGate.tsx`

**Files:**
- Create: `app/dashboard/financeiro/layout.tsx`
- Create: `app/dashboard/financeiro/FinanceiroSellerGate.tsx`

**Interfaces:**
- Produces: `FinanceiroSellerGate` component with props `{ user: SupabaseUser; profile: {...} | null; isSeller: boolean; children: React.ReactNode }` — Task 3's 5 stub pages don't import this directly (they're rendered AS `children` by the layout), but they must assume they only ever render when `isSeller === true` (the layout guarantees this).
- Consumes: `requireClientSession` from `@/lib/services/profile`, `createServerSupabaseClient` from `@/lib/supabase-server` (both already used identically by `/dashboard/meus-app/page.tsx` — same pattern, not a new one).

- [ ] **Step 1: Write `app/dashboard/financeiro/layout.tsx`**

```tsx
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import FinanceiroSellerGate from './FinanceiroSellerGate'

export default async function FinanceiroLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireClientSession(supabase)

  // Mesma query (sem filtro explícito por usuário) de app/dashboard/meus-app/
  // page.tsx — a RLS de app_drafts já restringe a "próprio OU membro de
  // app_team_members". Qualquer linha = o usuário já vende pelo menos um app.
  const { data: drafts } = await supabase.from('app_drafts').select('id').limit(1)
  const isSeller = (drafts?.length ?? 0) > 0

  return (
    <FinanceiroSellerGate user={user} profile={profile} isSeller={isSeller}>
      {children}
    </FinanceiroSellerGate>
  )
}
```

- [ ] **Step 2: Write `app/dashboard/financeiro/FinanceiroSellerGate.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Wallet, ArrowRight } from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import DashboardShell from '@/components/layout/DashboardShell'
import { colors, shadows } from '@/lib/design-tokens'

const FINANCEIRO_TABS = [
  { label: 'Visão geral',                 href: '/dashboard/financeiro' },
  { label: 'Vendas',                      href: '/dashboard/financeiro/vendas' },
  { label: 'Repasses e extrato',          href: '/dashboard/financeiro/repasses' },
  { label: 'Ofertas e promoções',         href: '/dashboard/financeiro/ofertas' },
  { label: 'Configurações de recebimento', href: '/dashboard/financeiro/configuracoes' },
]

interface Props {
  user:     SupabaseUser
  profile:  { full_name?: string; company_name?: string } | null
  isSeller: boolean
  children: React.ReactNode
}

/**
 * Guarda de acesso da área "Vendas e financeiro" (Etapa 2 do roadmap —
 * só estrutura, sem dado financeiro real ainda). Quem não vende nenhum
 * app ainda nunca chega a montar `children` — vê só a apresentação com
 * CTA de cadastro.
 */
export default function FinanceiroSellerGate({ user, profile, isSeller, children }: Props) {
  const pathname = usePathname()

  if (!isSeller) {
    return (
      <DashboardShell user={user} profile={profile}>
        <div className="mx-auto max-w-xl py-12 text-center" style={{ color: colors.text }}>
          <div
            className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: colors.primary }}
          >
            <Wallet size={24} className="text-white" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Vendas e financeiro
          </h1>
          <p className="mt-3 text-sm" style={{ color: colors.textSecondary }}>
            Quando você publica um app no marketplace, esta área mostra suas vendas,
            quanto você tem a receber e seus repasses — tudo num só lugar.
          </p>
          <Link
            href="/dashboard/meus-app/novo"
            className="mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white"
            style={{ background: colors.primary }}
          >
            Cadastrar meu aplicativo
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell user={user} profile={profile}>
      <div style={{ background: colors.backgroundAlt }} className="-m-6 min-h-screen p-6 sm:-m-8 sm:p-8">
        <h1 className="mb-1 text-2xl font-bold" style={{ color: colors.text, fontFamily: 'Space Grotesk, sans-serif' }}>
          Vendas e financeiro
        </h1>
        <p className="mb-5 text-sm" style={{ color: colors.textSecondary }}>
          Acompanhe as vendas dos seus aplicativos, os valores a receber e seus repasses.
        </p>

        {/* Desktop: abas horizontais */}
        <div className="mb-6 hidden gap-1 overflow-x-auto border-b sm:flex" style={{ borderColor: colors.border }}>
          {FINANCEIRO_TABS.map(tab => {
            const active = tab.href === '/dashboard/financeiro'
              ? pathname === tab.href
              : pathname.startsWith(tab.href)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="shrink-0 px-3 py-2.5 text-sm font-semibold"
                style={active
                  ? { color: colors.primary, borderBottom: `2px solid ${colors.primary}` }
                  : { color: colors.textSecondary }}
              >
                {tab.label}
              </Link>
            )
          })}
        </div>

        {/* Celular: seletor */}
        <div className="mb-6 sm:hidden">
          <select
            value={FINANCEIRO_TABS.find(t => t.href === '/dashboard/financeiro' ? pathname === t.href : pathname.startsWith(t.href))?.href ?? FINANCEIRO_TABS[0].href}
            onChange={e => { window.location.href = e.target.value }}
            className="h-11 w-full rounded-xl border px-3 text-sm font-semibold"
            style={{ borderColor: colors.border, background: colors.card, color: colors.text }}
            aria-label="Navegar na área Vendas e financeiro"
          >
            {FINANCEIRO_TABS.map(tab => (
              <option key={tab.href} value={tab.href}>{tab.label}</option>
            ))}
          </select>
        </div>

        <div
          className="rounded-2xl border p-6"
          style={{ background: colors.card, borderColor: colors.border, boxShadow: shadows.card }}
        >
          {children}
        </div>
      </div>
    </DashboardShell>
  )
}
```

(`boxShadow: shadows.card` passed straight through — same usage already established in `components/cards/ProjectCard.tsx`, `components/credits/CreditPackageCard.tsx`, `components/cards/ResourceCard.tsx`. Don't transform the string, match the existing pattern exactly.)

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` — must be clean.

No new test (zero precedent).

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/financeiro/layout.tsx app/dashboard/financeiro/FinanceiroSellerGate.tsx
git commit -m "feat: guarda de vendedor e sub-navegação da área Vendas e financeiro"
```

---

### Task 3: 5 páginas stub

**Files:**
- Create: `app/dashboard/financeiro/page.tsx`
- Create: `app/dashboard/financeiro/vendas/page.tsx`
- Create: `app/dashboard/financeiro/repasses/page.tsx`
- Create: `app/dashboard/financeiro/ofertas/page.tsx`
- Create: `app/dashboard/financeiro/configuracoes/page.tsx`

**Interfaces:**
- Consumes: nothing beyond `colors` from `@/lib/design-tokens` — these are rendered as `children` by Task 2's `FinanceiroSellerGate`, so they must NOT re-check seller status, re-render `DashboardShell`, or do their own data fetching. Each is a plain Server Component returning static placeholder markup.

- [ ] **Step 1: Write `app/dashboard/financeiro/page.tsx`**

```tsx
import { colors } from '@/lib/design-tokens'

export default function FinanceiroVisaoGeralPage() {
  return (
    <div>
      <h2 className="mb-2 text-lg font-bold" style={{ color: colors.text }}>Visão geral</h2>
      <p className="text-sm" style={{ color: colors.textSecondary }}>
        Em construção — essa área está sendo desenvolvida.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Write `app/dashboard/financeiro/vendas/page.tsx`**

```tsx
import { colors } from '@/lib/design-tokens'

export default function FinanceiroVendasPage() {
  return (
    <div>
      <h2 className="mb-2 text-lg font-bold" style={{ color: colors.text }}>Vendas</h2>
      <p className="text-sm" style={{ color: colors.textSecondary }}>
        Em construção — essa área está sendo desenvolvida.
      </p>
    </div>
  )
}
```

- [ ] **Step 3: Write `app/dashboard/financeiro/repasses/page.tsx`**

```tsx
import { colors } from '@/lib/design-tokens'

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

- [ ] **Step 4: Write `app/dashboard/financeiro/ofertas/page.tsx`**

```tsx
import { colors } from '@/lib/design-tokens'

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

- [ ] **Step 5: Write `app/dashboard/financeiro/configuracoes/page.tsx`**

```tsx
import { colors } from '@/lib/design-tokens'

export default function FinanceiroConfiguracoesPage() {
  return (
    <div>
      <h2 className="mb-2 text-lg font-bold" style={{ color: colors.text }}>Configurações de recebimento</h2>
      <p className="text-sm" style={{ color: colors.textSecondary }}>
        Em construção — essa área está sendo desenvolvida.
      </p>
    </div>
  )
}
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit` — must be clean.

No new tests (zero precedent).

- [ ] **Step 7: Manual verification**

Run: `npm run dev` (check `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` first — a dev server may already be running from an earlier session on port 3000).

Using Playwright (per this session's established `webapp-testing` pattern) or a manual browser check:

1. Log in as a Técnico Líder is NOT what's needed here — this is the CLIENT dashboard, log in as a regular client account (not `/admin/login`, the client login at `/login`). If no test client credentials are available, ask the user for one, or check if `johnoffice@gmail.com` (used earlier this session for admin login) also has a non-technician profile usable here — if not, this step may need credentials from the user.
2. Confirm "Vendas e financeiro" appears in the sidebar between "Meus apps" and "Minhas compras".
3. Click it. If the logged-in user has zero `app_drafts`, confirm the presentation screen renders with the "Cadastrar meu aplicativo" button, and that clicking it navigates to `/dashboard/meus-app/novo`.
4. If the logged-in user has at least one `app_draft` (or test with one that does), confirm the 5-tab sub-nav renders, each tab is clickable, and each of the 5 routes shows its own "Em construção" placeholder without crashing or showing a console error.
5. Resize the viewport to mobile width and confirm the tab bar is replaced by the `<select>` dropdown, and that choosing a different option navigates correctly.

- [ ] **Step 8: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — no new tests, but confirms nothing else broke (this plan touches no shared library code besides the sidebar array).

- [ ] **Step 9: Commit**

```bash
git add app/dashboard/financeiro/page.tsx app/dashboard/financeiro/vendas/page.tsx app/dashboard/financeiro/repasses/page.tsx app/dashboard/financeiro/ofertas/page.tsx app/dashboard/financeiro/configuracoes/page.tsx
git commit -m "feat: páginas stub das 5 rotas de Vendas e financeiro"
```

---

## Self-Review Notes

**Spec coverage:** sidebar entry (Task 1) ✓, seller detection (Task 2's layout) ✓, light-theme gate + presentation for non-sellers (Task 2's `FinanceiroSellerGate`) ✓, horizontal/mobile-select sub-nav (Task 2) ✓, 5 stub routes (Task 3) ✓. No real financial data anywhere, as required. `/admin/financeiro` untouched throughout.

**Type consistency:** `FinanceiroSellerGate`'s `Props` shape (`user`, `profile`, `isSeller`, `children`) matches exactly what `layout.tsx` passes it. `FINANCEIRO_TABS`' 5 `href` values match exactly the 5 file paths created in Task 3 (`/dashboard/financeiro`, `/vendas`, `/repasses`, `/ofertas`, `/configuracoes`).

**Placeholder scan:** none found in the code itself — the literal string "Em construção" in the 5 stub pages is the INTENDED content per the spec (a real placeholder shown to users, not a TODO marker left in the plan), not a planning gap.
