/* Página de definição de nova senha (rota: /atualizar-senha)
 *
 * Destino do link enviado por e-mail no fluxo de recuperação de senha.
 * O Supabase inclui um token na URL; UpdatePasswordForm (Client Component)
 * lê esse token via supabase.auth.onAuthStateChange('PASSWORD_RECOVERY')
 * e chama supabase.auth.updateUser({ password }) para salvar a nova senha.
 */
import type { Metadata } from 'next'
import AuthLayout from '@/components/layout/AuthLayout'
import UpdatePasswordForm from '@/components/forms/UpdatePasswordForm'

export const metadata: Metadata = {
  title: 'Nova senha | LOBBY',
  description: 'Defina uma nova senha para acessar sua conta LOBBY.',
}

/* Dicas exibidas na coluna esquerda do AuthLayout durante a definição da senha. */
const benefits = [
  { title: 'Senha segura',       description: 'Use letras, números e símbolos.' },
  { title: 'Proteção de dados',  description: 'Sua conta fica protegida com criptografia.' },
  { title: 'Acesso restaurado',  description: 'Após definir, faça login normalmente.' },
  { title: 'Suporte disponível', description: 'Problemas? Fale com nosso time.' },
]

export default function AtualizarSenhaPage() {
  return (
    <AuthLayout
      title="Crie uma nova senha para sua conta LOBBY."
      subtitle="Escolha uma senha forte para manter seu acesso seguro e protegido."
      benefits={benefits}
    >
      <div>
        <h1 className="text-2xl font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          Nova senha
        </h1>
        <p className="mt-1 mb-7 text-sm text-[#5D6475]">
          Defina sua nova senha de acesso.
        </p>
        {/* UpdatePasswordForm: campos nova senha + confirmação; valida e salva via Supabase Auth */}
        <UpdatePasswordForm />
      </div>
    </AuthLayout>
  )
}
