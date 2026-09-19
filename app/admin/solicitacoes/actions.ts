'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getResendClient } from '@/lib/resend'
import { checkRateLimit } from '@/lib/rate-limit'

// Tipo de retorno padronizado para todas as Server Actions deste módulo.
// success: true indica operação concluída; success: false traz a mensagem de erro.
type ActionResult =
  | { success: true }
  | { success: false; error: string }

// Dados necessários para enviar ou salvar uma resposta a uma solicitação de contato
interface ResponseInput {
  contactId: string   // ID do registro na tabela contacts
  subject:   string   // Assunto do e-mail de resposta
  message:   string   // Corpo do e-mail de resposta
  draftId?:  string   // ID do rascunho existente (undefined = criar novo registro)
}

// Guard interno: verifica se o usuário autenticado é um técnico.
// Retorna { ok: false, error } se não autenticado ou sem permissão,
// ou { ok: true, supabase, userId } para uso nas Server Actions.
// Diferente de requireTechnicianSession (lib/services/profile.ts), não redireciona —
// retorna erro estruturado, pois Server Actions não devem redirecionar diretamente.
async function requireTechnician() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'technician') {
    return { ok: false as const, error: 'Acesso restrito a técnicos.' }
  }
  return { ok: true as const, supabase, userId: user.id }
}

// Guard interno: verifica se o usuário é técnico E líder (is_leader=true).
// Usado em ações destrutivas como deleteContact, que exigem permissão de líder.
async function requireLeader() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles').select('role, is_leader').eq('id', user.id).single()
  if (profile?.role !== 'technician' || profile?.is_leader !== true) {
    return { ok: false as const, error: 'Acesso restrito a técnicos líderes.' }
  }
  return { ok: true as const, supabase, userId: user.id }
}

/**
 * Envia um e-mail de resposta ao solicitante via Resend e registra na tabela
 * contact_responses. Se draftId for fornecido, atualiza o rascunho existente
 * em vez de criar um novo registro. Atualiza o status do contato para 'respondido'.
 * Requer autenticação de técnico.
 */
export async function sendContactResponse(input: ResponseInput): Promise<ActionResult> {
  // Valida autenticação antes de qualquer operação
  const auth = await requireTechnician()
  if (!auth.ok) return { success: false, error: auth.error }
  const { supabase, userId } = auth

  // 30 e-mails/hora por técnico — cobre uso normal de suporte, limita abuso
  // de uma sessão comprometida usada para disparar e-mail em massa.
  const rl = checkRateLimit({ key: `send-contact-response:${userId}`, limit: 30, windowMs: 3_600_000 })
  if (!rl.allowed) {
    return { success: false, error: 'Muitos e-mails enviados recentemente. Tente novamente em breve.' }
  }

  // Validação básica — assunto e mensagem são obrigatórios para envio
  const subject = input.subject.trim()
  const message = input.message.trim()
  if (!subject || !message) {
    return { success: false, error: 'Preencha assunto e mensagem.' }
  }

  // Busca o e-mail e nome do solicitante para compor o destinatário
  const { data: contact } = await supabase
    .from('contacts').select('email, name').eq('id', input.contactId).single()
  if (!contact) {
    return { success: false, error: 'Solicitação não encontrada.' }
  }

  // Tenta enviar via Resend — falha aqui retorna erro sem alterar o banco
  try {
    const { resend, from } = getResendClient()
    const { error: sendError } = await resend.emails.send({
      from,
      to:      contact.email,
      subject,
      text:    message,
    })
    if (sendError) {
      console.error('sendContactResponse: falha no envio', sendError)
      return { success: false, error: 'Erro ao enviar e-mail. Tente novamente.' }
    }
  } catch (err) {
    console.error('sendContactResponse: Resend indisponível', err)
    return { success: false, error: 'Envio de e-mail indisponível. Configure o Resend.' }
  }

  // Persiste a resposta no banco — atualiza rascunho existente ou insere novo registro
  const now = new Date().toISOString()
  if (input.draftId) {
    // Rascunho existente: marca como enviado e registra timestamp de envio
    await supabase.from('contact_responses').update({
      subject, message, is_draft: false, sent_at: now, updated_at: now,
    }).eq('id', input.draftId)
  } else {
    // Sem rascunho: cria novo registro de resposta já enviada
    await supabase.from('contact_responses').insert({
      contact_id: input.contactId, technician_id: userId,
      subject, message, is_draft: false, sent_at: now,
    })
  }

  // Atualiza o status do contato para refletir que foi respondido
  await supabase.from('contacts').update({ status: 'respondido' }).eq('id', input.contactId)

  // Invalida o cache da rota para que a lista recarregue com dados atualizados
  revalidatePath('/admin/solicitacoes')
  return { success: true }
}

