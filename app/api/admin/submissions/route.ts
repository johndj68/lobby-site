import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
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

  const status = req.nextUrl.searchParams.get('status') || 'pending'
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '20')
  const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0')

  try {
    // Get submissions with app info
    const { data: submissions, error: queryErr, count } = await supabase
      .from('app_submissions')
      .select(`
        id,
        app_draft_id,
        submitted_by,
        status,
        submitted_at,
        reviewed_at,
        reviewer_id,
        public_feedback,
        app_drafts(name, category, short_description, created_by)
      `, { count: 'exact' })
      .eq('status', status)
      .order('submitted_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (queryErr) {
      console.error('[submissions list]', queryErr)
      return NextResponse.json({ error: 'Failed to load' }, { status: 500 })
    }

    // Get reviewer info for each
    const submissionsWithReviewer = await Promise.all(
      (submissions || []).map(async (sub: any) => {
        let reviewer = null
        if (sub.reviewer_id) {
          const { data: rev } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', sub.reviewer_id)
            .single()
          reviewer = rev
        }
        return { ...sub, reviewer }
      })
    )

    return NextResponse.json({
      submissions: submissionsWithReviewer,
      total: count,
      limit,
      offset,
    })
  } catch (err) {
    console.error('[submissions GET]', err)
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 })
  }
}
