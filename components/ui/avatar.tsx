"use client"

/*
 * Avatar — exibe imagem de perfil circular com fallback de iniciais/ícone.
 *
 * Construído sobre @base-ui/react/avatar. Exporta 6 subcomponentes:
 *
 *   Avatar         ← contêiner raiz (define tamanho e borda circular)
 *   AvatarImage    ← imagem; quando falha no carregamento, mostra AvatarFallback
 *   AvatarFallback ← conteúdo alternativo (iniciais, ícone, etc.)
 *   AvatarBadge    ← indicador de status sobreposto no canto inferior direito
 *   AvatarGroup    ← agrupa vários Avatars com sobreposição (stack)
 *   AvatarGroupCount ← indicador "+N" ao final de um AvatarGroup
 *
 * Tamanhos disponíveis (prop `size` em Avatar):
 *   "sm"      → 24 px  (size-6)
 *   "default" → 32 px  (size-8)  ← padrão
 *   "lg"      → 40 px  (size-10)
 *
 * O tamanho é propagado via data-size no elemento raiz e lido pelos filhos
 * através de seletores CSS (group-data-[size=*]/avatar:...).
 *
 * Exemplo de uso básico:
 *   <Avatar size="lg">
 *     <AvatarImage src="/foto.jpg" alt="João" />
 *     <AvatarFallback>JO</AvatarFallback>
 *   </Avatar>
 *
 * Exemplo com grupo:
 *   <AvatarGroup>
 *     <Avatar><AvatarImage src="..." /><AvatarFallback>A</AvatarFallback></Avatar>
 *     <Avatar><AvatarImage src="..." /><AvatarFallback>B</AvatarFallback></Avatar>
 *     <AvatarGroupCount>+3</AvatarGroupCount>
 *   </AvatarGroup>
 */

import * as React from "react"
import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar"

import { cn } from "@/lib/utils"

/*
 * Contêiner raiz do avatar.
 * — after::absolute cria uma borda circular sutil sobre a imagem (mix-blend-darken
 *   em modo claro, mix-blend-lighten em modo escuro) para evitar "vazamento" de
 *   cores na borda.
 * — group/avatar permite que filhos reajam ao tamanho via group-data-[size=*].
 */
function Avatar({
  className,
  size = "default",
  ...props
}: AvatarPrimitive.Root.Props & {
  size?: "default" | "sm" | "lg"
}) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      className={cn(
        "group/avatar relative flex size-8 shrink-0 rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken data-[size=lg]:size-10 data-[size=sm]:size-6 dark:after:mix-blend-lighten",
        className
      )}
      {...props}
    />
  )
}

/*
 * Imagem do avatar.
 * — object-cover garante que a imagem preencha o círculo sem distorção.
 * — Se a imagem falhar no carregamento, o Base UI mostrará automaticamente
 *   o AvatarFallback (comportamento nativo do primitivo).
 */
function AvatarImage({ className, ...props }: AvatarPrimitive.Image.Props) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn(
        "aspect-square size-full rounded-full object-cover",
        className
      )}
      {...props}
    />
  )
}

/*
 * Fallback exibido enquanto a imagem carrega ou quando falha.
 * — Normalmente contém as iniciais do usuário (ex: "JD" para John Doe).
 * — O texto fica menor (text-xs) quando o Avatar usa size="sm".
 */
function AvatarFallback({
  className,
  ...props
}: AvatarPrimitive.Fallback.Props) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center rounded-full bg-muted text-sm text-muted-foreground group-data-[size=sm]/avatar:text-xs",
        className
      )}
      {...props}
    />
  )
}

/*
 * Indicador de status sobreposto ao avatar (ex: online, offline, notificação).
 * — Posicionado no canto inferior direito via absolute + right-0 + bottom-0.
 * — ring-2 cria um "anel branco" de separação entre o badge e o avatar.
 * — O tamanho do badge (e se ícones SVG internos aparecem) varia conforme
 *   o size do Avatar pai, via seletores group-data-[size=*]/avatar.
 * — Em size="sm", qualquer SVG dentro do badge é ocultado ([&>svg]:hidden).
 */
function AvatarBadge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        "absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground bg-blend-color ring-2 ring-background select-none",
        "group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden",
        "group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2",
        "group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2",
        className
      )}
      {...props}
    />
  )
}

/*
 * Agrupa múltiplos Avatars com sobreposição (efeito stack).
 * — -space-x-2 faz os avatars se sobreporem horizontalmente.
 * — *:data-[slot=avatar]:ring-2 adiciona anel de separação entre cada avatar.
 * — group/avatar-group permite que AvatarGroupCount detecte o tamanho dos
 *   avatars filhos via group-has-data-[size=*]/avatar-group.
 */
function AvatarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        "group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background",
        className
      )}
      {...props}
    />
  )
}

/*
 * Contador de avatars excedentes (ex: "+5") ao final de um AvatarGroup.
 * — Deve ser o último filho de AvatarGroup.
 * — Adapta seu tamanho automaticamente ao size dos avatars do grupo via
 *   seletores group-has-data-[size=*]/avatar-group.
 * — Aceita texto ("+3") ou SVG como filhos.
 */
function AvatarGroupCount({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground ring-2 ring-background group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3",
        className
      )}
      {...props}
    />
  )
}

export {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarBadge,
}
