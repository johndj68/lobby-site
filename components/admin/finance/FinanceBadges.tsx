import {
  BookOpen, FolderKanban, MapPin, Users, RefreshCw, Coins, Package,
  CheckCircle2, Clock, XCircle, RotateCcw, TrendingUp,
} from 'lucide-react'
import { getFinanceTypeStyle, getFinanceStatusStyle, FINANCE_TYPE_LABEL, FINANCE_STATUS_LABEL } from '@/lib/finance'
import type { FinanceType, FinanceStatus } from '@/types'

/**
 * Mapeia cada tipo de transação financeira para o ícone Lucide correspondente.
 * O tipo determina a origem da receita (e-book, projeto, visita, etc.).
 */
const TYPE_ICON: Record<FinanceType, React.ElementType> = {
  ebook:          BookOpen,      // venda de e-book
  projeto:        FolderKanban,  // honorário de projeto
  visita_tecnica: MapPin,        // visita técnica presencial
  consultoria:    Users,         // consultoria avulsa
  mensalidade:    RefreshCw,     // contrato recorrente
  creditos:       Coins,         // compra de créditos da plataforma
  outro:          Package,       // receita não categorizada
}

/**
 * Mapeia cada status de pagamento para o ícone Lucide correspondente.
 * O status reflete a situação atual do recebimento.
 */
const STATUS_ICON: Record<FinanceStatus, React.ElementType> = {
  pago:        CheckCircle2,  // pagamento confirmado
  pendente:    Clock,         // aguardando pagamento
  cancelado:   XCircle,       // transação cancelada
  reembolsado: RotateCcw,     // valor devolvido ao cliente
  negociacao:  TrendingUp,    // em processo de negociação
}

/**
 * Badge visual de tipo de transação financeira.
 * Combina ícone + label + cores (obtidas de getFinanceTypeStyle) em uma
 * pílula compacta usada nas tabelas e cards do painel financeiro.
 *
 * Props:
 * - type: tipo de transação (ebook, projeto, visita_tecnica, etc.)
 */
export function FinanceTypeBadge({ type }: { type: FinanceType }) {
  // Obtém as cores (fundo e texto) para este tipo de transação
  const s    = getFinanceTypeStyle(type)
  const Icon = TYPE_ICON[type]
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: s.bg, color: s.color }}>
      <Icon size={9} aria-hidden="true" />
      {FINANCE_TYPE_LABEL[type]}
    </span>
  )
}

/**
 * Badge visual de status de pagamento.
 * Combina ícone + label + cores (obtidas de getFinanceStatusStyle) em uma
 * pílula compacta que indica visualmente a situação do recebimento.
 *
 * Props:
 * - status: situação do pagamento (pago, pendente, cancelado, etc.)
 */
export function FinanceStatusBadge({ status }: { status: FinanceStatus }) {
  // Obtém as cores (fundo e texto) para este status de pagamento
  const s    = getFinanceStatusStyle(status)
  const Icon = STATUS_ICON[status]
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: s.bg, color: s.color }}>
      <Icon size={9} aria-hidden="true" />
      {FINANCE_STATUS_LABEL[status]}
    </span>
  )
}
