"use client"

/*
 * Sheet — painel lateral deslizante (drawer/side panel).
 *
 * Construído sobre @base-ui/react/dialog (o mesmo primitivo do Dialog, mas
 * usado para criar painéis laterais em vez de modais centralizados).
 * Gerencia foco, scroll lock, aria-modal e tecla Escape automaticamente.
 *
 * ─────────────────────────────────────────────
 * COMPOSIÇÃO:
 * ─────────────────────────────────────────────
 *   <Sheet>                        ← raiz (estado aberto/fechado)
 *     <SheetTrigger>               ← elemento que abre o painel ao ser clicado
 *     <SheetContent side="right">  ← painel deslizante (com overlay)
 *       <SheetHeader>              ← área do topo com título e descrição
 *         <SheetTitle>             ← título semântico (aria-labelledby)
 *         <SheetDescription>      ← subtítulo/texto de apoio
 *       </SheetHeader>
 *       ... conteúdo livre ...
 *       <SheetFooter>              ← área de ações na base do painel
 *     </SheetContent>
 *   </Sheet>
 *
 * ─────────────────────────────────────────────
 * POSIÇÕES (prop `side` em SheetContent):
 * ─────────────────────────────────────────────
 *   "right"  (padrão) → desliza da direita; w-3/4, sm:max-w-sm
 *   "left"            → desliza da esquerda; w-3/4, sm:max-w-sm
 *   "top"             → desliza de cima; h-auto, largura total
 *   "bottom"          → desliza de baixo; h-auto, largura total
 *
 * As animações de entrada/saída usam translate baseado no `side`:
 *   right/left → translateX; top/bottom → translateY
 *   (via data-starting-style / data-ending-style do Base UI)
 *
 * ─────────────────────────────────────────────
 * BOTÃO DE FECHAR:
 * ─────────────────────────────────────────────
 *   showCloseButton (padrão: true) — exibe botão X no canto superior direito.
 *   Para remover, passe showCloseButton={false} e use SheetClose manualmente.
 *
 * ─────────────────────────────────────────────
 * OVERLAY:
 * ─────────────────────────────────────────────
 *   SheetOverlay — backdrop semitransparente com fade in/out.
 *   Exibido automaticamente dentro de SheetContent.
 *   data-starting-style / data-ending-style controlam opacity 0 na animação.
 *
 * ─────────────────────────────────────────────
 * EXEMPLO DE USO:
 * ─────────────────────────────────────────────
 *   <Sheet>
 *     <SheetTrigger asChild>
 *       <Button variant="outline">Abrir filtros</Button>
 *     </SheetTrigger>
 *     <SheetContent side="right">
 *       <SheetHeader>
 *         <SheetTitle>Filtros</SheetTitle>
 *         <SheetDescription>Refine sua busca</SheetDescription>
 *       </SheetHeader>
 *       <div className="p-4">... filtros ...</div>
 *       <SheetFooter>
 *         <SheetClose asChild>
 *           <Button variant="outline">Fechar</Button>
 *         </SheetClose>
 *         <Button>Aplicar</Button>
 *       </SheetFooter>
 *     </SheetContent>
 *   </Sheet>
 */

import * as React from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

/* Raiz do Sheet — gerencia o estado aberto/fechado.
 * Props: open, defaultOpen, onOpenChange, modal */
function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

/* Elemento que dispara a abertura do painel ao ser clicado */
function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

/* Fecha o painel quando ativado — pode envolver qualquer elemento interativo */
function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

/* Portal — renderiza o painel no <body> para evitar problemas de z-index */
function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

/*
 * Overlay (backdrop) do Sheet.
 * — Fade in/out controlado via data-starting-style/data-ending-style.
 * — backdrop-blur-xs aplica desfoque sutil em navegadores que suportam.
 * — bg-black/10: escurecimento leve do fundo sem bloquear a visão.
 */
function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/10 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs",
        className
      )}
      {...props}
    />
  )
}

/*
 * Conteúdo do painel lateral.
 *
 * Props adicionais:
 *   side            — posição do painel: "right" | "left" | "top" | "bottom"
 *   showCloseButton — exibe botão X automático (padrão: true)
 *
 * Cada posição define:
 *   right/left → inset-y-0, h-full, w-3/4, sm:max-w-sm + borda lateral
 *   top/bottom → inset-x-0, h-auto + borda horizontal
 *
 * As animações usam translate no eixo correto baseado no side:
 *   data-starting-style / data-ending-style definem translate de 2.5rem
 *   na direção de origem do painel.
 */
function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-ending-style:opacity-0 data-starting-style:opacity-0 data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=bottom]:data-ending-style:translate-y-[2.5rem] data-[side=bottom]:data-starting-style:translate-y-[2.5rem] data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:data-ending-style:translate-x-[-2.5rem] data-[side=left]:data-starting-style:translate-x-[-2.5rem] data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=right]:data-ending-style:translate-x-[2.5rem] data-[side=right]:data-starting-style:translate-x-[2.5rem] data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=top]:data-ending-style:translate-y-[-2.5rem] data-[side=top]:data-starting-style:translate-y-[-2.5rem] data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm",
          className
        )}
        {...props}
      >
        {children}
        {/* Botão X posicionado absolutamente no canto superior direito */}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-3 right-3"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  )
}

/* Cabeçalho do painel — empilha título e descrição com padding e gap */
function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  )
}

/*
 * Rodapé do painel — área de ações na parte inferior.
 * — mt-auto empurra o rodapé para o fundo do painel (flexbox fill).
 * — flex-col + gap-2 organiza os botões em coluna com espaçamento.
 */
function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

/*
 * Título semântico do painel.
 * — Vinculado ao Sheet via aria-labelledby automaticamente pelo Base UI.
 * — font-heading garante tipografia de heading consistente.
 */
function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-base font-medium text-foreground",
        className
      )}
      {...props}
    />
  )
}

/*
 * Descrição/subtítulo do painel.
 * — Vinculado ao Sheet via aria-describedby automaticamente pelo Base UI.
 */
function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
