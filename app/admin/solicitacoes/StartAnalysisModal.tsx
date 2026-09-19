'use client'
// Diretiva "use client": componente executado no navegador com estado local (useState).
// Modal que o técnico usa para configurar e iniciar a análise de uma solicitação:
//  - Campo de observação interna (opcional, visível apenas para o time)
//  - Seleção de prioridade (baixa / média / alta) com cores semânticas
//  - Exibição do responsável (nome do técnico logado, somente leitura)

import { useState } from 'react'
import { toast } from 'sonner'    // Biblioteca de notificações toast
import { CircleDot, Loader2, User, X } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { startAnalysis } from './actions' // Server Action que marca a solicitação como "Em análise"
import type { Contact } from './page'    // Tipo que representa uma solicitação (contato)

/* ============================================================
 * Tipos e constantes
 * ============================================================ */

// Props recebidas pelo componente modal
interface Props {
  contact:        Contact  // Dados da solicitação (contato) a ser analisada
  technicianName: string   // Nome do técnico logado, exibido como responsável fixo
  onClose:        () => void                  // Callback para fechar o modal sem confirmar
  onConfirm:      (contactId: string) => void // Callback chamado após análise iniciada com sucesso
}

// Opções de nível de prioridade disponíveis para seleção no modal
const PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'baixa', label: 'Baixa' },
  { value: 'media', label: 'Média' },
  { value: 'alta',  label: 'Alta' },
]

/*
 * Estilos Tailwind aplicados ao botão de prioridade quando está ativo (selecionado).
 * Cada nível tem cor semântica própria:
 *   baixa → verde  (baixa urgência)
 *   media → amarelo (urgência moderada)
 *   alta  → vermelho (alta urgência)
 */
const PRIORITY_ACTIVE_STYLE: Record<string, string> = {
  baixa: 'border-[#10B981]/40 bg-[#10B981]/15 text-[#34D399]',
  media: 'border-[#F59E0B]/40 bg-[#F59E0B]/15 text-[#FBBF24]',
  alta:  'border-[#EF4444]/40 bg-[#EF4444]/15 text-[#F87171]',
}

/* ============================================================
 * Componente StartAnalysisModal
 * ============================================================ */

/**
 * StartAnalysisModal — modal de confirmação para iniciar análise de uma solicitação.
 *
 * Fluxo:
 *  1. Técnico preenche (opcionalmente) uma nota interna e seleciona a prioridade
 *  2. Ao confirmar, chama a Server Action `startAnalysis` com contactId, nota e prioridade
 *  3. Sucesso: exibe toast de confirmação, dispara onConfirm(contactId) e fecha o modal
 *  4. Erro: exibe toast de erro e mantém o modal aberto para nova tentativa
 */
