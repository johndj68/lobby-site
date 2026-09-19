/*
 * Button — botão interativo com múltiplas variantes visuais e tamanhos.
 *
 * Construído sobre @base-ui/react/button (primitivo acessível) e `cva`
 * (class-variance-authority) para compor as classes Tailwind das variantes.
 *
 * ─────────────────────────────────────────────
 * VARIANTES (prop `variant`):
 * ─────────────────────────────────────────────
 *   "default"     → fundo primário sólido (azul)                      ← padrão
 *   "outline"     → borda visível, fundo transparente; hover cinza
 *   "secondary"   → fundo secundário (cinza); hover mais escuro
 *   "ghost"       → sem borda/fundo; hover cinza sutil
 *   "destructive" → fundo vermelho translúcido; texto vermelho (ações perigosas)
 *   "link"        → aparência de link; sem caixa, sublinhado no hover
 *
 * ─────────────────────────────────────────────
 * TAMANHOS (prop `size`):
 * ─────────────────────────────────────────────
 *   "default"  → h-8, padding horizontal moderado               ← padrão
 *   "xs"       → h-6, texto xs, bordas mais arredondadas
 *   "sm"       → h-7, texto 0.8rem
 *   "lg"       → h-9, mesmo padding que default mas maior
 *   "icon"     → quadrado 32 px — para botões com apenas ícone
 *   "icon-xs"  → quadrado 24 px
 *   "icon-sm"  → quadrado 28 px
 *   "icon-lg"  → quadrado 36 px
 *
 * ─────────────────────────────────────────────
 * COMPORTAMENTOS AUTOMÁTICOS:
 * ─────────────────────────────────────────────
 *   — disabled:opacity-50 + pointer-events-none: botão desabilitado fica
 *     visualmente apagado e não responde a cliques.
 *   — active:translate-y-px: leve deslocamento ao clicar (exceto em botões
 *     com aria-haspopup, como menus).
 *   — aria-invalid: borda e anel vermelho em contextos de formulário inválido.
 *   — has-data-[icon=inline-start/end]: ajusta padding lateral quando há ícone
 *     decorativo dentro do botão.
 *   — SVGs filhos sem classe size-* recebem size-4 automaticamente.
 *
 * ─────────────────────────────────────────────
 * EXEMPLOS DE USO:
 * ─────────────────────────────────────────────
 *   <Button>Salvar</Button>
 *   <Button variant="destructive">Excluir conta</Button>
 *   <Button variant="outline" size="sm">Cancelar</Button>
 *   <Button size="icon"><TrashIcon /></Button>
 *   <Button variant="ghost" size="icon-sm"><MoreHorizontalIcon /></Button>
 *
 * O componente exporta também `buttonVariants` para uso em outros elementos
 * que precisem das mesmas classes sem renderizar um <button>:
 *   <Link className={buttonVariants({ variant: "outline" })} href="/...">
 */

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/*
 * Definição de variantes e tamanhos via cva.
 * A string base define estilos comuns:
 *   - inline-flex com alinhamento central
 *   - rounded-lg, transição suave, sem outline nativo
 *   - select-none: impede seleção de texto ao clicar rápido
 *   - anel de foco acessível (focus-visible:ring-3)
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Ação principal — fundo sólido na cor primária
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        // Ação secundária — borda visível, fundo transparente
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        // Alternativa ao default — fundo cinza/secundário
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        // Mínimo visual — sem caixa, apenas hover cinza sutil
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        // Ação destrutiva (deletar, revogar) — vermelho translúcido
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        // Parece um link de texto — sem caixa, sublinhado no hover
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // Tamanho padrão — h-8 com padding horizontal
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        // Extra pequeno — h-6, bordas compactas
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        // Pequeno — h-7
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        // Grande — h-9
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        // Quadrado 32px — somente ícone
        icon: "size-8",
        // Quadrado 24px — ícone extra pequeno
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        // Quadrado 28px — ícone pequeno
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        // Quadrado 36px — ícone grande
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/*
 * Componente Button.
 *
 * Props:
 *   className — classes extras Tailwind para sobrescrita pontual
 *   variant   — estilo visual (ver lista acima)
 *   size      — tamanho do botão (ver lista acima)
 *   ...props  — todas as props nativas de ButtonPrimitive (onClick, disabled,
 *               type, aria-*, etc.) são repassadas diretamente
 *
 * O ButtonPrimitive do Base UI garante:
 *   - Papel semântico correto (role="button")
 *   - Suporte a keyboard (Enter/Space)
 *   - Propagação correta de disabled e aria-disabled
 */
function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
