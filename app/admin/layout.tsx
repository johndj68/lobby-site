import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Admin | LOBBY',
  robots: { index: false, follow: false },
}

/* Layout raiz da área administrativa (/admin/*)
 *
 * Responsabilidades:
 *   - Aplica fundo escuro (#070D1A) a todas as páginas admin
 *   - Remove o offset do header público (-mt-16) pois a área admin
 *     tem seu próprio header/sidebar interno
 *   - Ocupa altura total da viewport (h-screen) com scroll interno
 *     (overflow-y-auto) para que o sidebar fixo não role junto com o conteúdo
 *
 * Nota de segurança: a proteção de rota (verificação de sessão e role)
 * é feita em cada page.tsx admin via createServerSupabaseClient(),
 * não aqui — layout é estático e não pode aguardar dados assíncronos
 * de forma bloqueante sem afetar o streaming do Next.js.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    // admin-layout: classe utilitária para estilos específicos da área admin (globals.css)
    // -mt-16: cancela o padding-top adicionado pelo layout público para o header fixo
    // h-screen overflow-y-auto: altura fixa + scroll interno (sidebar não rola)
    // bg-[#070D1A]: fundo escuro exclusivo da área administrativa
    <div className="admin-layout -mt-16 h-screen overflow-y-auto bg-[#070D1A]">
      {children}
    </div>
  )
}
