import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { csvSafe } from '@/lib/services/offers'
import { resolvePeriodoRange, PERIODO_LABEL, type PeriodoPreset } from '@/lib/services/financeiro-periodo'
import { formatCurrencyBRL, formatDateBR } from '@/lib/finance'

/**
 * Export da Visão geral — mesmo padrão csvSafe + Content-Disposition já
 * usado nos exports admin (ex: app/api/admin/offers/export/route.ts).
 * Reaproveita as mesmas RPCs que alimentam a tela — nenhum cálculo
 * exclusivo do arquivo.
 *
 * Permissão: delegada inteiramente às RPCs (security definer, checam
 * financeiro_visao_geral/role='owner' internamente e lançam exceção
 * em caso de acesso negado). Esta rota não reimplementa esse check —
 * apenas propaga o erro da RPC como resposta de erro limpa.
 */
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('full_name, email').eq('id', user.id).maybeSingle()

  const sp = req.nextUrl.searchParams
  const preset = (sp.get('preset') as PeriodoPreset) || 'este_mes'
  const customFrom = sp.get('from')
  const customTo = sp.get('to')
  const applicationId = sp.get('application_id') || null
  const partnerId = sp.get('parceiro') || null
  const range = resolvePeriodoRange(preset, customFrom, customTo)

  const [resumoRes, overviewRes, vendasRes, appsRes] = await Promise.all([
    supabase.rpc('get_partner_financeiro_periodo_resumo', { p_from: range.from, p_to: range.to, p_application_id: applicationId, p_partner_id: partnerId }),
    supabase.rpc('get_partner_financeiro_overview', { p_partner_id: partnerId }),
    supabase.rpc('get_partner_financeiro_periodo_vendas', { p_from: range.from, p_to: range.to, p_application_id: applicationId, p_limit: 1000, p_offset: 0, p_partner_id: partnerId }),
    applicationId ? supabase.rpc('get_partner_sold_apps', { p_partner_id: partnerId }) : Promise.resolve({ data: null, error: null }),
  ]) as unknown as [
    { data: { vendas_confirmadas_valor: number; vendas_confirmadas_qtd: number; comissao_valor: number; reembolsos_valor: number; reembolsos_qtd: number; participacao_valor: number }[] | null; error: unknown },
    { data: { retido_amount: number; elegivel_amount: number; repassado_amount: number; reserva_retida_amount: number }[] | null; error: unknown },
    { data: { sale_id: string; sale_kind: string; application_name: string; plan_name: string; amount: number; partner_amount: number; paid_at: string; payout_status: string }[] | null; error: unknown },
    { data: { application_id: string; application_name: string }[] | null; error: unknown },
  ]

  if (resumoRes.error || overviewRes.error || vendasRes.error) {
    return NextResponse.json({ error: 'Não foi possível gerar o relatório. Tente novamente.' }, { status: 500 })
  }

  const resumo = resumoRes.data?.[0]
  const overview = overviewRes.data?.[0]
  const vendas = vendasRes.data ?? []
  const appName = applicationId ? appsRes.data?.find(a => a.application_id === applicationId)?.application_name ?? applicationId : 'Todos'
  const now = new Date()

  const lines: string[] = []
  lines.push('# Relatório Vendas e financeiro — LOBBY')
  lines.push(`# Parceiro: ${csvSafe(profile?.full_name || profile?.email || user.id)}`)
  lines.push(`# Período: ${formatDateBR(range.from.slice(0, 10))} a ${formatDateBR(new Date(new Date(range.to).getTime() - 86400_000).toISOString().slice(0, 10))} (${PERIODO_LABEL[preset]})`)
  lines.push(`# Aplicativo: ${csvSafe(appName)}`)
  lines.push(`# Gerado em: ${formatDateBR(now.toISOString().slice(0, 10))} ${now.toTimeString().slice(0, 5)}`)
  lines.push('# Saldos atuais referem-se à data de geração, não ao período acima.')
  lines.push('')
  lines.push('RESULTADOS DO PERÍODO')
  lines.push(['Indicador', 'Valor'].map(csvSafe).join(','))
  lines.push(['Vendas confirmadas', `${formatCurrencyBRL(resumo?.vendas_confirmadas_valor ?? 0)} (${resumo?.vendas_confirmadas_qtd ?? 0} vendas)`].map(csvSafe).join(','))
  lines.push(['Comissão da plataforma', formatCurrencyBRL(resumo?.comissao_valor ?? 0)].map(csvSafe).join(','))
  lines.push(['Reembolsos', `${formatCurrencyBRL(resumo?.reembolsos_valor ?? 0)} (${resumo?.reembolsos_qtd ?? 0})`].map(csvSafe).join(','))
  lines.push(['Sua participação', formatCurrencyBRL(resumo?.participacao_valor ?? 0)].map(csvSafe).join(','))
  lines.push('')
  lines.push(`SALDOS ATUAIS (em ${formatDateBR(now.toISOString().slice(0, 10))})`)
  lines.push(['Indicador', 'Valor'].map(csvSafe).join(','))
  lines.push(['Disponível para repasse', formatCurrencyBRL(overview?.elegivel_amount ?? 0)].map(csvSafe).join(','))
  lines.push(['Em retenção', formatCurrencyBRL(overview?.retido_amount ?? 0)].map(csvSafe).join(','))
  lines.push(['Reserva de segurança', formatCurrencyBRL(overview?.reserva_retida_amount ?? 0)].map(csvSafe).join(','))
  lines.push('')
  lines.push('VENDAS DO PERÍODO')
  lines.push(['App', 'Plano', 'Data', 'Valor pago', 'Sua participação', 'Status'].map(csvSafe).join(','))
  for (const v of vendas) {
    lines.push([
      v.application_name, v.plan_name, formatDateBR(v.paid_at.slice(0, 10)),
      formatCurrencyBRL(v.amount), formatCurrencyBRL(v.partner_amount), v.payout_status,
    ].map(csvSafe).join(','))
  }

  const csv = lines.join('\r\n')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="vendas-financeiro-${now.toISOString().slice(0, 10)}.csv"`,
    },
  })
}
