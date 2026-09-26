import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { sendEmail } from '@/lib/notifications'
import { SUBMISSION_STATUS_LABELS } from '@/lib/marketplace'

const DECIDABLE_STATUSES = ['pending', 'in_review']

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

  const validActions = ['approve', 'reject', 'request_changes', 'save_analysis']
  if (!validActions.includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  try {
    const { data: submission } = await supabase
      .from('app_submissions')
      .select('*, app_drafts(created_by, name)')
      .eq('id', id)
      .single()

    if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    /* "Salvar análise" — só grava o rascunho de trabalho (mensagem/nota
     * ainda não enviadas). Nunca muda status, nunca dispara e-mail. Só faz
     * sentido enquanto a submissão ainda pode ser decidida — depois disso
     * public_feedback/internal_notes já são a decisão registrada, e editar
     * o rascunho não teria mais efeito nenhum (reabrir não é suportado). */
    if (action === 'save_analysis') {
      if (!DECIDABLE_STATUSES.includes(submission.status)) {
        return NextResponse.json({
          error: 'Esta solicitação já foi decidida — não há mais o que salvar.',
          status: submission.status,
        }, { status: 409 })
      }
      const { data: saved, error: saveErr } = await supabase
        .from('app_submissions')
        .update({ draft_message: public_feedback ?? null, draft_internal_notes: internal_notes ?? null })
        .eq('id', id)
        .select()
        .single()
      if (saveErr) {
        console.error('[review save_analysis]', saveErr)
        return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
      }
      return NextResponse.json(saved)
    }

    // Decisão (approve/reject/request_changes) — só é permitida enquanto a
    // submissão está pending/in_review. Uma vez decidida, o registro fica
    // congelado: sem essa checagem, reabrir a aba e clicar de novo
    // sobrescreveria (ou duplicaria e-mail de) uma decisão já tomada por
    // outro admin.
    if (!DECIDABLE_STATUSES.includes(submission.status)) {
      return NextResponse.json({
        error: `Esta solicitação já foi decidida (${SUBMISSION_STATUS_LABELS[submission.status] ?? submission.status}). Recarregue a página.`,
        status: submission.status,
      }, { status: 409 })
    }

    let newStatus: string
    if (action === 'approve') newStatus = 'approved'
    else if (action === 'reject') newStatus = 'rejected'
    else newStatus = 'changes_requested'

    // Aprovação exige checklist sem bloqueios pendentes — revalidado aqui
    // porque o botão desabilitado no cliente é só UX, não garantia; alguém
    // pode registrar uma pendência bloqueante entre o carregamento da
    // página e o clique em Aprovar.
    if (action === 'approve') {
      const { count: blockerCount } = await supabase
        .from('review_issues')
        .select('id', { count: 'exact', head: true })
        .eq('submission_id', id)
        .eq('severity', 'blocker')
        .is('resolved_at', null)
      if ((blockerCount ?? 0) > 0) {
        return NextResponse.json({ error: 'Há pendências bloqueantes no checklist — resolva-as antes de aprovar.' }, { status: 400 })
      }
    }

    // Update condicionado ao status ainda ser decidível: fecha a corrida
    // entre dois admins decidindo a mesma submissão quase ao mesmo tempo —
    // o segundo PATCH não encontra linha pra atualizar (0 rows) em vez de
    // sobrescrever silenciosamente a decisão do primeiro.
    const { data: updatedRows, error: updateErr } = await supabase
      .from('app_submissions')
      .update({
        status: newStatus,
        reviewer_id: user.id,
        reviewed_at: new Date().toISOString(),
        public_feedback,
        internal_notes,
        draft_message: null,
        draft_internal_notes: null,
      })
      .eq('id', id)
      .in('status', DECIDABLE_STATUSES)
      .select()

    if (updateErr) {
      console.error('[review]', updateErr)
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
    }

    if (!updatedRows || updatedRows.length === 0) {
      const { data: fresh } = await supabase.from('app_submissions').select('status').eq('id', id).single()
      return NextResponse.json({
        error: `Outro administrador já decidiu esta solicitação (${SUBMISSION_STATUS_LABELS[fresh?.status ?? ''] ?? fresh?.status}). Recarregue a página.`,
        status: fresh?.status,
      }, { status: 409 })
    }
    const updated = updatedRows[0]

    // Sincroniza app_drafts.status com a decisão — sem isso, reject/
    // request_changes deixavam o draft travado em 'submitted' (setado pela
    // rota de envio), que não está em SUBMITTABLE_STATUSES: o parceiro nunca
    // mais conseguia reenviar depois de uma decisão dessas. app_drafts não
    // tem um status "rejected" próprio (não existe no CHECK constraint), e
    // rejeitar aqui nunca foi um veto definitivo em lugar nenhum do projeto
    // (sem fluxo de "reabrir cadastro" separado) — 'changes_requested' é o
    // único estado que realmente reabre o reenvio pra ambos os casos.
    const draftStatus = action === 'approve' ? 'approved' : 'changes_requested'
    await supabase
      .from('app_drafts')
      .update({ status: draftStatus })
      .eq('id', submission.app_draft_id)

    // Send notification email
    const { data: dev } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', submission.app_drafts.created_by)
      .single()

    if (dev?.email) {
      const actionTexts = {
        approve: 'aprovado',
        reject: 'rejeitado',
        request_changes: 'requer ajustes',
      }
      const actionText = actionTexts[action as keyof typeof actionTexts]

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
