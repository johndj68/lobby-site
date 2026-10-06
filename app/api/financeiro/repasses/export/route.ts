import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { csvSafe } from '@/lib/services/offers'
import { formatCurrencyBRL, formatDateBR } from '@/lib/finance'

/**
 * Export do extrato de movimentações — mesmo padrão csvSafe +
 * Content-Disposition + paginação em blocos já usado em
 * app/api/financeiro/vendas/export/route.ts. Respeita os mesmos filtros
 * da tela (aplicativo, tipo, período) via get_partner_statement — nenhum
 * cálculo próprio, nenhuma segunda fonte de verdade. Permissão delegada
 * inteiramente à RPC (security definer).
 *
 * Saldo inicial/final: só informado quando NENHUM filtro de aplicativo/tipo
 * está ativo — com esses filtros, mostrar "saldo após" linha a linha
 * produziria a impressão de um saldo próprio daquele recorte, que o pedido
 * original proíbe explicitamente. Com filtro só de período, o "saldo final"
 * ainda é o saldo disponível REAL (a janela de cálculo da RPC é sempre o
 * histórico completo, o filtro de data só limita quais linhas aparecem) —
 * mas "saldo inicial" não é incluído por não termos a linha anterior ao
 * recorte nesta chamada.
 */

const TIPO_LABEL: Record<string, string> = {
  venda_confirmada: 'Venda confirmada',
  reserva_constituida: 'Constituição de reserva',
  liberacao_retencao: 'Liberação de retenção',
  reembolso: 'Reembolso',
  reserva_perdida_disputa: 'Reserva perdida em disputa',
  repasse_concluido: 'Repasse concluído',
  repasse_revertido: 'Repasse revertido/devolução',
}

interface StatementRow {
  event_at: string; tipo: string; descricao: string
  application_name: string | null; referencia: string
  valor: number; saldo_disponivel_delta: number; saldo_disponivel_apos: number; situacao: string
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const applicationId = sp.get('application_id') || null
  const tipo = sp.get('tipo') || null
  const partnerId = sp.get('parceiro') || null

  const fromIsoRaw = sp.get('from_iso')
  const toIsoRaw = sp.get('to_iso')
  const fromIso = fromIsoRaw && Number.isFinite(Date.parse(fromIsoRaw)) ? fromIsoRaw : null
  const toIso = toIsoRaw && Number.isFinite(Date.parse(toIsoRaw)) ? toIsoRaw : null

  const baseParams = {
    p_partner_id: partnerId,
    p_application_id: applicationId,
    p_tipo: tipo,
    p_date_from: fromIso,
    p_date_to: toIso,
  }

  const PAGE_SIZE = 1000
  let rows: StatementRow[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase.rpc('get_partner_statement', {
      ...baseParams, p_limit: PAGE_SIZE, p_offset: offset,
    }) as unknown as { data: StatementRow[] | null; error: unknown }
    if (error) {
      const message = typeof error === 'object' && error !== null && 'message' in error ? String((error as { message: unknown }).message) : ''
      const status = message.includes('Sem permissão') ? 403 : 500
      return NextResponse.json({ error: 'Não foi possível gerar o extrato. Tente novamente.' }, { status })
    }
    rows = rows.concat(data ?? [])
    if (!data || data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  // RPC devolve do mais recente pro mais antigo (mesma ordem da tela) —
  // extrato exportado faz mais sentido cronológico (mais antigo primeiro).
  rows.reverse()

  const now = new Date()
  const hasScopeFilter = !!(applicationId || tipo)
  const lines: string[] = []
  lines.push(`# Extrato de movimentações — gerado em ${formatDateBR(now.toISOString().slice(0, 10))} ${now.toTimeString().slice(0, 5)} (horário local do servidor)`)
  lines.push(`# Filtros: aplicativo=${applicationId ?? 'todos'}; tipo=${tipo ? (TIPO_LABEL[tipo] ?? tipo) : 'todos'}; período=${fromIso ?? 'início'} a ${toIso ?? 'hoje'}`)
  lines.push(`# Moeda: BRL`)
  lines.push(`# Total de eventos: ${rows.length}`)
  if (hasScopeFilter) {
    lines.push(`# Extrato filtrado por aplicativo/tipo — saldo inicial e final não mostrados (um saldo "deste recorte" não existe na conta real).`)
  } else {
    lines.push(`# Saldo disponível ao final do período: ${rows.length > 0 ? formatCurrencyBRL(rows[rows.length - 1].saldo_disponivel_apos) : '—'}`)
  }
  lines.push('')
  lines.push(['Data/hora', 'Tipo', 'Descrição', 'Aplicativo', 'Referência', 'Valor', 'Saldo disponível após', 'Situação'].map(csvSafe).join(','))
  for (const r of rows) {
    const d = new Date(r.event_at)
    lines.push([
      `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
      TIPO_LABEL[r.tipo] ?? r.tipo,
      r.descricao,
      r.application_name ?? '—',
      r.referencia,
      formatCurrencyBRL(r.valor),
      r.saldo_disponivel_delta === 0 ? '—' : formatCurrencyBRL(r.saldo_disponivel_apos),
      r.situacao,
    ].map(csvSafe).join(','))
  }

  const csv = lines.join('\r\n')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="extrato-repasses-${now.toISOString().slice(0, 10)}.csv"`,
    },
  })
}
