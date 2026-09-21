import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Create new draft
  const { data, error } = await supabase
    .from('app_drafts')
    .insert({
      created_by: user.id,
      stage: 1,
      status: 'draft',
    })
    .select('id')
    .single()

  if (error) {
    console.error('[drafts POST]', error)
    return NextResponse.json({ error: 'Failed to create draft' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id })
}
