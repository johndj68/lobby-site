import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Recursos | LOBBY',
  description:
    'Acesse e-books, templates e guias práticos da LOBBY sobre software, automação, análise de dados e cibersegurança para profissionais e empresas.',
  openGraph: {
    title: 'Recursos | LOBBY',
    description: 'E-books e materiais gratuitos e pagos sobre tecnologia e inovação empresarial.',
    type: 'website',
    locale: 'pt_BR',
  },
}

export default function RecursosLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
