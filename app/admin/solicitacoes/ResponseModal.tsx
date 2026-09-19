'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Send, Loader2, Sparkles, X, Mail } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { sendContactResponse, saveContactDraft } from './actions'
import type { Contact, ResponseTemplate, ContactResponse } from './page'

// Props do modal de resposta a uma solicitação de contato
interface Props {
  contact:       Contact              // Contato que será respondido
  templates:     ResponseTemplate[]   // Modelos de resposta disponíveis para seleção rápida
  existingDraft: ContactResponse | null  // Rascunho salvo anteriormente (null se não houver)
  onClose:       () => void           // Callback chamado ao fechar o modal (sem enviar)
  onSent:        (contactId: string) => void  // Callback chamado após envio bem-sucedido
}

// Extrai o primeiro nome de uma string de nome completo.
// Usado para personalizar a saudação na mensagem de resposta.
function firstName(name: string) {
  return name.trim().split(' ')[0] || name
}

// Assunto padrão preenchido automaticamente ao abrir o modal
const DEFAULT_SUBJECT = 'Retorno sobre sua solicitação - LOBBY'

// Modal para compor e enviar (ou salvar como rascunho) uma resposta por e-mail
// a uma solicitação de contato recebida pelo formulário público.
export default function ResponseModal({ contact, templates, existingDraft, onClose, onSent }: Props) {
  // Assunto do e-mail — pré-preenchido com rascunho salvo ou assunto padrão
  const [subject, setSubject] = useState(
    existingDraft?.subject ?? DEFAULT_SUBJECT
  )
  // Corpo do e-mail — pré-preenchido com rascunho salvo ou mensagem inicial padrão
  const [message, setMessage] = useState(
    existingDraft?.message ??
    `Olá, ${firstName(contact.name)}. Recebemos sua solicitação e nosso time já está avaliando...`
  )
  // Estado de loading do envio (chama a Server Action sendContactResponse)
  const [sending,     setSending]     = useState(false)
  // Estado de loading do salvamento de rascunho (chama saveContactDraft)
  const [savingDraft, setSavingDraft] = useState(false)
  // busy bloqueia todos os controles enquanto qualquer operação assíncrona está em andamento
  const busy = sending || savingDraft

  // Substitui assunto e mensagem pelo conteúdo de um modelo de resposta.
  // {{nome}} no corpo do template é substituído pelo primeiro nome do contato.
  const applyTemplate = (t: ResponseTemplate) => {
    const name = firstName(contact.name)
    setSubject(t.subject)
    setMessage(t.body.replaceAll('{{nome}}', name))
  }

  // Envia o e-mail via Server Action e atualiza o status do contato para 'respondido'.
  // Se havia um rascunho (draftId), ele é atualizado em vez de criar novo registro.
  const handleSend = async () => {
    setSending(true)
    const result = await sendContactResponse({
      contactId: contact.id, subject, message, draftId: existingDraft?.id,
    })
    setSending(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success('Resposta enviada com sucesso')
    onSent(contact.id)
    onClose()
  }

  // Salva o conteúdo atual como rascunho sem enviar o e-mail.
  // Útil quando o técnico quer preparar a resposta em etapas.
  const handleSaveDraft = async () => {
    setSavingDraft(true)
    const result = await saveContactDraft({
      contactId: contact.id, subject, message, draftId: existingDraft?.id,
    })
    setSavingDraft(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success('Rascunho salvo')
    onClose()
  }

  return (
    // onOpenChange fecha o modal apenas se não houver operação em andamento (busy=false)
    <Dialog open onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-lg rounded-2xl border border-white/[0.09] bg-[#0D1428] p-6 text-white shadow-[0_30px_80px_rgba(0,0,0,0.50)] max-h-[90vh] overflow-y-auto"
      >
        {/* Cabeçalho do modal com título e botão de fechar */}
        <div className="mb-5 flex items-center justify-between">
          <DialogTitle className="text-lg font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Responder solicitação
          </DialogTitle>
          <button type="button" disabled={busy} onClick={onClose}
            className="rounded-lg p-1.5 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/70 disabled:opacity-50">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Campo "Para" — somente leitura, exibe o e-mail do solicitante */}
          <div>
            <p className="mb-1.5 text-xs font-semibold text-white/50">Para</p>
            <p className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white/70">
              <Mail size={13} className="text-white/30" aria-hidden="true" />
              {contact.email}
            </p>
          </div>

          {/* Campo de assunto do e-mail — editável */}
          <div>
            <label htmlFor="resp-subject" className="mb-1.5 block text-xs font-semibold text-white/50">Assunto</label>
            <input
              id="resp-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={busy}
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3.5 text-sm text-white outline-none transition-all focus:border-[#005BFF]/50 focus:bg-white/[0.08] focus:ring-4 focus:ring-[#005BFF]/15 disabled:opacity-60"
            />
          </div>

          {/* Corpo da mensagem — área de texto com altura mínima para conforto de edição */}
          <div>
            <label htmlFor="resp-message" className="mb-1.5 block text-xs font-semibold text-white/50">Mensagem</label>
            <Textarea
              id="resp-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={busy}
              rows={6}
              className="min-h-[140px] rounded-xl border-white/10 bg-white/[0.06] text-sm text-white focus-visible:border-[#005BFF]/50 focus-visible:ring-[#005BFF]/15"
            />
          </div>

          {/* Seção de modelos rápidos — só exibida se houver templates cadastrados */}
          {templates.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/25">
                <Sparkles size={11} aria-hidden="true" />Modelos rápidos
              </p>
              <div className="flex flex-wrap gap-2">
                {/* Cada botão aplica o modelo correspondente, substituindo assunto e mensagem */}
                {templates.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={busy}
                    onClick={() => applyTemplate(t)}
                    className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/60 transition-colors hover:border-[#005BFF]/40 hover:text-white disabled:opacity-50"
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Rodapé com botões de ação — Enviar (primário), Salvar rascunho e Cancelar */}
        <div className="mt-6 flex flex-wrap gap-3">
          {/* Botão principal — envia o e-mail e fecha o modal */}
          <button
            type="button"
            disabled={busy}
            onClick={handleSend}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] py-2.5 text-sm font-bold text-white shadow-[0_12px_30px_rgba(0,91,255,0.30)] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sending ? <><Loader2 size={15} className="animate-spin" />Enviando...</> : <><Send size={15} />Enviar resposta</>}
          </button>
          {/* Botão secundário — persiste o rascunho sem enviar */}
          <button
            type="button"
            disabled={busy}
            onClick={handleSaveDraft}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.10] px-4 py-2.5 text-sm font-semibold text-white/60 transition-all hover:border-white/25 hover:text-white/90 disabled:opacity-50"
          >
            {savingDraft ? <Loader2 size={15} className="animate-spin" /> : null}
            Salvar rascunho
          </button>
          {/* Botão de cancelar — fecha sem salvar nada */}
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/50 transition-all hover:bg-white/[0.08] hover:text-white disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
