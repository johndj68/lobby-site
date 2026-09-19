"use client"

/*
 * Label — rótulo acessível para campos de formulário.
 *
 * Wrapper sobre o elemento HTML <label> nativo com estilos padronizados.
 * "use client" porque depende de leitura de estado do DOM (peer/group).
 *
 * Deve ser associado ao campo através do atributo `htmlFor` (aponta para o `id`
 * do campo) ou envolvendo o campo como filho direto.
 *
 * Características visuais:
 *   — flex items-center gap-2: alinha ícones/badges no mesmo nível do texto
 *   — text-sm font-medium: tipografia de rótulo padrão
 *   — leading-none: evita espaçamento vertical extra
 *   — select-none: impede seleção acidental do texto ao clicar
 *
 * Integração com estado do campo (Tailwind peer/group):
 *   — peer-disabled: quando o campo irmão (com classe `peer`) está desabilitado,
 *     o Label aplica cursor-not-allowed + opacity-50 automaticamente.
 *   — group-data-[disabled=true]: quando o Label está dentro de um componente
 *     Field/FormField desabilitado, também fica inacessível visualmente
 *     (pointer-events-none + opacity-50).
 *
 * Props: todas as props nativas de <label> (htmlFor, className, etc.)
 *
 * Exemplo de uso:
 *   // Associação via htmlFor
 *   <Label htmlFor="email">Endereço de e-mail</Label>
 *   <Input id="email" type="email" />
 *
 *   // Envolvendo o campo
 *   <Label>
 *     <Checkbox /> Aceito os termos de uso
 *   </Label>
 *
 *   // Com ícone à esquerda
 *   <Label><MailIcon className="size-3.5" /> E-mail</Label>
 */

import * as React from "react"

import { cn } from "@/lib/utils"

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
