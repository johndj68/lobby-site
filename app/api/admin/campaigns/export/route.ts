import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { fetchCampaignRows } from '@/lib/services/campaigns'
import { csvSafe } from '@/lib/services/offers'
import { formatDateTimeBR } from '@/lib/marketplace'

const HEADERS = ['ID da campanha', 'Aplicativo', 'Nome interno', 'Parceiro', 'Espaço', 'Pacote', 'Início', 'Término', 'Revisão', 'Pagamento', 'Disponibilidade', 'Atualizado']

/** Exporta campanhas em CSV — leader-only, protegido contra injeção de
 *  fórmula, nunca inclui dado de pagamento sensível além do status. */
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role, is_leader').eq('id', user.id).single()
  if (profile?.role !== 'technician' || profile.is_leader !== true) {
    return NextResponse.json({ error: 'Exportação restrita a técnicos líderes.' }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const { rows: allRows } = await fetchCampaignRows(supabase)
  let rows = allRows

  const q = (sp.get('q') ?? '').trim().toLowerCase()
  if (q) rows = rows.filter(r => r.appName.toLowerCase().includes(q) || (r.internalName ?? '').toLowerCase().includes(q) || r.partnerName.toLowerCase().includes(q) || r.id.toLowerCase().includes(q))
  const disponibilidade = sp.get('disponibilidade')
  if (disponibilidade && disponibilidade !== 'todas') rows = rows.filter(r => r.eligibility.key === disponibilidade)

  const lines = [HEADERS.map(csvSafe).join(',')]
  for (const r of rows) {
    lines.push([
      csvSafe(r.id), csvSafe(r.appName), csvSafe(r.internalName ?? ''), csvSafe(r.partnerName),
      csvSafe(r.spaceName ?? ''), csvSafe(r.packageName ?? ''), csvSafe(formatDateTimeBR(r.startsAt)), csvSafe(formatDateTimeBR(r.endsAt)),
      csvSafe(r.review.label), csvSafe(r.payment.label), csvSafe(r.eligibility.label), csvSafe(formatDateTimeBR(r.updatedAt)),
    ].join(','))
  }

  return new NextResponse(lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="destaques-lobby-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
