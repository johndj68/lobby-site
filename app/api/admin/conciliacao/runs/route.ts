import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { requireLeaderApi, ApiAuthError } from '@/lib/services/admin-auth'
import { mapRunRow } from '@/lib/services/reconciliation'

const PAGE_SIZE = 20

/** Histórico de execuções de conciliação, mais recente primeiro. */
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  try {
    await requireLeaderApi(supabase)
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }

  const page = Math.max(0, Number(req.nextUrl.searchParams.get('page') ?? '0') || 0)
  const admin = createAdminClient()

  const { data, error, count } = await admin
    .from('reconciliation_runs')
    .select('*', { count: 'exact' })
    .order('started_at', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ runs: (data ?? []).map(mapRunRow), total: count ?? 0, page, pageSize: PAGE_SIZE })
}
