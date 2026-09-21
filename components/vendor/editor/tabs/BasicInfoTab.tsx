'use client'

import { colors } from '@/lib/design-tokens'
import { X } from 'lucide-react'

interface BasicInfoTabProps {
  formData: any
  onFieldChange: (field: string, value: any) => void
}

const CATEGORIES = [
  'Inteligência Artificial',
  'Automação',
  'Marketing',
  'Gestão e Finanças',
  'Dados e BI',
  'Segurança',
  'Colaboração',
  'Produtividade',
]

const AUDIENCES = [
  'Pequenas empresas',
  'Empresas médias',
  'Startups',
  'Desenvolvedores',
  'Agências',
  'Empresas de tecnologia',
]

const INTEGRATIONS = [
  'Zapier',
  'Slack',
  'Microsoft Teams',
  'Salesforce',
  'HubSpot',
  'Jira',
  'Asana',
  'Monday.com',
  'Airtable',
  'Google Workspace',
]

export default function BasicInfoTab({
  formData,
  onFieldChange,
}: BasicInfoTabProps) {
  const integrations = (formData?.integrations as any[]) || []
  const alternatives = (formData?.alternatives as any[]) || []

  const toggleIntegration = (integration: string) => {
    if (integrations.includes(integration)) {
      onFieldChange(
        'integrations',
        integrations.filter((i) => i !== integration)
      )
    } else if (integrations.length < 5) {
      onFieldChange('integrations', [...integrations, integration])
    }
  }

  const addAlternative = (name: string) => {
    if (!name || alternatives.length >= 3) return
    if (!alternatives.includes(name)) {
      onFieldChange('alternatives', [...alternatives, name])
    }
  }

  const removeAlternative = (idx: number) => {
    onFieldChange(
      'alternatives',
      alternatives.filter((_: any, i: number) => i !== idx)
    )
  }

  return (
    <div className="space-y-8">
      {/* Seção Principal */}
      <div className="space-y-6 pb-6 border-b" style={{ borderColor: colors.border }}>
        <h3 className="text-base font-bold" style={{ color: colors.text }}>
          Informações básicas
        </h3>

        {/* Nome do aplicativo */}
        <div>
          <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
            Nome do aplicativo *
          </label>
          <input
            type="text"
            value={formData?.name || ''}
            onChange={(e) => onFieldChange('name', e.target.value)}
            placeholder="Ex: FlowPilot"
            maxLength={75}
            className="w-full px-4 py-2 border rounded-lg text-sm"
            style={{ borderColor: colors.border }}
          />
          <div className="flex justify-between items-center mt-1">
            <p className="text-xs" style={{ color: colors.textMuted }}>
              Use um nome claro e fácil de lembrar.
            </p>
            <span style={{ color: colors.textMuted }} className="text-xs">
              {formData?.name?.length || 0}/75
            </span>
          </div>
        </div>

        {/* Categoria */}
        <div>
          <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
            Categoria *
          </label>
          <select
            value={formData?.category || ''}
            onChange={(e) => onFieldChange('category', e.target.value)}
            className="w-full px-4 py-2 border rounded-lg text-sm"
            style={{ borderColor: colors.border }}
          >
            <option value="">Selecione uma categoria</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <p className="text-xs mt-1" style={{ color: colors.textMuted }}>
            Escolha a categoria principal do seu aplicativo.
          </p>
        </div>

        {/* Subcategoria */}
        <div>
          <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
            Subcategoria
          </label>
          <input
            type="text"
            value={formData?.subcategory || ''}
            onChange={(e) => onFieldChange('subcategory', e.target.value)}
            placeholder="Ex: Automação de marketing"
            className="w-full px-4 py-2 border rounded-lg text-sm"
            style={{ borderColor: colors.border }}
          />
          <p className="text-xs mt-1" style={{ color: colors.textMuted }}>
            Opcional. Seja mais específico se necessário.
          </p>
        </div>

        {/* Descrição curta */}
        <div>
          <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
            Descrição curta *
          </label>
          <textarea
            value={formData?.short_description || ''}
            onChange={(e) => onFieldChange('short_description', e.target.value)}
            placeholder="Uma frase que será exibida no resumo do seu anúncio."
            maxLength={100}
            rows={2}
            className="w-full px-4 py-2 border rounded-lg text-sm"
            style={{ borderColor: colors.border }}
          />
          <div className="flex justify-between items-center mt-1">
            <p className="text-xs" style={{ color: colors.textMuted }}>
              Uma frase para o resumo do anúncio.
            </p>
            <span style={{ color: colors.textMuted }} className="text-xs">
              {formData?.short_description?.length || 0}/100
            </span>
          </div>
        </div>

        {/* Chamada complementar */}
        <div>
          <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
            Chamada complementar
          </label>
          <input
            type="text"
            value={formData?.callout || ''}
            onChange={(e) => onFieldChange('callout', e.target.value)}
            placeholder="Uma linha de apoio que reforça o valor do seu app"
            maxLength={140}
            className="w-full px-4 py-2 border rounded-lg text-sm"
            style={{ borderColor: colors.border }}
          />
          <div className="flex justify-between items-center mt-1">
            <p className="text-xs" style={{ color: colors.textMuted }}>
              Opcional. Até 140 caracteres.
            </p>
            <span style={{ color: colors.textMuted }} className="text-xs">
              {formData?.callout?.length || 0}/140
            </span>
          </div>
        </div>

        {/* Diferencial do produto */}
        <div>
          <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
            Diferencial do produto *
          </label>
          <textarea
            value={formData?.differentiator || ''}
            onChange={(e) => onFieldChange('differentiator', e.target.value)}
            placeholder="Explique o que torna seu aplicativo diferente..."
            maxLength={255}
            rows={3}
            className="w-full px-4 py-2 border rounded-lg text-sm"
            style={{ borderColor: colors.border }}
          />
          <div className="flex justify-between items-center mt-1">
            <p className="text-xs" style={{ color: colors.textMuted }}>
              Entre 30 e 255 caracteres.
            </p>
            <span style={{ color: colors.textMuted }} className="text-xs">
              {formData?.differentiator?.length || 0}/255
            </span>
          </div>
        </div>

        {/* Descrição completa */}
        <div>
          <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
            Descrição completa *
          </label>
          <textarea
            value={formData?.full_description || ''}
            onChange={(e) => onFieldChange('full_description', e.target.value)}
            placeholder="Descreva em detalhes o seu aplicativo..."
            maxLength={2000}
            rows={6}
            className="w-full px-4 py-2 border rounded-lg text-sm"
            style={{ borderColor: colors.border }}
          />
          <div className="flex justify-between items-center mt-1">
            <p className="text-xs" style={{ color: colors.textMuted }}>
              Explicação detalhada do que torna seu app interessante.
            </p>
            <span style={{ color: colors.textMuted }} className="text-xs">
              {formData?.full_description?.length || 0}/2000
            </span>
          </div>
        </div>

        {/* Benefícios em duas linhas */}
        <div>
          <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
            Benefícios *
          </label>
          <p className="text-xs mb-3" style={{ color: colors.textMuted }}>
            Destaque os principais benefícios para seus clientes. (2 obrigatórios)
          </p>
          <div className="space-y-3">
            <input
              type="text"
              value={formData?.benefit_one || ''}
              onChange={(e) => onFieldChange('benefit_one', e.target.value)}
              placeholder="Benefício 1"
              maxLength={128}
              className="w-full px-4 py-2 border rounded-lg text-sm"
              style={{ borderColor: colors.border }}
            />
            <div className="text-xs text-right" style={{ color: colors.textMuted }}>
              {formData?.benefit_one?.length || 0}/128
            </div>

            <input
              type="text"
              value={formData?.benefit_two || ''}
              onChange={(e) => onFieldChange('benefit_two', e.target.value)}
              placeholder="Benefício 2"
              maxLength={128}
              className="w-full px-4 py-2 border rounded-lg text-sm"
              style={{ borderColor: colors.border }}
            />
            <div className="text-xs text-right" style={{ color: colors.textMuted }}>
              {formData?.benefit_two?.length || 0}/128
            </div>
          </div>
        </div>
      </div>

      {/* Seção Visão Geral */}
      <div className="space-y-6">
        <h3 className="text-base font-bold" style={{ color: colors.text }}>
          Visão geral
        </h3>

        {/* Website */}
        <div>
          <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
            Website do produto *
          </label>
          <input
            type="url"
            value={formData?.website_url || ''}
            onChange={(e) => onFieldChange('website_url', e.target.value)}
            placeholder="https://seuapp.com"
            className="w-full px-4 py-2 border rounded-lg text-sm"
            style={{ borderColor: colors.border }}
          />
          <p className="text-xs mt-1" style={{ color: colors.textMuted }}>
            URL válida HTTP ou HTTPS.
          </p>
        </div>

        {/* Público-alvo */}
        <div>
          <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
            Ideal para *
          </label>
          <select
            value={formData?.target_audience || ''}
            onChange={(e) => onFieldChange('target_audience', e.target.value)}
            className="w-full px-4 py-2 border rounded-lg text-sm"
            style={{ borderColor: colors.border }}
          >
            <option value="">Selecione o público-alvo</option>
            {AUDIENCES.map((aud) => (
              <option key={aud} value={aud}>
                {aud}
              </option>
            ))}
          </select>
          <p className="text-xs mt-1" style={{ color: colors.textMuted }}>
            Qual é o perfil ideal de cliente para seu app?
          </p>
        </div>

        {/* Alternativas a */}
        <div>
          <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
            Alternativas a
          </label>
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Digite o nome de um concorrente e pressione Enter"
              maxLength={100}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.target as HTMLInputElement).value) {
                  addAlternative((e.target as HTMLInputElement).value)
                  ;(e.target as HTMLInputElement).value = ''
                }
              }}
              className="w-full px-4 py-2 border rounded-lg text-sm"
              style={{ borderColor: colors.border }}
            />
            {alternatives.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {alternatives.map((alt: string, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-3 py-1 rounded-full text-sm"
                    style={{ backgroundColor: colors.backgroundAlt, color: colors.text }}
                  >
                    {alt}
                    <button
                      onClick={() => removeAlternative(idx)}
                      className="hover:opacity-70"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs mt-2" style={{ color: colors.textMuted }}>
            Opcional. Até 3 alternativas. ({alternatives.length}/3)
          </p>
        </div>

        {/* Integrações */}
        <div>
          <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
            Integrações disponíveis
          </label>
          <div className="grid grid-cols-2 gap-2">
            {INTEGRATIONS.map((integration) => (
              <button
                key={integration}
                onClick={() => toggleIntegration(integration)}
                className="px-3 py-2 text-sm rounded-lg border transition-all text-left"
                style={{
                  borderColor: integrations.includes(integration)
                    ? colors.primary
                    : colors.border,
                  backgroundColor: integrations.includes(integration)
                    ? `${colors.primary}15`
                    : colors.background,
                  color: colors.text,
                }}
              >
                {integration}
              </button>
            ))}
          </div>
          <p className="text-xs mt-2" style={{ color: colors.textMuted }}>
            Opcional. Até 5 integrações. ({integrations.length}/5)
          </p>
        </div>

        {/* Idiomas */}
        <div>
          <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
            Idiomas disponíveis
          </label>
          <input
            type="text"
            value={formData?.languages?.join(', ') || ''}
            onChange={(e) =>
              onFieldChange(
                'languages',
                e.target.value
                  .split(',')
                  .map((l) => l.trim())
                  .filter((l) => l)
              )
            }
            placeholder="pt, en, es"
            className="w-full px-4 py-2 border rounded-lg text-sm"
            style={{ borderColor: colors.border }}
          />
          <p className="text-xs mt-1" style={{ color: colors.textMuted }}>
            Separe os idiomas com vírgula. Exemplo: pt, en, es
          </p>
        </div>
      </div>
    </div>
  )
}
