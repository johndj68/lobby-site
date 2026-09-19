/* Página de cadastro de novo cliente (rota: /cadastro)
 *
 * Server Component estático — sem busca de dados no servidor.
 * RegisterForm (Client Component) gerencia os campos e chama
 * supabase.auth.signUp() para criar a conta.
 *
 * Após o cadastro com e-mail, o Supabase envia um e-mail de confirmação.
 * Após confirmação, o usuário é redirecionado para /dashboard.
 */
import type { Metadata } from 'next'
import AuthLayout from '@/components/layout/AuthLayout'
import RegisterForm from '@/components/forms/RegisterForm'

export const metadata: Metadata = {
  title: 'Criar conta | LOBBY',
  description: 'Crie sua conta gratuitamente e tenha acesso a materiais exclusivos, soluções inteligentes e diagnósticos personalizados.',
}

/* Benefícios exibidos na coluna esquerda do AuthLayout para incentivar o cadastro. */
const benefits = [
  { title: 'Materiais gratuitos', description: 'Acesse guias, cases e conteúdos exclusivos.' },
  { title: 'Acompanhamento de projetos', description: 'Acompanhe o andamento dos seus projetos.' },
  { title: 'Soluções personalizadas', description: 'Receba recomendações sob medida para o seu negócio.' },
  { title: 'Diagnóstico gratuito', description: 'Entenda o momento da sua empresa e descubra oportunidades.' },
]

export default function CadastroPage() {
  return (
    // AuthLayout: estrutura visual de duas colunas para telas de autenticação
    <AuthLayout
      title="Comece sua jornada digital com a LOBBY."
      subtitle="Crie sua conta gratuitamente e tenha acesso a materiais exclusivos, soluções inteligentes e diagnósticos que impulsionam o crescimento do seu negócio."
      benefits={benefits}
    >
      <div>
        <h1 className="text-2xl font-bold text-[#0B1020] mb-1" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          Criar conta
        </h1>
        <p className="text-sm text-[#5D6475] mb-7">Preencha os dados abaixo para criar sua conta.</p>
        {/* RegisterForm: Client Component com nome, e-mail, senha e confirmação.
            Cria conta via supabase.auth.signUp() e redireciona ao confirmar e-mail. */}
        <RegisterForm />
      </div>
    </AuthLayout>
  )
}
