import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { app_draft_id, name, currency, price, billing_period, features, activation_method } = await req.json()

  // Verify ownership
  const { data: draft } = await supabase
    .from('app_drafts')
    .select('id')
    .eq('id', app_draft_id)
    .eq('created_by', user.id)
    .single()

  if (!draft) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabase
    .from('app_plans')
    .insert({
      app_draft_id,
      name,
      currency,
      price,
      billing_period,
      features,
      activation_method,
      display_order: 0,
    })
    .select()
    .single()

  if (error) {
    console.error('[plans POST]', error)
    return NextResponse.json({ error: 'Create failed' }, { status: 500 })
  }

  return NextResponse.json(data)
}
