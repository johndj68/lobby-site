'use client'

import { useProjectVisualUrl } from '@/hooks/useProjectVisualUrl'

interface Props {
  src:       string
  alt:       string
  className: string
}

export default function SignedVisualImage({ src, alt, className }: Props) {
  const resolved = useProjectVisualUrl(src)

  if (resolved === undefined) {
    return <div className={`${className} animate-pulse bg-[#E3E7F0]`} aria-hidden="true" />
  }
  if (resolved === null) {
    return <div className={`${className} flex items-center justify-center bg-[#F7F8FC] text-[10px] text-[#94A3B8]`}>Sem acesso</div>
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={resolved} alt={alt} className={className} />
}
