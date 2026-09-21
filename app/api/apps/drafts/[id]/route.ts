import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function PATCH(
  req: NextRequest,
  { params: { id } }: { params: { id: string } }
) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const updates = await req.json()

  const { data, error } = await supabase
    .from('app_drafts')
    .update({
      ...updates,
      last_edited_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('created_by', user.id)
    .select()
    .single()

  if (error) {
    console.error('[drafts PATCH]', error)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  return NextResponse.json(data)
}
