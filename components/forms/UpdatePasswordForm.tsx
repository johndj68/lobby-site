'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Eye, EyeOff, Loader2, Lock, ArrowRight,
  CheckCircle, ShieldCheck, AlertCircle,
} from 'lucide-react'
import { Input }  from '@/components/ui/input'
import { Label }  from '@/components/ui/label'
import { createClient } from '@/lib/supabase'

type SessionState = 'checking' | 'ready' | 'invalid'

export default function UpdatePasswordForm() {
  const router = useRouter()

  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [success,  setSuccess]  = useState(false)
  const [error,    setError]    = useState('')
  const [session,  setSession]  = useState<SessionState>('checking')

  /* ── Detect session from Supabase reset link ──────────────────── */
  useEffect(() => {
    const supabase = createClient()

    // onAuthStateChange handles both hash-based and PKCE token exchange
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, activeSession) => {
        if (
          (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') &&
          activeSession
        ) {
          setSession('ready')
        }
      }
    )

    // Fallback: check if session already exists (page refresh case)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSession('ready')
      } else {
        // Give onAuthStateChange time to fire before marking invalid
        const timer = setTimeout(() => {
          setSession((prev) => prev === 'checking' ? 'invalid' : prev)
        }, 3000)
        return () => clearTimeout(timer)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  /* ── Submit ───────────────────────────────────────────────────── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      setSuccess(true)
      setTimeout(() => router.push('/dashboard'), 2500)
    } catch {
      setError('Erro ao atualizar a senha. Solicite um novo link de recuperação.')
    } finally {
      setLoading(false)
    }
  }

  /* ── States ───────────────────────────────────────────────────── */

  // Verificando sessão do link
  if (session === 'checking') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
        <Loader2 size={28} className="animate-spin text-[#005BFF]" />
        <p className="text-sm text-[#5D6475]">Verificando link de recuperação...</p>
      </div>
    )
  }

  // Link inválido ou expirado
  if (session === 'invalid') {
    return (
      <div className="flex flex-col items-center gap-5 py-8 text-center">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: 'rgba(220,38,38,0.10)' }}
        >
          <AlertCircle size={24} style={{ color: '#DC2626' }} />
        </div>
        <div>
          <h3
            className="text-base font-bold text-[#0B1020]"
            style={{ fontFamily: 'Space Grotesk, sans-serif' }}
          >
            Link inválido ou expirado
          </h3>
          <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-[#5D6475]">
            O link de recuperação de senha é válido por 1 hora. Solicite um novo abaixo.
          </p>
        </div>
        <Link
          href="/recuperar-senha"
          className="group inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-6 py-3 text-sm font-bold text-white shadow-sm transition-all hover:-translate-y-0.5"
        >
          Solicitar novo link
          <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </Link>
      </div>
    )
  }

  // Senha atualizada com sucesso
  if (success) {
    return (
      <div className="flex flex-col items-center gap-5 py-8 text-center">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-[0_12px_40px_rgba(0,91,255,0.28)]"
          style={{ background: 'linear-gradient(135deg, #005BFF, #7B2CFF)' }}
        >
          <CheckCircle size={28} />
        </div>
        <div>
          <h3
            className="text-xl font-bold text-[#0B1020]"
            style={{ fontFamily: 'Space Grotesk, sans-serif' }}
          >
            Senha atualizada!
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-[#5D6475]">
            Redirecionando para o dashboard...
          </p>
        </div>
        <Loader2 size={18} className="animate-spin text-[#005BFF]" />
      </div>
    )
  }

  /* ── Form ─────────────────────────────────────────────────────── */
  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">

      {/* Nova senha */}
      <div>
        <Label htmlFor="password" className="mb-2 block text-sm font-semibold text-[#0B1020]">
          Nova senha
        </Label>
        <div className="relative">
          <Lock
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5D6475]"
            aria-hidden="true"
          />
          <Input
            id="password"
            type={showPw ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Mínimo de 8 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 rounded-2xl border-[#E3E7F0] pl-10 pr-11 text-sm transition-all duration-300 focus-visible:border-[#005BFF]/40 focus-visible:ring-4 focus-visible:ring-[#005BFF]/10"
            required
          />
          <button
            type="button"
            onClick={() => setShowPw(!showPw)}
            aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#5D6475] transition-colors hover:text-[#0B1020]"
          >
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-[#5D6475]">
          Use letras, números e símbolos para uma senha forte.
        </p>
      </div>

      {/* Confirmar nova senha */}
      <div>
        <Label htmlFor="confirm" className="mb-2 block text-sm font-semibold text-[#0B1020]">
          Confirmar nova senha
        </Label>
        <div className="relative">
          <Lock
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5D6475]"
            aria-hidden="true"
          />
          <Input
            id="confirm"
            type={showPw ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Repita a nova senha"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="h-12 rounded-2xl border-[#E3E7F0] pl-10 text-sm transition-all duration-300 focus-visible:border-[#005BFF]/40 focus-visible:ring-4 focus-visible:ring-[#005BFF]/10"
            required
          />
        </div>
      </div>

      {/* Força da senha — indicador visual simples */}
      {password.length > 0 && (
        <div className="flex items-center gap-2">
          {[
            password.length >= 8,
            /[A-Z]/.test(password),
            /[0-9]/.test(password),
            /[^A-Za-z0-9]/.test(password),
          ].map((ok, i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full transition-all duration-300"
              style={{
                background: ok
                  ? i < 2 ? '#F97316' : '#16A34A'
                  : '#E3E7F0',
              }}
            />
          ))}
          <span className="text-[10px] font-semibold text-[#5D6475] whitespace-nowrap">
            {password.length < 8 ? 'Fraca' : /[^A-Za-z0-9]/.test(password) ? 'Forte' : 'Média'}
          </span>
        </div>
      )}

      {/* Erro */}
      {error && (
        <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-600">
          {error}
        </p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="group mt-2 inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] text-sm font-bold text-white shadow-[0_18px_40px_rgba(0,91,255,0.22)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(123,44,255,0.28)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            Atualizando...
          </>
        ) : (
          <>
            Definir nova senha
            <ArrowRight
              size={16}
              className="transition-transform duration-300 group-hover:translate-x-1"
              aria-hidden="true"
            />
          </>
        )}
      </button>

      {/* Segurança */}
      <p className="flex items-center justify-center gap-2 text-xs text-[#5D6475]">
        <ShieldCheck size={14} style={{ color: '#005BFF' }} aria-hidden="true" />
        Sua nova senha é criptografada e protegida.
      </p>

      {/* Voltar */}
      <p className="text-center text-sm text-[#5D6475]">
        <Link
          href="/login"
          className="font-semibold text-[#005BFF] transition-colors hover:text-[#7B2CFF]"
        >
          Voltar ao login
        </Link>
      </p>
    </form>
  )
}
