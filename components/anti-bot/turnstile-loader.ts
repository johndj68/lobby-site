'use client'

// Carregador do script oficial do Cloudflare Turnstile
// (https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/).
// render=explicit: nós controlamos quando/onde renderizar via turnstile.render(),
// em vez de deixar o script auto-renderizar qualquer <div class="cf-turnstile"> —
// necessário porque o mesmo widget pode (re)montar em páginas diferentes
// (cadastro, login, recuperar senha) e precisamos do widgetId pra limpar no unmount.
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const SCRIPT_SRC_BASE = SCRIPT_SRC.split('?')[0]

export interface TurnstileRenderOptions {
  sitekey:               string
  action:                string
  theme?:                'light' | 'dark' | 'auto'
  language?:              string
  size?:                 'normal' | 'flexible' | 'compact'
  retry?:                'auto' | 'never'
  'refresh-expired'?:     'auto' | 'manual' | 'never'
  'refresh-timeout'?:     'auto' | 'manual' | 'never'
  callback?:              (token: string) => void
  'error-callback'?:      (errorCode?: string) => void
  'expired-callback'?:    () => void
  'timeout-callback'?:    () => void
}

export interface TurnstileApi {
  render:      (container: string | HTMLElement, options: TurnstileRenderOptions) => string
  remove:      (widgetId: string) => void
  reset:       (widgetId: string) => void
  getResponse: (widgetId: string) => string | undefined
  isExpired:   (widgetId: string) => boolean
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let loadPromise: Promise<TurnstileApi> | null = null

/** Carrega (ou reaproveita) o script do Turnstile. Cacheado em escopo de módulo —
 *  várias instâncias do widget na mesma navegação (ex.: troca de rota) não reinjetam
 *  o script. Em falha, a promise é descartada para permitir um novo retry. */
export function loadTurnstileScript({ timeoutMs }: { timeoutMs: number }): Promise<TurnstileApi> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('turnstile: sem window (render no servidor)'))
  }
  if (window.turnstile) return Promise.resolve(window.turnstile)

  if (!loadPromise) {
    loadPromise = new Promise<TurnstileApi>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('turnstile: tempo esgotado carregando o script'))
      }, timeoutMs)

      const onLoad = () => {
        clearTimeout(timer)
        if (window.turnstile) resolve(window.turnstile)
        else reject(new Error('turnstile: script carregou mas window.turnstile não existe'))
      }
      const onError = () => {
        clearTimeout(timer)
        reject(new Error('turnstile: falha ao carregar o script (bloqueado ou rede indisponível)'))
      }

      const existing = document.querySelector<HTMLScriptElement>(`script[src^="${SCRIPT_SRC_BASE}"]`)
      if (existing) {
        if (window.turnstile) { onLoad(); return }
        existing.addEventListener('load', onLoad, { once: true })
        existing.addEventListener('error', onError, { once: true })
        return
      }

      const script = document.createElement('script')
      script.src = SCRIPT_SRC
      script.async = true
      script.defer = true
      script.addEventListener('load', onLoad, { once: true })
      script.addEventListener('error', onError, { once: true })
      document.head.appendChild(script)
    }).catch((err) => {
      loadPromise = null
      throw err
    })
  }

  return loadPromise
}
