import Link from 'next/link'
import Container from '@/components/layout/Container'
import { ArrowLeft } from 'lucide-react'

export default function ProjetoNotFound() {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center">
      <Container>
        <div className="mx-auto max-w-lg py-24 text-center">
          <p className="lobby-gradient-text font-heading text-[120px] font-black leading-none tracking-tight sm:text-[160px]">
            404
          </p>

          <h1 className="font-heading mt-6 text-2xl font-bold text-foreground sm:text-3xl">
            Projeto não encontrado
          </h1>
          <p className="mt-4 text-muted-foreground">
            Este case não existe ou foi removido. Veja todos os projetos que desenvolvemos.
          </p>

          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/projetos"
              className="lobby-gradient inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-md transition-opacity hover:opacity-90"
            >
              <ArrowLeft size={16} />
              Ver todos os projetos
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            >
              Página inicial
            </Link>
          </div>
        </div>
      </Container>
    </main>
  )
}
