import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string; memberId: string }> }
) {
  const { appId, memberId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify app ownership
  const { data: draft } = await supabase
    .from('app_drafts')
    .select('id, created_by')
    .eq('id', appId)
    .single()

  if (!draft || draft.created_by !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { permissions } = await req.json()

  if (!Array.isArray(permissions)) {
    return NextResponse.json({ error: 'Invalid permissions' }, { status: 400 })
  }

  try {
    // Get member to check role
    const { data: member } = await supabase
      .from('app_team_members')
      .select('*')
      .eq('id', memberId)
      .eq('app_draft_id', appId)
      .single()

    if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Can't change owner role
    if (member.role === 'owner') {
      return NextResponse.json({ error: 'Cannot modify owner' }, { status: 400 })
    }

    const { data: updated, error: updateError } = await supabase
      .from('app_team_members')
      .update({
        permissions,
        updated_at: new Date().toISOString(),
      })
      .eq('id', memberId)
      .select()
      .single()

    if (updateError) {
      console.error('[update member]', updateError)
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
    }

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[update member]', err)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string; memberId: string }> }
) {
  const { appId, memberId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify app ownership
  const { data: draft } = await supabase
    .from('app_drafts')
    .select('id, created_by')
    .eq('id', appId)
    .single()

  if (!draft || draft.created_by !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    // Get member
    const { data: member } = await supabase
      .from('app_team_members')
      .select('*')
      .eq('id', memberId)
      .eq('app_draft_id', appId)
      .single()

    if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Can't remove owner
    if (member.role === 'owner') {
      return NextResponse.json({ error: 'Cannot remove owner' }, { status: 400 })
    }

    const { error: deleteError } = await supabase
      .from('app_team_members')
      .delete()
      .eq('id', memberId)

    if (deleteError) {
      console.error('[remove member]', deleteError)
      return NextResponse.json({ error: 'Failed to remove' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[remove member]', err)
    return NextResponse.json({ error: 'Failed to remove' }, { status: 500 })
  }
}
