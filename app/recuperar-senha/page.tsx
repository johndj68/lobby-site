/* Página de recuperação de senha (rota: /recuperar-senha)
 *
 * Server Component estático. O formulário ForgotPasswordForm (Client Component)
 * chama supabase.auth.resetPasswordForEmail() que envia um e-mail com link
 * de redefinição. O link aponta para /atualizar-senha onde a nova senha é definida.
 */
import type { Metadata } from 'next'
import AuthLayout from '@/components/layout/AuthLayout'
import ForgotPasswordForm from '@/components/forms/ForgotPasswordForm'

export const metadata: Metadata = {
  title: 'Recuperar senha | LOBBY',
  description: 'Redefina sua senha de acesso à plataforma LOBBY.',
}

/* Benefícios que explicam o fluxo e reforçam a segurança do processo. */
const benefits = [
  { title: 'Processo seguro',        description: 'Link de recuperação válido por 1 hora.' },
  { title: 'E-mail verificado',      description: 'Enviamos somente para o e-mail cadastrado.' },
  { title: 'Suporte disponível',     description: 'Problemas? Fale com nosso time pelo contato.' },
  { title: 'Acesso restaurado',      description: 'Crie uma nova senha e retome o acesso normalmente.' },
]

export default function RecuperarSenhaPage() {
  return (
    <AuthLayout
      title="Recupere seu acesso à LOBBY."
      subtitle="Informe o e-mail cadastrado e enviaremos um link seguro para redefinir sua senha."
      benefits={benefits}
    >
      <div>
        <h1 className="text-2xl font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          Recuperar senha
        </h1>
        <p className="mt-1 mb-7 text-sm text-[#5D6475]">
          Enviaremos um link de recuperação para seu e-mail.
        </p>
        {/* ForgotPasswordForm: campo de e-mail + botão que dispara o e-mail de reset */}
        <ForgotPasswordForm />
      </div>
    </AuthLayout>
  )
}
