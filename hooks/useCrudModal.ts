'use client'

import { useState } from 'react'

/**
 * Hook genérico: useCrudModal<T>
 *
 * Centraliza o estado necessário para um modal/painel de criação ou edição
 * de registros (operações CRUD). Antes deste hook, os mesmos seis estados
 * (showForm / editingId / form / saving / error / saved) eram duplicados
 * manualmente em ProjetosAdminClient.tsx, ProjetosClientesClient.tsx e no
 * modal "Solicitar projeto" de ProjetosClient.tsx.
 *
 * @template T - Tipo do objeto de formulário (ex.: `{ nome: string; ... }`).
 *
 * @param emptyForm - Valor inicial do formulário, usado tanto na abertura de
 *                    "Novo registro" quanto para resetar o estado após fechar.
 *                    Deve ser um objeto estável (definido fora do render ou
 *                    com useMemo) para evitar re-renders desnecessários.
 *
 * Quando usar:
 *   - Sempre que uma tela precisar de um modal ou painel lateral que alterne
 *     entre os modos "criar novo item" e "editar item existente".
 *   - Substitui o bloco de useState repetitivo e as funções openAdd/openEdit
 *     definidas localmente nos componentes de administração.
 */
export function useCrudModal<T>(emptyForm: T) {
  /**
   * Controla a visibilidade do modal/painel.
   * `true` → modal aberto; `false` → modal fechado.
   */
  const [showForm, setShowForm]   = useState(false)

  /**
   * ID do registro em edição.
   * `null` indica modo de criação (novo registro).
   * Quando não-nulo, indica modo de edição e guarda o ID do item sendo
   * alterado (útil para montar a URL da requisição PATCH/PUT).
   */
  const [editingId, setEditingId] = useState<string | null>(null)

  /**
   * Dados atuais do formulário, tipados conforme o genérico `T`.
   * Inicializado com `emptyForm` e atualizado pelo componente via `setForm`
   * conforme o usuário preenche os campos.
   */
  const [form, setForm]           = useState<T>(emptyForm)

  /**
   * Indica se há uma requisição de salvar em andamento.
   * Usado para exibir spinner e desabilitar o botão "Salvar" durante o
   * envio, evitando submissões duplicadas.
   */
  const [saving, setSaving]       = useState(false)

  /**
   * Mensagem de erro a ser exibida no modal.
   * String vazia (`''`) significa "sem erro". Qualquer outro valor é
   * renderizado como feedback de erro para o usuário.
   */
  const [error, setError]         = useState('')

  /**
   * Flag de sucesso após salvar.
   * `true` por um breve instante após a operação concluir com êxito,
   * permitindo exibir feedback visual (ex.: checkmark, toast).
   */
  const [saved, setSaved]         = useState(false)

  /**
   * Abre o modal em modo de CRIAÇÃO de novo registro.
   * Reseta o formulário para `emptyForm`, limpa qualquer ID de edição e
   * qualquer mensagem de erro anterior.
   */
  const openAdd = () => {
    setForm(emptyForm)
    setEditingId(null)
    setShowForm(true)
    setError('')
  }

  /**
   * Abre o modal em modo de EDIÇÃO de um registro existente.
   * Preenche o formulário com os valores atuais do item e armazena seu ID.
   *
   * @param id     - Identificador único do registro a editar.
   * @param values - Valores atuais do registro, que serão colocados no form.
   */
  const openEdit = (id: string, values: T) => {
    setForm(values)
    setEditingId(id)
    setShowForm(true)
    setError('')
  }

  /**
   * Fecha o modal e limpa o ID de edição.
   * Não reseta `form` nem `error` intencionalmente — esses são limpos ao
   * reabrir via `openAdd` ou `openEdit`.
   */
  const close = () => {
    setShowForm(false)
    setEditingId(null)
  }

  /**
   * Valores e funções expostos pelo hook:
   *
   * @returns showForm    - Se o modal está visível.
   * @returns setShowForm - Setter direto de showForm (escapes pontuais).
   * @returns editingId   - ID em edição ou null (modo criar).
   * @returns setEditingId - Setter direto de editingId.
   * @returns form        - Dados atuais do formulário.
   * @returns setForm     - Atualiza o formulário (usar em onChange dos campos).
   * @returns saving      - Se há envio em progresso.
   * @returns setSaving   - Controla o estado de loading durante o submit.
   * @returns error       - Mensagem de erro atual ('' = sem erro).
   * @returns setError    - Define a mensagem de erro após falha na API.
   * @returns saved       - Flag de sucesso pós-save.
   * @returns setSaved    - Ativa o feedback de sucesso.
   * @returns openAdd     - Abre o modal no modo "criar novo".
   * @returns openEdit    - Abre o modal no modo "editar existente".
   * @returns close       - Fecha o modal.
   */
  return {
    showForm, setShowForm,
    editingId, setEditingId,
    form, setForm,
    saving, setSaving,
    error, setError,
    saved, setSaved,
    openAdd, openEdit, close,
  }
}
