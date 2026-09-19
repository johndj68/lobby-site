"use client"

/*
 * Checkbox — caixa de seleção acessível com indicador visual de ícone.
 *
 * Construído sobre @base-ui/react/checkbox (substituto do Radix UI Checkbox).
 * O componente é "use client" pois gerencia estado de interação no lado do cliente.
 *
 * Estrutura interna:
 *   CheckboxPrimitive.Root      ← elemento interativo raiz (papel checkbox ARIA)
 *   └── CheckboxPrimitive.Indicator ← wrapper visível somente quando checked
 *       └── CheckIcon               ← ícone de check (lucide-react)
 *
 * Estados visuais (via classes Tailwind condicionais):
 *   — Desmarcado (padrão)   : borda border-input, fundo transparente (dark: bg-input/30)
 *   — Marcado (checked)     : borda + fundo primários (data-checked:border-primary + bg-primary)
 *   — Foco                  : anel focus-visible:ring-3
 *   — Desabilitado          : opacidade 50%, cursor not-allowed
 *   — Inválido (aria-invalid): borda destrutiva + anel vermelho
 *   — Inválido + marcado    : borda volta a primary (aria-invalid:aria-checked:border-primary)
 *
 * Integração com campo de formulário:
 *   — peer: expõe o estado ao Label via peer-disabled (Label pode escurecer quando
 *     o Checkbox está desabilitado).
 *   — group-has-disabled/field:opacity-50: se o Checkbox estiver dentro de um
 *     componente Field desabilitado, ele fica com opacidade reduzida.
 *
 * Área de toque expandida:
 *   — after:absolute after:-inset-x-3 after:-inset-y-2 cria uma área invisível
 *     maior que o checkbox visual, facilitando o clique em dispositivos touch.
 *
 * Props principais (repassadas via ...props para CheckboxPrimitive.Root):
 *   checked        — valor controlado (boolean | 'indeterminate')
 *   defaultChecked — valor inicial não-controlado
 *   onCheckedChange — callback chamado na mudança de estado
 *   disabled       — desabilita o componente
 *   name / value   — para uso em formulários HTML nativos
 *
 * Exemplo de uso:
 *   <Checkbox id="aceitar" onCheckedChange={(v) => setAceito(v)} />
 *   <Label htmlFor="aceitar">Aceito os termos</Label>
 */

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"

import { cn } from "@/lib/utils"
import { CheckIcon } from "lucide-react"

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary",
        className
      )}
      {...props}
    >
      {/*
       * Indicator: visível apenas quando o checkbox está marcado (data-checked).
       * O Base UI controla a visibilidade; não é necessário condicionais em React.
       * [&>svg]:size-3.5 garante tamanho correto do ícone SVG interno.
       */}
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <CheckIcon
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
