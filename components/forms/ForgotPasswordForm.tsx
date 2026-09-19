'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Mail, ArrowRight, CheckCircle, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Formulário de recuperação de senha via e-mail.
 * Envia um link de redefinição usando o Supabase Auth.
 * O link aponta para /atualizar-senha, onde o usuário define a nova senha.
 * Após o envio bem-sucedido, exibe uma tela de confirmação no lugar do form.
 */
export default function ForgotPasswordForm() {
  // Valor digitado no campo de e-mail
  const [email, setEmail]   = useState('')

  // Indica se a requisição ao Supabase está em andamento
  const [loading, setLoading] = useState(false)

  // Controla a exibição da tela de confirmação após envio bem-sucedido
  const [sent, setSent]     = useState(false)

  // Mensagem de erro exibida em caso de falha no envio
  const [error, setError]   = useState('')

  /**
   * Valida o campo e chama resetPasswordForEmail do Supabase.
   * O redirectTo aponta para a página /atualizar-senha da própria aplicação,
   * onde o usuário poderá definir a nova senha após clicar no link do e-mail.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) { setError('Digite seu e-mail.'); return }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body:        JSON.stringify({ email }),
      })
      if (!res.ok) throw new Error('failed')

      // Exibe a tela de confirmação de envio
      setSent(true)
    } catch {
      setError('Erro ao enviar. Verifique o e-mail informado.')
    } finally {
      setLoading(false)
    }
  }

  /* Tela de confirmação — exibida após o e-mail de recuperação ser enviado com sucesso */
  if (sent) {
    return (
      <div className="flex flex-col items-center text-center gap-4 py-8">
        {/* Ícone de sucesso com gradiente da marca */}
        <div
          className="flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-[0_12px_40px_rgba(0,91,255,0.28)]"
          style={{ background: 'linear-gradient(135deg, #005BFF, #7B2CFF)' }}
        >
          <CheckCircle size={28} />
        </div>
        <div>
          <h3 className="text-xl font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            E-mail enviado!
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-[#5D6475] max-w-xs mx-auto">
            Verifique sua caixa de entrada e clique no link para redefinir sua senha.
          </p>
        </div>
        {/* Link de retorno ao login */}
        <Link href="/login" className="text-sm font-semibold text-[#005BFF] hover:text-[#7B2CFF] transition-colors">
          Voltar ao login
        </Link>
      </div>
    )
  }

  /* Formulário principal de solicitação de recuperação */
  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* Campo: E-mail cadastrado na plataforma */}
      <div>
        <Label htmlFor="email" className="mb-2 block text-sm font-semibold text-[#0B1020]">
          E-mail cadastrado
        </Label>
        <div className="relative">
          {/* Ícone de e-mail decorativo, não interativo */}
          <Mail size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5D6475]" aria-hidden="true" />
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 rounded-2xl border-[#E3E7F0] pl-10 text-sm transition-all duration-300 focus-visible:border-[#005BFF]/40 focus-visible:ring-4 focus-visible:ring-[#005BFF]/10"
            required
          />
        </div>
      </div>

      {/* Exibe mensagem de erro caso o envio falhe */}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-600">{error}</p>
      )}

      {/* Botão de envio — desabilitado e com spinner enquanto a requisição ocorre */}
      <button
        type="submit"
        disabled={loading}
        className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] text-sm font-bold text-white shadow-[0_18px_40px_rgba(0,91,255,0.22)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(123,44,255,0.28)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <><Loader2 size={16} className="animate-spin" />Enviando...</>
        ) : (
          /* A seta desliza levemente para a direita no hover (group-hover) */
          <>Enviar link de recuperação<ArrowRight size={16} className="transition-transform group-hover:translate-x-1" /></>
        )}
      </button>

      {/* Link para voltar ao login caso o usuário já lembre a senha */}
      <p className="text-center text-sm text-[#5D6475]">
        Lembrou a senha?{' '}
        <Link href="/login" className="font-semibold text-[#005BFF] hover:text-[#7B2CFF] transition-colors">
          Voltar ao login
        </Link>
      </p>
    </form>
  )
}
