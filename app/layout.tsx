/* Layout raiz da aplicação (app/layout.tsx)
 *
 * Este é o único componente que envolve TODAS as páginas do site público
 * (home, soluções, projetos, contato, sobre, auth). Exceção: /admin/* tem
 * seu próprio layout em app/admin/layout.tsx que substitui parcialmente este.
 *
 * Responsabilidades:
 *  - Carrega e aplica as fontes do Google Fonts (Inter + Space Grotesk)
 *  - Define os metadados SEO padrão do site (sobrescritos por cada página)
 *  - Renderiza o Header fixo (navegação pública), o conteúdo da rota (children)
 *    e o Footer em todas as páginas públicas
 *  - Exibe o Toaster global de notificações (toast) no canto superior direito
 *
 * Nota: pt-16 no <main> compensa a altura do Header fixo (h-16 = 64px)
 * para que o conteúdo não fique oculto sob a barra de navegação.
 */
import type { Metadata } from 'next'
import { Inter, Space_Grotesk, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import { Toaster } from '@/components/ui/sonner'

/* Inter: fonte principal de corpo de texto.
   `variable` define o nome da CSS custom property usado no globals.css como --font-inter.
   display=swap: exibe fallback font enquanto Inter carrega (evita FOIT). */
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
})

/* Space Grotesk: fonte de títulos e headings (h1-h6).
   Referenciada via --font-space-grotesk no globals.css. */
const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  display: 'swap',
})

/* JetBrains Mono: fonte monospace para código e elementos técnicos.
   Referenciada via --font-geist-mono no globals.css. */
const jetbrainsMono = JetBrains_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
})

/* Metadados padrão do site para SEO e Open Graph.
   Cada rota pode exportar sua própria constante `metadata` para sobrescrever estes valores. */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lobby.tech'),
  title: 'LOBBY — Software, Automação, Dados e Cibersegurança',
  description:
    'A LOBBY cria soluções digitais em software, automação, análise de dados e cibersegurança para empresas que querem crescer com eficiência, inteligência e segurança.',
  keywords: ['software sob medida', 'automação empresarial', 'análise de dados', 'cibersegurança', 'LOBBY'],
  openGraph: {
    title: 'LOBBY — Tecnologia Estratégica para Empresas',
    description: 'Software, Automação, Dados e Cibersegurança para impulsionar o seu negócio.',
    type: 'website',
    locale: 'pt_BR',
  },
}

/* RootLayout: envoltório raiz de toda a aplicação.
   children: conteúdo da rota atual injetado pelo Next.js App Router. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // lang="pt-BR": informa ao navegador e leitores de tela o idioma da página
    // inter.variable + spaceGrotesk.variable + jetbrainsMono.variable: expõe as CSS vars das fontes para o Tailwind
    // antialiased: suaviza o traço das fontes
    <html lang="pt-BR" className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      {/* flex flex-col: empilha Header, main e Footer verticalmente
          min-h-full: garante que o body ocupe ao menos 100% da viewport */}
      <body className="min-h-full flex flex-col bg-white text-[#0B1020]">
        {/* Header fixo: barra de navegação pública (logotipo + links + CTA) */}
        <Header />
        {/* flex-1: faz o main ocupar todo o espaço restante entre Header e Footer
            pt-16: offset de 64px para não ficar sob o Header fixo (position: sticky) */}
        <main className="flex-1 pt-16">{children}</main>
        {/* Footer: rodapé com links institucionais e redes sociais */}
        <Footer />
        {/* Toaster: provider global de notificações toast (shadcn/ui + Sonner)
            richColors: aplica cores semânticas (verde=sucesso, vermelho=erro etc.) */}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  )
}
