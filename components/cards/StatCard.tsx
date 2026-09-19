'use client'

import { motion } from 'framer-motion'
import { Rocket, Building2, Star, Clock } from 'lucide-react'
import { Metric } from '@/types'
import { colors, gradients } from '@/lib/design-tokens'

const iconMap = { Rocket, Building2, Star, Clock }

interface StatCardProps {
  metric: Metric
  index?: number
}

export default function StatCard({ metric, index = 0 }: StatCardProps) {
  const Icon = metric.icon ? iconMap[metric.icon as keyof typeof iconMap] : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
      className="flex flex-col items-center text-center p-6"
    >
      {Icon && (
        <div
          className="w-10 h-10 rounded-xl mb-3 flex items-center justify-center"
          style={{ background: gradients.blue }}
        >
          <Icon size={18} style={{ color: colors.primary }} />
        </div>
      )}
      <span
        className="text-3xl md:text-4xl font-bold mb-1"
        style={{
          fontFamily: 'Space Grotesk, sans-serif',
          background: gradients.primaryBold,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        {metric.value}
      </span>
      <span className="text-sm" style={{ color: colors.textSecondary }}>
        {metric.label}
      </span>
    </motion.div>
  )
}
