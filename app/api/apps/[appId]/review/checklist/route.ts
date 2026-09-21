import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { calculateReview } from '@/lib/validations/app-review'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const { appId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Load draft
    const { data: draft } = await supabase
      .from('app_drafts')
      .select('*')
      .eq('id', appId)
      .eq('created_by', user.id)
      .single()

    if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Load plans
    const { data: plans } = await supabase
      .from('app_plans')
      .select('*')
      .eq('app_draft_id', appId)

    // Load activation config
    const { data: config } = await supabase
      .from('app_activation_config')
      .select('*')
      .eq('app_draft_id', appId)
      .single()

    // Load team
    const { data: members } = await supabase
      .from('app_team_members')
      .select('*')
      .eq('app_draft_id', appId)

    const { data: invitations } = await supabase
      .from('app_team_invitations')
      .select('*')
      .eq('app_draft_id', appId)
      .eq('status', 'pending')

    // Calculate review
    const review = calculateReview(draft, plans || [], config, members || [], invitations || [])

    return NextResponse.json(review)
  } catch (err) {
    console.error('[review checklist]', err)
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 })
  }
}
