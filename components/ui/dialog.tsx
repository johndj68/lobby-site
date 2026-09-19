"use client"

/*
 * Dialog — modal acessível com overlay, animações e botão de fechar.
 *
 * Construído sobre @base-ui/react/dialog (substituto do Radix UI Dialog).
 * Gerencia foco, scroll lock, aria-modal e tecla Escape automaticamente.
 *
 * ─────────────────────────────────────────────
 * COMPOSIÇÃO (ordem recomendada):
 * ─────────────────────────────────────────────
 *   <Dialog>                    ← raiz (estado aberto/fechado)
 *     <DialogTrigger>           ← elemento que abre o modal ao ser clicado
 *     <DialogContent>           ← popup + overlay (renderizado via portal no <body>)
 *       <DialogHeader>          ← área do topo com título e descrição
 *         <DialogTitle>         ← título semântico (acessibilidade: aria-labelledby)
 *         <DialogDescription>  ← descrição opcional (aria-describedby)
 *       </DialogHeader>
 *       ... conteúdo livre ...
 *       <DialogFooter>          ← área de ações (botões de confirmar/cancelar)
 *     </DialogContent>
 *   </Dialog>
 *
 * ─────────────────────────────────────────────
 * SUBCOMPONENTES AUXILIARES:
 * ─────────────────────────────────────────────
 *   DialogPortal  — renderiza filhos diretamente no <body> (evita z-index e overflow)
 *   DialogOverlay — backdrop semitransparente com blur
 *   DialogClose   — botão/elemento que fecha o modal programaticamente
 *
 * ─────────────────────────────────────────────
 * NOTAS IMPORTANTES:
 * ─────────────────────────────────────────────
 *   — DialogContent NÃO define max-w fixo de propósito.
 *     Cada modal do projeto (ConfirmDialog, ResponseModal, etc.) define
 *     seu próprio max-w-* via className. Um default com sm:max-w-sm causaria
 *     conflito com valores sem prefixo de breakpoint passados de fora.
 *   — showCloseButton (padrão: true em DialogContent, false em DialogFooter)
 *     controla se o botão X aparece automaticamente.
 *
 * ─────────────────────────────────────────────
 * EXEMPLO DE USO:
 * ─────────────────────────────────────────────
 *   <Dialog>
 *     <DialogTrigger asChild><Button>Abrir modal</Button></DialogTrigger>
 *     <DialogContent className="max-w-md">
 *       <DialogHeader>
 *         <DialogTitle>Confirmar ação</DialogTitle>
 *         <DialogDescription>Esta ação não pode ser desfeita.</DialogDescription>
 *       </DialogHeader>
 *       <DialogFooter showCloseButton>
 *         <Button variant="destructive">Confirmar</Button>
 *       </DialogFooter>
 *     </DialogContent>
 *   </Dialog>
 */

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

/* Raiz do Dialog — gerencia o estado aberto/fechado.
 * Props relevantes: open, defaultOpen, onOpenChange, modal */
function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

/* Elemento que dispara a abertura do modal ao ser clicado.
 * Pode envolver qualquer elemento interativo. */
function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

/* Portal — renderiza o conteúdo diretamente no <body> para evitar
 * problemas de z-index e overflow em elementos posicionados. */
function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

/* Fecha o modal quando ativado. Pode envolver qualquer elemento interativo. */
function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

/*
 * Overlay (backdrop) do modal.
 * — fixed inset-0 cobre toda a tela.
 * — bg-black/10 + backdrop-blur-xs cria efeito de desfoque sutil.
 * — data-open/data-closed acionam animações de fade in/out.
 * — isolate garante que o contexto de empilhamento seja isolado.
 */
function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

/*
 * Conteúdo do modal — popup centralizado na tela.
 *
 * Props adicionais:
 *   showCloseButton (padrão: true) — exibe botão X no canto superior direito.
 *
 * Posicionamento: fixed, centralizado via top-1/2 left-1/2 + translate -50%.
 * Largura: ocupa toda a largura menos 2rem de margem (max-w-[calc(100%-2rem)]).
 * Para limitar a largura máxima, passe className="max-w-md" (ou lg, 2xl, etc.).
 *
 * Animações: zoom-in-95 + fade-in ao abrir; zoom-out-95 + fade-out ao fechar.
 */
function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          // Sem sm:max-w-sm fixo aqui de propósito — os modais deste projeto
          // (ConfirmDialog, ResponseModal, StartAnalysisModal, Finance
          // TransactionModal, BuyCreditsModal, CreditManualAdjustmentModal,
          // o de "Solicitar projeto") já definem seu próprio max-w-* via
          // className. Um default com o MESMO prefixo de variante (sm:) não
          // era considerado conflitante pelo tailwind-merge com um
          // max-w-lg/md/2xl sem prefixo passado de fora, então o
          // sm:max-w-sm (384px) sempre vencia em telas ≥640px — todo modal
          // custom ficava mais estreito do que o pedido, sem nenhum aviso.
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        {/* Botão X no canto superior direito — renderizado como Button ghost icon-sm */}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

/* Área do topo do modal — empilha título e descrição com gap-2 */
function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

/*
 * Rodapé do modal — área de ações (botões de confirmar/cancelar).
 *
 * Props adicionais:
 *   showCloseButton (padrão: false) — adiciona botão "Close" automático
 *   como último elemento; útil para diálogos simples de confirmação.
 *
 * Layout: coluna reversa em mobile (botão principal primeiro visualmente),
 * linha com justify-end em desktop (sm:flex-row sm:justify-end).
 * Negativo margin-x/b (-mx-4 -mb-4) + padding p-4 cola o rodapé nas
 * bordas laterais e inferior do DialogContent.
 */
function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {/* Botão de fechar automático no rodapé (opcional) */}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

/*
 * Título semântico do modal.
 * — Vinculado ao Dialog via aria-labelledby automaticamente pelo Base UI.
 * — font-heading garante tipografia de heading consistente com o design system.
 */
function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

/*
 * Descrição/subtítulo do modal.
 * — Vinculado ao Dialog via aria-describedby automaticamente pelo Base UI.
 * — Links dentro da descrição recebem sublinhado automático.
 */
function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
