'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Loader2, CheckCircle, ArrowRight, ShieldCheck,
  User, Mail, Phone, Building2, MessageSquare,
  Code2, Settings2, BarChart3, Shield, Sparkles, FileText,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase'
import { submitContact } from '@/app/contato/actions'
import { colors, gradients, borderRadius } from '@/lib/design-tokens'
import { colors } from '@/lib/design-tokens'

/**
 * Interest chips — tune: label (maps to Supabase interest_area), icon.
 * Label value is stored verbatim in Supabase.
 */
const interestOptions = [
  { label: 'Software',              icon: Code2     },
  { label: 'Automação',             icon: Settings2  },
  { label: 'Dados',                 icon: BarChart3  },
  { label: 'Cibersegurança',        icon: Shield     },
  { label: 'Diagnóstico gratuito',  icon: Sparkles   },
]

const MESSAGE_MAX = 500

function formatDoc(v: string) {
  const d = v.replace(/\D/g, '')
  if (d.length <= 11)
    return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  return d.slice(0, 14)
    .replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

export default function ContactForm() {
  const searchParams = useSearchParams()
  // Pré-preenche a mensagem quando chega de um link com contexto, ex.:
  // "Comprar este projeto" em /projetos/[slug] (?mensagem=...). Lazy
  // initializer em vez de efeito — searchParams já está disponível na
  // primeira render, não precisa de setState assíncrono depois.
  const [form, setForm] = useState(() => ({
    name: '', email: '', phone: '', company: '', document: '', interest_area: '',
    message: searchParams.get('mensagem')?.slice(0, MESSAGE_MAX) ?? '',
  }))
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError]     = useState('')

  /* ── Pre-fill with logged-in user data ───────────────────────────
     Priority chain:
       name    → profiles.full_name   → user_metadata.full_name (auth token)
       email   → auth session email   (always reliable)
       company → profiles.company_name
  ────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) return

      const user = session.user
      // user_metadata is stored in the auth token during signUp
      const meta = (user.user_metadata ?? {}) as Record<string, string>

      // Fetch profile for company_name (requires RLS policy: own_profile_select)
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, company_name, phone, document')
        .eq('id', user.id)
        .single()

      const p = profile as { full_name?: string; company_name?: string; phone?: string; document?: string } | null
      setForm((prev) => ({
        ...prev,
        name:     p?.full_name    || meta['full_name'] || prev.name,
        email:    user.email      || prev.email,
        company:  p?.company_name || prev.company,
        phone:    p?.phone        || prev.phone,
        document: p?.document ? formatDoc(p.document) : prev.document,
      }))
    })
  }, [])

  /* ── Submit via Server Action ────────────────────────────────── */
  // A Server Action (app/contato/actions.ts) salva no banco, envia e-mail
  // e WhatsApp para os técnicos líderes, tudo no servidor.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name)    { setError('Nome é obrigatório.');               return }
    if (!form.email)   { setError('E-mail é obrigatório.');             return }
    if (!form.phone)   { setError('Telefone é obrigatório.');           return }
    if (!form.company) { setError('Nome da empresa é obrigatório.');    return }
    if (!form.document){ setError('CPF ou CNPJ é obrigatório.');        return }
    const docDigits = form.document.replace(/\D/g, '')
    if (docDigits.length !== 11 && docDigits.length !== 14) {
      setError('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.')
      return
    }
    if (!form.message) { setError('Mensagem é obrigatória.');           return }

    setLoading(true)
    setError('')

    try {
      const result = await submitContact({
        name:          form.name,
        email:         form.email,
        phone:         form.phone,
        company:       form.company,
        document:      form.document,
        interest_area: form.interest_area,
        message:       form.message,
      })
      if (!result.success) throw new Error(result.error)
      setSuccess(true)
      setForm({ name: '', email: '', phone: '', company: '', document: '', interest_area: '', message: '' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar. Tente novamente em instantes.')
    } finally {
      setLoading(false)
    }
  }

  /* Success state */
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-5">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-[0_12px_40px_rgba(0,91,255,0.28)]"
          style={{ background: gradients.primaryBold }}
        >
          <CheckCircle size={28} />
        </div>
        <div>
          <h3
            className="text-2xl font-bold"
            style={{ fontFamily: 'Space Grotesk, sans-serif', color: colors.text }}
          >
            Mensagem enviada!
          </h3>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed" style={{ color: colors.textSecondary }}>
            Recebemos seu contato e nossa equipe retornará em breve.
          </p>
        </div>
        <button
          onClick={() => setSuccess(false)}
          className="text-sm font-semibold transition-colors hover:text-[#7B2CFF]"
          style={{ color: colors.primary }}
        >
          Enviar outra mensagem
        </button>
      </div>
    )
  }

  /* ── Form ─────────────────────────────────────────────────────── */
  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">

      {/* Row 1 — Nome + E-mail */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Nome */}
        <div>
          <Label htmlFor="name" className="mb-2 block text-sm font-semibold" style={{ color: colors.text }}>
            Nome <span style={{ color: colors.primary }}>*</span>
          </Label>
          <div className="relative">
            <User size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} aria-hidden="true" />
            <Input
              id="name"
              autoComplete="name"
              placeholder="Seu nome completo"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="h-12 rounded-2xl border pl-10 text-sm transition-all duration-300"
              style={{ borderColor: colors.border, color: colors.text }}
              required
            />
          </div>
        </div>

        {/* E-mail */}
        <div>
          <Label htmlFor="email" className="mb-2 block text-sm font-semibold" style={{ color: colors.text }}>
            E-mail <span style={{ color: colors.primary }}>*</span>
          </Label>
          <div className="relative">
            <Mail size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="seu@email.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="h-12 rounded-2xl border pl-10 text-sm transition-all duration-300"
              style={{ borderColor: colors.border, color: colors.text }}
              required
            />
          </div>
        </div>
      </div>

      {/* Row 2 — Telefone + Empresa */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Telefone */}
        <div>
          <Label htmlFor="phone" className="mb-2 block text-sm font-semibold" style={{ color: colors.text }}>
            Telefone / WhatsApp <span style={{ color: colors.primary }}>*</span>
          </Label>
          <div className="relative">
            <Phone size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} aria-hidden="true" />
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              placeholder="(11) 99999-9999"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="h-12 rounded-2xl border pl-10 text-sm transition-all duration-300"
              style={{ borderColor: colors.border, color: colors.text }}
              required
            />
          </div>
        </div>

        {/* Empresa */}
        <div>
          <Label htmlFor="company" className="mb-2 block text-sm font-semibold" style={{ color: colors.text }}>
            Empresa <span style={{ color: colors.primary }}>*</span>
          </Label>
          <div className="relative">
            <Building2 size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} aria-hidden="true" />
            <Input
              id="company"
              autoComplete="organization"
              placeholder="Nome da sua empresa"
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              className="h-12 rounded-2xl border pl-10 text-sm transition-all duration-300"
              style={{ borderColor: colors.border, color: colors.text }}
              required
            />
          </div>
        </div>
      </div>

      {/* CPF / CNPJ */}
      <div>
        <Label htmlFor="document" className="mb-2 block text-sm font-semibold" style={{ color: colors.text }}>
          CPF ou CNPJ <span style={{ color: colors.primary }}>*</span>
        </Label>
        <div className="relative">
          <FileText size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} aria-hidden="true" />
          <Input
            id="document"
            placeholder="000.000.000-00 ou 00.000.000/0000-00"
            value={form.document}
            onChange={e => setForm({ ...form, document: formatDoc(e.target.value) })}
            className="h-12 rounded-2xl border pl-10 text-sm transition-all duration-300"
            style={{ borderColor: colors.border, color: colors.text }}
            inputMode="numeric"
            maxLength={18}
            required
          />
        </div>
      </div>

      {/* Interest chips */}
      <div>
        <Label className="mb-2.5 block text-sm font-semibold" style={{ color: colors.text }}>
          Área de interesse
        </Label>
        <div className="flex flex-wrap gap-2">
          {interestOptions.map(({ label, icon: Icon }) => {
            const isActive = form.interest_area === label
            return (
              <button
                key={label}
                type="button"
                aria-pressed={isActive}
                onClick={() => setForm({ ...form, interest_area: isActive ? '' : label })}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition-all duration-300"
                style={
                  isActive
                    ? {
                        borderColor: 'transparent',
                        background: gradients.primaryBold,
                        color: 'white',
                        boxShadow: '0_6px_18px_rgba(0,91,255,0.22)',
                      }
                    : {
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                        color: colors.textSecondary,
                      }
                }
              >
                <Icon
                  size={13}
                  aria-hidden="true"
                  style={{ color: isActive ? 'white' : colors.primary }}
                />
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Mensagem + counter */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <Label htmlFor="message" className="text-sm font-semibold" style={{ color: colors.text }}>
            Mensagem <span style={{ color: colors.primary }}>*</span>
          </Label>
          <span className="text-xs" style={{ color: colors.textSecondary }}>
            {form.message.length}<span className="opacity-50">/{MESSAGE_MAX}</span>
          </span>
        </div>
        <div className="relative">
          <MessageSquare size={16} className="pointer-events-none absolute left-3.5 top-3.5" style={{ color: colors.textSecondary }} aria-hidden="true" />
          <Textarea
            id="message"
            placeholder="Conte como podemos ajudar sua empresa..."
            rows={5}
            maxLength={MESSAGE_MAX}
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            className="resize-none rounded-2xl border pl-10 pt-3 text-sm transition-all duration-300"
            style={{ borderColor: colors.border, color: colors.text }}
            required
          />
        </div>
      </div>

      {/* Error message */}
      {error && (
        <p className="rounded-xl px-3.5 py-2.5 text-xs font-medium" style={{ backgroundColor: '#FEE2E2', color: '#DC2626' }}>
          {error}
        </p>
      )}

      {/* Submit button */}
      <button
        type="submit"
        disabled={loading}
        className="group inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-sm font-bold text-white shadow-[0_18px_40px_rgba(0,91,255,0.22)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(123,44,255,0.28)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        style={{ background: gradients.primaryBold }}
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            Enviando...
          </>
        ) : (
          <>
            Enviar mensagem
            <ArrowRight
              size={16}
              className="transition-transform duration-300 group-hover:translate-x-1"
              aria-hidden="true"
            />
          </>
        )}
      </button>

      {/* Security note */}
      <p className="flex items-center justify-center gap-2 text-xs" style={{ color: colors.textSecondary }}>
        <ShieldCheck size={14} style={{ color: colors.primary }} aria-hidden="true" />
        Suas informações estão seguras e serão usadas apenas para contato.
      </p>
    </form>
  )
}
