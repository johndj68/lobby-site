import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
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

  // Client admin pra todo o resto: até aceitar, o convidado não é dono nem
  // membro do draft — nenhuma policy de RLS de app_team_invitations/
  // app_team_members cobre "é a pessoa convidada" (achado em e2e, Fase 7
  // audit: a tela de aceite nunca funcionou de ponta a ponta pra um
  // convidado de verdade, sempre voltava vazio). Abrir RLS linha a linha
  // pra isso significaria dar ao convidado UPDATE/INSERT direto nessas
  // tabelas antes do aceite — ele podia alterar o próprio convite (ex.:
  // subir permissions) via REST direto, sem passar por aqui. Toda a
  // autorização real já é feita em código abaixo (e-mail bate, não
  // expirou, status pending, ainda não é membro) — igual o motivo de
  // outras rotas sensíveis deste projeto (webhook Stripe, publish) usarem
  // o client admin em vez de abrir mão fina de RLS pro caso.
  const admin = createAdminClient()

  try {
    // Hash token
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

    // Find invitation
    const { data: invitation } = await admin
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
      await admin
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
    const { data: existing } = await admin
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

    const { data: member, error: memberError } = await admin
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
    await admin
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
