'use client'

import { colors } from '@/lib/design-tokens'

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

export default function BasicInfoTab({
  formData,
  onFieldChange,
}: BasicInfoTabProps) {
  return (
    <div className="space-y-6">
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
            Uma frase que será exibida no resumo do seu anúncio.
          </p>
          <span style={{ color: colors.textMuted }} className="text-xs">
            {formData?.short_description?.length || 0}/100
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
            Explique o que torna seu aplicativo diferente e interessante.
          </p>
          <span style={{ color: colors.textMuted }} className="text-xs">
            {formData?.full_description?.length || 0}/2000
          </span>
        </div>
      </div>

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
          Público-alvo *
        </label>
        <select
          value={formData?.target_audience || ''}
          onChange={(e) => onFieldChange('target_audience', e.target.value)}
          className="w-full px-4 py-2 border rounded-lg text-sm"
          style={{ borderColor: colors.border }}
        >
          <option value="">Selecione</option>
          {AUDIENCES.map((aud) => (
            <option key={aud} value={aud}>
              {aud}
            </option>
          ))}
        </select>
        <p className="text-xs mt-1" style={{ color: colors.textMuted }}>
          Para qual público seu app é ideal?
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
              e.target.value.split(',').map((l) => l.trim())
            )
          }
          placeholder="pt, en, es"
          className="w-full px-4 py-2 border rounded-lg text-sm"
          style={{ borderColor: colors.border }}
        />
        <p className="text-xs mt-1" style={{ color: colors.textMuted }}>
          Separe os idiomas com vírgula.
        </p>
      </div>
    </div>
  )
}
