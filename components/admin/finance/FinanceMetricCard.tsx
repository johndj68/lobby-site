'use client'

import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { colors, borderRadius } from '@/lib/design-tokens'

interface Props {
  icon:     LucideIcon
  title:    string
  value:    string
  sub?:     string
  color:    string
  bg:       string
  grad:     string
  index?:   number
}

/**
 * Card de indicador financeiro — mesmo padrão visual dos stats cards de
 * LeadsClient/SolicitacoesClient (ícone, valor em destaque, hover com
 * borda colorida), aplicado aos números do controle financeiro.
 */
export default function FinanceMetricCard({ icon: Icon, title, value, sub, color, bg, grad, index = 0 }: Props) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 + index * 0.05 }}
      className="relative overflow-hidden border p-5 transition-all duration-300 hover:-translate-y-1"
      style={{
        borderRadius: borderRadius['3xl'],
        borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(17,24,39,0.8)',
        boxShadow: '0_18px_60px_rgba(0,0,0,0.25)',
      }}
    >
      <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: `linear-gradient(to right, ${grad}, ${color})` }} aria-hidden="true" />
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: bg }}>
        <Icon size={18} style={{ color }} aria-hidden="true" />
      </div>
      <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.45)' }}>
        {title}
      </p>
      <p className="my-1 text-2xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
        {value}
      </p>
      {sub && <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{sub}</p>}
    </motion.article>
  )
}
