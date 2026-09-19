'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, Mail, Lock, ArrowRight } from 'lucide-react'

export default function AdminLoginForm() {
  const router = useRouter()
  const [form, setForm]       = useState({ email: '', password: '' })
  const [showPw, setShowPw]   = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.email || !form.password) { setError('Preencha e-mail e senha.'); return }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/admin-login', {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body:        JSON.stringify({ email: form.email, password: form.password }),
      })
      const data = await res.json().catch(() => ({}))

      if (res.status === 429) {
        setError('Muitas tentativas. Aguarde um minuto e tente novamente.')
        return
      }
      // 403 = bloqueio intencional (conta não-técnica tentando entrar aqui) — mensagem própria, segura de exibir
      if (res.status === 403) {
        setError(data.error ?? 'Acesso não permitido.')
        return
      }
      if (!res.ok) {
        const message: string = data.error ?? ''
        // Nunca expõe a mensagem crua do Supabase/erro de rede — só o caso de credenciais tem texto dedicado
        setError(
          message.includes('Invalid login credentials')
            ? 'E-mail ou senha incorretos.'
            : 'Erro ao entrar. Tente novamente.'
        )
        return
      }

      router.push('/admin')
      router.refresh()
    } catch {
      setError('Erro ao entrar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* E-mail */}
      <div>
        <label htmlFor="admin-email" className="mb-2 block text-sm font-semibold text-white/80">
          E-mail
        </label>
        <div className="relative">
          <Mail size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" aria-hidden="true" />
          <input
            id="admin-email"
            type="email"
            autoComplete="email"
            placeholder="tecnico@lobby.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.06] pl-10 pr-4 text-sm text-white placeholder:text-white/25 outline-none transition-all duration-300 focus:border-[#005BFF]/50 focus:bg-white/[0.08] focus:ring-4 focus:ring-[#005BFF]/15"
            required
          />
        </div>
      </div>

      {/* Senha */}
      <div>
        <label htmlFor="admin-password" className="mb-2 block text-sm font-semibold text-white/80">
          Senha
        </label>
        <div className="relative">
          <Lock size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" aria-hidden="true" />
          <input
            id="admin-password"
            type={showPw ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Sua senha de acesso"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.06] pl-10 pr-11 text-sm text-white placeholder:text-white/25 outline-none transition-all duration-300 focus:border-[#005BFF]/50 focus:bg-white/[0.08] focus:ring-4 focus:ring-[#005BFF]/15"
            required
          />
          <button
            type="button"
            onClick={() => setShowPw(!showPw)}
            aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 transition-colors hover:text-white/70"
          >
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="group mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] text-sm font-bold text-white shadow-[0_12px_30px_rgba(0,91,255,0.30)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(0,91,255,0.40)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <><Loader2 size={16} className="animate-spin" />Autenticando...</>
        ) : (
          <>Acessar painel<ArrowRight size={16} className="transition-transform group-hover:translate-x-1" /></>
        )}
      </button>
    </form>
  )
}
