import Link from 'next/link'
import { MARKETPLACE_COLORS as C } from '@/lib/marketplace'

/**
 * Navegação interna do marketplace (/admin/marketplace/*) — mesma lista e
 * mesmo destino usados em cada página da seção. Cada página ainda repete
 * seu próprio NAV_TABS inline (histórico do projeto); este componente é a
 * versão compartilhada usada pelas páginas que forem migradas para ele.
 */
const TABS = [
  { key: 'visao-geral', label: 'Visão geral', href: '/admin/marketplace' },
  { key: 'aplicativos', label: 'Aplicativos', href: '/admin/marketplace/aplicativos' },
  { key: 'solicitacoes', label: 'Solicitações', href: '/admin/marketplace/solicitacoes' },
  { key: 'ofertas', label: 'Ofertas', href: '/admin/marketplace/ofertas' },
  { key: 'destaques', label: 'Destaques', href: '/admin/marketplace/destaques' },
  { key: 'categorias', label: 'Categorias', href: '/admin/marketplace/categorias' },
  { key: 'parceiros', label: 'Parceiros', href: '/admin/marketplace/parceiros' },
] as const

export type MarketplaceTabKey = (typeof TABS)[number]['key']

export default function MarketplaceTabs({ active }: { active: MarketplaceTabKey }) {
  return (
    <nav aria-label="Seções do marketplace" className="mb-6 flex flex-wrap gap-1 border-b" style={{ borderColor: C.border }}>
      {TABS.map(tab => {
        const isActive = tab.key === active
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            className="px-3 py-2.5 text-sm font-medium"
            style={{ color: isActive ? C.primary : C.textSecondary, borderBottom: isActive ? `2px solid ${C.primary}` : '2px solid transparent' }}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
