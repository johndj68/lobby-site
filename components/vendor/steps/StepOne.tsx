'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'
import { colors } from '@/lib/design-tokens'
import { ArrowRight, AlertCircle, Loader } from 'lucide-react'

interface StepOneProps {
  user: User
  hasOrganization: boolean
  onDraftCreated: (id: string, data: any) => void
}

export default function StepOne({
  user,
  hasOrganization,
  onDraftCreated,
}: StepOneProps) {
  const router = useRouter()
  const [loadingUrl, setLoadingUrl] = useState(false)
  const [errorUrl, setErrorUrl] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const supabase = createClient()

  const handleImportFromUrl = async () => {
    if (!organizationId) {
      setErrorUrl('Selecione uma organização')
      return
    }

    if (!urlInput) {
      setErrorUrl('Digite a URL do seu aplicativo')
      return
    }

    setLoadingUrl(true)
    setErrorUrl('')

    try {
      // Scrape app info from URL
      const scrapeResponse = await fetch('/api/scrape-app-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput }),
      })

      if (!scrapeResponse.ok) {
        const error = await scrapeResponse.json()
        throw new Error(error.error || 'Falha ao importar')
      }

      const { data: scrapedData } = await scrapeResponse.json()

      // Create draft com dados do scrape
      const { data: draft, error: draftError } = await supabase
        .from('app_drafts')
        .insert({
          organization_id: organizationId,
          created_by: user.id,
          stage: 2,
          status: 'draft',
          import_source: 'url',
          website_url: urlInput,
          ...scrapedData,
        })
        .select()
        .single()

      if (draftError) throw draftError

      // Redirecionar para editor em vez de chamar callback
      router.push(`/cadastro-meuapp/${draft.id}/editar`)
    } catch (error) {
      setErrorUrl((error as Error).message)
    } finally {
      setLoadingUrl(false)
    }
  }

  const handleManualStart = async () => {
    if (!organizationId) {
      setErrorUrl('Selecione uma organização')
      return
    }

    setLoadingUrl(true)
    try {
      const { data: draft, error } = await supabase
        .from('app_drafts')
        .insert({
          organization_id: organizationId,
          created_by: user.id,
          stage: 2,
          status: 'draft',
          import_source: 'manual',
        })
        .select()
        .single()

      if (error) throw error
      // Redirecionar para editor em vez de chamar callback
      router.push(`/cadastro-meuapp/${draft.id}/editar`)
    } catch (error) {
      setErrorUrl((error as Error).message)
    } finally {
      setLoadingUrl(false)
    }
  }

  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-3">
        <div className="text-sm font-semibold uppercase tracking-wide" style={{ color: colors.primary }}>
          Venda na LOBBY
        </div>
        <h1 className="text-4xl font-bold" style={{ color: colors.text }}>
          Seu aplicativo merece{' '}
          <span style={{ color: colors.primary }}>ser descoberto.</span>
        </h1>
        <p className="text-lg" style={{ color: colors.textSecondary }}>
          Crie sua página de produto, apresente sua oferta e envie para análise da nossa equipe.
        </p>
      </div>

      {/* Organization selector */}
      {hasOrganization && (
        <div className="space-y-2">
          <label className="block font-semibold" style={{ color: colors.text }}>
            Organização
          </label>
          <select
            value={organizationId}
            onChange={(e) => setOrganizationId(e.target.value)}
            className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2"
            style={{
              borderColor: colors.border,
              backgroundColor: colors.background,
            }}
          >
            <option value="">Selecione uma organização</option>
            {/* This will be populated via useEffect in real implementation */}
          </select>
        </div>
      )}

      {/* Method cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Import from URL */}
        <div
          className="p-6 rounded-2xl border space-y-4"
          style={{ borderColor: colors.border, backgroundColor: colors.background }}
        >
          <h3 className="text-xl font-bold" style={{ color: colors.text }}>
            Comece pelo site do seu app
          </h3>
          <p style={{ color: colors.textSecondary }}>
            Use as informações públicas do seu site para criar um rascunho editável.
          </p>

          <div className="space-y-2">
            <input
              type="url"
              placeholder="https://seuapp.com"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="w-full px-4 py-3 border rounded-lg text-sm focus:outline-none focus:ring-2"
              style={{
                borderColor: colors.border,
                backgroundColor: colors.background,
              }}
              disabled={loadingUrl}
            />
            {errorUrl && (
              <div className="flex gap-2 text-sm" style={{ color: '#DC2626' }}>
                <AlertCircle size={16} />
                <span>{errorUrl}</span>
              </div>
            )}
          </div>

          <ul className="text-sm space-y-1" style={{ color: colors.textSecondary }}>
            <li>✓ Importe informações públicas</li>
            <li>✓ Adicione imagens e detalhes</li>
            <li>✓ Revise antes de enviar</li>
          </ul>

          <p className="text-xs" style={{ color: colors.textMuted }}>
            Nada é publicado automaticamente.
          </p>

          <button
            onClick={handleImportFromUrl}
            disabled={loadingUrl || !organizationId}
            className="w-full py-3 rounded-full font-semibold text-white flex items-center justify-center gap-2 transition-all hover:shadow-lg disabled:opacity-50"
            style={{ backgroundColor: colors.primary }}
          >
            {loadingUrl && <Loader size={18} className="animate-spin" />}
            Criar rascunho
          </button>
        </div>

        {/* Card 2: AI Agent */}
        <div
          className="p-6 rounded-2xl border space-y-4"
          style={{ borderColor: colors.border, backgroundColor: colors.background }}
        >
          <h3 className="text-xl font-bold" style={{ color: colors.text }}>
            Use seu agente de IA
          </h3>
          <p style={{ color: colors.textSecondary }}>
            Prepare o conteúdo com o assistente que já conhece seu projeto.
          </p>

          <ul className="text-sm space-y-1" style={{ color: colors.textSecondary }}>
            <li>✓ Organize recursos e diferenciais</li>
            <li>✓ Prepare textos e imagens do produto</li>
            <li>✓ Revise o rascunho antes da análise</li>
          </ul>

          <button
            onClick={() => {
              const prompt = `Você é um assistente para preparar cadastros de aplicativos no marketplace LOBBY.

Analise nosso produto e prepare uma descrição comercial com:
- Nome e categoria do app
- Descrição curta e longa
- Recursos principais
- Público-alvo
- Planos e preços (se aplicável)
- Instruções de ativação

Não inclua senhas, tokens ou dados privados.
Use informações reais do produto.`
              navigator.clipboard.writeText(prompt).catch(() => {})
            }}
            className="w-full py-3 rounded-full font-semibold flex items-center justify-center gap-2 transition-all border"
            style={{
              color: colors.primary,
              borderColor: colors.primary,
              backgroundColor: 'transparent',
            }}
          >
            Copiar prompt
          </button>

          <a href="#" className="block text-sm font-semibold" style={{ color: colors.primary }}>
            Como conectar meu agente →
          </a>

          <p className="text-xs" style={{ color: colors.textMuted }}>
            Você controla o que será compartilhado.
          </p>
        </div>
      </div>

      {/* Manual entry */}
      <div className="text-center">
        <button
          onClick={handleManualStart}
          disabled={loadingUrl || !organizationId}
          className="text-sm font-semibold transition-colors hover:underline disabled:opacity-50"
          style={{ color: colors.primary }}
        >
          Prefere preencher por conta própria? Cadastrar manualmente
        </button>
      </div>

      {/* Evaluation criteria */}
      <div className="space-y-6 pt-8 border-t" style={{ borderColor: colors.border }}>
        <div className="space-y-2">
          <h3 className="text-2xl font-bold" style={{ color: colors.text }}>
            Antes de enviar seu aplicativo
          </h3>
          <p style={{ color: colors.textSecondary }}>
            Conheça os critérios e as próximas etapas.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* What we evaluate */}
          <div
            className="p-6 rounded-2xl border"
            style={{ borderColor: colors.border, backgroundColor: colors.background }}
          >
            <h4 className="font-bold mb-4" style={{ color: colors.text }}>
              O que avaliamos
            </h4>
            <ul className="space-y-2 text-sm" style={{ color: colors.textSecondary }}>
              <li>✓ Produto funcional e pronto para uso</li>
              <li>✓ Informações e imagens fiéis ao produto</li>
              <li>✓ Identidade e direitos de comercialização</li>
              <li>✓ Suporte e documentação disponíveis</li>
              <li>✓ Oferta, limites e reembolso claros</li>
            </ul>
            <p className="text-xs mt-4" style={{ color: colors.textMuted }}>
              O envio não garante aprovação.
            </p>
          </div>

          {/* Next steps */}
          <div
            className="p-6 rounded-2xl border"
            style={{ borderColor: colors.border, backgroundColor: colors.background }}
          >
            <h4 className="font-bold mb-4" style={{ color: colors.text }}>
              Depois do envio
            </h4>
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <span
                  className="font-bold"
                  style={{ color: colors.primary }}
                >
                  1.
                </span>
                <div>
                  <p className="font-semibold" style={{ color: colors.text }}>
                    Análise da equipe
                  </p>
                  <p style={{ color: colors.textSecondary }}>
                    Verificamos o produto e as informações.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span
                  className="font-bold"
                  style={{ color: colors.primary }}
                >
                  2.
                </span>
                <div>
                  <p className="font-semibold" style={{ color: colors.text }}>
                    Ajustes, se necessários
                  </p>
                  <p style={{ color: colors.textSecondary }}>
                    Você acompanha tudo pelo painel.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span
                  className="font-bold"
                  style={{ color: colors.primary }}
                >
                  3.
                </span>
                <div>
                  <p className="font-semibold" style={{ color: colors.text }}>
                    Publicação aprovada
                  </p>
                  <p style={{ color: colors.textSecondary }}>
                    Seu app pode aparecer no marketplace.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </div>
      </div>

      {/* Commission info */}
      <div className="space-y-4 pt-8 border-t" style={{ borderColor: colors.border }}>
        <h3 className="text-2xl font-bold" style={{ color: colors.text }}>
          Vendas e visibilidade, com regras claras
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-6 rounded-2xl border space-y-2" style={{ borderColor: colors.border, backgroundColor: colors.background }}>
            <h4 className="font-bold" style={{ color: colors.text }}>
              Comissões e repasses
            </h4>
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              Consulte e aceite as condições comerciais antes da publicação.
            </p>
          </div>
          <div className="p-6 rounded-2xl border space-y-2" style={{ borderColor: colors.border, backgroundColor: colors.background }}>
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-bold" style={{ color: colors.text }}>
                  Destaque patrocinado
                </h4>
                <p className="text-xs font-semibold text-orange-500">Opcional</p>
              </div>
            </div>
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              Após a aprovação, seu app poderá participar do carrossel de destaque da home.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
