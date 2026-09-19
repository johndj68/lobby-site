/* Página de login da área técnica (rota: /admin/login)
 *
 * Server Component estático — sem busca de dados.
 * Ponto de entrada exclusivo para técnicos e colaboradores LOBBY.
 * AdminLoginForm (Client Component) gerencia e-mail/senha e chama
 * supabase.auth.signInWithPassword(); após o login, verifica role='technician'
 * antes de redirecionar para /admin.
 *
 * Visual: fundo escuro (#0B1020) com blobs de luz e grid de pontos,
 * diferente do login de clientes para reforçar o caráter restrito da área.
 */
import type { Metadata } from 'next'
import { Wrench } from 'lucide-react'
import AdminLoginForm from '@/components/forms/AdminLoginForm'

export const metadata: Metadata = {
  title: 'Área técnica | LOBBY',
  description: 'Acesso restrito a técnicos e colaboradores LOBBY.',
}

export default function AdminLoginPage() {
  return (
    // Fundo escuro profundo + centralização vertical e horizontal da tela
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0B1020] px-4 py-10">
      {/* Background glow */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(0,91,255,0.12),transparent_40%),radial-gradient(circle_at_80%_70%,rgba(123,44,255,0.12),transparent_40%)]" />
        <div className="absolute inset-0 opacity-[0.18] bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.08)_1px,transparent_0)] bg-[size:28px_28px]" />
        <div className="absolute -left-40 top-20 h-[400px] w-[400px] rounded-full bg-[#005BFF]/[0.07] blur-3xl" />
        <div className="absolute -right-40 bottom-20 h-[400px] w-[400px] rounded-full bg-[#7B2CFF]/[0.07] blur-3xl" />
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-md">
        <div className="overflow-hidden rounded-[2rem] border border-white/[0.08] bg-white/[0.04] p-8 shadow-[0_30px_80px_rgba(0,0,0,0.40)] backdrop-blur">

          {/* Header */}
          <div className="mb-8 text-center">
            {/* Badge */}
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl shadow-[0_8px_24px_rgba(0,91,255,0.30)]"
              style={{ background: 'linear-gradient(135deg, #005BFF, #7B2CFF)' }}>
              <Wrench size={22} className="text-white" />
            </div>

            <h1
              className="text-2xl font-bold text-white"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              Área técnica
            </h1>
            <p className="mt-2 text-sm text-white/40">
              Acesso exclusivo para técnicos e colaboradores LOBBY.
            </p>
          </div>

          <AdminLoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-white/20">
          © 2025 LOBBY — Área restrita
        </p>
      </div>
    </div>
  )
}
