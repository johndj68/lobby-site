import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sobre a LOBBY | Software, Automação e Dados',
  description:
    'Conheça a LOBBY — a empresa de tecnologia que transforma desafios em soluções de software, automação, análise de dados e cibersegurança para o crescimento do seu negócio.',
  openGraph: {
    title: 'Sobre a LOBBY',
    description: 'Quem somos e como ajudamos empresas a crescerem com tecnologia.',
    type: 'website',
    locale: 'pt_BR',
  },
}

export default function SobreLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
