"use client"

/*
 * DropdownMenu — menu suspenso contextual com rica variedade de itens.
 *
 * Construído sobre @base-ui/react/menu (Menu do Base UI, substituto do Radix UI
 * DropdownMenu). Gerencia foco, navegação por teclado, posicionamento e
 * acessibilidade automaticamente.
 *
 * ─────────────────────────────────────────────
 * COMPOSIÇÃO TÍPICA:
 * ─────────────────────────────────────────────
 *   <DropdownMenu>
 *     <DropdownMenuTrigger>       ← botão que abre o menu
 *     <DropdownMenuContent>       ← popup com a lista de itens (portal + posicionador)
 *       <DropdownMenuLabel>       ← rótulo de seção (não clicável)
 *       <DropdownMenuGroup>       ← agrupa itens semanticamente
 *         <DropdownMenuItem>      ← item padrão clicável
 *         <DropdownMenuCheckboxItem> ← item com toggle (check à direita)
 *         <DropdownMenuRadioGroup>   ← grupo de itens exclusivos
 *           <DropdownMenuRadioItem> ← item de seleção exclusiva
 *         </DropdownMenuRadioGroup>
 *         <DropdownMenuSub>          ← submenu aninhado
 *           <DropdownMenuSubTrigger> ← trigger do submenu (com seta →)
 *           <DropdownMenuSubContent> ← conteúdo do submenu
 *         </DropdownMenuSub>
 *       </DropdownMenuGroup>
 *       <DropdownMenuSeparator>   ← linha divisória
 *       <DropdownMenuShortcut>    ← texto de atalho teclado (dentro de DropdownMenuItem)
 *     </DropdownMenuContent>
 *   </DropdownMenu>
 *
 * ─────────────────────────────────────────────
 * PROP `inset` (em Label, Item, SubTrigger, CheckboxItem, RadioItem):
 * ─────────────────────────────────────────────
 *   Quando true, adiciona pl-7 ao item para alinhar texto com itens que têm
 *   ícone à esquerda — útil quando alguns itens têm ícone e outros não.
 *
 * ─────────────────────────────────────────────
 * VARIANTE DE ITEM (DropdownMenuItem `variant`):
 * ─────────────────────────────────────────────
 *   "default"     → estilo padrão
 *   "destructive" → texto vermelho; hover com fundo avermelhado
 *
 * ─────────────────────────────────────────────
 * POSICIONAMENTO (DropdownMenuContent):
 * ─────────────────────────────────────────────
 *   Aceita as props: align, alignOffset, side, sideOffset (padrão: bottom/start).
 *   O popup usa MenuPrimitive.Positioner do Base UI para calcular a posição
 *   e inverte automaticamente quando há pouco espaço na tela.
 *
 * ─────────────────────────────────────────────
 * EXEMPLOS DE USO:
 * ─────────────────────────────────────────────
 *   // Menu simples
 *   <DropdownMenu>
 *     <DropdownMenuTrigger asChild><Button>Ações</Button></DropdownMenuTrigger>
 *     <DropdownMenuContent>
 *       <DropdownMenuItem onClick={handleEdit}>Editar</DropdownMenuItem>
 *       <DropdownMenuSeparator />
 *       <DropdownMenuItem variant="destructive" onClick={handleDelete}>
 *         Excluir
 *       </DropdownMenuItem>
 *     </DropdownMenuContent>
 *   </DropdownMenu>
 *
 *   // Item com atalho de teclado
 *   <DropdownMenuItem>
 *     Salvar <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
 *   </DropdownMenuItem>
 */

import * as React from "react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"

import { cn } from "@/lib/utils"
import { ChevronRightIcon, CheckIcon } from "lucide-react"

/* Raiz do DropdownMenu — gerencia estado aberto/fechado.
 * Props relevantes: open, defaultOpen, onOpenChange, modal */
function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

/* Portal — renderiza o menu fora do fluxo normal do DOM (direto no <body>).
 * Necessário para evitar problemas de overflow e z-index. */
function DropdownMenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
  return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
}

/* Elemento que dispara a abertura do menu ao ser clicado.
 * Recebe aria-expanded e aria-haspopup automaticamente. */
function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

/*
 * Popup do menu suspenso — contém todos os itens.
 *
 * Props de posicionamento (repassadas ao MenuPrimitive.Positioner):
 *   align       — alinhamento horizontal relativo ao trigger ("start" | "center" | "end")
 *   alignOffset — offset adicional no eixo de alinhamento (px)
 *   side        — lado de abertura ("top" | "right" | "bottom" | "left")
 *   sideOffset  — espaço entre o trigger e o popup (px, padrão: 4)
 *
 * O conteúdo usa max-h-(--available-height) para não ultrapassar a janela e
 * overflow-y-auto para scroll quando há muitos itens.
 * w-(--anchor-width) faz o popup ter a largura mínima do trigger.
 */
