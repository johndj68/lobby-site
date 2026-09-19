/*
 * Input — campo de entrada de texto estilizado.
 *
 * Wrapper fino sobre @base-ui/react/input (primitivo acessível) que aplica
 * estilos Tailwind padronizados. Aceita todas as props de um <input> HTML nativo.
 *
 * Características visuais:
 *   — Altura fixa h-8, largura total w-full
 *   — Borda border-input com transição de cor
 *   — Fundo transparente (dark: bg-input/30 para contraste sutil)
 *   — Sem outline nativo (substituído por anel focus-visible)
 *
 * Estados:
 *   — Foco         : border-ring + ring-3 (anel azul acessível)
 *   — Desabilitado : bg-input/50, opacity-50, cursor-not-allowed, sem cliques
 *                    (dark: bg-input/80)
 *   — Inválido     : border-destructive + ring vermelho (aria-invalid=true)
 *                    (dark: borda/anel com opacidade reduzida)
 *   — Placeholder  : text-muted-foreground (cinza)
 *
 * Suporte a input de arquivo (type="file"):
 *   — Botão nativo estilizado: file:inline-flex, file:bg-transparent,
 *     file:text-sm, file:font-medium, file:text-foreground
 *
 * Responsividade de texto:
 *   — text-base em mobile (evita zoom automático em iOS)
 *   — md:text-sm em telas maiores
 *
 * Props principais (todas as props de <input> são aceitas):
 *   type        — "text" | "email" | "password" | "number" | "file" | etc.
 *   placeholder — texto de dica
 *   disabled    — desabilita o campo
 *   aria-invalid — marca o campo como inválido (integração com formulários)
 *   ...props    — onChange, onBlur, value, defaultValue, ref, etc.
 *
 * Exemplo de uso:
 *   <Input type="email" placeholder="seu@email.com" />
 *   <Input type="text" aria-invalid={!!errors.nome} />
 */

import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
