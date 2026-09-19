/*
 * Card — contêiner de conteúdo com estrutura padronizada.
 *
 * Composto por 7 subcomponentes que devem ser aninhados na ordem desejada:
 *
 *   Card             ← raiz com borda, sombra e fundo
 *   ├── CardHeader   ← área do topo (título + descrição + ação opcional)
 *   │   ├── CardTitle       ← título principal do card
 *   │   ├── CardDescription ← subtítulo/texto de apoio em cinza
 *   │   └── CardAction      ← elemento de ação posicionado à direita do header (botão, badge)
 *   ├── CardContent  ← corpo principal — conteúdo livre
 *   └── CardFooter   ← rodapé com fundo diferenciado e borda superior
 *
 * Tamanhos disponíveis (prop `size` em Card):
 *   "default" → gap-4, py-4, padding horizontal px-4    ← padrão
 *   "sm"      → gap-3, py-3, padding horizontal px-3
 *
 * O tamanho é propagado como data-size no elemento raiz e lido pelos filhos
 * via seletores group-data-[size=sm]/card.
 *
 * Comportamentos automáticos:
 *   — Imagem como PRIMEIRO filho: remove padding-top (has-[>img:first-child]:pt-0)
 *     e arredonda o topo da imagem (*:[img:first-child]:rounded-t-xl).
 *   — Imagem como ÚLTIMO filho: arredonda o fundo da imagem.
 *   — CardFooter remove padding-bottom do Card (has-data-[slot=card-footer]:pb-0).
 *
 * Exemplo de uso:
 *   <Card>
 *     <CardHeader>
 *       <CardTitle>Relatório Mensal</CardTitle>
 *       <CardDescription>Dados de julho de 2026</CardDescription>
 *       <CardAction><Button size="icon-sm"><MoreHorizontalIcon /></Button></CardAction>
 *     </CardHeader>
 *     <CardContent>
 *       <p>Conteúdo principal aqui.</p>
 *     </CardContent>
 *     <CardFooter>
 *       <Button variant="outline">Ver detalhes</Button>
 *     </CardFooter>
 *   </Card>
 */

import * as React from "react"

import { cn } from "@/lib/utils"

/*
 * Raiz do card.
 * — ring-1 ring-foreground/10 cria uma borda sutil sem usar border para
 *   evitar conflito de cor em temas escuros.
 * — group/card expõe o data-size para descendentes via group-data-*.
 * — overflow-hidden garante que imagens e conteúdo não ultrapassem os cantos arredondados.
 */
function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-4 overflow-hidden rounded-xl bg-card py-4 text-sm text-card-foreground ring-1 ring-foreground/10 has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:gap-3 data-[size=sm]:py-3 data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        className
      )}
      {...props}
    />
  )
}

/*
 * Cabeçalho do card — área superior com grid para acomodar título, descrição e ação.
 *
 * Grid automático:
 *   — Quando há CardAction: grid-cols-[1fr_auto] → título/descrição à esquerda,
 *     ação à direita (has-data-[slot=card-action]).
 *   — Quando há CardDescription: grid-rows-[auto_auto] → duas linhas.
 *   — @container/card-header permite queries de container para responsividade interna.
 */
function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-4 group-data-[size=sm]/card:px-3 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-4 group-data-[size=sm]/card:[.border-b]:pb-3",
        className
      )}
      {...props}
    />
  )
}

/* Título principal do card — font-heading, peso medium, tamanho base */
function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props}
    />
  )
}

/* Texto de suporte abaixo do título — text-muted-foreground (cinza) */
function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

/*
 * Elemento de ação alinhado à direita do header.
 * — col-start-2 + row-span-2: ocupa a coluna direita do grid do CardHeader,
 *   cobrindo as duas linhas (título e descrição) para centralização vertical.
 * — Tipicamente contém um Button de ícone ou um DropdownMenu.
 */
function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

/* Corpo principal do card — apenas adiciona padding horizontal consistente */
function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-4 group-data-[size=sm]/card:px-3", className)}
      {...props}
    />
  )
}

/*
 * Rodapé do card.
 * — Fundo bg-muted/50 e borda-t diferenciam visualmente o rodapé do corpo.
 * — rounded-b-xl garante que as bordas inferiores fiquem arredondadas.
 * — O Card remove seu próprio pb quando detecta um CardFooter filho
 *   (has-data-[slot=card-footer]:pb-0) para evitar duplo espaçamento.
 */
function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl border-t bg-muted/50 p-4 group-data-[size=sm]/card:p-3",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
