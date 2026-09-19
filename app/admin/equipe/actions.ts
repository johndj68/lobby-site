'use server'
// Diretiva "use server": todas as funções exportadas são Server Actions do Next.js.
// Este módulo gerencia membros da equipe técnica:
//   - createTechnician: cria um novo técnico com conta de auth + perfil
//   - deleteTechnician: remove um técnico existente com limpeza de FK antes do delete
// Ambas as ações são restritas a técnicos líderes (is_leader = true).

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin' // Cliente com service_role para operações administrativas
import { checkRateLimit } from '@/lib/rate-limit'

/* ============================================================
 * Tipos de entrada e retorno — createTechnician
 * ============================================================ */

// Dados necessários para registrar um novo técnico no sistema
interface CreateTechnicianInput {
  name:     string // Nome completo do técnico
  email:    string // E-mail que será usado como login
  password: string // Senha inicial (mínimo 8 caracteres)
}

// Tipo discriminado: sucesso retorna o ID do usuário criado; falha retorna mensagem de erro
type CreateTechnicianResult =
  | { success: true; id: string }
  | { success: false; error: string }

/* ============================================================
 * Server Action: createTechnician
 * ============================================================ */

/**
 * Cria um novo técnico no sistema em dois passos:
 *  1. Cria a conta de autenticação via Supabase Auth Admin API
 *     (com e-mail já confirmado, dispensando o fluxo de verificação)
 *  2. Insere (ou atualiza) o perfil na tabela `profiles` com role = 'technician'
 *
 * Restrições:
 *  - O usuário chamador deve ser técnico líder (role = 'technician' e is_leader = true)
 *  - Nome, e-mail e senha são obrigatórios; senha deve ter ≥ 8 caracteres
 *  - E-mails duplicados retornam erro amigável ao invés da mensagem do Supabase
 */
export async function createTechnician(
  input: CreateTechnicianInput
): Promise<CreateTechnicianResult> {
  // Sanitiza os campos de texto removendo espaços desnecessários
  const name     = input.name.trim()
  const email    = input.email.trim()
  const password = input.password

  // Cria o cliente Supabase com as credenciais da sessão do servidor
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    // Usuário não autenticado — bloqueia a action imediatamente
    return { success: false, error: 'Não autenticado.' }
  }

  // Verifica se o usuário logado é um técnico líder antes de prosseguir
  const { data: profile } = await supabase
    .from('profiles').select('role, is_leader').eq('id', user.id).single()
  if (profile?.role !== 'technician' || profile?.is_leader !== true) {
    return { success: false, error: 'Acesso restrito a técnicos líderes.' }
  }

  // Limite de criação de contas de técnico: 10/hora por líder — cobre uso legítimo
  // (onboarding de equipe) sem permitir criação em massa por uma sessão comprometida.
  const rl = checkRateLimit({ key: `create-technician:${user.id}`, limit: 10, windowMs: 3_600_000 })
  if (!rl.allowed) {
    return { success: false, error: 'Muitas contas criadas recentemente. Tente novamente em breve.' }
  }

  // Validação dos campos obrigatórios
  if (!name || !email || !password) {
    return { success: false, error: 'Preencha todos os campos obrigatórios.' }
  }
  if (password.length < 8) {
    return { success: false, error: 'A senha deve ter pelo menos 8 caracteres.' }
  }

  // Usa o cliente admin (service_role) para criar o usuário sem restrições de RLS
  const admin = createAdminClient()

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,                    // Dispensa o fluxo de confirmação por e-mail
    user_metadata: { full_name: name },     // Armazena o nome como metadado no registro de auth
  })

  if (createError) {
    const msg = createError.message ?? ''
    return {
      success: false,
      // Mensagem amigável para e-mail duplicado; genérica para demais erros
      error: msg.includes('already been registered')
        ? 'E-mail já cadastrado.'
        : 'Erro ao criar conta. Tente novamente.',
    }
  }

  // Persiste o perfil do técnico na tabela `profiles`.
  // upsert garante idempotência caso o trigger do banco já tenha criado o registro.
  // is_leader = false: novos técnicos não recebem privilégios de liderança por padrão.
  const { error: profileError } = await admin.from('profiles').upsert({
    id:        created.user.id,
    email,
    full_name: name,
    role:      'technician',
    is_leader: false,
  })

  if (profileError) {
    console.error('createTechnician: falha ao salvar profile', profileError)
    return {
      success: false,
      error: 'Conta criada mas perfil não pôde ser salvo. Contate o suporte.',
    }
  }

  // Invalida o cache da página de equipe para exibir o novo técnico imediatamente
  revalidatePath('/admin/equipe')
  return { success: true, id: created.user.id }
}

