'use client'

import { motion } from 'framer-motion'
import ServiceCard from '@/components/cards/ServiceCard'
import type { ServiceItem } from '@/types'

/* Props da seção:
   - services: array de serviços a exibir no grid.
     Cada ServiceItem contém icon, title, description, items, cta, accent etc.
     Os dados tipicamente vêm de uma constante ou do CMS. */
interface ServicesGridProps {
  services: ServiceItem[]
}

/* Grid animado de ServiceCards.
   Cada card entra com fade + slide de baixo, com delay escalonado por índice
   para criar efeito cascata ao fazer scroll até a seção. */
export default function ServicesGrid({ services }: ServicesGridProps) {
  return (
    // Grid responsivo: 1 coluna no mobile, 2 no tablet, 4 no desktop
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
      {services.map((s, i) => (
        // Wrapper animado: cada card entra individualmente com delay proporcional ao índice
        <motion.div
          key={s.title}
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 0.45, delay: i * 0.1 }}
          className="flex"  // flex para que o ServiceCard ocupe toda a altura da célula
        >
          {/* Passa todas as props do serviço para o ServiceCard via spread.
              className="w-full" garante que o card ocupa largura total da célula do grid. */}
          <ServiceCard {...s} className="w-full" />
        </motion.div>
      ))}
    </div>
  )
}
