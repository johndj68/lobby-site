import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const { appId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify app ownership or membership
  const { data: draft } = await supabase
    .from('app_drafts')
    .select('id, created_by')
    .eq('id', appId)
    .single()

  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = draft.created_by === user.id

  const { data: member } = await supabase
    .from('app_team_members')
    .select('id')
    .eq('app_draft_id', appId)
    .eq('user_id', user.id)
    .single()

  if (!isOwner && !member) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    // Get accepted members
    const { data: members } = await supabase
      .from('app_team_members')
      .select(`
        id,
        user_id,
        permissions,
        role,
        scope,
        joined_at
      `)
      .eq('app_draft_id', appId)
      .order('joined_at')

    // Get pending invitations
    const { data: invitations } = await supabase
      .from('app_team_invitations')
      .select(`
        id,
        invited_email,
        invited_name,
        permissions,
        scope,
        status,
        created_at,
        expires_at
      `)
      .eq('app_draft_id', appId)
      .in('status', ['pending', 'expired'])
      .order('created_at', { ascending: false })

    // Get owner profile
    const { data: ownerProfile } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('id', draft.created_by)
      .single()

    return NextResponse.json({
      owner: {
        id: draft.created_by,
        name: ownerProfile?.full_name || 'Proprietário',
        role: 'owner',
        isYou: draft.created_by === user.id,
      },
      members: members || [],
      invitations: invitations || [],
    })
  } catch (err) {
    console.error('[team members]', err)
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 })
  }
}