// Dados necessários para iniciar a análise de uma solicitação
interface StartAnalysisInput {
  contactId: string   // ID do contato a ser movido para 'em_analise'
  note:      string   // Nota interna opcional do técnico (ex: "aguardando retorno do cliente")
  priority:  string   // Prioridade atribuída (ex: 'alta', 'media', 'baixa')
}

/**
 * Inicia a análise de uma solicitação: atualiza o status para 'em_analise',
 * define a prioridade, atribui o técnico atual (assignee_id) e registra
 * a atividade na tabela contact_activity.
 * Requer autenticação de técnico.
 */
export async function startAnalysis(input: StartAnalysisInput): Promise<ActionResult> {
  const auth = await requireTechnician()
  if (!auth.ok) return { success: false, error: auth.error }
  const { supabase, userId } = auth

  const note = input.note.trim()

  // Atualiza o contato: status, prioridade e técnico responsável em uma única operação
  const { error: updateError } = await supabase.from('contacts').update({
    status: 'em_analise', priority: input.priority, assignee_id: userId,
  }).eq('id', input.contactId)
  if (updateError) {
    console.error('startAnalysis: falha ao atualizar contato', updateError)
    return { success: false, error: 'Erro ao iniciar análise. Tente novamente.' }
  }

  // Registra a atividade para histórico de auditoria — falha aqui não bloqueia o fluxo
  const { error: activityError } = await supabase.from('contact_activity').insert({
    contact_id: input.contactId, technician_id: userId,
    action: 'iniciou_analise', note: note || null,
  })
  if (activityError) {
    console.error('startAnalysis: falha ao registrar atividade', activityError)
  }

  revalidatePath('/admin/solicitacoes')
  return { success: true }
}

/**
 * Salva ou atualiza um rascunho de resposta sem enviar o e-mail.
 * Se draftId for fornecido, atualiza o rascunho existente; caso contrário, cria um novo.
 * O rascunho fica disponível para o técnico retomar depois (is_draft=true).
 * Requer autenticação de técnico.
 */
export async function saveContactDraft(input: ResponseInput): Promise<ActionResult> {
  const auth = await requireTechnician()
  if (!auth.ok) return { success: false, error: auth.error }
  const { supabase, userId } = auth

  const subject = input.subject.trim()
  const message = input.message.trim()
  // Para rascunho, pelo menos um dos campos deve ter conteúdo
  if (!subject && !message) {
    return { success: false, error: 'Nada para salvar.' }
  }

  if (input.draftId) {
    // Atualiza rascunho existente — só sobrescreve conteúdo, mantém is_draft=true
    const { error } = await supabase.from('contact_responses').update({
      subject, message, updated_at: new Date().toISOString(),
    }).eq('id', input.draftId)
    if (error) {
      console.error('saveContactDraft: falha ao atualizar', error)
      return { success: false, error: 'Erro ao salvar rascunho. Tente novamente.' }
    }
  } else {
    // Cria novo rascunho — is_draft: true indica que ainda não foi enviado
    const { error } = await supabase.from('contact_responses').insert({
      contact_id: input.contactId, technician_id: userId,
      subject, message, is_draft: true,
    })
    if (error) {
      console.error('saveContactDraft: falha ao inserir', error)
      return { success: false, error: 'Erro ao salvar rascunho. Tente novamente.' }
    }
  }

  revalidatePath('/admin/solicitacoes')
  return { success: true }
}

/**
 * Exclui permanentemente uma solicitação de contato do banco.
 * Só é permitido se o contato já estiver com status 'arquivado' — evita
 * exclusão acidental de solicitações ainda em aberto.
 * Requer autenticação de técnico LÍDER (permissão elevada).
 */
export async function deleteContact(contactId: string): Promise<ActionResult> {
  // Exclusão permanente requer permissão de líder
  const auth = await requireLeader()
  if (!auth.ok) return { success: false, error: auth.error }
  const { supabase } = auth

  // Verifica se o contato existe e está arquivado antes de excluir
  const { data: contact } = await supabase
    .from('contacts').select('status').eq('id', contactId).single()
  if (!contact) {
    return { success: false, error: 'Solicitação não encontrada.' }
  }
  // Regra de negócio: só arquivados podem ser excluídos permanentemente
  if (contact.status !== 'arquivado') {
    return { success: false, error: 'Só é possível excluir solicitações arquivadas.' }
  }

  const { error } = await supabase.from('contacts').delete().eq('id', contactId)
  if (error) {
    console.error('deleteContact:', error)
    return { success: false, error: 'Erro ao excluir. Tente novamente.' }
  }

  revalidatePath('/admin/solicitacoes')
  return { success: true }
}
