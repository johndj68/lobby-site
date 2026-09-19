import Link from 'next/link'
import { Users, ArrowLeft } from 'lucide-react'

export default function ClienteNotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
        <Users className="h-7 w-7 text-white/70" />
      </div>

      <h1 className="mb-2 text-xl font-bold text-white">Cliente não encontrado</h1>
      <p className="mb-8 max-w-sm text-sm text-white/50">
        Este cliente não existe ou foi removido do sistema.
      </p>

      <Link
        href="/admin/clientes"
        className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/20"
      >
        <ArrowLeft className="h-4 w-4" />
        Ver todos os clientes
      </Link>
    </div>
  )
}
