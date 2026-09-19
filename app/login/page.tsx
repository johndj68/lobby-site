/* Página de login do cliente (rota: /login)
 *
 * Server Component estático — sem busca de dados. O formulário é um Client
 * Component separado (LoginForm) que gerencia o estado e a chamada ao Supabase Auth.
 *
 * Layout: AuthLayout divide a tela em duas colunas:
 *   Esquerda → lista de benefícios + identidade visual da LOBBY
 *   Direita  → formulário de e-mail/senha (LoginForm)
 */
import type { Metadata } from 'next'
import AuthLayout from '@/components/layout/AuthLayout'
import LoginForm from '@/components/forms/LoginForm'

export const metadata: Metadata = {
  title: 'Entrar | LOBBY',
  description: 'Acesse sua área LOBBY para gerenciar materiais, projetos e soluções personalizadas.',
}

/* Benefícios exibidos na coluna esquerda do AuthLayout.
   Objetivo: reforçar o valor da plataforma e reduzir abandono da tela de login. */
const benefits = [
  { title: 'Acesso rápido e seguro', description: 'Entre com segurança e acesse sua área em poucos segundos.' },
  { title: 'Área do cliente', description: 'Gerencie informações, faturas, contratos e preferências em um só lugar.' },
  { title: 'Materiais e projetos', description: 'Visualize e acompanhe materiais, projetos e soluções personalizadas.' },
  { title: 'Suporte especializado', description: 'Conte com nosso time para tirar dúvidas e apoiar suas decisões.' },
]

export default function LoginPage() {
  return (
    // AuthLayout: estrutura visual de duas colunas para telas de autenticação
    <AuthLayout
      title="Acesse sua área LOBBY."
      subtitle="Faça login para gerenciar materiais, acompanhar projetos, acessar soluções exclusivas e impulsionar o crescimento do seu negócio com inteligência."
      benefits={benefits}
    >
      <div>
        <h1
          className="text-2xl font-bold text-[#0B1020]"
          style={{ fontFamily: 'Space Grotesk, sans-serif' }}
        >
          Entrar
        </h1>
        <p className="mt-1 mb-7 text-sm text-[#5D6475]">Acesse sua conta para continuar.</p>
        {/* LoginForm: Client Component com campo e-mail, senha, toggle de visibilidade,
            validação e chamada a supabase.auth.signInWithPassword() */}
        <LoginForm />
      </div>
    </AuthLayout>
  )
}
