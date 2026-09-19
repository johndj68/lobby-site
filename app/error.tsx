'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import Container from '@/components/layout/Container'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { captureException } from '@/lib/monitoring'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    captureException(error, { digest: error.digest })
  }, [error])

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center">
      <Container>
        <div className="mx-auto max-w-lg py-24 text-center">

          {/* Icon */}
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10">
            <AlertTriangle size={36} className="text-destructive" />
          </div>

          {/* Heading */}
          <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">
            Algo deu errado
          </h1>

          {/* Description */}
          <p className="mt-4 text-muted-foreground">
            Ocorreu um erro inesperado nesta página. Tente novamente — se o
            problema persistir, entre em contato com o suporte.
          </p>

          {/* Digest (error ID for support) */}
          {error.digest && (
            <p className="mt-3 font-mono text-xs text-muted-foreground/60">
              Código: {error.digest}
            </p>
          )}

          {/* CTAs */}
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <button
              onClick={reset}
              className="lobby-gradient inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-md transition-opacity hover:opacity-90"
            >
              <RefreshCw size={16} />
              Tentar novamente
            </button>

            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <Home size={16} />
              Página inicial
            </Link>
          </div>

          {/* Support link */}
          <p className="mt-8 text-sm text-muted-foreground">
            Problema persistindo?{' '}
            <Link
              href="/contato"
              className="text-lobby-blue underline-offset-4 hover:underline"
            >
              Fale com o suporte
            </Link>
          </p>

        </div>
      </Container>
    </main>
  )
}
