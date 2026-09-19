"use client"

/*
 * Separator — linha divisória horizontal ou vertical.
 *
 * Construído sobre @base-ui/react/separator, que fornece o atributo
 * role="separator" e aria-orientation automaticamente para acessibilidade.
 *
 * Orientações disponíveis (prop `orientation`):
 *   "horizontal" (padrão) → linha horizontal: h-px, w-full
 *   "vertical"            → linha vertical  : w-px, self-stretch
 *
 * A orientação é aplicada via data-horizontal / data-vertical que o
 * primitivo do Base UI adiciona ao elemento, permitindo a distinção
 * por seletores Tailwind sem lógica condicional em React.
 *
 * shrink-0: impede que o separador seja comprimido em layouts flex/grid.
 * bg-border: usa a cor de borda do tema (ajusta em modo escuro automaticamente).
 *
 * Exemplos de uso:
 *   // Separador horizontal (padrão)
 *   <Separator />
 *
 *   // Separador vertical (em layouts flex row)
 *   <div className="flex items-center gap-2">
 *     <span>Item 1</span>
 *     <Separator orientation="vertical" />
 *     <span>Item 2</span>
 *   </div>
 *
 *   // Com classe extra para espaçamento
 *   <Separator className="my-4" />
 */

import { Separator as SeparatorPrimitive } from "@base-ui/react/separator"

import { cn } from "@/lib/utils"

function Separator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        // shrink-0: não comprime em flex; bg-border: cor de borda do tema
        // data-horizontal: aplica h-px w-full (linha horizontal)
        // data-vertical: aplica w-px self-stretch (linha vertical, altura = pai)
        "shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch",
        className
      )}
      {...props}
    />
  )
}

export { Separator }
