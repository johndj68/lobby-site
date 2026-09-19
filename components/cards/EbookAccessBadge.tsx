import { Gift, DollarSign } from 'lucide-react'
import type { Resource } from '@/types'
import { formatCurrencyBRL } from '@/lib/finance'
import { badgeColors } from '@/lib/design-tokens'

interface Props {
  resource: Resource
}

/** Badge Gratuito/Pago exibido nos cards de /recursos. */
export default function EbookAccessBadge({ resource }: Props) {
  if (!resource.isPaid) {
    const style = badgeColors.free
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold"
        style={{ backgroundColor: style.bg, color: style.text, borderColor: style.border }}
      >
        <Gift size={9} aria-hidden="true" />
        Gratuito
      </span>
    )
  }
  const style = badgeColors.paid
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold"
      style={{ backgroundColor: style.bg, color: style.text, borderColor: style.border }}
    >
      <DollarSign size={9} aria-hidden="true" />
      {resource.price != null ? formatCurrencyBRL(resource.price) : 'Pago'}
    </span>
  )
}
