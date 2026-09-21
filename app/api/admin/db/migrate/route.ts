import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// Admin only - executes SQL migrations
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check admin role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin' && profile?.role !== 'technician') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { sql } = await req.json()

  if (!sql) {
    return NextResponse.json({ error: 'Missing SQL' }, { status: 400 })
  }

  try {
    // Execute raw SQL via Supabase admin API
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
      }
    )

    if (!response.ok) {
      const err = await response.text()
      return NextResponse.json({ error: err }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[migrate]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
