'use client'

import DashboardError from '@/components/ui/DashboardError'

export default function PreviaError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <DashboardError error={error} reset={reset} title="Não foi possível carregar a prévia do anúncio." />
}
