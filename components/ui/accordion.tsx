/*
 * Accordion — seções colapsáveis empilhadas verticalmente.
 *
 * Construído sobre @base-ui/react/accordion (substituto do Radix UI Accordion).
 * Exporta 4 subcomponentes que devem ser compostos em ordem:
 *
 *   <Accordion>            ← raiz; controla modo single/multiple e valor aberto
 *     <AccordionItem>      ← um item (seção) individual
 *       <AccordionTrigger> ← cabeçalho clicável com ícone de seta
 *       <AccordionContent> ← corpo colapsável com animação
 *     </AccordionItem>
 *   </Accordion>
 *
 * Exemplo de uso:
 *   <Accordion>
 *     <AccordionItem value="faq-1">
 *       <AccordionTrigger>Pergunta 1</AccordionTrigger>
 *       <AccordionContent>Resposta 1</AccordionContent>
 *     </AccordionItem>
 *   </Accordion>
 *
 * Props relevantes de AccordionPrimitive.Root (repassadas via ...props):
 *   - value / defaultValue : item(s) aberto(s) (controlado/não-controlado)
 *   - onValueChange        : callback quando a seleção muda
 *   - openMultiple         : se true, permite múltiplos itens abertos ao mesmo tempo
 */

import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion"

import { cn } from "@/lib/utils"
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react"

/* Raiz do accordion — renderiza um flex-col que empilha os AccordionItems */
function Accordion({ className, ...props }: AccordionPrimitive.Root.Props) {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      className={cn("flex w-full flex-col", className)}
      {...props}
    />
  )
}

/*
 * Um item individual do accordion.
 * Adiciona borda inferior em todos os itens exceto o último (not-last:border-b).
 * Deve receber a prop `value` (string) que identifica o item para abertura controlada.
 */
function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("not-last:border-b", className)}
      {...props}
    />
  )
}

/*
 * Cabeçalho clicável do item.
 *
 * — Ícone de seta: usa ChevronDownIcon quando fechado e ChevronUpIcon quando
 *   aberto. A troca é feita com group-aria-expanded via Tailwind:
 *     • ChevronDown: visível por padrão, oculto quando aria-expanded=true
 *     • ChevronUp  : oculto por padrão, visível quando aria-expanded=true
 *
 * — O wrapper AccordionPrimitive.Header garante a semântica de heading para
 *   leitores de tela.
 *
 * — focus-visible mostra anel de foco acessível; aria-disabled bloqueia
 *   interação sem remover o elemento do DOM.
 */
function AccordionTrigger({
  className,
  children,
  ...props
}: AccordionPrimitive.Trigger.Props) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "group/accordion-trigger relative flex flex-1 items-start justify-between rounded-lg border border-transparent py-2.5 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:after:border-ring aria-disabled:pointer-events-none aria-disabled:opacity-50 **:data-[slot=accordion-trigger-icon]:ml-auto **:data-[slot=accordion-trigger-icon]:size-4 **:data-[slot=accordion-trigger-icon]:text-muted-foreground",
          className
        )}
        {...props}
      >
        {children}
        {/* Ícone exibido quando o item está FECHADO */}
        <ChevronDownIcon data-slot="accordion-trigger-icon" className="pointer-events-none shrink-0 group-aria-expanded/accordion-trigger:hidden" />
        {/* Ícone exibido quando o item está ABERTO (aria-expanded=true) */}
        <ChevronUpIcon data-slot="accordion-trigger-icon" className="pointer-events-none hidden shrink-0 group-aria-expanded/accordion-trigger:inline" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

/*
 * Corpo colapsável do item.
 *
 * — AccordionPrimitive.Panel controla visibilidade via data-open/data-closed.
 * — As classes animate-accordion-down / animate-accordion-up devem estar
 *   definidas no tailwind.config (keyframes de height 0 → var(--accordion-panel-height)).
 * — O div interno usa h-(--accordion-panel-height) com data-starting-style/
 *   data-ending-style:h-0 para a transição suave de altura.
 * — Links dentro do conteúdo recebem sublinhado automático via [&_a]:underline.
 * — Parágrafos não-finais recebem margin-bottom via [&_p:not(:last-child)]:mb-4.
 */
function AccordionContent({
  className,
  children,
  ...props
}: AccordionPrimitive.Panel.Props) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className="overflow-hidden text-sm data-open:animate-accordion-down data-closed:animate-accordion-up"
      {...props}
    >
      <div
        className={cn(
          "h-(--accordion-panel-height) pt-0 pb-2.5 data-ending-style:h-0 data-starting-style:h-0 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
          className
        )}
      >
        {children}
      </div>
    </AccordionPrimitive.Panel>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
