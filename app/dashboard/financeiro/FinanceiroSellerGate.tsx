'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
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

interface ViewablePartner {
  partner_id:    string
  partner_label: string
}

interface Props {
  isSeller:         boolean
  viewablePartners: ViewablePartner[]
  children:         React.ReactNode
}

/**
 * Guarda de acesso da área "Vendas e financeiro". Quem não é vendedor
 * E não tem acesso ao financeiro de nenhum outro parceiro via equipe
 * (Etapa 5) nunca vê `children` renderizado — vê só a apresentação com
 * CTA de cadastro. Guarda de *exibição*, não de *busca de dado* — o
 * Server Component da página filha roda no servidor independente disso.
 * As 3 páginas com RPC real (Visão geral, Vendas, Repasses) fazem sua
 * própria validação via o parâmetro `p_partner_id` de cada RPC (Etapa
 * 5) — não dependem deste componente pra segurança, só pra navegação.
 *
 * Seletor de parceiro (Etapa 5): quando `viewablePartners` não está
 * vazio, mostra um `<select>` com "Minha conta" (se `isSeller`) + um
 * item por parceiro concedido. Troca de seleção escreve `?parceiro=
 * <uuid>` na URL (via `URLSearchParams`, preservando a sub-rota atual)
 * — cada página real lê esse param e passa como `p_partner_id` pras
 * suas RPCs. `FinanceiroSellerGate` só renderiza o seletor; a
 * autorização de verdade vive nas RPCs (Task 1), nunca só aqui.
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
export default function FinanceiroSellerGate({ isSeller, viewablePartners, children }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  const hasAnyAccess = isSeller || viewablePartners.length > 0

  if (!hasAnyAccess) {
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

  const selectorOptions = [
    ...(isSeller ? [{ partner_id: 'self', partner_label: 'Minha conta' }] : []),
    ...viewablePartners,
  ]
  const selectedPartnerId = searchParams.get('parceiro') ?? 'self'

  const handlePartnerChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'self') {
      params.delete('parceiro')
    } else {
      params.set('parceiro', value)
    }
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold" style={{ color: colors.text, fontFamily: 'Space Grotesk, sans-serif' }}>
        Vendas e financeiro
      </h1>
      <p className="mb-5 text-sm" style={{ color: colors.textSecondary }}>
        Acompanhe as vendas dos seus aplicativos, os valores a receber e seus repasses.
      </p>

      {selectorOptions.length > 1 && (
        <div className="mb-4">
          <label className="mb-1 block text-xs font-semibold" style={{ color: colors.textSecondary }}>
            Visualizando financeiro de
          </label>
          <select
            value={selectedPartnerId}
            onChange={e => handlePartnerChange(e.target.value)}
            className="h-10 w-full max-w-xs rounded-xl border px-3 text-sm font-semibold sm:w-auto"
            style={{ borderColor: colors.border, background: colors.card, color: colors.text }}
            aria-label="Visualizando financeiro de"
          >
            {selectorOptions.map(opt => (
              <option key={opt.partner_id} value={opt.partner_id}>{opt.partner_label}</option>
            ))}
          </select>
        </div>
      )}

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

      {/* Celular: seletor de aba */}
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
