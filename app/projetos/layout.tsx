import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Portfólio | LOBBY',
  description:
    'Conheça os projetos desenvolvidos pela LOBBY: sistemas sob medida, automações, dashboards e soluções de cibersegurança que geraram resultados reais para nossos clientes.',
  openGraph: {
    title: 'Portfólio de Projetos | LOBBY',
    description: 'Projetos de software, automação e dados com impacto mensurável.',
    type: 'website',
    locale: 'pt_BR',
  },
}

export default function ProjetosLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
