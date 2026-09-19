import Link from 'next/link'
import { FolderKanban, ArrowLeft } from 'lucide-react'

export default function ProjectNotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F0F4FF]">
        <FolderKanban className="h-7 w-7 text-[#005BFF]" />
      </div>

      <h1 className="mb-2 text-xl font-bold text-[#0B1020]">Projeto não encontrado</h1>
      <p className="mb-8 max-w-sm text-sm text-[#5D6475]">
        Este projeto não existe ou você não tem acesso a ele.
      </p>

      <Link
        href="/dashboard/projetos"
        className="inline-flex items-center gap-2 rounded-xl bg-[#005BFF] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#0047CC]"
      >
        <ArrowLeft className="h-4 w-4" />
        Ver meus projetos
      </Link>
    </div>
  )
}
