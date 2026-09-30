'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Wallet, Receipt, ScanSearch } from 'lucide-react'

const LINKS = [
  { href: '/admin/financeiro',              label: 'Financeiro',  icon: Wallet },
  { href: '/admin/financeiro/contas',       label: 'Contas',      icon: Receipt },
  { href: '/admin/financeiro/conciliacao',  label: 'Conciliação', icon: ScanSearch },
]

interface Props {
  // 'dark' — resto do /admin (AdminShell, /admin/financeiro). 'light' — só
  // /admin/financeiro/contas, que ainda não foi migrada pro tema escuro
  // (fora do escopo do aprimoramento da conciliação).
  variant?: 'dark' | 'light'
}

/** Navegação interna entre as 3 sub-páginas do Financeiro — item ativo destacado. */
export default function FinanceiroSubNav({ variant = 'dark' }: Props) {
  const pathname = usePathname()

  return (
    <nav aria-label="Navegação do Financeiro" className="flex flex-wrap gap-1.5">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = href === '/admin/financeiro' ? pathname === href : pathname.startsWith(href)
        const activeClass = variant === 'dark' ? 'bg-[#005BFF]/20 text-[#60A5FA]' : 'bg-[#005BFF]/10 text-[#005BFF]'
        const idleClass = variant === 'dark'
          ? 'border border-white/[0.08] text-white/50 hover:border-white/20 hover:text-white/80'
          : 'border border-[#E3E7F0] text-[#5D6475] hover:border-[#005BFF]/40 hover:text-[#005BFF]'
        return (
          <Link key={href} href={href} aria-current={active ? 'page' : undefined}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${active ? activeClass : idleClass}`}>
            <Icon size={13} aria-hidden="true" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
