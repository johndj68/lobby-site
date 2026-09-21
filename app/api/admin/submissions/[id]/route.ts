import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function PATCH(
  req: NextRequest,
  { params: { id } }: { params: { id: string } }
) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check admin role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { status, reviewer_notes, public_feedback } = await req.json()

  const { data, error } = await supabase
    .from('app_submissions')
    .update({
      status,
      reviewer_id: user.id,
      reviewer_notes,
      public_feedback,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[submissions PATCH]', error)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  // Update draft status based on submission status
  if (data.app_draft_id) {
    const draftStatus = status === 'pending' ? 'under_review' : status
    await supabase
      .from('app_drafts')
      .update({ status: draftStatus })
      .eq('id', data.app_draft_id)
  }

  return NextResponse.json(data)
}
