"use client"

/*
 * Toaster (Sonner) — sistema de notificações toast do projeto LOBBY.
 *
 * Wrapper sobre a biblioteca `sonner` que:
 *   1. Sincroniza automaticamente com o tema do sistema (light/dark/system)
 *      usando `useTheme` do next-themes.
 *   2. Substitui os ícones padrão do Sonner por ícones do lucide-react,
 *      garantindo consistência visual com o restante da UI.
 *   3. Mapeia as variáveis CSS do design system do projeto (--popover,
 *      --popover-foreground, --border, --radius) para as variáveis internas
 *      do Sonner (--normal-bg, --normal-text, etc.).
 *
 * ─────────────────────────────────────────────
 * COMO USAR:
 * ─────────────────────────────────────────────
 * 1. Adicione <Toaster /> UMA VEZ no layout raiz (app/layout.tsx):
 *    import { Toaster } from "@/components/ui/sonner"
 *    <Toaster />
 *
 * 2. Em qualquer componente, dispare toasts via a função `toast` do sonner:
 *    import { toast } from "sonner"
 *
 *    toast("Operação concluída")               // toast neutro
 *    toast.success("Salvo com sucesso!")        // ícone de check verde
 *    toast.error("Ocorreu um erro")             // ícone X vermelho
 *    toast.warning("Atenção!")                  // ícone de alerta amarelo
 *    toast.info("Informação")                   // ícone de info azul
 *    toast.loading("Carregando...")             // ícone de spinner animado
 *    toast.promise(minhaPromise, {              // gerencia estados da promise
 *      loading: "Enviando...",
 *      success: "Enviado!",
 *      error: "Falhou.",
 *    })
 *
 * ─────────────────────────────────────────────
 * ÍCONES POR TIPO DE TOAST:
 * ─────────────────────────────────────────────
 *   success → CircleCheckIcon  (check em círculo)
 *   info    → InfoIcon         (i em círculo)
 *   warning → TriangleAlertIcon (triângulo de atenção)
 *   error   → OctagonXIcon    (X em octágono)
 *   loading → Loader2Icon     (spinner animado — animate-spin)
 *
 * ─────────────────────────────────────────────
 * ESTILOS VIA VARIÁVEIS CSS:
 * ─────────────────────────────────────────────
 *   --normal-bg     → fundo do toast (usa --popover do tema)
 *   --normal-text   → texto do toast (usa --popover-foreground)
 *   --normal-border → borda do toast (usa --border)
 *   --border-radius → arredondamento   (usa --radius)
 *
 * A classe CSS "cn-toast" (via toastOptions.classNames.toast) permite
 * estilização adicional via globals.css se necessário.
 *
 * ─────────────────────────────────────────────
 * PROPS ADICIONAIS:
 * ─────────────────────────────────────────────
 * Todas as props do ToasterProps do sonner são repassadas via ...props:
 *   position    — onde os toasts aparecem ("top-right", "bottom-center", etc.)
 *   duration    — tempo de exibição em ms (padrão: 4000)
 *   richColors  — habilita cores mais ricas por tipo de toast
 *   expand      — toasts empilham expandidos por padrão
 *   closeButton — exibe botão de fechar em cada toast
 */

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  // Lê o tema atual (light | dark | system) para sincronizar com o Sonner
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // Sobrescreve os ícones padrão do Sonner pelos ícones do lucide-react
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          // animate-spin: ícone gira continuamente enquanto o toast de loading está ativo
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      // Mapeia variáveis CSS do design system para as variáveis internas do Sonner
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          // Permite estilização adicional via .cn-toast em globals.css
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
