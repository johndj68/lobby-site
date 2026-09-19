'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, Phone, Building2, FileText } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import FormInput from './FormInput'
import { colors } from '@/lib/design-tokens'

/* Opções de área de interesse exibidas como chips selecionáveis no formulário */
const interestOptions = ['Software', 'Automação', 'Dados', 'Cibersegurança']

/**
 * Formata CPF ou CNPJ enquanto o usuário digita.
 * Remove tudo que não é dígito e aplica a máscara correta:
 * - até 11 dígitos → CPF:  000.000.000-00
 * - 12 a 14 dígitos → CNPJ: 00.000.000/0000-00
 */
function formatDocument(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length <= 11) {
    // CPF: 000.000.000-00
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  // CNPJ: 00.000.000/0000-00
  return digits
    .slice(0, 14)
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

/**
 * Formulário de cadastro de novo cliente da plataforma LOBBY.
 * Coleta: nome, e-mail, senha, empresa, telefone, documento (CPF/CNPJ)
 * e área de interesse. Ao submeter, cria a conta no Supabase Auth e
 * insere/atualiza o perfil na tabela `profiles` com role = 'client'.
 */
export default function RegisterForm() {
  // Controla a navegação após cadastro bem-sucedido
  const router = useRouter()

  // Alterna visibilidade do campo de senha (olho aberto/fechado)
  const [showPassword, setShowPassword] = useState(false)

  // Indica se a requisição de cadastro está em andamento (desabilita botão)
  const [loading, setLoading] = useState(false)

  // Mensagem de erro exibida ao usuário em caso de validação ou falha na API
  const [error, setError] = useState('')

  // Controla se o usuário aceitou os Termos de Uso e Política de Privacidade
  const [accepted, setAccepted] = useState(false)

  /* Estado único para todos os campos do formulário.
   * Usar um objeto facilita atualizações parciais via spread. */
  const [form, setForm] = useState({
    fullName: '', email: '', password: '',
    companyName: '', phone: '', document: '', interestArea: '',
  })

  /**
   * Valida os campos obrigatórios e envia o cadastro ao Supabase.
   * Ordem de validação:
   *  1. Aceitou os termos?
   *  2. Senha tem ao menos 8 caracteres?
   *  3. Empresa, telefone e documento preenchidos?
   *  4. CPF (11 dígitos) ou CNPJ (14 dígitos) válido?
   * Se tudo ok: cria usuário no Auth → upsert em `profiles` → redireciona.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accepted)                    { setError('Você precisa aceitar os termos.');              return }
    if (form.password.length < 8)     { setError('Senha deve ter pelo menos 8 caracteres.');      return }
    if (!form.companyName.trim())      { setError('Nome da empresa é obrigatório.');               return }
    if (!form.phone.trim())           { setError('Telefone/WhatsApp é obrigatório.');              return }
    if (!form.document.trim())        { setError('CPF ou CNPJ é obrigatório.');                   return }

    // Valida tamanho do documento removendo formatação
    const docDigits = form.document.replace(/\D/g, '')
    if (docDigits.length !== 11 && docDigits.length !== 14) {
      setError('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/register', {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body:        JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))

      if (res.status === 429) {
        setError('Muitas tentativas. Tente novamente em alguns minutos.')
        return
      }
      if (!res.ok) {
        const message: string = data.error ?? 'Erro ao criar conta.'
        setError(message === 'User already registered' ? 'E-mail já cadastrado.' : message)
        return
      }

      // Redireciona para o dashboard após cadastro bem-sucedido
      router.push('/dashboard')
    } catch {
      setError('Erro ao criar conta.')
    } finally {
      setLoading(false)
    }
  }

  /* Marcador visual de campo obrigatório — asterisco reutilizado em vários labels */
  const req = <span style={{ color: colors.primary }}>*</span>

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Nome completo */}
      <div>
        <Label htmlFor="fullName" className="text-sm font-medium" style={{ color: colors.text }}>
          Nome completo {req}
        </Label>
        <Input
          id="fullName"
          placeholder="Digite seu nome completo"
          value={form.fullName}
          onChange={e => setForm({ ...form, fullName: e.target.value })}
          className="mt-1.5 border"
          style={{ borderColor: colors.border, color: colors.text }}
          required
        />
      </div>

      {/* E-mail */}
      <div>
        <Label htmlFor="email" className="text-sm font-medium" style={{ color: colors.text }}>
          E-mail {req}
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="Digite seu melhor e-mail"
          value={form.email}
          onChange={e => setForm({ ...form, email: e.target.value })}
          className="mt-1.5 border"
          style={{ borderColor: colors.border, color: colors.text }}
          required
        />
      </div>

      {/* Senha */}
      <div>
        <Label htmlFor="password" className="text-sm font-medium" style={{ color: colors.text }}>
          Senha {req}
        </Label>
        <div className="relative mt-1.5">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Crie uma senha segura"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            className="border pr-10"
            style={{ borderColor: colors.border, color: colors.text }}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
            style={{ color: colors.textSecondary }}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <p className="text-xs mt-1.5" style={{ color: colors.textSecondary }}>
          Mínimo de 8 caracteres.
        </p>
      </div>

      {/* Empresa + Telefone side by side */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="companyName" className="text-sm font-medium" style={{ color: colors.text }}>
            Nome da empresa {req}
          </Label>
          <div className="relative mt-1.5">
            <Building2 size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} aria-hidden="true" />
            <Input
              id="companyName"
              placeholder="Nome da empresa"
              value={form.companyName}
              onChange={e => setForm({ ...form, companyName: e.target.value })}
              className="border pl-9"
              style={{ borderColor: colors.border, color: colors.text }}
              required
            />
          </div>
        </div>

        <div>
          <Label htmlFor="phone" className="text-sm font-medium" style={{ color: colors.text }}>
            Telefone / WhatsApp {req}
          </Label>
          <div className="relative mt-1.5">
            <Phone size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} aria-hidden="true" />
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              placeholder="(11) 99999-9999"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              className="border pl-9"
              style={{ borderColor: colors.border, color: colors.text }}
              required
            />
          </div>
        </div>
      </div>

      {/* CPF / CNPJ */}
      <div>
        <Label htmlFor="document" className="text-sm font-medium" style={{ color: colors.text }}>
          CPF ou CNPJ {req}
        </Label>
        <div className="relative mt-1.5">
          <FileText size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} aria-hidden="true" />
          <Input
            id="document"
            placeholder="000.000.000-00 ou 00.000.000/0000-00"
            value={form.document}
            onChange={e => setForm({ ...form, document: formatDocument(e.target.value) })}
            className="border pl-9"
            style={{ borderColor: colors.border, color: colors.text }}
            inputMode="numeric"
            maxLength={18}
            required
          />
        </div>
        <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
          Pessoa física: CPF · Pessoa jurídica: CNPJ.
        </p>
      </div>

      {/* Seleção de área de interesse — chips clicáveis, seleção única */}
      <div>
        <Label className="text-sm font-medium text-[#0B1020]">Área de interesse</Label>
        <p className="text-xs text-[#5D6475] mb-2">Selecione a área que mais faz sentido para você.</p>
        <div className="flex flex-wrap gap-2">
          {interestOptions.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => setForm({ ...form, interestArea: opt })}
              // Destaca visualmente a opção selecionada com borda e fundo azul
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                form.interestArea === opt
                  ? 'border-[#005BFF] bg-[#005BFF]/5 text-[#005BFF]'
                  : 'border-[#E3E7F0] text-[#5D6475] hover:border-[#005BFF]/40'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* Checkbox de aceite dos Termos de Uso e Política de Privacidade */}
      <div className="flex items-start gap-3 pt-1">
        <Checkbox
          id="terms"
          checked={accepted}
          onCheckedChange={v => setAccepted(!!v)}
          className="mt-0.5 border-[#E3E7F0] data-[state=checked]:bg-[#005BFF] data-[state=checked]:border-[#005BFF]"
        />
        <label htmlFor="terms" className="text-xs text-[#5D6475] leading-relaxed cursor-pointer">
          Li e aceito a{' '}
          <Link href="/sobre#privacidade" className="text-[#005BFF] hover:underline">Política de Privacidade</Link>
          {' '}e os{' '}
          <Link href="/sobre#termos" className="text-[#005BFF] hover:underline">Termos de Uso</Link>.
        </label>
      </div>

      {/* Exibe mensagem de erro de validação ou da API */}
      {error && <p role="alert" className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      {/* Botão de submissão — desabilitado e com spinner enquanto carrega */}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3.5 lobby-gradient text-white rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {loading ? <><Loader2 size={16} className="animate-spin" />Criando conta...</> : 'Criar conta'}
      </button>

      {/* Link para login — exibido para quem já possui conta */}
      <p className="text-sm text-center text-[#5D6475]">
        Já tem conta?{' '}
        <Link href="/login" className="font-semibold text-[#005BFF] hover:underline">Entrar</Link>
      </p>
    </form>
  )
}
