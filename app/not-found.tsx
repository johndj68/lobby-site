import Link from 'next/link'
import Container from '@/components/layout/Container'
import BackButton from '@/components/ui/BackButton'
import { Home, LayoutDashboard } from 'lucide-react'

export default function NotFound() {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center">
      <Container>
        <div className="mx-auto max-w-lg py-24 text-center">

          {/* 404 */}
          <p className="lobby-gradient-text font-heading text-[120px] font-black leading-none tracking-tight sm:text-[160px]">
            404
          </p>

          {/* Heading */}
          <h1 className="font-heading mt-6 text-2xl font-bold text-foreground sm:text-3xl">
            Página não encontrada
          </h1>

          {/* Description */}
          <p className="mt-4 text-muted-foreground">
            O endereço que você acessou não existe ou foi movido.
            Verifique o link ou use uma das opções abaixo.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/"
              className="lobby-gradient inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-md transition-opacity hover:opacity-90"
            >
              <Home size={16} />
              Página inicial
            </Link>

            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <LayoutDashboard size={16} />
              Meu dashboard
            </Link>
          </div>

          {/* Back link */}
          <div className="mt-8">
            <BackButton />
          </div>

        </div>
      </Container>
    </main>
  )
}
