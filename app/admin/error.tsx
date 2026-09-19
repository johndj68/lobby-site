'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { captureException } from '@/lib/monitoring'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function AdminError({ error, reset }: ErrorProps) {
  useEffect(() => {
    captureException(error, { digest: error.digest, area: 'admin' })
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070D1A] p-6">
      <div className="mx-auto w-full max-w-md text-center">

        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10">
          <AlertTriangle size={28} className="text-red-400" />
        </div>

        <h1 className="text-xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          Algo deu errado
        </h1>

        <p className="mt-3 text-sm text-white/50 leading-relaxed">
          Ocorreu um erro inesperado no painel. Tente novamente — se o problema persistir, recarregue a página.
        </p>

        {error.digest && (
          <p className="mt-2 font-mono text-xs text-white/25">Código: {error.digest}</p>
        )}

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-xl bg-[#005BFF] px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            <RefreshCw size={14} />
            Tentar novamente
          </button>

          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft size={14} />
            Ir para o painel
          </Link>
        </div>

      </div>
    </div>
  )
}
