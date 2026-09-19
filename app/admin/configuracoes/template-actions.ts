'use server'

// Server Actions para gerenciamento de modelos de resposta (response_templates).
// Todas as ações exigem autenticação e perfil de técnico líder (is_leader = true).
// Usadas na página de Configurações para criar, atualizar e excluir modelos de e-mail.

// revalidatePath: invalida o cache do Next.js para forçar re-renderização das páginas afetadas
import { revalidatePath } from 'next/cache'
// Cliente Supabase com as credenciais da sessão do servidor (respeita RLS)
import { createServerSupabaseClient } from '@/lib/supabase-server'

// Tipo de retorno padrão das Server Actions: sucesso ou erro com mensagem
type ActionResult =
  | { success: true }
  | { success: false; error: string }

// Campos necessários para criar ou atualizar um modelo de resposta
interface TemplateInput {
  title:   string  // Texto do botão exibido no modal de resposta
  subject: string  // Assunto padrão do e-mail enviado ao cliente
  body:    string  // Corpo do e-mail (suporta {{nome}} como variável)
}

/**
 * Verifica se o usuário autenticado é técnico líder.
 * Retorna o cliente Supabase para uso imediato caso autorizado,
 * ou um erro caso contrário — evitando repetição desta lógica em cada action.
 */
async function requireLeader() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Não autenticado.' }

  // Busca o perfil para verificar role e is_leader
  const { data: profile } = await supabase
    .from('profiles').select('role, is_leader').eq('id', user.id).single()
  if (profile?.role !== 'technician' || profile?.is_leader !== true) {
    return { ok: false as const, error: 'Acesso restrito a técnicos líderes.' }
  }
  return { ok: true as const, supabase }
}

/**
 * Invalida o cache das páginas que exibem modelos de resposta,
 * forçando a re-renderização com os dados atualizados.
 */
function revalidate() {
  revalidatePath('/admin/configuracoes')
  revalidatePath('/admin/solicitacoes')
}

/**
 * Cria um novo modelo de resposta na tabela response_templates.
 * Requer autenticação como técnico líder e todos os campos preenchidos.
 */
export async function createResponseTemplate(input: TemplateInput): Promise<ActionResult> {
  const auth = await requireLeader()
  if (!auth.ok) return { success: false, error: auth.error }

  // Sanitiza os campos removendo espaços extras
  const title   = input.title.trim()
  const subject = input.subject.trim()
  const body    = input.body.trim()
  if (!title || !subject || !body) {
    return { success: false, error: 'Preencha todos os campos.' }
  }

  const { error } = await auth.supabase.from('response_templates').insert({ title, subject, body })
  if (error) {
    console.error('createResponseTemplate:', error)
    return { success: false, error: 'Erro ao criar modelo. Tente novamente.' }
  }

  // Invalida cache para que a listagem atualizada seja servida na próxima requisição
  revalidate()
  return { success: true }
}

/**
 * Atualiza um modelo de resposta existente identificado por seu ID.
 * Requer autenticação como técnico líder e todos os campos preenchidos.
 * Atualiza também o campo updated_at para controle de versão.
 */
export async function updateResponseTemplate(id: string, input: TemplateInput): Promise<ActionResult> {
  const auth = await requireLeader()
  if (!auth.ok) return { success: false, error: auth.error }

  // Sanitiza os campos removendo espaços extras
  const title   = input.title.trim()
  const subject = input.subject.trim()
  const body    = input.body.trim()
  if (!title || !subject || !body) {
    return { success: false, error: 'Preencha todos os campos.' }
  }

  const { error } = await auth.supabase.from('response_templates')
    .update({ title, subject, body, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) {
    console.error('updateResponseTemplate:', error)
    return { success: false, error: 'Erro ao salvar modelo. Tente novamente.' }
  }

  revalidate()
  return { success: true }
}

/**
 * Exclui permanentemente um modelo de resposta pelo seu ID.
 * Requer autenticação como técnico líder.
 */
export async function deleteResponseTemplate(id: string): Promise<ActionResult> {
  const auth = await requireLeader()
  if (!auth.ok) return { success: false, error: auth.error }

  const { error } = await auth.supabase.from('response_templates').delete().eq('id', id)
  if (error) {
    console.error('deleteResponseTemplate:', error)
    return { success: false, error: 'Erro ao excluir modelo. Tente novamente.' }
  }

  revalidate()
  return { success: true }
}
