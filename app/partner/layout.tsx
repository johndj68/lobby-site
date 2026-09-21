import { Toaster } from '@/components/ui/sonner'

export default function PartnerLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <>
      {children}
      <Toaster position="top-right" richColors />
    </>
  )
}
