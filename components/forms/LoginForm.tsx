'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, Mail, Lock, ArrowRight, ShieldCheck } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import FormInput from './FormInput'
import { colors, gradients } from '@/lib/design-tokens'

export default function LoginForm() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [remember, setRemember]   = useState(true)
  const [form, setForm]           = useState({ email: '', password: '' })

  /* ── Login via rota server-side (rate-limited) ─────────────────── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.email || !form.password) {
      setError('Preencha e-mail e senha.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
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
      // 403 = bloqueio intencional (conta de técnico tentando entrar aqui) — mensagem própria, segura de exibir
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

      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Erro ao entrar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="mt-7 space-y-5">
        <FormInput
          label="E-mail"
          type="email"
          autoComplete="email"
          placeholder="Digite seu melhor e-mail"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          icon={<Mail size={17} />}
          error={error.includes('E-mail') ? error : ''}
          required
        />

        <div className="relative">
          <div
            className="mb-2 block text-sm font-semibold"
            style={{ color: colors.text }}
          >
            Senha
          </div>
          <div className="relative">
            <Lock
              size={17}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
              style={{ color: colors.textSecondary }}
              aria-hidden="true"
            />
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Digite sua senha"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="h-12 w-full rounded-2xl border pl-10 pr-11 text-sm transition-all duration-300"
              style={{
                borderColor: colors.border,
                color: colors.text,
              }}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
              style={{ color: colors.textSecondary }}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>
      </div>

      {/* Remember + forgot */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="remember"
            checked={remember}
            onCheckedChange={(v) => setRemember(!!v)}
          />
          <label htmlFor="remember" className="cursor-pointer select-none text-sm" style={{ color: colors.textSecondary }}>
            Manter conectado
          </label>
        </div>
        <Link
          href="/recuperar-senha"
          className="text-sm font-semibold transition-colors hover:text-[#7B2CFF]"
          style={{ color: colors.primary }}
        >
          Esqueci minha senha
        </Link>
      </div>

      {/* Error message */}
      {error && (
        <p className="mt-4 rounded-xl px-3.5 py-2.5 text-xs font-medium" style={{ backgroundColor: '#FEE2E2', color: '#DC2626' }}>
          {error}
        </p>
      )}

      {/* Submit button */}
      <button
        type="submit"
        disabled={loading}
        className="group mt-6 inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-sm font-bold text-white shadow-[0_18px_40px_rgba(0,91,255,0.22)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(123,44,255,0.28)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        style={{ background: gradients.primaryBold }}
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            Entrando...
          </>
        ) : (
          <>
            Entrar
            <ArrowRight
              size={16}
              className="transition-transform duration-300 group-hover:translate-x-1"
              aria-hidden="true"
            />
          </>
        )}
      </button>

      {/* Social divider */}
      <div className="my-6 flex items-center gap-4">
        <div className="h-px flex-1" style={{ backgroundColor: colors.border }} />
        <span className="text-xs font-medium" style={{ color: colors.textSecondary }}>
          ou continue com
        </span>
        <div className="h-px flex-1" style={{ backgroundColor: colors.border }} />
      </div>

      {/* Social buttons */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          className="inline-flex h-12 items-center justify-center gap-2.5 rounded-2xl border px-4 text-sm font-semibold shadow-sm transition-all duration-300 hover:-translate-y-0.5"
          style={{ borderColor: colors.border, backgroundColor: colors.background, color: colors.text }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continuar com Google
        </button>

        <button
          type="button"
          className="inline-flex h-12 items-center justify-center gap-2.5 rounded-2xl border px-4 text-sm font-semibold shadow-sm transition-all duration-300 hover:-translate-y-0.5"
          style={{ borderColor: colors.border, backgroundColor: colors.background, color: colors.text }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="#0077B5" aria-hidden="true">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
          </svg>
          Continuar com LinkedIn
        </button>
      </div>

      {/* Create account link */}
      <p className="mt-6 text-center text-sm" style={{ color: colors.textSecondary }}>
        Ainda não tem conta?{' '}
        <Link
          href="/cadastro"
          className="font-semibold transition-colors hover:text-[#7B2CFF]"
          style={{ color: colors.primary }}
        >
          Criar conta
        </Link>
      </p>

      {/* Security badge */}
      <div className="mt-7 border-t pt-5" style={{ borderColor: colors.border }}>
        <div className="flex items-start gap-3 rounded-2xl p-4" style={{ backgroundColor: colors.backgroundAlt }}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${colors.primary}10` }}>
            <ShieldCheck size={18} style={{ color: colors.primary }} aria-hidden="true" />
          </div>
          <div>
            <p
              className="text-sm font-bold"
              style={{ fontFamily: 'Space Grotesk, sans-serif', color: colors.text }}
            >
              Ambiente seguro LOBBY
            </p>
            <p className="mt-0.5 text-xs leading-relaxed" style={{ color: colors.textSecondary }}>
              Seus dados são protegidos com criptografia de ponta a ponta.
            </p>
          </div>
        </div>
      </div>
    </form>
  )
}
