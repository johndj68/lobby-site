/*
 * Badge — etiqueta inline de status, categoria ou destaque.
 *
 * Implementado com `cva` (class-variance-authority) para variantes de estilo
 * e `useRender` do Base UI para renderização polimórfica (pode se tornar
 * qualquer elemento HTML via a prop `render`).
 *
 * Variantes disponíveis (prop `variant`):
 *   "default"     → fundo primário (azul/cor principal)         ← padrão
 *   "secondary"   → fundo secundário (cinza neutro)
 *   "destructive" → fundo avermelhado, texto vermelho (erros/alertas)
 *   "outline"     → apenas borda, sem fundo (versão sutil)
 *   "ghost"       → sem borda/fundo, realce apenas no hover
 *   "link"        → aparência de link com sublinhado no hover
 *
 * Renderização polimórfica (via prop `render`):
 *   Por padrão renderiza como <span>. Para tornar clicável como link:
 *   <Badge render={<a href="/categoria/tech" />}>Tech</Badge>
 *   Quando renderizado como <a>, :hover aplica opacidade ao fundo.
 *
 * Exemplo de uso:
 *   <Badge>Novo</Badge>
 *   <Badge variant="destructive">Erro</Badge>
 *   <Badge variant="outline" render={<a href="/tags/react" />}>React</Badge>
 *
 * Notas de acessibilidade:
 *   — aria-invalid:border-destructive muda a borda automaticamente em contextos
 *     de formulário inválido.
 *   — data-[icon=inline-start/end] ajusta padding lateral quando há ícones SVG.
 */

import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/*
 * Definição de variantes via cva.
 * A string base define estilos comuns a todas as variantes:
 *   - altura fixa h-5, texto xs, font-medium
 *   - overflow-hidden para impedir que conteúdo longo quebre o layout
 *   - anel de foco acessível (focus-visible:ring)
 *   - ícones SVG com tamanho forçado de 3 (size-3!)
 */
const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        // Fundo na cor primária do tema
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        // Fundo secundário/neutro
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        // Indicação de erro ou ação perigosa — fundo vermelho translúcido
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        // Apenas borda — sem fundo preenchido
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        // Sem borda nem fundo — realce só no hover
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        // Aparência de hyperlink — sem caixa, só texto e sublinhado
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

/*
 * Componente Badge.
 *
 * Props:
 *   className  — classes extras para sobrescrever/complementar o estilo
 *   variant    — variante visual (ver badgeVariants acima)
 *   render     — elemento React alternativo para renderização polimórfica
 *                ex: render={<a href="..." />} ou render={<button />}
 *   ...props   — demais props do elemento renderizado (span por padrão)
 *
 * useRender() do Base UI faz o merge de props e decide qual tag usar,
 * permitindo que o Badge se comporte como <span>, <a>, <button>, etc.
 * mantendo os mesmos estilos e acessibilidade.
 */
function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    // state.slot é usado para identificação por outros componentes Base UI
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
