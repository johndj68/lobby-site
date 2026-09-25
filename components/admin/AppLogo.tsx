'use client'

import { useEffect, useRef, useState } from 'react'
import { Grid3x3 } from 'lucide-react'
import { MARKETPLACE_COLORS } from '@/lib/marketplace'
import { colors as LIGHT_COLORS } from '@/lib/design-tokens'

const THEME = {
  dark: { bg: MARKETPLACE_COLORS.header, icon: MARKETPLACE_COLORS.textSecondary },
  light: { bg: LIGHT_COLORS.backgroundAlt, icon: LIGHT_COLORS.textMuted },
}

/** Logo de app com fallback visual: ícone genérico quando não há logo, e
 *  também quando a URL existe mas falha ao carregar. Além do onError (falhas
 *  de rede normais), confere `complete`+`naturalWidth` no mount: uma imagem
 *  bloqueada de forma síncrona (ex.: CSP) já chega com erro resolvido antes
 *  do React terminar de montar o listener de onError, então o evento nunca
 *  dispara — sem essa checagem o <img> quebrado fica na tela. Nunca inventa
 *  uma imagem no lugar. `theme` escolhe a cor do fallback (admin é escuro,
 *  dashboard do cliente é claro) — o resto do comportamento é idêntico. */
export default function AppLogo({ url, size = 32, theme = 'dark' }: { url: string | null; size?: number; theme?: 'dark' | 'light' }) {
  const [errored, setErrored] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  // Reseta o fallback quando a URL muda (troca de linha reaproveitando o
  // mesmo componente) — ajuste de estado a partir de prop durante o render,
  // não em efeito: evita um render extra desnecessário.
  const [prevUrl, setPrevUrl] = useState(url)
  if (url !== prevUrl) {
    setPrevUrl(url)
    setErrored(false)
  }

  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth === 0) setErrored(true)
  }, [url])

  const dim = { width: size, height: size }
  const palette = THEME[theme]
  if (!url || errored) {
    return (
      <div className="flex shrink-0 items-center justify-center rounded-lg" style={{ ...dim, background: palette.bg }}>
        <Grid3x3 size={Math.round(size * 0.44)} style={{ color: palette.icon }} aria-hidden="true" />
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={imgRef} src={url} alt="" onError={() => setErrored(true)} className="shrink-0 rounded-lg object-cover" style={dim} />
  )
}
