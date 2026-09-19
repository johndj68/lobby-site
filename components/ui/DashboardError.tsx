'use client'

import { AlertCircle, RotateCcw, LayoutDashboard } from 'lucide-react'
import Link from 'next/link'

interface DashboardErrorProps {
  error: Error & { digest?: string }
  reset: () => void
  title?: string
}

export default function DashboardError({ error, reset, title = 'Algo deu errado' }: DashboardErrorProps) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center py-16">
      <div className="w-full max-w-md rounded-2xl border border-[#E3E7F0] bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <AlertCircle className="h-6 w-6 text-red-500" />
        </div>

        <h2 className="mb-1 text-lg font-semibold text-[#0B1020]">{title}</h2>
        <p className="mb-6 text-sm text-[#5D6475]">
          {process.env.NODE_ENV === 'development'
            ? error.message || 'Erro desconhecido.'
            : 'Não foi possível carregar esta página. Tente novamente ou volte ao dashboard.'}
        </p>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#005BFF] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#0047CC]"
          >
            <RotateCcw className="h-4 w-4" />
            Tentar novamente
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E3E7F0] px-5 py-2.5 text-sm font-medium text-[#0B1020] transition hover:bg-[#F7F8FC]"
          >
            <LayoutDashboard className="h-4 w-4" />
            Voltar ao dashboard
          </Link>
        </div>

        {error.digest && (
          <p className="mt-4 text-[10px] text-[#5D6475]/60">ID: {error.digest}</p>
        )}
      </div>
    </div>
  )
}
