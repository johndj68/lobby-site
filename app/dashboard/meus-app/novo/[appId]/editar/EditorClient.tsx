'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Check, AlertCircle, Monitor, Smartphone } from 'lucide-react'
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

const TABS: { id: Tab; label: string }[] = [
  { id: 'basico', label: 'Informações básicas' },
  { id: 'midia', label: 'Mídia' },
  { id: 'funcionalidades', label: 'Funcionalidades' },
  { id: 'historia', label: 'História do produto' },
  { id: 'sinais', label: 'Sinais de confiança' },
  { id: 'faq', label: 'Perguntas frequentes' },
]

export default function EditorClient({ draft, user, profile }: EditorClientProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('basico')
  const [formData, setFormData] = useState(draft.data || {})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop')

  // Auto-save
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
    router.push(`/dashboard/meus-app/novo/${draft.id}/planos`)
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
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              style={{ color: colors.primary }}
              className="text-sm hover:underline flex items-center gap-2"
            >
              ← Voltar ao painel
            </button>
            <button style={{ color: colors.primary }} className="text-sm hover:underline">
              ⓘ Ajuda
            </button>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ backgroundColor: colors.primary, color: 'white' }}>
              JS
            </div>
          </div>
        </div>
      </header>

      {/* Breadcrumb & Stage Indicator */}
      <div className="bg-white border-b px-6 py-4" style={{ borderColor: colors.border }}>
        <div className="max-w-full">
          <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>
            Meus aplicativos / FlowPilot / Editar
          </p>

          {/* Stage Indicator */}
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map((stage) => (
              <div key={stage} className="flex items-center gap-2">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full font-bold text-xs text-white"
                  style={{
                    backgroundColor: stage <= draft.stage ? colors.primary : '#E5E7EB',
                  }}
                >
                  {stage < draft.stage ? '✓' : stage}
                </div>
                {stage < 4 && (
                  <div
                    className="w-8 h-1"
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
      </div>

      {/* Action Bar */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between" style={{ borderColor: colors.border }}>
        <h1 className="text-2xl font-bold" style={{ color: colors.text }}>
          Crie a página do seu aplicativo
        </h1>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveDraft}
            className="px-4 py-2 rounded-lg text-sm font-semibold border"
            style={{ borderColor: colors.border, color: colors.text }}
          >
            Rascunho
          </button>

          {saved && (
            <div className="flex items-center gap-2" style={{ color: colors.primary }}>
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
            {saving ? 'Salvando...' : 'Salvar rascunho'}
          </button>

          <button
            onClick={handleContinue}
            disabled={saving}
            className="px-6 py-2 rounded-lg text-white text-sm font-semibold flex items-center gap-2"
            style={{ backgroundColor: colors.primary }}
          >
            Continuar <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* IA Helper */}
      <div className="bg-blue-50 border-b px-6 py-3 flex items-start justify-between" style={{ borderColor: colors.border }}>
        <div className="flex items-start gap-3 flex-1">
          <span className="text-2xl">⚡</span>
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
          className="px-3 py-1 rounded-lg text-sm font-semibold border flex items-center gap-2 shrink-0"
          style={{ borderColor: colors.primary, color: colors.primary }}
        >
          📋 Copiar prompt
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-6 p-6">
        {/* Left: Tabs & Form */}
        <div className="flex-1 bg-white rounded-lg p-6" style={{ borderColor: colors.border, border: '1px solid' }}>
          {/* Tabs */}
          <div className="flex items-center gap-4 border-b mb-6 -mx-6 px-6" style={{ borderColor: colors.border }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 text-sm font-semibold border-b-2 -mb-6 pb-4 ${
                  activeTab === tab.id
                    ? 'border-primary'
                    : 'border-transparent'
                }`}
                style={{
                  color: activeTab === tab.id ? colors.primary : colors.textSecondary,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div>
            {activeTab === 'basico' && <BasicInfoTab formData={formData} onChange={handleFieldChange} />}
            {activeTab === 'midia' && <MediaTab formData={formData} onChange={handleFieldChange} />}
            {activeTab === 'funcionalidades' && <FeaturesTab formData={formData} onChange={handleFieldChange} />}
            {activeTab === 'historia' && <HistoryTab formData={formData} onChange={handleFieldChange} />}
            {activeTab === 'sinais' && <SignalsTab formData={formData} onChange={handleFieldChange} />}
            {activeTab === 'faq' && <FaqTab formData={formData} onChange={handleFieldChange} />}
          </div>
        </div>

        {/* Right: Preview */}
        <div className="w-96 space-y-4">
          {/* Preview Tabs */}
          <div className="bg-white rounded-lg p-4 flex gap-2">
            <button
              onClick={() => setPreviewMode('desktop')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${
                previewMode === 'desktop' ? 'bg-blue-100' : 'bg-gray-100'
              }`}
              style={{ color: colors.text }}
            >
              <Monitor size={16} /> Desktop
            </button>
            <button
              onClick={() => setPreviewMode('mobile')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${
                previewMode === 'mobile' ? 'bg-blue-100' : 'bg-gray-100'
              }`}
              style={{ color: colors.text }}
            >
              <Smartphone size={16} /> Mobile
            </button>
            <a href="#" className="ml-auto text-sm font-semibold hover:underline" style={{ color: colors.primary }}>
              Ampliar →
            </a>
          </div>

          {/* Preview Box */}
          <div
            className="bg-white rounded-lg p-6 space-y-4"
            style={{
              borderColor: colors.border,
              border: '1px solid',
              minHeight: '600px',
            }}
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg" style={{ backgroundColor: colors.primary }} />
              <div className="flex-1">
                <p className="font-bold" style={{ color: colors.text }}>
                  {formData.name || 'Nome do app'}
                </p>
                <p className="text-sm" style={{ color: colors.textSecondary }}>
                  Por {profile.full_name || 'Seu nome'} · Automação
                </p>
              </div>
            </div>

            <p style={{ color: colors.text }}>
              {formData.description || 'Descrição curta do app'}
            </p>

            {formData.features && (
              <div className="space-y-2">
                {formData.features.map((feat: string, i: number) => (
                  <p key={i} className="text-sm flex gap-2">
                    <Check size={16} style={{ color: colors.primary }} className="shrink-0" />
                    <span style={{ color: colors.text }}>{feat}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="border-t bg-white px-6 py-4 flex items-center justify-between" style={{ borderColor: colors.border }}>
        <button
          onClick={() => router.back()}
          className="text-sm font-semibold"
          style={{ color: colors.text }}
        >
          ← Voltar
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveDraft}
            className="px-4 py-2 rounded-lg text-sm font-semibold border"
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
      <div>
        <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
          Nome do aplicativo *
        </label>
        <p className="text-xs mb-2" style={{ color: '#666' }}>
          Use um nome claro e fácil de lembrar.
        </p>
        <input
          type="text"
          value={formData.name || ''}
          onChange={(e) => onChange('name', e.target.value)}
          placeholder="FlowPilot"
          className="w-full px-4 py-2 rounded-lg border text-sm"
          style={{ borderColor: '#DDD' }}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>Categoria *</label>
          <select
            value={formData.category || ''}
            onChange={(e) => onChange('category', e.target.value)}
            className="w-full px-4 py-2 rounded-lg border text-sm"
            style={{ borderColor: '#DDD' }}
          >
            <option>Automação</option>
            <option>CRM</option>
            <option>Produtividade</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>Subcategoria</label>
          <input
            type="text"
            value={formData.subcategory || ''}
            onChange={(e) => onChange('subcategory', e.target.value)}
            placeholder="Fluxos de trabalho"
            className="w-full px-4 py-2 rounded-lg border text-sm"
            style={{ borderColor: '#DDD' }}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>Descrição curta *</label>
        <p className="text-xs mb-2" style={{ color: '#666' }}>
          Uma frase que seja exibida no seu anúncio.
        </p>
        <input
          type="text"
          value={formData.shortDesc || ''}
          onChange={(e) => onChange('shortDesc', e.target.value)}
          placeholder="Automatize tarefas e conecte suas ferramentas."
          className="w-full px-4 py-2 rounded-lg border text-sm"
          style={{ borderColor: '#DDD' }}
        />
      </div>

      <div>
        <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>Chamada complementar</label>
        <p className="text-xs mb-2" style={{ color: '#666' }}>
          Opcional. Uma linha de apoio que reforça o valor do seu app.
        </p>
        <input
          type="text"
          value={formData.tagline || ''}
          onChange={(e) => onChange('tagline', e.target.value)}
          placeholder="Menos trabalho manual. Mais tempo para crescer."
          className="w-full px-4 py-2 rounded-lg border text-sm"
          style={{ borderColor: '#DDD' }}
        />
      </div>

      <div>
        <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>Diferencial do produto *</label>
        <p className="text-xs mb-2" style={{ color: '#666' }}>
          Explique o que torna seu aplicativo único.
        </p>
        <textarea
          value={formData.differentiation || ''}
          onChange={(e) => onChange('differentiation', e.target.value)}
          placeholder="Crie fluxos visuais para conectar ferramentas e automatizar tarefas, sem precisar programar."
          className="w-full px-4 py-2 rounded-lg border text-sm"
          style={{ borderColor: '#DDD' }}
          rows={4}
        />
      </div>

      <div>
        <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>Benefícios em duas linhas *</label>
        <p className="text-xs mb-2" style={{ color: '#666' }}>
          Destaque os principais benefícios para seus clientes.
        </p>
        <div className="space-y-2">
          <input
            type="text"
            value={formData.benefit1 || ''}
            onChange={(e) => onChange('benefit1', e.target.value)}
            placeholder="Conecte suas ferramentas em um só lugar"
            className="w-full px-4 py-2 rounded-lg border text-sm"
            style={{ borderColor: '#DDD' }}
          />
          <input
            type="text"
            value={formData.benefit2 || ''}
            onChange={(e) => onChange('benefit2', e.target.value)}
            placeholder="Automatize tarefas com fluxos visuais"
            className="w-full px-4 py-2 rounded-lg border text-sm"
            style={{ borderColor: '#DDD' }}
          />
        </div>
      </div>
    </div>
  )
}

function MediaTab({ formData, onChange }: any) {
  return (
    <div className="space-y-6 text-center py-12">
      <AlertCircle size={48} style={{ color: '#999', margin: '0 auto' }} />
      <p style={{ color: '#666' }}>Upload de mídia em desenvolvimento</p>
    </div>
  )
}

function FeaturesTab({ formData, onChange }: any) {
  return (
    <div className="space-y-6 text-center py-12">
      <AlertCircle size={48} style={{ color: '#999', margin: '0 auto' }} />
      <p style={{ color: '#666' }}>Funcionalidades em desenvolvimento</p>
    </div>
  )
}

function HistoryTab({ formData, onChange }: any) {
  return (
    <div className="space-y-6 text-center py-12">
      <AlertCircle size={48} style={{ color: '#999', margin: '0 auto' }} />
      <p style={{ color: '#666' }}>História do produto em desenvolvimento</p>
    </div>
  )
}

function SignalsTab({ formData, onChange }: any) {
  return (
    <div className="space-y-6 text-center py-12">
      <AlertCircle size={48} style={{ color: '#999', margin: '0 auto' }} />
      <p style={{ color: '#666' }}>Sinais de confiança em desenvolvimento</p>
    </div>
  )
}

function FaqTab({ formData, onChange }: any) {
  return (
    <div className="space-y-6 text-center py-12">
      <AlertCircle size={48} style={{ color: '#999', margin: '0 auto' }} />
      <p style={{ color: '#666' }}>Perguntas frequentes em desenvolvimento</p>
    </div>
  )
}
