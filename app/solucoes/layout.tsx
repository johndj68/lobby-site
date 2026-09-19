import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Soluções | LOBBY',
  description:
    'Explore as soluções da LOBBY: software sob medida, automação de processos, análise de dados e cibersegurança para impulsionar seu negócio com eficiência e inteligência.',
  openGraph: {
    title: 'Soluções | LOBBY',
    description: 'Software, automação, dados e segurança — soluções tecnológicas para crescimento empresarial.',
    type: 'website',
    locale: 'pt_BR',
  },
}

export default function SolucoesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
