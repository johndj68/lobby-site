import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { sendEmail } from '@/lib/notifications'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin' && profile?.role !== 'technician') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { action, public_feedback, internal_notes } = await req.json()

  const validActions = ['approve', 'reject', 'request_changes']
  if (!validActions.includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  try {
    // Get submission & app
    const { data: submission } = await supabase
      .from('app_submissions')
      .select('*, app_drafts(created_by, name)')
      .eq('id', id)
      .single()

    if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Determine new status
    let newStatus: string
    if (action === 'approve') newStatus = 'approved'
    else if (action === 'reject') newStatus = 'rejected'
    else if (action === 'request_changes') newStatus = 'changes_requested'
    else return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

    // Update submission
    const { data: updated, error: updateErr } = await supabase
      .from('app_submissions')
      .update({
        status: newStatus,
        reviewer_id: user.id,
        reviewed_at: new Date().toISOString(),
        public_feedback,
        internal_notes,
      })
      .eq('id', id)
      .select()
      .single()

    if (updateErr) {
      console.error('[review]', updateErr)
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
    }

    // If approved, update app status
    if (action === 'approve') {
      await supabase
        .from('app_drafts')
        .update({
          status: 'approved',
        })
        .eq('id', submission.app_draft_id)
    }

    // Send notification email
    const { data: dev } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', submission.app_drafts.created_by)
      .single()

    if (dev?.email) {
      const actionText = {
        approve: 'aprovado',
        reject: 'rejeitado',
        request_changes: 'requer ajustes',
      }[action]

      const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px;">
  <h2>Seu aplicativo foi ${actionText}</h2>
  <p>Olá ${dev.full_name},</p>
  <p>Sua submissão do aplicativo <strong>${submission.app_drafts.name}</strong> foi ${actionText}.</p>

  ${public_feedback ? `<div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
    <p><strong>Feedback:</strong></p>
    <p>${public_feedback}</p>
  </div>` : ''}

  <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/meus-app" style="background: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Ver no painel</a></p>
</div>
      `.trim()

      await sendEmail(dev.email, `Seu aplicativo foi ${actionText} - LOBBY`, html)
    }

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[review update]', err)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
