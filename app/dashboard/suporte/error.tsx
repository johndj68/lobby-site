'use client'

import DashboardError from '@/components/ui/DashboardError'

export default function SuporteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <DashboardError error={error} reset={reset} title="Erro ao carregar suporte" />
}
