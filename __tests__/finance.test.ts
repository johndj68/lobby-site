import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest'
import {
  formatCurrencyBRL,
  formatDateBR,
  filterFinanceTransactions,
  calculateFinanceMetrics,
  getFinanceTypeStyle,
  getFinanceStatusStyle,
} from '@/lib/finance'
import type { FinancialTransaction, FinanceFilters } from '@/lib/finance'

// ── Helpers ──────────────────────────────────────────────────────────────────

// Datas relativas a "agora" (não fixas) — um valor fixo tipo '2026-07-10' vira
// bomba-relógio pro teste de período (30d): passou a falhar sozinho quando o
// relógio real passou de julho/2026, sem nenhuma mudança de código.
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function makeRow(overrides: Partial<FinancialTransaction> = {}): FinancialTransaction {
  return {
    id:           'uuid-1',
    type:         'ebook',
    client_id:    'client-1',
    client_name:  'João Silva',
    company_name: 'Empresa XPTO',
    description:  'Compra de e-book',
    amount:       150,
    status:       'pago',
    sale_date:    daysAgo(5),
    created_at:   `${daysAgo(5)}T10:00:00Z`,
    updated_at:   `${daysAgo(5)}T10:00:00Z`,
    ...overrides,
  } as FinancialTransaction
}

const BASE_FILTERS: FinanceFilters = {
  period:        'todos',
  type:          'todos',
  status:        'todos',
  paymentMethod: 'todos',
  search:        '',
}

// ── formatCurrencyBRL ─────────────────────────────────────────────────────────

describe('formatCurrencyBRL', () => {
  it('formata valor inteiro em BRL', () => {
    const result = formatCurrencyBRL(100)
    expect(result).toContain('100')
    expect(result).toMatch(/R\$/)
  })

  it('formata valor decimal', () => {
    const result = formatCurrencyBRL(99.9)
    expect(result).toContain('99')
  })

  it('formata zero', () => {
    expect(formatCurrencyBRL(0)).toMatch(/R\$/)
  })
})

// ── formatDateBR ──────────────────────────────────────────────────────────────

describe('formatDateBR', () => {
  it('retorna — para null', () => {
    expect(formatDateBR(null)).toBe('—')
  })

  it('retorna — para undefined', () => {
    expect(formatDateBR(undefined)).toBe('—')
  })

  it('formata data ISO no padrão BR', () => {
    const result = formatDateBR('2026-07-20')
    expect(result).toMatch(/20\/07\/2026|2026/)
  })
})

// ── filterFinanceTransactions ─────────────────────────────────────────────────

