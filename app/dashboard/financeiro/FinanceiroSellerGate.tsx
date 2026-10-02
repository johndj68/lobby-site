'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Wallet, ArrowRight } from 'lucide-react'
import { colors, shadows } from '@/lib/design-tokens'

const FINANCEIRO_TABS = [
  { label: 'Visão geral',                 href: '/dashboard/financeiro' },
  { label: 'Vendas',                      href: '/dashboard/financeiro/vendas' },
  { label: 'Repasses e extrato',          href: '/dashboard/financeiro/repasses' },
  { label: 'Ofertas e promoções',         href: '/dashboard/financeiro/ofertas' },
  { label: 'Configurações de recebimento', href: '/dashboard/financeiro/configuracoes' },
]

const isTabActive = (pathname: string, href: string): boolean =>
  href === '/dashboard/financeiro'
    ? pathname === href
    : pathname === href || pathname.startsWith(href + '/')

interface Props {
  isSeller: boolean
  children: React.ReactNode
}

/**
 * Guarda de acesso da área "Vendas e financeiro" (Etapa 2 do roadmap —
 * só estrutura, sem dado financeiro real ainda). Quem não vende nenhum
 * app ainda nunca vê `children` renderizado — vê só a apresentação com
 * CTA de cadastro. Importante: isso é uma guarda de *exibição*, não de
 * *busca de dado* — o Server Component da página filha roda no servidor
 * independente disso (o App Router não dá pra um layout impedir isso).
 * Páginas futuras que buscarem dado financeiro real devem fazer sua
 * própria checagem de vendedor antes de consultar, em vez de confiar só
 * neste componente pra evitar a query.
 *
 * NÃO renderiza <DashboardShell> — o layout raiz do dashboard
 * (app/dashboard/layout.tsx → DashboardLayoutWrapper) já envolve TODA
 * rota /dashboard/** nele. Remontar aqui duplicava o DashboardShell
 * (sidebar + assinaturas realtime) pra qualquer rota /dashboard/
 * financeiro/**, e duas instâncias tentando se inscrever no mesmo canal
 * `dash-msg-badge-${user.id}` quebrava com "cannot add `postgres_changes`
 * callbacks ... after `subscribe()`" — achado ao testar de verdade no
 * navegador, não pego por tsc nem pelas reviews (nenhuma rodou a página).
 */
export default function FinanceiroSellerGate({ isSeller, children }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  if (!isSeller) {
    return (
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
    )
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold" style={{ color: colors.text, fontFamily: 'Space Grotesk, sans-serif' }}>
        Vendas e financeiro
      </h1>
      <p className="mb-5 text-sm" style={{ color: colors.textSecondary }}>
        Acompanhe as vendas dos seus aplicativos, os valores a receber e seus repasses.
      </p>

      {/* Desktop: abas horizontais */}
      <div className="mb-6 hidden gap-1 overflow-x-auto border-b sm:flex" style={{ borderColor: colors.border }}>
        {FINANCEIRO_TABS.map(tab => {
          const active = isTabActive(pathname, tab.href)
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
          value={FINANCEIRO_TABS.find(t => isTabActive(pathname, t.href))?.href ?? FINANCEIRO_TABS[0].href}
          onChange={e => router.push(e.target.value)}
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
  )
}
