import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import crypto from 'crypto'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!user.email) {
    return NextResponse.json({ error: 'Email not confirmed' }, { status: 400 })
  }

  try {
    // Hash token
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

    // Find invitation
    const { data: invitation } = await supabase
      .from('app_team_invitations')
      .select('*')
      .eq('token_hash', tokenHash)
      .single()

    if (!invitation) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
    }

    // Validate status
    if (invitation.status !== 'pending') {
      return NextResponse.json(
        { error: `Invitation already ${invitation.status}` },
        { status: 400 }
      )
    }

    // Validate expiry
    if (new Date(invitation.expires_at) < new Date()) {
      await supabase
        .from('app_team_invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id)

      return NextResponse.json({ error: 'Invitation expired' }, { status: 410 })
    }

    // Validate email match
    if (user.email.toLowerCase() !== invitation.invited_email.toLowerCase()) {
      return NextResponse.json(
        { error: 'Email mismatch - logged in with different account' },
        { status: 403 }
      )
    }

    // Check not already member
    const { data: existing } = await supabase
      .from('app_team_members')
      .select('id')
      .eq('app_draft_id', invitation.app_draft_id)
      .eq('user_id', user.id)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Already a member' }, { status: 400 })
    }

    // Create member + mark invitation as accepted (transactional)
    const now = new Date().toISOString()

    const { data: member, error: memberError } = await supabase
      .from('app_team_members')
      .insert({
        app_draft_id: invitation.app_draft_id,
        user_id: user.id,
        permissions: invitation.permissions,
        scope: invitation.scope,
        role: 'member',
        joined_at: now,
      })
      .select()
      .single()

    if (memberError) {
      console.error('[accept invite]', memberError)
      return NextResponse.json({ error: 'Failed to accept' }, { status: 500 })
    }

    // Mark invitation accepted
    await supabase
      .from('app_team_invitations')
      .update({
        status: 'accepted',
        accepted_by: user.id,
        accepted_at: now,
      })
      .eq('id', invitation.id)

    return NextResponse.json({
      member,
      appId: invitation.app_draft_id,
    })
  } catch (err) {
    console.error('[accept invite]', err)
    return NextResponse.json({ error: 'Failed to accept invitation' }, { status: 500 })
  }
}