describe('filterFinanceTransactions', () => {
  let rows: FinancialTransaction[]

  beforeEach(() => {
    rows = [
      makeRow({ id: '1', type: 'ebook',   status: 'pago',     amount: 100, sale_date: daysAgo(10), client_name: 'Alice' }),
      makeRow({ id: '2', type: 'projeto',  status: 'pendente', amount: 500, sale_date: daysAgo(15), client_name: 'Bob'   }),
      makeRow({ id: '3', type: 'creditos', status: 'pago',     amount: 200, sale_date: daysAgo(45), client_name: 'Carol' }),
    ]
  })

  it('sem filtros retorna tudo', () => {
    expect(filterFinanceTransactions(rows, BASE_FILTERS)).toHaveLength(3)
  })

  it('filtra por tipo', () => {
    const result = filterFinanceTransactions(rows, { ...BASE_FILTERS, type: 'ebook' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('filtra por status', () => {
    const result = filterFinanceTransactions(rows, { ...BASE_FILTERS, status: 'pendente' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })

  it('filtra por busca de texto (client_name)', () => {
    const result = filterFinanceTransactions(rows, { ...BASE_FILTERS, search: 'alice' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('busca case-insensitive', () => {
    const result = filterFinanceTransactions(rows, { ...BASE_FILTERS, search: 'ALICE' })
    expect(result).toHaveLength(1)
  })

  it('filtra por período (30d) — exclui registro antigo', () => {
    const result = filterFinanceTransactions(rows, { ...BASE_FILTERS, period: '30d' })
    // id '3' (45 dias atrás) fica fora dos últimos 30 dias; '1'/'2' (10/15 dias) ficam dentro
    const ids = result.map(r => r.id)
    expect(ids).not.toContain('3')
    expect(ids).toContain('1')
    expect(ids).toContain('2')
  })

  it('retorna array vazio quando nenhum match', () => {
    const result = filterFinanceTransactions(rows, { ...BASE_FILTERS, search: 'zzzNaoExiste' })
    expect(result).toHaveLength(0)
  })

  it('filtros combinados funcionam', () => {
    const result = filterFinanceTransactions(rows, { ...BASE_FILTERS, type: 'ebook', status: 'pago' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })
})

// ── calculateFinanceMetrics ───────────────────────────────────────────────────

describe('calculateFinanceMetrics', () => {
  let rows: FinancialTransaction[]

  beforeEach(() => {
    rows = [
      makeRow({ id: '1', type: 'ebook',   status: 'pago',     amount: 100, client_id: 'c1', client_name: 'Alice', sale_date: '2026-07-01' }),
      makeRow({ id: '2', type: 'projeto',  status: 'pago',     amount: 400, client_id: 'c2', client_name: 'Bob',   sale_date: '2026-07-01' }),
      makeRow({ id: '3', type: 'creditos', status: 'pendente', amount: 200, client_id: 'c1', client_name: 'Alice', sale_date: '2026-06-01' }),
    ]
  })

  it('calcula totalRevenue corretamente', () => {
    const m = calculateFinanceMetrics(rows)
    expect(m.totalRevenue).toBe(700)
  })

  it('calcula receivedRevenue só com status pago', () => {
    const m = calculateFinanceMetrics(rows)
    expect(m.receivedRevenue).toBe(500)
  })

  it('calcula pendingRevenue só com status pendente', () => {
    const m = calculateFinanceMetrics(rows)
    expect(m.pendingRevenue).toBe(200)
  })

  it('conta ebookSales corretamente', () => {
    const m = calculateFinanceMetrics(rows)
    expect(m.ebookSales).toBe(1)
  })

  it('conta projectSales corretamente', () => {
    const m = calculateFinanceMetrics(rows)
    expect(m.projectSales).toBe(1)
  })

  it('calcula averageTicket', () => {
    const m = calculateFinanceMetrics(rows)
    expect(m.averageTicket).toBeCloseTo(700 / 3)
  })

  it('conta salesCount', () => {
    const m = calculateFinanceMetrics(rows)
    expect(m.salesCount).toBe(3)
  })

  it('conta payingClients únicos por client_id', () => {
    const m = calculateFinanceMetrics(rows)
    // c1 e c2 pagaram (status pago) — c1 aparece 1x pago, c2 1x pago
    expect(m.payingClients).toBe(2)
  })

  it('topClients lista os maiores clientes', () => {
    const m = calculateFinanceMetrics(rows)
    expect(m.topClients.length).toBeGreaterThan(0)
    expect(m.topClients[0].total).toBeGreaterThanOrEqual(m.topClients.at(-1)!.total)
  })

  it('byType agrupa corretamente', () => {
    const m = calculateFinanceMetrics(rows)
    const ebook = m.byType.find(b => b.type === 'ebook')
    expect(ebook?.count).toBe(1)
    expect(ebook?.total).toBe(100)
  })

  it('monthly agrupa por YYYY-MM', () => {
    const m = calculateFinanceMetrics(rows)
    const months = m.monthly.map(x => x.month)
    expect(months).toContain('2026-07')
    expect(months).toContain('2026-06')
  })

  it('retorna estrutura correta com array vazio', () => {
    const m = calculateFinanceMetrics([])
    expect(m.totalRevenue).toBe(0)
    expect(m.salesCount).toBe(0)
    expect(m.averageTicket).toBe(0)
    expect(m.monthly).toEqual([])
    expect(m.byType).toEqual([])
    expect(m.topClients).toEqual([])
  })
})

// ── getFinanceTypeStyle ───────────────────────────────────────────────────────

describe('getFinanceTypeStyle', () => {
  const types = [
    'ebook', 'projeto', 'visita_tecnica', 'consultoria',
    'mensalidade', 'creditos', 'outro',
  ] as const

  it.each(types)('retorna color e bg para tipo "%s"', (type) => {
    const s = getFinanceTypeStyle(type)
    expect(s.color).toMatch(/^#/)
    expect(s.bg).toContain('rgba')
  })

  it('projeto tem cor azul', () => {
    expect(getFinanceTypeStyle('projeto').color).toBe('#005BFF')
  })

  it('ebook tem cor roxa', () => {
    expect(getFinanceTypeStyle('ebook').color).toBe('#7B2CFF')
  })
})

// ── getFinanceStatusStyle ─────────────────────────────────────────────────────

describe('getFinanceStatusStyle', () => {
  const statuses = ['pago', 'pendente', 'cancelado', 'reembolsado', 'negociacao'] as const

  it.each(statuses)('retorna color e bg para status "%s"', (status) => {
    const s = getFinanceStatusStyle(status)
    expect(s.color).toMatch(/^#/)
    expect(s.bg).toContain('rgba')
  })

  it('pago tem cor verde', () => {
    expect(getFinanceStatusStyle('pago').color).toBe('#10B981')
  })

  it('cancelado tem cor vermelha', () => {
    expect(getFinanceStatusStyle('cancelado').color).toBe('#EF4444')
  })
})

// ── filterFinanceTransactions — paymentMethod e períodos ─────────────────────

describe('filterFinanceTransactions — paymentMethod', () => {
  const rows: FinancialTransaction[] = [
    { id: '1', type: 'ebook', status: 'pago', amount: 100, sale_date: '2026-07-01',
      payment_method: 'pix', client_name: 'A', description: '', created_at: '', updated_at: '' } as FinancialTransaction,
    { id: '2', type: 'projeto', status: 'pago', amount: 200, sale_date: '2026-07-01',
      payment_method: 'cartao', client_name: 'B', description: '', created_at: '', updated_at: '' } as FinancialTransaction,
  ]

  const base: FinanceFilters = {
    period: 'todos', type: 'todos', status: 'todos', paymentMethod: 'todos', search: '',
  }

  it('filtra por paymentMethod pix', () => {
    const result = filterFinanceTransactions(rows, { ...base, paymentMethod: 'pix' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('filtra por paymentMethod cartao', () => {
    const result = filterFinanceTransactions(rows, { ...base, paymentMethod: 'cartao' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })
})

describe('filterFinanceTransactions — períodos com fake timers', () => {
  const NOW_DATE = new Date('2026-07-20T12:00:00Z')

  beforeAll(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW_DATE)
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  const rows: FinancialTransaction[] = [
    { id: 'hoje',   type: 'ebook', status: 'pago', amount: 10, sale_date: '2026-07-20', description: '', created_at: '', updated_at: '' } as FinancialTransaction,
    { id: '7d',     type: 'ebook', status: 'pago', amount: 10, sale_date: '2026-07-15', description: '', created_at: '', updated_at: '' } as FinancialTransaction,
    { id: 'mes',    type: 'ebook', status: 'pago', amount: 10, sale_date: '2026-07-01', description: '', created_at: '', updated_at: '' } as FinancialTransaction,
    { id: 'antigo', type: 'ebook', status: 'pago', amount: 10, sale_date: '2026-01-01', description: '', created_at: '', updated_at: '' } as FinancialTransaction,
  ]

  const base: FinanceFilters = {
    period: 'todos', type: 'todos', status: 'todos', paymentMethod: 'todos', search: '',
  }

  it('period=hoje retorna só transações de hoje', () => {
    const result = filterFinanceTransactions(rows, { ...base, period: 'hoje' })
    expect(result.map(r => r.id)).toContain('hoje')
    expect(result.map(r => r.id)).not.toContain('7d')
  })

  it('period=7d inclui últimos 7 dias', () => {
    const result = filterFinanceTransactions(rows, { ...base, period: '7d' })
    const ids = result.map(r => r.id)
    expect(ids).toContain('hoje')
    expect(ids).toContain('7d')
    expect(ids).not.toContain('antigo')
  })

  it('period=mes retorna transações do mês corrente', () => {
    const result = filterFinanceTransactions(rows, { ...base, period: 'mes' })
    const ids = result.map(r => r.id)
    expect(ids).toContain('hoje')
    expect(ids).toContain('mes')
    expect(ids).not.toContain('antigo')
  })

  it('period=ano retorna transações do ano corrente', () => {
    const result = filterFinanceTransactions(rows, { ...base, period: 'ano' })
    const ids = result.map(r => r.id)
    expect(ids).toContain('hoje')
    expect(ids).toContain('antigo')
  })

  it('period=todos não filtra por data', () => {
    const result = filterFinanceTransactions(rows, { ...base, period: 'todos' })
    expect(result).toHaveLength(4)
  })
})
