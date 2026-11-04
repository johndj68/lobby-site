import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireLeaderApi, ApiAuthError } from '@/lib/services/admin-auth'
import { mapSettlementRow, mapAuditEventRow } from '@/lib/services/accounts'

/** Mesma rota de payable/[id]/history, kind='receivable'. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  try {
    await requireLeaderApi(supabase)
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }

  const [{ data: settlements, error: e1 }, { data: events, error: e2 }] = await Promise.all([
    supabase.from('account_settlements').select('*').eq('account_kind', 'receivable').eq('account_id', id).order('created_at', { ascending: false }),
    supabase.from('account_audit_events').select('*').eq('account_kind', 'receivable').eq('account_id', id).order('created_at', { ascending: false }),
  ])
  if (e1 || e2) return NextResponse.json({ error: 'Não foi possível carregar o histórico.' }, { status: 500 })

  return NextResponse.json({ settlements: (settlements ?? []).map(mapSettlementRow), events: (events ?? []).map(mapAuditEventRow) })
}
