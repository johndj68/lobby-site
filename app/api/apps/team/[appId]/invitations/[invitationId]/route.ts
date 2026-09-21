import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { sendEmail } from '@/lib/notifications'
import crypto from 'crypto'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string; invitationId: string }> }
) {
  const { appId, invitationId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership
  const { data: draft } = await supabase
    .from('app_drafts')
    .select('id, name')
    .eq('id', appId)
    .eq('created_by', user.id)
    .single()

  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { action } = await req.json()

  if (action === 'resend') {
    try {
      // Get invitation
      const { data: invitation } = await supabase
        .from('app_team_invitations')
        .select('*')
        .eq('id', invitationId)
        .eq('app_draft_id', appId)
        .single()

      if (!invitation || invitation.status !== 'pending') {
        return NextResponse.json({ error: 'Invalid invitation' }, { status: 404 })
      }

      // Check if already sent recently (rate limit: 1 per 5 mins)
      const lastSent = invitation.sent_at ? new Date(invitation.sent_at) : null
      if (lastSent && Date.now() - lastSent.getTime() < 5 * 60 * 1000) {
        return NextResponse.json(
          { error: 'Please wait before resending' },
          { status: 429 }
        )
      }

      // Generate new token
      const newToken = crypto.randomBytes(32).toString('hex')
      const newTokenHash = crypto.createHash('sha256').update(newToken).digest('hex')

      // Update invitation
      const { data: updated } = await supabase
        .from('app_team_invitations')
        .update({
          token: newToken,
          token_hash: newTokenHash,
          sent_at: new Date().toISOString(),
        })
        .eq('id', invitationId)
        .select()
        .single()

      if (!updated) {
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
      }

      // Send email
      const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/meus-app/novo/${appId}/equipe/aceitar?token=${newToken}`
      const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>Convite para colaborar (Reenvio)</h2>
  <p>Olá ${escapeHtml(invitation.invited_name)},</p>
  <p>Reenviando seu convite para colaborar no <strong>${escapeHtml(draft.name)}</strong>.</p>
  <p style="margin-top: 20px;"><a href="${acceptUrl}" style="background: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Aceitar convite</a></p>
</div>
      `.trim()

      await sendEmail(invitation.invited_email, `Reenvio: Convite para colaborar no ${draft.name}`, html)

      return NextResponse.json({ invitation: updated })
    } catch (err) {
      console.error('[resend invite]', err)
      return NextResponse.json({ error: 'Failed to resend' }, { status: 500 })
    }
  } else if (action === 'cancel') {
    try {
      const { data: updated } = await supabase
        .from('app_team_invitations')
        .update({ status: 'cancelled' })
        .eq('id', invitationId)
        .eq('app_draft_id', appId)
        .select()
        .single()

      if (!updated) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }

      return NextResponse.json({ invitation: updated })
    } catch (err) {
      console.error('[cancel invite]', err)
      return NextResponse.json({ error: 'Failed to cancel' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}