/* ============================================================
 * Tipos de retorno — deleteTechnician
 * ============================================================ */

// Tipo discriminado: sucesso sem dados adicionais, ou falha com mensagem de erro
type DeleteTechnicianResult =
  | { success: true }
  | { success: false; error: string }

/* ============================================================
 * Server Action: deleteTechnician
 * ============================================================ */

/**
 * Remove um técnico do sistema em três etapas obrigatórias:
 *  1. Desatribui todas as solicitações (contacts) vinculadas ao técnico
 *     — necessário para não violar a FK contacts.assignee_id → profiles.id
 *  2. Exclui o usuário do Supabase Auth via Admin API (revoga tokens e sessões)
 *  3. Remove o perfil da tabela `profiles` (garante consistência caso o cascade não ocorra)
 *
 * Restrições:
 *  - Somente técnicos líderes podem excluir outros técnicos
 *  - Não é permitido excluir a própria conta (auto-exclusão)
 *  - Não é permitido excluir outro técnico líder por esta rota
 */
export async function deleteTechnician(
  technicianId: string // ID (UUID) do usuário a ser removido
): Promise<DeleteTechnicianResult> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Não autenticado.' }
  }

  // Confirma que o solicitante é um técnico com privilégio de liderança
  const { data: profile } = await supabase
    .from('profiles').select('role, is_leader').eq('id', user.id).single()
  if (profile?.role !== 'technician' || profile?.is_leader !== true) {
    return { success: false, error: 'Acesso restrito a técnicos líderes.' }
  }

  // Impede que o líder exclua a própria conta (auto-exclusão acidental)
  if (technicianId === user.id) {
    return { success: false, error: 'Você não pode excluir a própria conta.' }
  }

  // Usa o cliente admin para operações que exigem service_role (sem restrições de RLS)
  const admin = createAdminClient()

  // Verifica se o alvo existe e se é um técnico sem privilégios de líder
  const { data: target } = await admin
    .from('profiles').select('role, is_leader').eq('id', technicianId).single()
  if (!target || target.role !== 'technician') {
    return { success: false, error: 'Técnico não encontrado.' }
  }
  if (target.is_leader === true) {
    // Líderes só podem ser removidos manualmente — protege contra exclusão acidental
    return { success: false, error: 'Não é possível excluir outro técnico líder por aqui.' }
  }

  // Libera solicitações atribuídas antes de apagar, senão a FK
  // contacts.assignee_id -> profiles.id bloqueia o delete.
  const { error: unassignError } = await admin
    .from('contacts')
    .update({ assignee_id: null })
    .eq('assignee_id', technicianId)
  if (unassignError) {
    console.error('deleteTechnician: falha ao desatribuir solicitações', unassignError)
    return { success: false, error: 'Erro ao liberar solicitações do técnico. Tente novamente.' }
  }

  // Remove o usuário do Supabase Auth (revoga tokens e elimina o registro de autenticação)
  const { error: deleteError } = await admin.auth.admin.deleteUser(technicianId)
  if (deleteError) {
    console.error('deleteTechnician: falha ao apagar usuário', deleteError)
    return { success: false, error: 'Erro ao excluir técnico. Tente novamente.' }
  }

  // Remove o perfil da tabela profiles (garante consistência caso o cascade não ocorra)
  await admin.from('profiles').delete().eq('id', technicianId)

  // Invalida o cache da página de equipe para refletir a remoção imediatamente
  revalidatePath('/admin/equipe')
  return { success: true }
}
