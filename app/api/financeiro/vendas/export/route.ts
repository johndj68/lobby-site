import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { csvSafe } from '@/lib/services/offers'
import { formatCurrencyBRL, formatDateBR } from '@/lib/finance'

/**
 * Export da aba Vendas — mesmo padrão csvSafe + Content-Disposition +
 * paginação em blocos de 1000 já usado em app/api/financeiro/export/
 * route.ts (Visão geral). Respeita exatamente os mesmos filtros da tela
 * (aplicativo, plano, período, status de pagamento, status de repasse,
 * busca) via get_partner_sales — nenhum cálculo próprio, nenhuma segunda
 * fonte de verdade.
 *
 * Permissão: delegada inteiramente à RPC (security definer, checa
 * financeiro_vendas internamente e lança exceção em caso de acesso
 * negado) — esta rota só propaga o erro como resposta limpa.
 */

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  confirmado: 'Confirmado', parcialmente_reembolsado: 'Parcialmente reembolsado', reembolsado: 'Reembolsado',
}
const PAYOUT_STATUS_LABEL: Record<string, string> = {
  retido: 'Retido', elegivel: 'Elegível', parcialmente_repassado: 'Parcialmente repassado', repassado: 'Repassado',
}

interface SaleRow {
  sale_id:           string
  application_name:  string
  plan_name:         string
  amount:            number
  commission_amount: number
  partner_amount:    number
  refunded_amount:   number
  paid_at:           string
  payment_status:    string
  payout_status:     string
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const applicationId = sp.get('application_id') || null
  const planId = sp.get('plan_id') || null
  const pagamento = sp.get('pagamento') || null
  const repasse = sp.get('repasse') || null
  const busca = sp.get('busca') || null
  const partnerId = sp.get('parceiro') || null

  const fromIsoRaw = sp.get('from_iso')
  const toIsoRaw = sp.get('to_iso')
  const fromIso = fromIsoRaw && Number.isFinite(Date.parse(fromIsoRaw)) ? fromIsoRaw : null
  const toIso = toIsoRaw && Number.isFinite(Date.parse(toIsoRaw)) ? toIsoRaw : null

  const baseParams = {
    p_application_id: applicationId,
    p_partner_id: partnerId,
    p_plan_id: planId,
    p_date_from: fromIso,
    p_date_to: toIso,
    p_payment_status: pagamento,
    p_payout_status: repasse,
    p_search: busca,
  }

  const PAGE_SIZE = 1000
  let rows: SaleRow[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase.rpc('get_partner_sales', {
      ...baseParams, p_limit: PAGE_SIZE, p_offset: offset, p_sort: 'recent',
    }) as unknown as { data: SaleRow[] | null; error: unknown }
    if (error) {
      const message = typeof error === 'object' && error !== null && 'message' in error ? String((error as { message: unknown }).message) : ''
      const status = message.includes('Sem permissão') ? 403 : 500
      return NextResponse.json({ error: 'Não foi possível gerar o relatório. Tente novamente.' }, { status })
    }
    rows = rows.concat(data ?? [])
    if (!data || data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  const now = new Date()
  const lines: string[] = []
  lines.push(`# Relatório de vendas — gerado em ${formatDateBR(now.toISOString().slice(0, 10))} ${now.toTimeString().slice(0, 5)}`)
  lines.push(`# Filtros: aplicativo=${applicationId ?? 'todos'}; plano=${planId ?? 'todos'}; período=${fromIso ?? 'início'} a ${toIso ?? 'hoje'}; pagamento=${pagamento ?? 'todos'}; repasse=${repasse ?? 'todos'}; busca=${busca ?? '—'}`)
  lines.push(`# Total de vendas: ${rows.length}`)
  lines.push('')
  lines.push(['Referência', 'Aplicativo', 'Plano', 'Data', 'Moeda', 'Valor pago', 'Comissão', 'Participação', 'Reembolsado', 'Status pagamento', 'Status repasse'].map(csvSafe).join(','))
  for (const r of rows) {
    lines.push([
      r.sale_id,
      r.application_name,
      r.plan_name,
      formatDateBR(r.paid_at?.slice(0, 10)),
      'BRL',
      formatCurrencyBRL(r.amount),
      formatCurrencyBRL(r.commission_amount),
      formatCurrencyBRL(r.partner_amount),
      formatCurrencyBRL(r.refunded_amount),
      PAYMENT_STATUS_LABEL[r.payment_status] ?? r.payment_status,
      PAYOUT_STATUS_LABEL[r.payout_status] ?? r.payout_status,
    ].map(csvSafe).join(','))
  }

  const csv = lines.join('\r\n')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="vendas-${now.toISOString().slice(0, 10)}.csv"`,
    },
  })
}
