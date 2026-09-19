/*
 * Textarea — campo de texto multilinha estilizado.
 *
 * Wrapper sobre o elemento HTML <textarea> nativo com estilos Tailwind
 * padronizados. Aceita todas as props de um <textarea> HTML nativo.
 *
 * Características visuais:
 *   — Largura total (w-full), altura mínima de 64px (min-h-16)
 *   — Borda border-input com transição de cor suave
 *   — Fundo transparente (dark: bg-input/30 para contraste sutil)
 *   — Sem outline nativo (substituído por anel focus-visible)
 *   — Texto base em mobile (evita zoom automático em iOS), text-sm em desktop
 *
 * Redimensionamento automático:
 *   — field-sizing-content: a textarea cresce verticalmente conforme o usuário
 *     digita, sem necessidade de JavaScript adicional. Recurso CSS moderno
 *     (suportado em Chrome 123+, Firefox 130+, Safari 18+).
 *     A altura mínima (min-h-16) garante um tamanho inicial razoável.
 *
 * Estados:
 *   — Foco         : border-ring + ring-3 (anel azul acessível)
 *   — Desabilitado : bg-input/50, opacity-50, cursor-not-allowed
 *                    (dark: bg-input/80)
 *   — Inválido     : border-destructive + ring vermelho (aria-invalid=true)
 *                    (dark: borda/anel com opacidade reduzida)
 *   — Placeholder  : text-muted-foreground (cinza)
 *
 * Props principais (todas as props de <textarea> são aceitas):
 *   placeholder  — texto de dica quando vazio
 *   disabled     — desabilita o campo
 *   rows         — número de linhas visíveis (sobrescrito por field-sizing-content)
 *   aria-invalid — marca como inválido (integração com formulários)
 *   ...props     — onChange, onBlur, value, defaultValue, ref, etc.
 *
 * Exemplos de uso:
 *   <Textarea placeholder="Descreva o projeto..." />
 *
 *   // Em formulário com validação
 *   <Textarea
 *     aria-invalid={!!errors.descricao}
 *     {...register("descricao")}
 *   />
 *
 *   // Altura mínima maior
 *   <Textarea className="min-h-32" placeholder="Mensagem longa..." />
 */

import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // field-sizing-content: cresce automaticamente conforme o conteúdo
        // min-h-16: altura mínima de 64px (4 × 16px)
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
