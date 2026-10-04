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

const PERIODO_PRESETS = ['este_mes', 'mes_anterior', 'ultimos_30_dias', 'personalizado'] as const

interface VendaRow {
  sale_id: string
  sale_kind: string
  application_name: string
  plan_name: string
  amount: number
  partner_amount: number
  paid_at: string
  payout_status: string
}

interface ViewablePartner {
  partner_id:    string
  partner_label: string
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('full_name, email').eq('id', user.id).maybeSingle()

  const sp = req.nextUrl.searchParams
  const rawPreset = sp.get('preset')
  // Um ?preset= malformado/digitado à mão não deve virar "(undefined)"
  // na label do CSV — o cálculo de datas abaixo já cai em 'este_mes'
  // com segurança, só a label precisava dessa validação (achado #14).
  const preset: PeriodoPreset = (PERIODO_PRESETS as readonly string[]).includes(rawPreset ?? '')
    ? (rawPreset as PeriodoPreset)
    : 'este_mes'
  const customFrom = sp.get('from')
  const customTo = sp.get('to')
  const applicationId = sp.get('application_id') || null
  const partnerId = sp.get('parceiro') || null

  // O client já resolve `range` uma única vez (useMemo) e manda os
  // limites prontos via from_iso/to_iso — resolvePeriodoRange usa
  // construtores Date de horário LOCAL, então recalculá-lo aqui (no
  // timezone do servidor, normalmente UTC) pode produzir um `from`/`to`
  // diferente do que a tela mostrou, por causa do offset. from_iso/
  // to_iso evitam essa divergência; resolvePeriodoRange(preset, ...)
  // só continua existindo como fallback de quem digitar a URL de
  // export à mão sem esses dois params (achado #3).
  const fromIso = sp.get('from_iso')
  const toIso = sp.get('to_iso')
  const range = fromIso && toIso ? { from: fromIso, to: toIso } : resolvePeriodoRange(preset, customFrom, customTo)

  const [resumoRes, overviewRes, appsRes] = await Promise.all([
    supabase.rpc('get_partner_financeiro_periodo_resumo', { p_from: range.from, p_to: range.to, p_application_id: applicationId, p_partner_id: partnerId }),
    supabase.rpc('get_partner_financeiro_overview', { p_partner_id: partnerId }),
    applicationId ? supabase.rpc('get_partner_sold_apps', { p_partner_id: partnerId }) : Promise.resolve({ data: null, error: null }),
  ]) as unknown as [
    { data: { vendas_confirmadas_valor: number; vendas_confirmadas_qtd: number; comissao_valor: number; reembolsos_valor: number; reembolsos_qtd: number; participacao_valor: number }[] | null; error: unknown },
    { data: { retido_amount: number; elegivel_amount: number; repassado_amount: number; reserva_retida_amount: number }[] | null; error: unknown },
    { data: { application_id: string; application_name: string }[] | null; error: unknown },
  ]

  if (resumoRes.error || overviewRes.error) {
    return NextResponse.json({ error: 'Não foi possível gerar o relatório. Tente novamente.' }, { status: 500 })
  }

  // "VENDAS DO PERÍODO" não pode ter paginação/limite (requisito
  // explícito do spec) — pagina a RPC inteira em blocos de 1000 em vez
  // de uma única chamada capada (achado #10).
  const PAGE_SIZE = 1000
  let vendas: VendaRow[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase.rpc('get_partner_financeiro_periodo_vendas', {
      p_from: range.from, p_to: range.to, p_application_id: applicationId,
      p_limit: PAGE_SIZE, p_offset: offset, p_partner_id: partnerId,
    }) as unknown as { data: VendaRow[] | null; error: unknown }
    if (error) return NextResponse.json({ error: 'Não foi possível gerar o relatório. Tente novamente.' }, { status: 500 })
    vendas = vendas.concat(data ?? [])
    if (!data || data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  const resumo = resumoRes.data?.[0]
  const overview = overviewRes.data?.[0]
  const appName = applicationId ? appsRes.data?.find(a => a.application_id === applicationId)?.application_name ?? applicationId : 'Todos'
  const now = new Date()

  // Quando há delegação (?parceiro= presente e diferente do próprio
  // usuário), os números do arquivo são do PARCEIRO, não do viewer —
  // a linha "# Parceiro:" precisa nomear quem os dados pertencem, e uma
  // linha extra registra quem de fato gerou o arquivo (achado #4).
  const isDelegated = !!partnerId && partnerId !== user.id
  let parceiroLabel = csvSafe(profile?.full_name || profile?.email || user.id)
  let geradoPorLine: string | null = null
  if (isDelegated) {
    const { data: viewablePartners } = await supabase.rpc('get_financeiro_viewable_partners') as unknown as { data: ViewablePartner[] | null }
    const partner = viewablePartners?.find(p => p.partner_id === partnerId)
    parceiroLabel = csvSafe(partner?.partner_label ?? partnerId!)
    geradoPorLine = `# Gerado por: ${csvSafe(profile?.full_name || profile?.email || user.id)}`
  }

  const lines: string[] = []
  lines.push('# Relatório Vendas e financeiro — LOBBY')
  lines.push(`# Parceiro: ${parceiroLabel}`)
  if (geradoPorLine) lines.push(geradoPorLine)
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
