'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Check, AlertCircle, Monitor, Smartphone, X, Zap } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import MediaTab from './tabs/MediaTab'

interface User {
  id: string
  email?: string
}

interface Profile {
  id: string
  full_name?: string
  role?: string
}

interface Draft {
  id: string
  data?: any
  stage: number
  status: string
  created_by: string
  created_at: string
  last_edited_at?: string
}

interface EditorClientProps {
  draft: Draft
  user: User
  profile: Profile
}

type Tab = 'basico' | 'midia' | 'funcionalidades' | 'historia' | 'sinais' | 'faq'

const TABS: { id: Tab; label: string; icon?: string }[] = [
  { id: 'basico', label: 'Informações básicas', icon: '📋' },
  { id: 'midia', label: 'Mídia', icon: '🖼️' },
  { id: 'funcionalidades', label: 'Funcionalidades', icon: '⊙' },
  { id: 'historia', label: 'História do produto', icon: '📖' },
  { id: 'sinais', label: 'Sinais de confiança', icon: '🛡️' },
  { id: 'faq', label: 'Perguntas frequentes', icon: '❓' },
]

export default function EditorClient({ draft, user, profile }: EditorClientProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('basico')
  const [formData, setFormData] = useState(draft.data || {})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop')

  useEffect(() => {
    if (!saved) return
    const timeout = setTimeout(async () => {
      setSaving(true)
      try {
        await fetch(`/api/apps/drafts/${draft.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: formData }),
        })
        setSaved(true)
      } catch (err) {
        console.error(err)
      } finally {
        setSaving(false)
      }
    }, 800)

    return () => clearTimeout(timeout)
  }, [formData, saved, draft.id])

  const handleFieldChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  const handleSaveDraft = async () => {
    setSaving(true)
    try {
      await fetch(`/api/apps/drafts/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: formData }),
      })
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  const handleContinue = async () => {
    await handleSaveDraft()
    router.push(`/partner/novo/${draft.id}/planos`)
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: '#F9FAFB' }}>
      {/* Header */}
      <header className="border-b bg-white" style={{ borderColor: colors.border }}>
        <div className="px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-lg font-bold" style={{ color: colors.primary }}>
              LOBBY
            </div>
            <div style={{ backgroundColor: colors.border }} className="w-px h-6" />
            <span className="text-sm font-semibold" style={{ color: colors.text }}>
              PARCEIROS
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button style={{ color: colors.primary }} className="text-sm hover:underline flex items-center gap-2">
              ← Voltar ao painel
            </button>
            <button style={{ color: colors.primary }} className="text-sm hover:underline flex items-center gap-2">
              ⓘ Ajuda
            </button>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ backgroundColor: colors.primary, color: 'white' }}>
              JS
            </div>
          </div>
        </div>
      </header>

      {/* Breadcrumb + Stage */}
      <div className="bg-white border-b px-8 py-3" style={{ borderColor: colors.border }}>
        <p className="text-xs mb-3" style={{ color: colors.textSecondary }}>
          Meus aplicativos / FlowPilot / Editar
        </p>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4].map((stage) => (
            <div key={stage} className="flex items-center gap-2">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  stage < draft.stage ? 'bg-blue-600 text-white' : stage === draft.stage ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
                }`}
              >
                {stage < draft.stage ? '✓' : stage}
              </div>
              {stage < 4 && (
                <div
                  className="w-6 h-0.5"
                  style={{
                    backgroundColor: stage < draft.stage ? colors.primary : '#E5E7EB',
                  }}
                />
              )}
            </div>
          ))}
          <span className="text-xs font-semibold ml-4" style={{ color: colors.text }}>
            {draft.stage === 1 && 'Começar'}
            {draft.stage === 2 && 'Produto e mídia'}
            {draft.stage === 3 && 'Oferta e planos'}
            {draft.stage === 4 && 'Revisão'}
          </span>
        </div>
      </div>

      {/* Title + Action Bar */}
      <div className="bg-white border-b px-8 py-6" style={{ borderColor: colors.border }}>
        <div className="flex items-start justify-between gap-8 mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-1" style={{ color: colors.text }}>
              Crie a página do seu aplicativo
            </h1>
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              Edite as informações e acompanhe a prévia do anúncio.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => handleSaveDraft()}
              className="px-4 py-2 rounded-lg text-sm font-semibold border"
              style={{ borderColor: colors.border, color: colors.text }}
            >
              Rascunho
            </button>

            {saved && (
              <div className="flex items-center gap-1 px-3 py-2" style={{ color: colors.primary }}>
                <Check size={16} />
                <span className="text-sm">Salvo agora</span>
              </div>
            )}

            <button
              onClick={handleSaveDraft}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold border"
              style={{ borderColor: colors.primary, color: colors.primary }}
            >
              Salvar rascunho
            </button>

            <button
              onClick={handleContinue}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-white text-sm font-semibold flex items-center gap-2"
              style={{ backgroundColor: colors.primary }}
            >
              Continuar <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* IA Helper Box */}
      <div className="bg-white border-b px-8 py-4 flex items-center justify-between" style={{ borderColor: colors.border }}>
        <div className="flex items-center gap-3 flex-1">
          <div className="text-2xl">⚡</div>
          <div>
            <p className="font-semibold text-sm" style={{ color: colors.text }}>
              Quer ajuda para escrever?
            </p>
            <p className="text-xs" style={{ color: colors.textSecondary }}>
              Prepare o conteúdo com seu agente de IA e revise antes de aplicar.
            </p>
          </div>
        </div>
        <button
          className="px-4 py-2 rounded-lg text-sm font-semibold border flex items-center gap-2 shrink-0"
          style={{ borderColor: colors.primary, color: colors.primary }}
        >
          📋 Copiar prompt
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b" style={{ borderColor: colors.border }}>
        <div className="px-8 flex items-center gap-8 overflow-x-auto">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            const isComplete = false
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="py-3 text-sm font-semibold border-b-2 whitespace-nowrap flex items-center gap-2"
                style={{
                  borderColor: isActive ? colors.primary : 'transparent',
                  color: isActive ? colors.primary : colors.text,
                }}
              >
                <span>{tab.icon}</span>
                {tab.label}
                {isComplete && <Check size={14} style={{ color: colors.primary }} />}
              </button>
            )
          })}
          <div className="flex items-center gap-2 ml-auto text-xs font-semibold">
            <Check size={14} style={{ color: colors.primary }} />
            <span style={{ color: colors.primary }}>Completo</span>
            <span style={{ color: '#F59E0B' }}>⊙ Pendente</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-6 p-8 max-w-7xl mx-auto w-full">
        {/* Left: Form */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-lg p-8" style={{ borderColor: colors.border, border: '1px solid' }}>
            {activeTab === 'basico' && <BasicInfoTab formData={formData} onChange={handleFieldChange} />}
            {activeTab === 'midia' && <MediaTab formData={formData} onChange={handleFieldChange} appId={draft.id} />}
            {activeTab === 'funcionalidades' && <PlaceholderTab />}
            {activeTab === 'historia' && <PlaceholderTab />}
            {activeTab === 'sinais' && <PlaceholderTab />}
            {activeTab === 'faq' && <PlaceholderTab />}
          </div>
        </div>

        {/* Right: Preview */}
        <div className="w-80 space-y-4 shrink-0">
          {/* Preview Header */}
          <div className="bg-white rounded-lg p-4" style={{ borderColor: colors.border, border: '1px solid' }}>
            <p className="text-sm font-semibold mb-3" style={{ color: colors.text }}>
              Prévia do anúncio
            </p>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setPreviewMode('desktop')}
                className={`px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${
                  previewMode === 'desktop'
                    ? 'bg-blue-100'
                    : 'bg-gray-100'
                }`}
                style={{ color: colors.text }}
              >
                <Monitor size={16} /> Desktop
              </button>
              <button
                onClick={() => setPreviewMode('mobile')}
                className={`px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${
                  previewMode === 'mobile'
                    ? 'bg-blue-100'
                    : 'bg-gray-100'
                }`}
                style={{ color: colors.text }}
              >
                <Smartphone size={16} /> Mobile
              </button>
              <a href="#" className="ml-auto text-sm font-semibold hover:underline" style={{ color: colors.primary }}>
                Ampliar →
              </a>
            </div>
            <p className="text-xs text-right" style={{ color: colors.textSecondary }}>
              Exemplo ilustrativo
            </p>
          </div>

          {/* Preview Card */}
          <div
            className="bg-white rounded-lg p-6 space-y-4 overflow-y-auto"
            style={{
              borderColor: colors.border,
              border: '1px solid',
              maxHeight: '600px',
            }}
          >
            {/* Header */}
            <div className="flex items-start gap-3 pb-4 border-b" style={{ borderColor: colors.border }}>
              <div
                className="w-14 h-14 rounded-lg flex items-center justify-center text-xl font-bold text-white shrink-0"
                style={{ backgroundColor: colors.primary }}
              >
                {(formData.name || 'A')?.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-sm" style={{ color: colors.text }}>
                  {formData.name || 'FlowPilot'}
                </p>
                <p className="text-xs" style={{ color: colors.textSecondary }}>
                  Por FlowPilot · {formData.category || 'Automação'}
                </p>
              </div>
            </div>

            {/* Description */}
            {formData.shortDesc && (
              <p className="text-sm font-semibold" style={{ color: colors.text }}>
                {formData.shortDesc}
              </p>
            )}

            {/* Features */}
            {formData.images && formData.images.length > 0 && (
              <div className="space-y-2">
                <img
                  src={formData.images[0].url}
                  alt="Preview"
                  className="w-full h-24 object-cover rounded-lg"
                />
              </div>
            )}

            {/* Checklist */}
            <div className="space-y-1 text-xs pt-2" style={{ color: colors.textSecondary }}>
              <p className="font-semibold" style={{ color: colors.text }}>O que você pode fazer</p>
              {formData.benefit1 && (
                <div className="flex gap-2">
                  <Check size={14} style={{ color: colors.primary }} className="shrink-0" />
                  <span>{formData.benefit1}</span>
                </div>
              )}
              {formData.benefit2 && (
                <div className="flex gap-2">
                  <Check size={14} style={{ color: colors.primary }} className="shrink-0" />
                  <span>{formData.benefit2}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="bg-white border-t px-8 py-4 flex items-center justify-between" style={{ borderColor: colors.border }}>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 rounded-lg text-sm font-semibold border"
          style={{ borderColor: colors.border, color: colors.text }}
        >
          ← Voltar
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveDraft}
            className="px-6 py-2 rounded-lg text-sm font-semibold border"
            style={{ borderColor: colors.border, color: colors.text }}
          >
            Salvar e sair
          </button>
          <button
            onClick={handleContinue}
            className="px-6 py-2 rounded-lg text-white text-sm font-semibold flex items-center gap-2"
            style={{ backgroundColor: colors.primary }}
          >
            Continuar para oferta e planos <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

function BasicInfoTab({ formData, onChange }: any) {
  return (
    <div className="space-y-6">
      {/* Row 1 */}
      <div>
        <label className="block text-sm font-semibold mb-1" style={{ color: colors.text }}>
          Nome do aplicativo *
        </label>
        <p className="text-xs mb-2" style={{ color: colors.textSecondary }}>
          Use um nome claro e fácil de lembrar.
        </p>
        <input
          type="text"
          value={formData.name || ''}
          onChange={(e) => onChange('name', e.target.value)}
          placeholder="FlowPilot"
          className="w-full px-4 py-2 rounded-lg border text-sm"
          style={{ borderColor: colors.border, color: colors.text }}
        />
      </div>

      {/* Row 2: Categoria + Subcategoria */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold mb-1" style={{ color: colors.text }}>
            Categoria *
          </label>
          <p className="text-xs mb-2" style={{ color: colors.textSecondary }}>
            Escolha a categoria principal do seu aplicativo.
          </p>
          <select
            value={formData.category || ''}
            onChange={(e) => onChange('category', e.target.value)}
            className="w-full px-4 py-2 rounded-lg border text-sm"
            style={{ borderColor: colors.border, color: colors.text }}
          >
            <option>Automação</option>
            <option>CRM</option>
            <option>Produtividade</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1" style={{ color: colors.text }}>
            Subcategoria
          </label>
          <p className="text-xs mb-2" style={{ color: colors.textSecondary }}>
            Uma subcategoria mais específica.
          </p>
          <input
            type="text"
            value={formData.subcategory || ''}
            onChange={(e) => onChange('subcategory', e.target.value)}
            placeholder="Fluxos de trabalho"
            className="w-full px-4 py-2 rounded-lg border text-sm"
            style={{ borderColor: colors.border, color: colors.text }}
          />
        </div>
      </div>

      {/* Row 3: Descrição curta */}
      <div>
        <label className="block text-sm font-semibold mb-1" style={{ color: colors.text }}>
          Descrição curta *
        </label>
        <p className="text-xs mb-2" style={{ color: colors.textSecondary }}>
          Uma frase que seja exibida em destaque no seu anúncio.
        </p>
        <input
          type="text"
          value={formData.shortDesc || ''}
          onChange={(e) => onChange('shortDesc', e.target.value)}
          placeholder="Automatize tarefas e conecte suas ferramentas."
          className="w-full px-4 py-2 rounded-lg border text-sm"
          style={{ borderColor: colors.border, color: colors.text }}
        />
      </div>

      {/* Row 4: Chamada complementar */}
      <div>
        <label className="block text-sm font-semibold mb-1" style={{ color: colors.text }}>
          Chamada complementar
        </label>
        <p className="text-xs mb-2" style={{ color: colors.textSecondary }}>
          Opcional. Uma linha de apoio que reforça o valor do seu app.
        </p>
        <input
          type="text"
          value={formData.tagline || ''}
          onChange={(e) => onChange('tagline', e.target.value)}
          placeholder="Menos trabalho manual. Mais tempo para crescer."
          className="w-full px-4 py-2 rounded-lg border text-sm"
          style={{ borderColor: colors.border, color: colors.text }}
        />
      </div>

      {/* Row 5: Diferencial do produto */}
      <div>
        <label className="block text-sm font-semibold mb-1" style={{ color: colors.text }}>
          Diferencial do produto *
        </label>
        <p className="text-xs mb-2" style={{ color: colors.textSecondary }}>
          Explique o que torna seu aplicativo único.
        </p>
        <textarea
          value={formData.differentiation || ''}
          onChange={(e) => onChange('differentiation', e.target.value)}
          placeholder="Crie fluxos visuais para conectar ferramentas e automatizar tarefas, sem precisar programar."
          className="w-full px-4 py-2 rounded-lg border text-sm"
          style={{ borderColor: colors.border, color: colors.text }}
          rows={4}
        />
      </div>

      {/* Row 6: Benefícios em duas linhas */}
      <div>
        <label className="block text-sm font-semibold mb-1" style={{ color: colors.text }}>
          Benefícios em duas linhas *
        </label>
        <p className="text-xs mb-2" style={{ color: colors.textSecondary }}>
          Destaque os principais benefícios para seus clientes.
        </p>
        <div className="space-y-2">
          <input
            type="text"
            value={formData.benefit1 || ''}
            onChange={(e) => onChange('benefit1', e.target.value)}
            placeholder="Conecte suas ferramentas em um só lugar"
            className="w-full px-4 py-2 rounded-lg border text-sm"
            style={{ borderColor: colors.border, color: colors.text }}
          />
          <input
            type="text"
            value={formData.benefit2 || ''}
            onChange={(e) => onChange('benefit2', e.target.value)}
            placeholder="Automatize tarefas com fluxos visuais"
            className="w-full px-4 py-2 rounded-lg border text-sm"
            style={{ borderColor: colors.border, color: colors.text }}
          />
        </div>
      </div>

      {/* Row 7: Visão geral sections (Alternativas, Integrações, Ideal para, Website) */}
      <div className="pt-4 border-t" style={{ borderColor: colors.border }}>
        <h3 className="text-lg font-bold mb-4" style={{ color: colors.text }}>
          Visão geral
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1" style={{ color: colors.text }}>
              Alternativas a
            </label>
            <p className="text-xs mb-2" style={{ color: colors.textSecondary }}>
              Os clientes podem comparar seu app com até 3 alternativas conhecidas.
            </p>
            <select
              className="w-full px-4 py-2 rounded-lg border text-sm"
              style={{ borderColor: colors.border, color: colors.text }}
            >
              <option>Selecione até 3 alternativas</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1" style={{ color: colors.text }}>
              Integrações
            </label>
            <p className="text-xs mb-2" style={{ color: colors.textSecondary }}>
              Seus aplicativos se conectam com outras ferramentas.
            </p>
            <div className="flex gap-2">
              <button className="px-3 py-1 rounded text-sm bg-gray-200" style={{ color: colors.text }}>
                Slack ✕
              </button>
              <button className="px-3 py-1 rounded text-sm bg-gray-200" style={{ color: colors.text }}>
                Notion ✕
              </button>
              <button className="px-3 py-1 rounded text-sm bg-gray-200" style={{ color: colors.text }}>
                Gmail ✕
              </button>
              <select className="px-4 py-1 rounded border text-sm" style={{ borderColor: colors.border }}>
                <option>+ Adicionar</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1" style={{ color: colors.text }}>
              Ideal para
            </label>
            <p className="text-xs mb-2" style={{ color: colors.textSecondary }}>
              Qual perfil se beneficia mais com seu app.
            </p>
            <div className="flex gap-2">
              <button className="px-3 py-1 rounded text-sm bg-gray-200" style={{ color: colors.text }}>
                Pequenas empresas ✕
              </button>
              <button className="px-3 py-1 rounded text-sm bg-gray-200" style={{ color: colors.text }}>
                Agências ✕
              </button>
              <select className="px-4 py-1 rounded border text-sm" style={{ borderColor: colors.border }}>
                <option>+ Adicionar</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1" style={{ color: colors.text }}>
              Website do produto
            </label>
            <p className="text-xs mb-2" style={{ color: colors.textSecondary }}>
              Informe o site oficial do seu produto.
            </p>
            <input
              type="url"
              placeholder="https://flowpilot.example"
              className="w-full px-4 py-2 rounded-lg border text-sm"
              style={{ borderColor: colors.border, color: colors.text }}
            />
          </div>
        </div>
      </div>

      <p className="text-xs" style={{ color: colors.textSecondary }}>
        * Campos obrigatórios
      </p>
    </div>
  )
}

function PlaceholderTab() {
  return (
    <div className="text-center py-12">
      <AlertCircle size={48} style={{ color: '#999', margin: '0 auto' }} className="mb-4" />
      <p style={{ color: colors.textSecondary }}>Esta aba está em desenvolvimento</p>
    </div>
  )
}
