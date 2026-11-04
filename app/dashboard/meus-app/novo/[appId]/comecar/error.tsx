'use client'

import DashboardError from '@/components/ui/DashboardError'

export default function ComecarError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <DashboardError error={error} reset={reset} title="Não foi possível carregar o cadastro deste aplicativo." />
}
