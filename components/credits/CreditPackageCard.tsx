'use client'

import { Coins, Star, ShoppingCart } from 'lucide-react'
import { formatCurrencyBRL } from '@/lib/finance'
import { formatCredits } from '@/lib/credits'
import type { CreditPackage } from '@/types'
import { colors, shadows, borderRadius, gradients } from '@/lib/design-tokens'

interface Props {
  pkg:      CreditPackage
  onBuy:    (pkg: CreditPackage) => void
}

export default function CreditPackageCard({ pkg, onBuy }: Props) {
  return (
    <div
      className="relative flex flex-col transition-all duration-300 hover:-translate-y-1"
      style={{
        borderRadius: borderRadius['3xl'],
        border: `1px solid ${pkg.is_featured ? `${colors.primary}4d` : colors.border}`,
        backgroundColor: colors.background,
        padding: '20px',
        boxShadow: shadows.card,
        cursor: 'pointer',
      }}
    >
      {pkg.is_featured && (
        <span className="absolute -top-3 left-5 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-bold text-white shadow-sm" style={{ background: gradients.primaryBold }}>
          <Star size={10} aria-hidden="true" />
          Mais vendido
        </span>
      )}

      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: `${colors.primary}1a` }}>
        <Coins size={20} style={{ color: colors.primary }} aria-hidden="true" />
      </div>

      <p className="text-sm font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif', color: colors.text }}>
        {pkg.name}
      </p>
      <p className="mt-1 text-2xl font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif', color: colors.text }}>
        {formatCredits(pkg.credits_amount)}
      </p>
      <p className="mt-0.5 text-lg font-bold" style={{ color: colors.primary }}>
        {formatCurrencyBRL(pkg.price)}
      </p>

      {pkg.description && (
        <p className="mt-2 flex-1 text-xs leading-relaxed" style={{ color: colors.textSecondary }}>
          {pkg.description}
        </p>
      )}

      <button
        type="button"
        onClick={() => onBuy(pkg)}
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-0.5"
        style={{ background: gradients.primaryBold }}
      >
        <ShoppingCart size={14} aria-hidden="true" />
        Comprar pacote
      </button>
    </div>
  )
}
