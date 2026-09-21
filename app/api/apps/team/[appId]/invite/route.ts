import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { sendEmail } from '@/lib/notifications'
import crypto from 'crypto'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const { appId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify app ownership
  const { data: draft } = await supabase
    .from('app_drafts')
    .select('id, name')
    .eq('id', appId)
    .eq('created_by', user.id)
    .single()

  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { invited_email, invited_name, permissions, scope } = await req.json()

  // Validate
  if (!invited_email || !invited_name || !permissions || !Array.isArray(permissions)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(invited_email)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }

  if (invited_email.toLowerCase() === user.email?.toLowerCase()) {
    return NextResponse.json({ error: 'Cannot invite yourself' }, { status: 400 })
  }

  // Check if already invited or member
  const { data: existing } = await supabase
    .from('app_team_invitations')
    .select('id, status')
    .eq('app_draft_id', appId)
    .eq('invited_email', invited_email.toLowerCase())
    .order('created_at', { ascending: false })
    .limit(1)

  if (existing && existing[0] && ['pending', 'accepted'].includes(existing[0].status)) {
    return NextResponse.json({ error: 'Already invited or member' }, { status: 400 })
  }

  const { data: member } = await supabase
    .from('app_team_members')
    .select('id')
    .eq('app_draft_id', appId)
    .eq('user_id', (await supabase.auth.admin.listUsers()).data?.users.find(u => u.email?.toLowerCase() === invited_email.toLowerCase())?.id || 'invalid')
    .single()

  if (member) {
    return NextResponse.json({ error: 'Already a member' }, { status: 400 })
  }

  try {
    // Generate token
    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

    // Create invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('app_team_invitations')
      .insert({
        app_draft_id: appId,
        invited_by: user.id,
        invited_email: invited_email.toLowerCase(),
        invited_name,
        permissions: permissions,
        scope: scope || 'app',
        token,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        status: 'pending',
      })
      .select()
      .single()

    if (inviteError) {
      console.error('[team invite]', inviteError)
      return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 })
    }

    // Send email
    const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/meus-app/novo/${appId}/equipe/aceitar?token=${token}`
    const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>Convite para colaborar</h2>
  <p>Olá ${escapeHtml(invited_name)},</p>
  <p>${escapeHtml(user.user_metadata?.full_name || user.email)} convidou você para colaborar no aplicativo <strong>${escapeHtml(draft.name)}</strong> na LOBBY.</p>

  <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <p><strong>Escopo:</strong> ${scope === 'app' ? 'Somente este aplicativo' : 'Toda a organização'}</p>
    <p><strong>Permissões:</strong> ${permissions.join(', ')}</p>
    <p style="margin-top: 20px;"><a href="${acceptUrl}" style="background: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Aceitar convite</a></p>
  </div>

  <p style="color: #666; font-size: 12px;">
    Este convite expira em 7 dias. Se não conseguir acessar, copie este link:<br/>
    ${acceptUrl}
  </p>
</div>
    `.trim()

    await sendEmail(invited_email, `Convite para colaborar no ${draft.name}`, html)

    return NextResponse.json({
      invitation: {
        id: invitation.id,
        email: invitation.invited_email,
        status: invitation.status,
        permissions: invitation.permissions,
      },
    })
  } catch (err) {
    console.error('[team invite]', err)
    return NextResponse.json({ error: 'Failed to send invitation' }, { status: 500 })
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}
