'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Link as LinkIcon, Zap, FileText, Star, Check } from 'lucide-react'
import { colors } from '@/lib/design-tokens'

interface User {
  id: string
  email?: string
}

interface Profile {
  id: string
  full_name?: string
  role?: string
}

interface NovoAppClientProps {
  user: User
  profile: Profile
}

export default function NovoAppClient({ user, profile }: NovoAppClientProps) {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [organization, setOrganization] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCreateByUrl = async () => {
    if (!url || !organization) {
      alert('Preencha URL e organização')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/apps/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, organization }),
      })

      if (!res.ok) throw new Error('Falha ao criar')

      const { id } = await res.json()
      router.push(`/dashboard/meus-app/novo/${id}/editar`)
    } catch (err) {
      console.error(err)
      alert('Erro ao criar rascunho')
    } finally {
      setLoading(false)
    }
  }

  const handleManual = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/apps/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (!res.ok) throw new Error('Falha')

      const { id } = await res.json()
      router.push(`/dashboard/meus-app/novo/${id}/editar`)
    } catch (err) {
      alert('Erro')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white" style={{ borderColor: colors.border }}>
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-lg font-bold" style={{ color: colors.primary }}>
              LOBBY
            </div>
            <div style={{ backgroundColor: colors.border }} className="w-px h-6" />
            <span className="text-sm font-semibold" style={{ color: colors.text }}>
              PARCEIROS
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <a href="/dashboard" style={{ color: colors.primary }} className="hover:underline">
              ← Voltar ao dashboard
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-8">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Breadcrumb */}
          <div className="text-sm" style={{ color: colors.textSecondary }}>
            Dashboard / Meus aplicativos / Novo
          </div>

          {/* Hero */}
          <div className="flex items-start justify-between gap-8">
            <div>
              <h1 className="text-4xl font-bold mb-2" style={{ color: colors.text }}>
                Venda seu aplicativo na LOBBY
              </h1>
              <p className="text-lg" style={{ color: colors.textSecondary }}>
                Prepare sua oferta e alcance novos clientes no marketplace.
              </p>
            </div>
            <button
              onClick={() => router.push('/dashboard/meus-app/apps-status')}
              className="px-6 py-2 rounded-lg border font-semibold whitespace-nowrap"
              style={{ borderColor: colors.primary, color: colors.primary }}
            >
              Acompanhar cadastros →
            </button>
          </div>

          {/* Stage Indicator */}
          <div className="flex items-center gap-4">
            {[1, 2, 3, 4].map((stage, idx) => (
              <div key={stage} className="flex items-center gap-4 flex-1">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-sm text-white"
                  style={{ backgroundColor: stage === 1 ? colors.primary : '#E5E7EB' }}
                >
                  {stage}
                </div>
                {idx < 3 && (
                  <div
                    className="hidden md:block h-1 flex-1"
                    style={{ backgroundColor: stage === 1 ? colors.primary : '#E5E7EB' }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* How to Start */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold" style={{ color: colors.text }}>
              Como você quer começar?
            </h2>
            <p style={{ color: colors.textSecondary }}>
              Escolha uma opção para preparar seu cadastro.
            </p>
          </div>

          {/* Cards */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Card 1: URL */}
            <div className="border rounded-2xl p-6 bg-white space-y-4" style={{ borderColor: colors.border }}>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase" style={{ color: colors.primary }}>
                <LinkIcon size={14} />
                PELO SITE DO PRODUTO
              </div>
              <h3 className="text-xl font-bold" style={{ color: colors.text }}>
                Comece pela URL do seu app
              </h3>
              <p style={{ color: colors.textSecondary }}>
                Transforme as informações públicas do seu site em um rascunho editável.
              </p>

              <div className="space-y-3 py-3">
                <div>
                  <label className="text-sm font-semibold mb-1 block" style={{ color: colors.text }}>
                    URL do produto
                  </label>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://seuapp.com"
                    className="w-full px-3 py-2 rounded-lg border text-sm"
                    style={{ borderColor: colors.border, color: colors.text }}
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold mb-1 block" style={{ color: colors.text }}>
                    Organização responsável
                  </label>
                  <select
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border text-sm"
                    style={{ borderColor: colors.border, color: colors.text }}
                  >
                    <option value="">Selecione sua organização</option>
                    <option value="org1">Minha Empresa</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleCreateByUrl}
                disabled={loading}
                className="w-full py-3 rounded-lg text-white font-bold text-sm"
                style={{ backgroundColor: colors.primary }}
              >
                Criar rascunho →
              </button>

              <ul className="space-y-2 text-sm" style={{ color: colors.textSecondary }}>
                <li className="flex gap-2">
                  <Check size={16} style={{ color: colors.primary }} className="shrink-0" />
                  <span>Importe informações públicas</span>
                </li>
                <li className="flex gap-2">
                  <Check size={16} style={{ color: colors.primary }} className="shrink-0" />
                  <span>Adicione imagens e detalhes</span>
                </li>
                <li className="flex gap-2">
                  <Check size={16} style={{ color: colors.primary }} className="shrink-0" />
                  <span>Revise antes de enviar</span>
                </li>
              </ul>

              <div className="p-3 rounded-lg" style={{ backgroundColor: '#F0F9FF', borderColor: colors.primary, border: '1px solid' }}>
                <p className="text-xs" style={{ color: colors.text }}>
                  <strong>ℹ️ Nada é publicado automaticamente.</strong>
                </p>
              </div>
            </div>

            {/* Card 2: IA */}
            <div className="border rounded-2xl p-6 bg-white space-y-4" style={{ borderColor: colors.border }}>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase" style={{ color: colors.primary }}>
                <Zap size={14} />
                COM AGENTE DE IA
              </div>
              <h3 className="text-xl font-bold" style={{ color: colors.text }}>
                Prepare com seu agente de IA
              </h3>
              <p style={{ color: colors.textSecondary }}>
                Use o assistente que já conhece seu projeto para organizar o conteúdo.
              </p>

              <ul className="space-y-2 text-sm" style={{ color: colors.textSecondary }}>
                <li className="flex gap-2">
                  <Check size={16} style={{ color: colors.primary }} className="shrink-0" />
                  <span>Descreva recursos e diferenciais</span>
                </li>
                <li className="flex gap-2">
                  <Check size={16} style={{ color: colors.primary }} className="shrink-0" />
                  <span>Prepare textos e imagens fiéis ao app</span>
                </li>
                <li className="flex gap-2">
                  <Check size={16} style={{ color: colors.primary }} className="shrink-0" />
                  <span>Revise as sugestões antes de aplicar</span>
                </li>
              </ul>

              <button
                className="w-full py-2 rounded-lg border font-semibold text-sm"
                style={{ borderColor: colors.primary, color: colors.primary }}
              >
                📋 Copiar prompt de configuração
              </button>

              <a href="#" style={{ color: colors.primary }} className="text-sm font-semibold hover:underline block">
                Como funciona →
              </a>

              <div className="p-3 rounded-lg" style={{ backgroundColor: '#F0F9FF', borderColor: colors.primary, border: '1px solid' }}>
                <p className="text-xs" style={{ color: colors.text }}>
                  <strong>ℹ️ Você escolhe o que compartilhar.</strong>
                </p>
              </div>
            </div>
          </div>

          {/* Manual */}
          <div className="text-center py-4">
            Prefere começar do zero?{' '}
            <button
              onClick={handleManual}
              disabled={loading}
              style={{ color: colors.primary }}
              className="font-semibold hover:underline"
            >
              Cadastrar manualmente →
            </button>
          </div>

          {/* What we evaluate */}
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 border rounded-2xl p-6 bg-white space-y-4" style={{ borderColor: colors.border }}>
              <h3 className="text-xl font-bold" style={{ color: colors.text }}>
                O que avaliamos
              </h3>
              <p style={{ color: colors.textSecondary }}>
                Confira os critérios antes de enviar.
              </p>

              <div className="space-y-2 text-sm">
                {[
                  'Produto funcional e pronto para uso',
                  'Informações e imagens fiéis ao produto',
                  'Identidade e direitos de comercialização',
                  'Suporte e documentação disponíveis',
                  'Oferta e condições claras'
                ].map((item, i) => (
                  <div key={i} className="flex gap-2">
                    <Check size={16} style={{ color: colors.primary }} className="shrink-0" />
                    <span style={{ color: colors.text }}>{item}</span>
                  </div>
                ))}
              </div>

              <div className="p-3 rounded-lg" style={{ backgroundColor: '#FEF3C7' }}>
                <p className="text-xs" style={{ color: '#92400E' }}>
                  <strong>ℹ️ O envio não garante aprovação.</strong>
                </p>
              </div>
            </div>

            <div className="border rounded-2xl p-6 bg-white space-y-4" style={{ borderColor: colors.border }}>
              <h3 className="text-xl font-bold" style={{ color: colors.text }}>
                Depois do envio
              </h3>
              <p style={{ color: colors.textSecondary }}>
                Entenda as próximas etapas.
              </p>

              <ol className="space-y-3 text-sm">
                {[
                  { num: '1', title: 'Análise da equipe', desc: 'Nossa equipe analisa seu produto.' },
                  { num: '2', title: 'Ajustes, se necessários', desc: 'Podemos solicitar alterações.' },
                  { num: '3', title: 'Publicação após aprovação', desc: 'Seu app será publicado.' }
                ].map((step) => (
                  <li key={step.num}>
                    <div className="font-bold mb-1" style={{ color: colors.primary }}>
                      {step.num}. {step.title}
                    </div>
                    <p style={{ color: colors.textSecondary }}>{step.desc}</p>
                  </li>
                ))}
              </ol>

              <button
                onClick={() => router.push('/dashboard/meus-app/apps-status')}
                className="w-full py-2 rounded-lg border font-semibold text-sm mt-4"
                style={{ borderColor: colors.primary, color: colors.primary }}
              >
                Ver status →
              </button>
            </div>
          </div>

          {/* Where app can appear */}
          <div className="border rounded-2xl p-6 bg-white space-y-4" style={{ borderColor: colors.border }}>
            <h3 className="text-xl font-bold" style={{ color: colors.text }}>
              Onde seu app pode aparecer
            </h3>
            <p style={{ color: colors.textSecondary }}>
              Após aprovação, seu app pode ser encontrado em diferentes áreas da LOBBY.
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg" style={{ backgroundColor: colors.backgroundAlt }}>
                <p className="font-bold mb-1" style={{ color: colors.text }}>🔍 No marketplace</p>
                <p className="text-sm" style={{ color: colors.textSecondary }}>
                  Seu app aparecerá nas categorias e busca.
                </p>
              </div>
              <div className="p-4 rounded-lg" style={{ backgroundColor: colors.backgroundAlt }}>
                <p className="font-bold mb-1" style={{ color: colors.text }}>⭐ No carrossel de destaque</p>
                <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: colors.primary, color: 'white' }}>
                  Patrocinado
                </span>
                <p className="text-sm mt-2" style={{ color: colors.textSecondary }}>
                  Opção de divulgação paga, contratada separadamente.
                </p>
              </div>
            </div>
          </div>

          {/* Commissions */}
          <div className="border rounded-2xl p-6 bg-white space-y-4" style={{ borderColor: colors.border }}>
            <h3 className="text-xl font-bold" style={{ color: colors.text }}>
              Comissões e repasses
            </h3>
            <p style={{ color: colors.textSecondary }}>
              Consulte as condições comerciais antes de enviar sua oferta.
            </p>
            <a href="#" style={{ color: colors.primary }} className="font-semibold hover:underline inline-flex items-center gap-2">
              Consultar condições <ChevronRight size={16} />
            </a>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white mt-12" style={{ borderColor: colors.border }}>
        <div className="max-w-6xl mx-auto px-8 py-8 text-center text-sm" style={{ color: colors.textSecondary }}>
          <p className="mb-4">© 2026 LOBBY. Todos os direitos reservados.</p>
          <div className="flex gap-6 justify-center flex-wrap text-sm">
            <a href="#" style={{ color: colors.primary }} className="hover:underline">Política de Privacidade</a>
            <a href="#" style={{ color: colors.primary }} className="hover:underline">Termos de Uso</a>
            <a href="#" style={{ color: colors.primary }} className="hover:underline">Proposta Visual</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