export default function StartAnalysisModal({ contact, technicianName, onClose, onConfirm }: Props) {
  // Texto da observação interna digitada pelo técnico (campo opcional)
  const [note,     setNote]     = useState('')
  // Nível de prioridade selecionado; inicia com o valor já atribuído à solicitação (padrão: 'media')
  const [priority, setPriority] = useState(contact.priority ?? 'media')
  // Controla o estado de carregamento enquanto a Server Action está em execução
  const [saving,   setSaving]   = useState(false)

  /**
   * handleConfirm — chama a Server Action e gerencia feedback ao técnico.
   * Desabilita todos os controles durante a requisição para evitar duplo envio.
   */
  const handleConfirm = async () => {
    setSaving(true) // Ativa o indicador de carregamento e desabilita a UI
    const result = await startAnalysis({ contactId: contact.id, note, priority })
    setSaving(false)
    if (!result.success) {
      // Exibe a mensagem de erro retornada pela Server Action
      toast.error(result.error)
      return
    }
    // Notifica o sucesso, avisa o componente pai e fecha o modal
    toast.success('Análise iniciada')
    onConfirm(contact.id)
    onClose()
  }

  return (
    // O Dialog fecha ao clicar fora apenas quando não há requisição em andamento (saving = false)
    <Dialog open onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-md rounded-2xl border border-white/[0.09] bg-[#0D1428] p-6 text-white shadow-[0_30px_80px_rgba(0,0,0,0.50)] max-h-[90vh] overflow-y-auto"
      >
        {/* Cabeçalho: ícone identificador do modal + botão de fechar */}
        <div className="mb-1 flex items-start justify-between">
          {/* Ícone decorativo com fundo roxo semitransparente */}
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#7B2CFF]/15">
            <CircleDot size={22} className="text-[#A78BFA]" aria-hidden="true" />
          </div>
          {/* Botão X para fechar — desabilitado enquanto o envio está em andamento */}
          <button type="button" disabled={saving} onClick={onClose}
            className="rounded-lg p-1.5 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/70 disabled:opacity-50">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Título e descrição explicativa do modal */}
        <DialogTitle className="mt-3 text-lg font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          Iniciar análise desta solicitação?
        </DialogTitle>
        <p className="mt-1.5 text-sm leading-relaxed text-white/50">
          A solicitação será marcada como &ldquo;Em análise&rdquo; e ficará vinculada ao seu atendimento.
        </p>

        {/* Campos do formulário */}
        <div className="mt-5 space-y-4">

          {/* Campo: observação interna — visível apenas para o time técnico */}
          <div>
            <label htmlFor="analysis-note" className="mb-1.5 block text-xs font-semibold text-white/50">
              Observação interna <span className="font-normal text-white/25">(opcional)</span>
            </label>
            <Textarea
              id="analysis-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={saving}
              rows={3}
              placeholder="Digite uma nota sobre essa solicitação..."
              className="rounded-xl border-white/10 bg-white/[0.06] text-sm text-white focus-visible:border-[#005BFF]/50 focus-visible:ring-[#005BFF]/15"
            />
          </div>

          {/* Campo: seleção de prioridade — botões toggle com cores semânticas por nível */}
          <div>
            <p className="mb-1.5 text-xs font-semibold text-white/50">Prioridade</p>
            <div className="flex gap-2">
              {PRIORITY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={saving}
                  onClick={() => setPriority(opt.value)}
                  className={`flex-1 rounded-xl border px-3 py-2 text-xs font-bold transition-all disabled:opacity-50 ${
                    priority === opt.value
                      ? PRIORITY_ACTIVE_STYLE[opt.value] // Estilo ativo: colorido conforme o nível
                      : 'border-white/10 bg-white/[0.04] text-white/40 hover:border-white/20 hover:text-white/70' // Estilo inativo: neutro
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Campo: responsável — exibe o nome do técnico logado (somente leitura, não editável) */}
          <div>
            <p className="mb-1.5 text-xs font-semibold text-white/50">Responsável</p>
            <p className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white/70">
              <User size={13} className="text-white/30" aria-hidden="true" />
              {technicianName}
            </p>
          </div>
        </div>

        {/* Rodapé: botões de ação */}
        <div className="mt-6 flex gap-3">
          {/* Botão secundário: cancela e fecha o modal sem nenhuma alteração */}
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] py-2.5 text-sm font-semibold text-white/60 transition-all hover:bg-white/[0.08] hover:text-white disabled:opacity-50"
          >
            Cancelar
          </button>
          {/* Botão primário: confirma e inicia a análise (gradiente azul → roxo) */}
          <button
            type="button"
            disabled={saving}
            onClick={handleConfirm}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] py-2.5 text-sm font-bold text-white shadow-[0_12px_30px_rgba(0,91,255,0.30)] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {/* Alterna entre spinner + "Iniciando..." durante o envio e o texto padrão */}
            {saving ? <><Loader2 size={15} className="animate-spin" />Iniciando...</> : 'Iniciar análise'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
