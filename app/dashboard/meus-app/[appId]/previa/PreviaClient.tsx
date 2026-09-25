'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import ProductPreview from '@/components/vendor/editor/preview/ProductPreview'
import { colors as C } from '@/lib/design-tokens'
import { formatDateTimeBR } from '@/lib/marketplace'

interface Props {
  appId: string
  appName: string
  submittedAt: string
  previewData: Record<string, unknown>
}

export default function PreviaClient({ appId, appName, submittedAt, previewData }: Props) {
  return (
    <div className="space-y-5">
      <p className="text-xs" style={{ color: C.textSecondary }}>
        <Link href="/dashboard" className="hover:underline">Dashboard</Link> /{' '}
        <Link href="/dashboard/meus-app" className="hover:underline">Meus aplicativos</Link> /{' '}
        <Link href={`/dashboard/meus-app/${appId}`} className="hover:underline">{appName}</Link> / Prévia
      </p>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Prévia privada</h1>
          <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>
            Como o app foi descrito na versão enviada em {formatDateTimeBR(submittedAt)} — pode diferir do rascunho atual.
          </p>
        </div>
        <Link href={`/dashboard/meus-app/${appId}`} className="inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold"
          style={{ borderColor: C.border, color: C.text }}>
          <ArrowLeft size={14} aria-hidden="true" /> Voltar ao acompanhamento
        </Link>
      </div>

      <div className="mx-auto max-w-sm rounded-2xl border bg-white p-5" style={{ borderColor: C.border, boxShadow: '0 8px 40px rgba(11,16,32,0.06)' }}>
        <ProductPreview data={previewData} />
      </div>
    </div>
  )
}
