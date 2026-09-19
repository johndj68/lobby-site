'use client'

import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'

/**
 * Props do ConfirmDialog.
 * - open: controla visibilidade do modal
 * - onOpenChange: callback chamado quando o modal deve abrir ou fechar
 * - icon: componente de ícone (Lucide) exibido no topo do modal
 * - title: título da ação de confirmação (ex: "Excluir arquivo?")
 * - description: texto explicativo — pode incluir JSX para destacar nomes
 * - confirmLabel: label do botão de confirmação no estado normal
 * - confirmingLabel: label exibido enquanto a ação está em progresso (busy=true)
 * - cancelLabel: label do botão de cancelamento (padrão: "Cancelar")
 * - busy: quando true, desabilita ambos os botões e exibe spinner
 * - onConfirm: callback executado ao clicar em confirmar
 * - variant: 'destructive' usa cores de perigo (vermelho); 'neutral' usa tons neutros
 */
interface Props {
  open:            boolean
  onOpenChange:    (open: boolean) => void
  icon:            React.ElementType
  title:           string
  description:     React.ReactNode
  confirmLabel:    React.ReactNode
  confirmingLabel: React.ReactNode
  cancelLabel?:    string
  busy?:           boolean
  onConfirm:       () => void
  variant?:        'destructive' | 'neutral'
}

/**
 * Modal de confirmação (excluir/arquivar) compartilhado — antes cada tela
 * (ArquivosClient, ProjetosAdminClient, ProjetosClientesClient,
 * ContactConfirmModals) reimplementava o mesmo overlay + painel com
 * Framer Motion à mão, sem Escape/focus trap. Usa o Dialog do design
 * system (@base-ui/react), que já cuida disso.
 */
export default function ConfirmDialog({
  open, onOpenChange, icon: Icon, title, description,
  confirmLabel, confirmingLabel, cancelLabel = 'Cancelar',
  busy = false, onConfirm, variant = 'destructive',
}: Props) {
  // Classes do fundo e texto do ícone variam conforme a variante da ação
  const iconBg   = variant === 'destructive' ? 'bg-red-500/15' : 'bg-white/[0.06]'
  const iconText = variant === 'destructive' ? 'text-red-400'  : 'text-white/50'

  // Classes do botão de confirmação: vermelho para ações destrutivas, neutro para as demais
  const confirmBtn = variant === 'destructive'
    ? 'bg-red-500 hover:bg-red-600'
    : 'bg-white/[0.10] hover:bg-white/[0.16]'

  return (
    // Impede fechar o modal enquanto a ação está em andamento (busy=true)
    <Dialog open={open} onOpenChange={next => !busy && onOpenChange(next)}>
      <DialogContent
        showCloseButton={false}
        className="max-w-sm rounded-2xl border border-white/[0.09] bg-[#0D1428] p-6 text-white shadow-[0_30px_80px_rgba(0,0,0,0.50)]"
      >
        {/* Ícone da ação no topo — cor muda conforme variante */}
        <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${iconBg}`}>
          <Icon size={24} className={iconText} aria-hidden="true" />
        </div>

        {/* Título e descrição explicativa da ação que será confirmada */}
        <h2 className="text-lg font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          {title}
        </h2>
        <p className="mt-2 break-words text-sm leading-relaxed text-white/50">{description}</p>

        {/* Botões de ação: Cancelar à esquerda, Confirmar à direita */}
        <div className="mt-6 flex gap-3">
          {/* Cancelar — desabilitado durante a execução para evitar estado inconsistente */}
          <button type="button" disabled={busy} onClick={() => onOpenChange(false)}
            className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] py-2.5 text-sm font-semibold text-white/60 transition-all hover:bg-white/[0.08] hover:text-white disabled:opacity-50">
            {cancelLabel}
          </button>
          {/* Confirmar — exibe spinner e label alternativo enquanto busy=true */}
          <button type="button" disabled={busy} onClick={onConfirm}
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white transition-all disabled:cursor-not-allowed disabled:opacity-60 ${confirmBtn}`}>
            {busy ? <><Loader2 size={15} className="animate-spin" />{confirmingLabel}</> : confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
