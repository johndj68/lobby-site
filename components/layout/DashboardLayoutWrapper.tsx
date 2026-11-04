'use client'

import { usePathname } from 'next/navigation'
import DashboardShell from './DashboardShell'
import type { User as SupabaseUser } from '@supabase/supabase-js'

interface DashboardLayoutWrapperProps {
  children: React.ReactNode
  user: SupabaseUser
  profile: { full_name?: string; company_name?: string } | null
}

export default function DashboardLayoutWrapper({ children, user, profile }: DashboardLayoutWrapperProps) {
  const pathname = usePathname()

  // Fluxo de cadastro/edição de app (começar/editar/planos/ativação/equipe/
  // revisão) usa seu próprio cabeçalho em largura total (EditorChrome) —
  // sem a sidebar do dashboard. Antes só /editar era excluído aqui; as
  // outras etapas (novas ou já existentes) ficavam com a sidebar por cima
  // do próprio layout de tela cheia dessas páginas (dois cabeçalhos
  // empilhados). novo/layout.tsx já documenta essa intenção pro fluxo
  // inteiro — isto só faz o wrapper cumprir o que ele já assume.
  const isEditorFlow = pathname === '/dashboard/meus-app/novo' || pathname.startsWith('/dashboard/meus-app/novo/')
  if (isEditorFlow) {
    return <>{children}</>
  }

  return (
    <DashboardShell user={user} profile={profile}>
      {children}
    </DashboardShell>
  )
}
