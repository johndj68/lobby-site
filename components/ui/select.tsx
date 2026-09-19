"use client"

/*
 * Select — dropdown de seleção acessível com suporte a grupos, scroll e posicionamento.
 *
 * Construído sobre @base-ui/react/select (substituto do Radix UI Select).
 * Gerencia foco, navegação por teclado (setas, Home, End, digitação), ARIA
 * e posicionamento do popup automaticamente.
 *
 * ─────────────────────────────────────────────
 * COMPOSIÇÃO:
 * ─────────────────────────────────────────────
 *   <Select>                       ← raiz (estado da seleção)
 *     <SelectTrigger>              ← botão que exibe o valor atual e abre o popup
 *       <SelectValue />            ← placeholder/valor selecionado exibido no trigger
 *     </SelectTrigger>
 *     <SelectContent>              ← popup com a lista (portal + posicionador)
 *       <SelectGroup>              ← agrupa itens com label opcional
 *         <SelectLabel>            ← rótulo do grupo (não selecionável)
 *         <SelectItem value="x">  ← opção selecionável (check ao ser selecionada)
 *         <SelectSeparator />      ← linha divisória entre grupos
 *       </SelectGroup>
 *     </SelectContent>
 *   </Select>
 *
 * ─────────────────────────────────────────────
 * TAMANHOS DO TRIGGER (prop `size` em SelectTrigger):
 * ─────────────────────────────────────────────
 *   "default" → h-8, rounded-lg              ← padrão
 *   "sm"      → h-7, rounded-[min(radius,10px)]
 *
 * ─────────────────────────────────────────────
 * POSICIONAMENTO DO POPUP (props de SelectContent):
 * ─────────────────────────────────────────────
 *   side                — "bottom" | "top" | "left" | "right" (padrão: "bottom")
 *   sideOffset          — espaço entre trigger e popup em px (padrão: 4)
 *   align               — "start" | "center" | "end" (padrão: "center")
 *   alignOffset         — offset adicional no eixo de alinhamento
 *   alignItemWithTrigger— se true (padrão), o item selecionado fica alinhado ao trigger;
 *                         desabilita animação de entrada quando ativo.
 *
 * ─────────────────────────────────────────────
 * SCROLL DO POPUP:
 * ─────────────────────────────────────────────
 *   SelectScrollUpButton e SelectScrollDownButton aparecem automaticamente
 *   quando há itens fora da área visível do popup (max-h limitado).
 *   São inseridos internamente por SelectContent.
 *
 * ─────────────────────────────────────────────
 * ESTADO DO ITEM (SelectItem):
 * ─────────────────────────────────────────────
 *   — Quando selecionado, exibe CheckIcon à direita (via SelectPrimitive.ItemIndicator).
 *   — focus:bg-accent + focus:text-accent-foreground no hover/foco por teclado.
 *   — data-disabled: item desabilitado (pointer-events-none + opacity-50).
 *
 * ─────────────────────────────────────────────
 * EXEMPLO DE USO:
 * ─────────────────────────────────────────────
 *   <Select defaultValue="br">
 *     <SelectTrigger className="w-40">
 *       <SelectValue placeholder="Selecione um país" />
 *     </SelectTrigger>
 *     <SelectContent>
 *       <SelectItem value="br">Brasil</SelectItem>
 *       <SelectItem value="us">Estados Unidos</SelectItem>
 *       <SelectSeparator />
 *       <SelectGroup>
 *         <SelectLabel>América do Sul</SelectLabel>
 *         <SelectItem value="ar">Argentina</SelectItem>
 *       </SelectGroup>
 *     </SelectContent>
 *   </Select>
 */

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"

import { cn } from "@/lib/utils"
import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from "lucide-react"

/*
 * Raiz do Select — re-exporta SelectPrimitive.Root diretamente.
 * Props relevantes: value, defaultValue, onValueChange, disabled, name
 */
const Select = SelectPrimitive.Root

/*
 * Grupo de itens — wrapper semântico com scroll-my-1 e padding interno.
 * Deve ser usado com SelectLabel para rotular o grupo.
 */
function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1 p-1", className)}
      {...props}
    />
  )
}

/*
 * Exibe o valor atualmente selecionado dentro do SelectTrigger.
 * — Quando nenhum valor está selecionado, exibe a prop `placeholder`.
 * — flex-1 + text-left alinha o texto à esquerda dentro do trigger.
 */
function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("flex flex-1 text-left", className)}
      {...props}
    />
  )
}

/*
 * Botão que exibe o valor atual e abre o popup ao ser clicado.
 *
 * Props:
 *   size — "default" (h-8) | "sm" (h-7)
 *
 * — ChevronDownIcon é adicionado automaticamente à direita.
 * — data-placeholder:text-muted-foreground: estilo do placeholder quando sem seleção.
 * — w-fit: largura se ajusta ao conteúdo (pode ser sobrescrita com className="w-full").
 * — SVGs filhos recebem size-4 automaticamente.
 */
function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      {/* Ícone de seta para baixo — indica que é um dropdown */}
      <SelectPrimitive.Icon
        render={
          <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
        }
      />
    </SelectPrimitive.Trigger>
  )
}

/*
 * Popup do Select — renderizado via portal com posicionador automático.
 *
 * Inclui internamente:
 *   SelectScrollUpButton   — botão de scroll para cima (aparece quando necessário)
 *   SelectPrimitive.List   — lista de itens (children)
 *   SelectScrollDownButton — botão de scroll para baixo (aparece quando necessário)
 *
 * max-h-(--available-height): limita a altura ao espaço disponível na tela.
 * w-(--anchor-width): popup tem a mesma largura mínima do trigger.
 */
function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  alignItemWithTrigger = true,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
  >) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={cn("relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", className )}
          {...props}
        >
          {/* Botão de scroll para cima — visível quando há itens acima */}
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          {/* Botão de scroll para baixo — visível quando há itens abaixo */}
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

/* Rótulo de grupo dentro do Select — texto pequeno em cinza, não selecionável */
function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("px-1.5 py-1 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

/*
 * Item selecionável do Select.
 *
 * — value (obrigatório): valor passado ao onValueChange quando selecionado.
 * — Quando selecionado, exibe CheckIcon absolutamente posicionado à direita.
 * — ItemText: texto visível + exibido no trigger após seleção (flex-1 shrink-0).
 * — ItemIndicator: visível apenas quando este item está selecionado.
 * — Suporta ícones e textos compostos como children.
 */
function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      {...props}
    >
      {/* Texto do item — também é o texto exibido no trigger após seleção */}
      <SelectPrimitive.ItemText className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      {/* Indicador de seleção (CheckIcon) — absoluto à direita, visível só quando selecionado */}
      <SelectPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
        }
      >
        <CheckIcon className="pointer-events-none" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

/* Linha divisória entre grupos de itens */
function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

/*
 * Botão de scroll para cima — aparece automaticamente quando há conteúdo
 * acima da área visível do popup (sticky no topo do popup).
 */
function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "top-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronUpIcon
      />
    </SelectPrimitive.ScrollUpArrow>
  )
}

/*
 * Botão de scroll para baixo — aparece automaticamente quando há conteúdo
 * abaixo da área visível do popup (sticky no rodapé do popup).
 */
function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronDownIcon
      />
    </SelectPrimitive.ScrollDownArrow>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
