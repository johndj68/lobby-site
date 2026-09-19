import type { FinancialTransaction, FinanceType, FinanceStatus, PaymentMethod } from '@/types'
export type { FinancialTransaction }

export function formatCurrencyBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatDateBR(d?: string | null): string {
  if (!d) return '—'
  return new Date(`${d}T00:00:00`).toLocaleDateString('pt-BR')
}

export const FINANCE_TYPE_LABEL: Record<FinanceType, string> = {
  ebook:          'E-book',
  projeto:        'Projeto',
  visita_tecnica: 'Visita técnica',
  consultoria:    'Consultoria',
  mensalidade:    'Mensalidade',
  creditos:       'Créditos',
  outro:          'Outro',
}

export const FINANCE_STATUS_LABEL: Record<FinanceStatus, string> = {
  pago:        'Pago',
  pendente:    'Pendente',
  cancelado:   'Cancelado',
  reembolsado: 'Reembolsado',
  negociacao:  'Em negociação',
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  pix:           'Pix',
  cartao:        'Cartão',
  boleto:        'Boleto',
  dinheiro:      'Dinheiro',
  transferencia: 'Transferência',
  outro:         'Outro',
}

export function getFinanceTypeStyle(type: FinanceType): { color: string; bg: string } {
  const map: Record<FinanceType, { color: string; bg: string }> = {
    ebook:          { color: '#7B2CFF', bg: 'rgba(123,44,255,0.12)' },
    projeto:        { color: '#005BFF', bg: 'rgba(0,91,255,0.12)'   },
    visita_tecnica: { color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
    consultoria:    { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
    mensalidade:    { color: '#38BDF8', bg: 'rgba(56,189,248,0.12)' },
    creditos:       { color: '#EAB308', bg: 'rgba(234,179,8,0.12)'  },
    outro:          { color: '#94A3B8', bg: 'rgba(148,163,184,0.12)' },
  }
  return map[type]
}

export function getFinanceStatusStyle(status: FinanceStatus): { color: string; bg: string } {
  const map: Record<FinanceStatus, { color: string; bg: string }> = {
    pago:        { color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
    pendente:    { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
    cancelado:   { color: '#EF4444', bg: 'rgba(239,68,68,0.12)'  },
    reembolsado: { color: '#94A3B8', bg: 'rgba(148,163,184,0.12)' },
    negociacao:  { color: '#A78BFA', bg: 'rgba(167,139,250,0.12)' },
  }
  return map[status]
}

export interface FinanceFilters {
  period:   'hoje' | '7d' | '30d' | 'mes' | 'ano' | 'todos'
  type:     FinanceType | 'todos'
  status:   FinanceStatus | 'todos'
  paymentMethod: PaymentMethod | 'todos'
  search:   string
}

export const DEFAULT_FINANCE_FILTERS: FinanceFilters = {
  period: 'todos', type: 'todos', status: 'todos', paymentMethod: 'todos', search: '',
}

function periodStart(period: FinanceFilters['period']): Date | null {
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (period) {
    case 'hoje': return startOfDay
    case '7d':   return new Date(startOfDay.getTime() - 7 * 86400000)
    case '30d':  return new Date(startOfDay.getTime() - 30 * 86400000)
    case 'mes':  return new Date(now.getFullYear(), now.getMonth(), 1)
    case 'ano':  return new Date(now.getFullYear(), 0, 1)
    default:     return null
  }
}

export function filterFinanceTransactions(
  rows: FinancialTransaction[],
  filters: FinanceFilters,
): FinancialTransaction[] {
  const start = periodStart(filters.period)
  const q = filters.search.trim().toLowerCase()

  return rows.filter(r => {
    if (start && new Date(`${r.sale_date}T00:00:00`) < start) return false
    if (filters.type !== 'todos' && r.type !== filters.type) return false
    if (filters.status !== 'todos' && r.status !== filters.status) return false
    if (filters.paymentMethod !== 'todos' && r.payment_method !== filters.paymentMethod) return false
    if (q) {
      const haystack = [r.client_name, r.company_name, r.description, String(r.amount)]
        .filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })
}

export interface FinanceMetrics {
  totalRevenue:      number
  receivedRevenue:   number
  pendingRevenue:    number
  ebookSales:        number
  projectSales:      number
  technicalVisits:   number
  averageTicket:     number
  salesCount:        number
  payingClients:     number
  monthly:           { month: string; total: number }[]
  byType:            { type: FinanceType; total: number; count: number }[]
  byStatus:          { status: FinanceStatus; total: number; count: number }[]
  topClients:        { name: string; total: number }[]
}

export function calculateFinanceMetrics(rows: FinancialTransaction[]): FinanceMetrics {
  const totalRevenue    = rows.reduce((sum, r) => sum + r.amount, 0)
  const receivedRevenue = rows.filter(r => r.status === 'pago').reduce((sum, r) => sum + r.amount, 0)
  const pendingRevenue  = rows.filter(r => r.status === 'pendente').reduce((sum, r) => sum + r.amount, 0)
  const ebookSales      = rows.filter(r => r.type === 'ebook').length
  const projectSales    = rows.filter(r => r.type === 'projeto').length
  const technicalVisits = rows.filter(r => r.type === 'visita_tecnica').length
  const salesCount      = rows.length
  const averageTicket   = salesCount > 0 ? totalRevenue / salesCount : 0
  const payingClients   = new Set(
    rows.filter(r => r.status === 'pago' && (r.client_id || r.client_name)).map(r => r.client_id ?? r.client_name)
  ).size

  const monthlyMap = new Map<string, number>()
  for (const r of rows) {
    const key = r.sale_date.slice(0, 7) // YYYY-MM
    monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + r.amount)
  }
  const monthly = [...monthlyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, total]) => ({ month, total }))

  const byTypeMap = new Map<FinanceType, { total: number; count: number }>()
  for (const r of rows) {
    const cur = byTypeMap.get(r.type) ?? { total: 0, count: 0 }
    byTypeMap.set(r.type, { total: cur.total + r.amount, count: cur.count + 1 })
  }
  const byType = [...byTypeMap.entries()].map(([type, v]) => ({ type, ...v }))

  const byStatusMap = new Map<FinanceStatus, { total: number; count: number }>()
  for (const r of rows) {
    const cur = byStatusMap.get(r.status) ?? { total: 0, count: 0 }
    byStatusMap.set(r.status, { total: cur.total + r.amount, count: cur.count + 1 })
  }
  const byStatus = [...byStatusMap.entries()].map(([status, v]) => ({ status, ...v }))

  const clientMap = new Map<string, number>()
  for (const r of rows) {
    const name = r.client_name || r.company_name
    if (!name) continue
    clientMap.set(name, (clientMap.get(name) ?? 0) + r.amount)
  }
  const topClients = [...clientMap.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, total]) => ({ name, total }))

  return {
    totalRevenue, receivedRevenue, pendingRevenue,
    ebookSales, projectSales, technicalVisits,
    averageTicket, salesCount, payingClients,
    monthly, byType, byStatus, topClients,
  }
}

/** Gera e baixa um CSV com as transações filtradas — sem dependência nova. */
export function exportFinanceCSV(rows: FinancialTransaction[]) {
  const headers = [
    'Data da venda', 'Cliente', 'Empresa', 'Tipo', 'Descrição', 'Valor',
    'Status', 'Forma de pagamento', 'Data de recebimento',
  ]
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
  const lines = rows.map(r => [
    formatDateBR(r.sale_date),
    r.client_name ?? '',
    r.company_name ?? '',
    FINANCE_TYPE_LABEL[r.type],
    r.description,
    r.amount.toFixed(2).replace('.', ','),
    FINANCE_STATUS_LABEL[r.status],
    r.payment_method ? PAYMENT_METHOD_LABEL[r.payment_method] : '',
    formatDateBR(r.received_date),
  ].map(v => escape(String(v))).join(';'))

  const csv = '﻿' + [headers.map(escape).join(';'), ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `financeiro-lobby-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
