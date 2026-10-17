'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Loader2, RefreshCw, ShieldAlert } from 'lucide-react'
import { loadTurnstileScript, type TurnstileApi } from './turnstile-loader'
import type { AntiBotAction } from '@/lib/anti-bot/types'

export type ChallengeStatus =
  | 'loading'      // script carregando
  | 'required'     // widget pronto, aguardando o desafio (automático, não é um checkbox)
  | 'verified'     // token obtido — formulário pode ser enviado
  | 'expired'      // token expirou, precisa resolver de novo
  | 'failed'       // erro de verificação — oferece retry
  | 'unavailable'  // script bloqueado/indisponível (adblock, rede, CSP)

const SCRIPT_TIMEOUT_MS = 8_000

interface TurnstileChallengeProps {
  siteKey:          string
  action:           AntiBotAction
  onStatusChange:   (status: ChallengeStatus) => void
  onToken:          (token: string | null) => void
  /** Incrementar este valor força o widget a resetar (ex.: o backend rejeitou o
   *  comprovante anterior como expirado/duplicado e pediu um novo). */
  resetSignal?:     number
}

/**
 * Widget Cloudflare Turnstile (seção 4 do pedido). Carrega o script só quando
 * montado, limpa o widget e os listeners no unmount, nunca auto-submete o
 * formulário — só reporta o token via onToken, quem decide enviar é o form.
 * Tema escuro e idioma inglês fixos (spec); respeita o modo automático do
 * provedor — não é um checkbox manual, é o widget padrão da Cloudflare.
 */
export default function TurnstileChallenge({
  siteKey, action, onStatusChange, onToken, resetSignal,
}: TurnstileChallengeProps) {
  const rawId = useId()
  const containerId = `turnstile-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`
  const widgetIdRef = useRef<string | null>(null)
  const [status, setStatusInternal] = useState<ChallengeStatus>('loading')

  useEffect(() => {
    let cancelled = false
    let currentWidgetId: string | null = null

    const setStatus = (s: ChallengeStatus) => {
      if (cancelled) return
      setStatusInternal(s)
      onStatusChange(s)
    }

    setStatus('loading')
    onToken(null)

    loadTurnstileScript({ timeoutMs: SCRIPT_TIMEOUT_MS })
      .then((turnstile: TurnstileApi) => {
        if (cancelled) return
        currentWidgetId = turnstile.render(`#${containerId}`, {
          sitekey:  siteKey,
          action,
          theme:    'dark',
          language: 'en',
          size:     'flexible',
          retry:    'auto',
          'refresh-expired': 'auto',
          callback: (token: string) => {
            onToken(token)
            setStatus('verified')
          },
          'error-callback': () => {
            onToken(null)
            setStatus('failed')
          },
          'expired-callback': () => {
            onToken(null)
            setStatus('expired')
          },
          'timeout-callback': () => {
            onToken(null)
            setStatus('failed')
          },
        })
        widgetIdRef.current = currentWidgetId
        setStatus('required')
      })
      .catch(() => {
        onToken(null)
        setStatus('unavailable')
      })

    return () => {
      cancelled = true
      if (currentWidgetId && window.turnstile) {
        try { window.turnstile.remove(currentWidgetId) } catch { /* já pode ter sido removido */ }
      }
      widgetIdRef.current = null
    }
    // resetSignal entra nas deps de propósito: incrementá-lo força este efeito a
    // rodar de novo (remove o widget velho, carrega/renderiza um novo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey, action, containerId, resetSignal])

  return (
    <div>
      <div id={containerId} />
      <div role="status" aria-live="polite" className="sr-only">
        {status === 'loading' && 'Loading verification…'}
        {status === 'verified' && 'Verification completed.'}
        {status === 'expired' && 'Your verification has expired. Please try again.'}
        {status === 'failed' && "We couldn't verify your request. Please try again."}
        {status === 'unavailable' && 'Security verification is temporarily unavailable. Please try again shortly.'}
      </div>

      {status === 'loading' && (
        <p className="mt-2 flex items-center gap-2 text-xs text-[#5D6475]">
          <Loader2 size={13} className="animate-spin" aria-hidden="true" />
          Loading verification…
        </p>
      )}

      {(status === 'expired' || status === 'failed') && (
        <p className="mt-2 flex items-center gap-2 text-xs font-medium text-amber-600">
          <RefreshCw size={13} aria-hidden="true" />
          {status === 'expired'
            ? 'Your verification has expired. Please try again.'
            : "We couldn't verify your request. Please try again."}
        </p>
      )}

      {status === 'unavailable' && (
        <p className="mt-2 flex items-center gap-2 text-xs font-medium text-red-600">
          <ShieldAlert size={13} aria-hidden="true" />
          Security verification is temporarily unavailable. Please try again shortly.
        </p>
      )}
    </div>
  )
}
