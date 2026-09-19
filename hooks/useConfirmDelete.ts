'use client'

import { useState } from 'react'

/**
 * Hook: useConfirmDelete
 *
 * Encapsula o fluxo de confirmação antes de excluir um item.
 * Evita duplicação do par de estados (confirmId / deleting) que antes
 * era copiado manualmente em ProjetosAdminClient.tsx e
 * ProjetosClientesClient.tsx com os mesmos nomes.
 *
 * Fluxo típico de uso:
 *   1. Usuário clica em "Excluir" → chama `request(id)`
 *   2. Dialog de confirmação é exibido (controlado por `confirmId !== null`)
 *   3a. Usuário cancela → chama `cancel()` → dialog fecha
 *   3b. Usuário confirma → componente seta `setDeleting(id)`, chama a
 *       API, e no finally limpa ambos os estados com `setConfirmId(null)`
 *       + `setDeleting(null)`
 *
 * Quando usar:
 *   - Em qualquer tela administrativa que precise de um dialog "Tem
 *     certeza que deseja excluir?" antes de disparar a operação real.
 */
export function useConfirmDelete() {
  /**
   * ID do item que aguarda confirmação do usuário.
   * `null` significa que nenhum dialog de confirmação está aberto.
   */
  const [confirmId, setConfirmId] = useState<string | null>(null)

  /**
   * ID do item que está sendo excluído no momento (requisição em
   * andamento). Usado para exibir spinner/disabled no botão de confirmação
   * e impedir cliques duplos.
   * `null` significa que não há exclusão em progresso.
   */
  const [deleting, setDeleting]   = useState<string | null>(null)

  /**
   * Abre o dialog de confirmação para o item com o `id` fornecido.
   * Deve ser chamado quando o usuário clicar no botão "Excluir".
   *
   * @param id - Identificador único do item a ser excluído.
   */
  const request = (id: string) => setConfirmId(id)

  /**
   * Fecha o dialog de confirmação sem executar nenhuma ação.
   * Deve ser chamado no botão "Cancelar" do dialog.
   */
  const cancel   = () => setConfirmId(null)

  /**
   * Valores e funções expostos pelo hook:
   *
   * @returns confirmId   - ID pendente de confirmação; não-nulo quando o
   *                        dialog deve estar visível.
   * @returns setConfirmId - Setter direto do confirmId (útil para limpar
   *                         após a exclusão).
   * @returns deleting    - ID do item sendo excluído; não-nulo durante a
   *                        requisição à API.
   * @returns setDeleting - Setter direto do deleting (chamado pelo
   *                        componente antes/depois da chamada à API).
   * @returns request     - Inicia o fluxo de confirmação para um dado ID.
   * @returns cancel      - Aborta o fluxo sem excluir nada.
   */
  return { confirmId, setConfirmId, deleting, setDeleting, request, cancel }
}