function DropdownMenuContent({
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  className,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<
    MenuPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="isolate z-50 outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn("z-50 max-h-(--available-height) w-(--anchor-width) min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:overflow-hidden data-closed:fade-out-0 data-closed:zoom-out-95", className )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

/* Grupo semântico de itens relacionados (sem visual próprio — apenas semântica) */
function DropdownMenuGroup({ ...props }: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
}

/*
 * Rótulo de seção dentro do menu (não clicável).
 * Props:
 *   inset — se true, adiciona pl-7 para alinhar com itens que têm ícone
 */
function DropdownMenuLabel({
  className,
  inset,
  ...props
}: MenuPrimitive.GroupLabel.Props & {
  inset?: boolean
}) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "px-1.5 py-1 text-xs font-medium text-muted-foreground data-inset:pl-7",
        className
      )}
      {...props}
    />
  )
}

/*
 * Item padrão do menu — clicável, com hover e suporte a ícones.
 *
 * Props:
 *   inset   — alinha texto com itens que têm ícone (adiciona pl-7)
 *   variant — "default" (padrão) ou "destructive" (vermelho)
 *
 * SVGs filhos recebem size-4 automaticamente se não tiverem classe size-*.
 * group/dropdown-menu-item: grupo CSS que permite que DropdownMenuShortcut
 * mude de cor quando o item está em foco.
 */
function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: MenuPrimitive.Item.Props & {
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "group/dropdown-menu-item relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive",
        className
      )}
      {...props}
    />
  )
}

/* Raiz do submenu aninhado */
function DropdownMenuSub({ ...props }: MenuPrimitive.SubmenuRoot.Props) {
  return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />
}

/*
 * Trigger do submenu — item clicável que abre um submenu lateral.
 * — Ícone ChevronRight é adicionado automaticamente à direita.
 * — data-popup-open e data-open mantêm o estilo ativo quando o submenu está aberto.
 */
function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props & {
  inset?: boolean
}) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7 data-popup-open:bg-accent data-popup-open:text-accent-foreground data-open:bg-accent data-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      {/* Seta indicando que há um submenu */}
      <ChevronRightIcon className="ml-auto" />
    </MenuPrimitive.SubmenuTrigger>
  )
}

/*
 * Popup do submenu — posicionado lateralmente (padrão: à direita).
 * Reutiliza DropdownMenuContent com defaults diferentes:
 *   side="right", alignOffset=-3 para alinhar visualmente com o trigger.
 */
function DropdownMenuSubContent({
  align = "start",
  alignOffset = -3,
  side = "right",
  sideOffset = 0,
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuContent>) {
  return (
    <DropdownMenuContent
      data-slot="dropdown-menu-sub-content"
      className={cn("w-auto min-w-[96px] rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", className )}
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  )
}

/*
 * Item com comportamento de checkbox — alterna entre marcado/desmarcado.
 * — O ícone de check fica visível à direita apenas quando checked=true
 *   (controlado via MenuPrimitive.CheckboxItemIndicator).
 * — checked pode ser boolean ou 'indeterminate'.
 */
function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: MenuPrimitive.CheckboxItem.Props & {
  inset?: boolean
}) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      checked={checked}
      {...props}
    >
      {/* Indicador de check posicionado absolutamente à direita */}
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <MenuPrimitive.CheckboxItemIndicator>
          <CheckIcon
          />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  )
}

/* Grupo de RadioItems — garante que apenas um item do grupo seja selecionado.
 * Props: value (controlado), onValueChange (callback) */
function DropdownMenuRadioGroup({ ...props }: MenuPrimitive.RadioGroup.Props) {
  return (
    <MenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  )
}

/*
 * Item de seleção exclusiva dentro de um RadioGroup.
 * — Funciona como radio button: apenas um por grupo pode ser selecionado.
 * — Indicador de check à direita (visível quando este item está selecionado).
 * — value identifica o item; o RadioGroup gerencia qual está ativo.
 */
function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: MenuPrimitive.RadioItem.Props & {
  inset?: boolean
}) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {/* Indicador de seleção posicionado absolutamente à direita */}
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <MenuPrimitive.RadioItemIndicator>
          <CheckIcon
          />
        </MenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  )
}

/* Linha divisória entre grupos de itens (1px horizontal) */
function DropdownMenuSeparator({
  className,
  ...props
}: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

/*
 * Atalho de teclado exibido à direita do item.
 * — ml-auto empurra o texto para a extremidade direita.
 * — tracking-widest espaça as letras para parecer uma tecla de atalho.
 * — Muda de cor quando o item pai (group/dropdown-menu-item) está em foco.
 *
 * Uso: <DropdownMenuItem>Salvar <DropdownMenuShortcut>⌘S</DropdownMenuShortcut></DropdownMenuItem>
 */
function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
