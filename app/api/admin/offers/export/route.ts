import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { fetchOfferRows, formatOfferPrice, csvSafe } from '@/lib/services/offers'
import { formatDateTimeBR } from '@/lib/marketplace'

const HEADERS = ['ID da oferta', 'Aplicativo', 'Plano/Oferta', 'Parceiro', 'Origem', 'Moeda', 'Preço regular', 'Promoção', 'Disponibilidade', 'Última atualização (America/Sao_Paulo)']

/**
 * Exporta o catálogo de ofertas em CSV — exige is_leader (única distinção
 * de permissão granular que existe hoje no projeto; ver relatório de
 * entrega sobre a ausência de uma tabela de permissões). Nunca inclui
 * código de ativação nem dado pessoal além do nome do parceiro já visível
 * na própria listagem administrativa.
 */
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role, is_leader').eq('id', user.id).single()
  if (profile?.role !== 'technician' || profile.is_leader !== true) {
    return NextResponse.json({ error: 'Exportação restrita a técnicos líderes.' }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const { rows: allRows } = await fetchOfferRows(supabase)
  let rows = allRows

  const q = (sp.get('q') ?? '').trim().toLowerCase()
  if (q) rows = rows.filter(r => r.appName.toLowerCase().includes(q) || r.planName.toLowerCase().includes(q) || r.partnerName.toLowerCase().includes(q) || r.id.toLowerCase().includes(q))
  const origin = sp.get('origem')
  if (origin === 'lobby' || origin === 'partner') rows = rows.filter(r => r.origin === origin)
  const status = sp.get('status')
  if (status && status !== 'todas') rows = rows.filter(r => r.status === status)
  const disponibilidade = sp.get('disponibilidade')
  if (disponibilidade && disponibilidade !== 'todas') rows = rows.filter(r => r.availability.key === disponibilidade)

  const lines = [HEADERS.map(csvSafe).join(',')]
  for (const r of rows) {
    lines.push([
      csvSafe(r.id),
      csvSafe(r.appName),
      csvSafe(r.planName),
      csvSafe(r.partnerName),
      csvSafe(r.origin === 'lobby' ? 'LOBBY' : 'Parceiro'),
      csvSafe(r.currency),
      csvSafe(formatOfferPrice(r.price, r.currency, r.billingPeriod)),
      csvSafe(r.promotion ? `${r.promotion.status.label} · ${formatOfferPrice(r.promotion.promoPrice, r.currency, r.billingPeriod)}` : 'Nenhuma'),
      csvSafe(r.availability.label),
      csvSafe(formatDateTimeBR(r.updatedAt)),
    ].join(','))
  }

  return new NextResponse(lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ofertas-lobby-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
