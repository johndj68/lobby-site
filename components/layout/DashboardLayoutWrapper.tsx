'use client'

import { usePathname } from 'next/navigation'
import DashboardShell from './DashboardShell'

interface DashboardLayoutWrapperProps {
  children: React.ReactNode
  user: any
  profile: any
}

export default function DashboardLayoutWrapper({ children, user, profile }: DashboardLayoutWrapperProps) {
  const pathname = usePathname()

  // Don't render DashboardShell for editor routes
  if (pathname.startsWith('/dashboard/meus-app/novo/') && pathname.includes('/editar')) {
    return <>{children}</>
  }

  return (
    <DashboardShell user={user} profile={profile}>
      {children}
    </DashboardShell>
  )
}
