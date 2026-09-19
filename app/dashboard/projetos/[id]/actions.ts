'use server'
// Diretiva "use server": todas as funções exportadas são Server Actions do Next.js.
// Este módulo contém as ações do cliente na página de detalhes de um projeto:
//   - respondToApproval: cliente aprova a etapa ou solicita ajustes
//   - respondToVisualApproval: cliente aprova ou solicita ajuste em ativo visual individual

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { ClientProgress } from '@/types' // Tipo que modela o campo JSONB client_progress

/* ============================================================
 * Tipo de retorno compartilhado entre as actions
 * ============================================================ */

// Tipo discriminado padrão: sucesso sem dados extras, ou falha com mensagem de erro
type ActionResult =
  | { success: true }
  | { success: false; error: string }

/* ============================================================
 * respondToApproval — aprovação / ajuste de etapa pelo cliente
 * ============================================================ */

// Dados necessários para registrar a decisão do cliente sobre a etapa atual
interface ApprovalInput {
  projectId: string                              // ID do projeto sendo avaliado
  decision:  'aprovado' | 'ajustes_solicitados' // Decisão tomada pelo cliente
  note?:     string                             // Observação opcional sobre o que ajustar
}

/**
 * Registra a resposta do cliente (aprovação ou solicitação de ajustes)
 * para a etapa atual do projeto. Atualiza o campo JSONB `client_progress` com:
 *  - approvalStatus:      decisão tomada ('aprovado' | 'ajustes_solicitados')
 *  - approvalClientNote:  nota de ajuste enviada pelo cliente (quando aplicável)
 *  - approvalRespondedAt: timestamp ISO 8601 do momento da resposta
 *
 * A atualização é feita por merge (spread) para preservar todos os outros
 * campos do JSONB sem sobrescrevê-los.
 *
 * Restrições:
 *  - Somente o próprio cliente dono do projeto pode chamar esta action
 */
export async function respondToApproval(input: ApprovalInput): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    // Usuário não autenticado — bloqueia a action imediatamente
    return { success: false, error: 'Não autenticado.' }
  }

  // Busca o projeto para verificar a propriedade e carregar o progresso atual
  const { data: project } = await supabase
    .from('client_projects')
    .select('client_id, client_progress')
    .eq('id', input.projectId)
    .single()

  if (!project) {
    return { success: false, error: 'Projeto não encontrado.' }
  }
  if (project.client_id !== user.id) {
    // Garante que somente o dono do projeto possa aprovar ou solicitar ajustes
    return { success: false, error: 'Acesso negado.' }
  }

  // Lê o progresso atual, inicializando com objeto vazio caso ainda não exista
  const current: ClientProgress = project.client_progress ?? {}
  // Monta o novo progresso preservando todos os campos anteriores e atualizando apenas os de aprovação
  const nextProgress: ClientProgress = {
    ...current,
    approvalStatus:      input.decision,
    approvalClientNote:  input.note?.trim() || undefined, // undefined descarta strings vazias do JSONB
    approvalRespondedAt: new Date().toISOString(),        // Marca o momento exato da resposta
  }

  // Persiste o progresso atualizado no banco de dados
  const { error } = await supabase
    .from('client_projects')
    .update({ client_progress: nextProgress })
    .eq('id', input.projectId)

  if (error) {
    console.error('respondToApproval:', error)
    return { success: false, error: 'Erro ao registrar resposta. Tente novamente.' }
  }

  // Invalida o cache da página do projeto para exibir o novo status imediatamente
  revalidatePath(`/dashboard/projetos/${input.projectId}`)
  return { success: true }
}

/* ============================================================
 * respondToVisualApproval — aprovação de ativo visual individual
 * ============================================================ */

// Dados necessários para aprovar ou solicitar ajuste em um ativo visual específico
interface VisualApprovalInput {
  projectId: string                                    // ID do projeto pai
  kind:      'images' | 'documents' | 'deliverables'  // Categoria do ativo visual
  assetId:   string                                    // ID único do ativo dentro da categoria
  decision:  'aprovado' | 'ajuste_solicitado'         // Decisão do cliente sobre este ativo
}

/**
 * Registra a aprovação ou solicitação de ajuste em um ativo visual específico
 * (imagem, documento ou entregável) dentro do campo JSONB `client_progress.clientVisualAssets`.
 *
 * Lógica de atualização:
 *  1. Lê o array da categoria (kind) dentro de clientVisualAssets
 *  2. Usa map() para encontrar o ativo pelo assetId e atualizar apenas seu campo `status`
 *     — mantém todos os outros ativos da lista inalterados (abordagem imutável)
 *  3. Mescla a lista atualizada de volta ao objeto clientVisualAssets
 *  4. Persiste o progresso completo no campo JSONB do banco
 *
 * Restrições:
 *  - Somente o próprio cliente dono do projeto pode chamar esta action
 */
export async function respondToVisualApproval(input: VisualApprovalInput): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Não autenticado.' }
  }

  // Busca o projeto para verificar propriedade e carregar o progresso atual
  const { data: project } = await supabase
    .from('client_projects')
    .select('client_id, client_progress')
    .eq('id', input.projectId)
    .single()

  if (!project) {
    return { success: false, error: 'Projeto não encontrado.' }
  }
  if (project.client_id !== user.id) {
    return { success: false, error: 'Acesso negado.' }
  }

  // Lê o progresso atual, inicializando com objeto vazio se ainda não existir
  const current: ClientProgress = project.client_progress ?? {}
  // Obtém o mapa de ativos visuais (ou objeto vazio se ainda não inicializado)
  const assets = current.clientVisualAssets ?? {}
  // Obtém a lista de ativos da categoria especificada (imagens, documentos ou entregáveis)
  const list = assets[input.kind] ?? []
  // Atualiza apenas o status do ativo correspondente; os demais itens permanecem intactos
  const nextList = list.map(item => item.id === input.assetId ? { ...item, status: input.decision } : item)

  // Monta o novo progresso com a lista atualizada mesclada ao estado anterior
  const nextProgress: ClientProgress = {
    ...current,
    clientVisualAssets: { ...assets, [input.kind]: nextList },
  }

  // Persiste o progresso atualizado no banco de dados
  const { error } = await supabase
    .from('client_projects')
    .update({ client_progress: nextProgress })
    .eq('id', input.projectId)

  if (error) {
    console.error('respondToVisualApproval:', error)
    return { success: false, error: 'Erro ao registrar resposta. Tente novamente.' }
  }

  // Invalida o cache da página do projeto para exibir o novo status imediatamente
  revalidatePath(`/dashboard/projetos/${input.projectId}`)
  return { success: true }
}
