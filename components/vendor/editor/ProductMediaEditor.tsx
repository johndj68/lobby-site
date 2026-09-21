'use client'

import { useState, useCallback } from 'react'
import { User } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { colors } from '@/lib/design-tokens'
import {
  Save,
  AlertCircle,
  CheckCircle2,
  Zap,
  Copy,
  ChevronDown,
  X,
} from 'lucide-react'
import EditorHeader from './EditorHeader'
import EditorTabs from './EditorTabs'
import ProductPreview from './preview/ProductPreview'

interface ProductMediaEditorProps {
  draftId: string
  initialData: any
  user: User
}

export default function ProductMediaEditor({
  draftId,
  initialData,
  user,
}: ProductMediaEditorProps) {
  const [activeTab, setActiveTab] = useState('basico')
  const [formData, setFormData] = useState(initialData)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle'
  )
  const [saveError, setSaveError] = useState('')
  const [showAIBanner, setShowAIBanner] = useState(true)
  const [showPendingItems, setShowPendingItems] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  // Debounced auto-save
  const autoSaveTimeoutRef = useCallback(
    debounce(async (data: any) => {
      try {
        setSaveState('saving')
        const { error } = await supabase
          .from('app_drafts')
          .update({
            ...data,
            stage: 2,
            last_edited_at: new Date().toISOString(),
          })
          .eq('id', draftId)

        if (error) throw error
        setSaveState('saved')
        setTimeout(() => setSaveState('idle'), 2000)
      } catch (err) {
        setSaveError((err as Error).message)
        setSaveState('error')
      }
    }, 1000),
    [draftId, supabase]
  )

  const handleFieldChange = useCallback(
    (field: string, value: any) => {
      setFormData((prev: any) => ({
        ...prev,
        [field]: value,
      }))
      setSaveState('idle')
      autoSaveTimeoutRef(formData)
    },
    [autoSaveTimeoutRef, formData]
  )

  const handleManualSave = useCallback(async () => {
    try {
      setSaveState('saving')
      const { error } = await supabase
        .from('app_drafts')
        .update({
          ...formData,
          stage: 2,
          last_edited_at: new Date().toISOString(),
        })
        .eq('id', draftId)

      if (error) throw error
      setSaveState('saved')
      setSaveError('')
      setTimeout(() => setSaveState('idle'), 2000)
    } catch (err) {
      setSaveError((err as Error).message)
      setSaveState('error')
    }
  }, [formData, draftId, supabase])

  const handleContinue = async () => {
    await handleManualSave()
    setTimeout(() => {
      router.push(`/vendedor/aplicativos/${draftId}/editar-planos`)
    }, 500)
  }

  // Calculate pending requirements
  const getPendingItems = () => {
    const items = []

    // Basic info requirements
    if (!formData?.name) items.push({ tab: 'basico', label: 'Nome do aplicativo' })
    if (!formData?.category) items.push({ tab: 'basico', label: 'Categoria' })
    if (!formData?.short_description)
      items.push({ tab: 'basico', label: 'Descrição curta' })
    if (!formData?.full_description) items.push({ tab: 'basico', label: 'Descrição completa' })
    if (!formData?.differentiator)
      items.push({ tab: 'basico', label: 'Diferencial do produto' })
    if (!formData?.benefit_one || !formData?.benefit_two)
      items.push({ tab: 'basico', label: 'Benefícios' })
    if (!formData?.target_audience) items.push({ tab: 'basico', label: 'Público-alvo' })
    if (!formData?.website_url) items.push({ tab: 'basico', label: 'Website do produto' })

    // Media requirements
    if (!formData?.logo_url) items.push({ tab: 'midia', label: 'Logo do aplicativo' })
    if (!formData?.media_gallery?.some((m: any) => m.type === 'main'))
      items.push({ tab: 'midia', label: 'Imagem principal' })

    // Features requirements
    if (!formData?.features || formData.features.length < 2)
      items.push({ tab: 'funcionalidades', label: 'Mínimo 2 funcionalidades' })

    return items
  }

  const pendingItems = getPendingItems()

  const copyAIPrompt = () => {
    const prompt = `Você é um assistente de marketing especializado em apresentações de software. Com base nestas informações sobre meu aplicativo, prepare sugestões para melhorar a apresentação no marketplace:

Nome: ${formData?.name || '[não preenchido]'}
Categoria: ${formData?.category || '[não preenchido]'}
Descrição curta: ${formData?.short_description || '[não preenchida]'}
Diferencial: ${formData?.differentiator || '[não preenchido]'}
Website: ${formData?.website_url || '[não preenchido]'}
Público-alvo: ${formData?.target_audience || '[não preenchido]'}

Forneça sugestões para:
1. Melhorar a descrição curta (máx 100 caracteres)
2. Melhorar o diferencial (30-255 caracteres)
3. Escrever benefícios claros (até 128 caracteres cada)
4. Sugerir funcionalidades principais

IMPORTANTE:
- Baseie-se APENAS nas informações acima
- Não invente recursos, preços ou clientes
- Não inclua informações privadas ou sensíveis
- Apresente as sugestões organizadas por campo`

    navigator.clipboard.writeText(prompt)
    alert('Prompt copiado para a área de transferência!')
  }

  return (
    <div style={{ backgroundColor: colors.backgroundAlt, minHeight: '100vh' }}>
      <EditorHeader
        draftName={formData?.name || 'Seu aplicativo'}
        saveState={saveState}
        onSave={handleManualSave}
      />

      {/* AI Help Banner */}
      {showAIBanner && (
        <div
          className="mx-auto max-w-7xl px-6 py-4 mt-6 rounded-lg border flex items-start gap-4"
          style={{
            backgroundColor: `${colors.primary}10`,
            borderColor: `${colors.primary}30`,
          }}
        >
          <Zap size={20} style={{ color: colors.primary, flexShrink: 0 }} className="mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-sm" style={{ color: colors.text }}>
              Quer ajuda para escrever?
            </h3>
            <p style={{ color: colors.textSecondary }} className="text-xs mt-1">
              Prepare o conteúdo com seu agente de IA e revise antes de aplicar.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copyAIPrompt}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition"
              style={{ color: colors.primary, backgroundColor: `${colors.primary}15` }}
            >
              <Copy size={14} />
              Copiar prompt
            </button>
            <button
              onClick={() => setShowAIBanner(false)}
              className="p-1 hover:opacity-70"
              style={{ color: colors.textSecondary }}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex gap-6 p-6 mx-auto max-w-7xl">
        {/* Editor Column */}
        <div className="flex-1">
          {/* Pending Items Section */}
          {showPendingItems && pendingItems.length > 0 && (
            <div
              className="mb-6 rounded-lg border p-4"
              style={{
                backgroundColor: colors.background,
                borderColor: '#FCA5A5',
              }}
            >
              <div className="flex items-start gap-3 mb-3">
                <AlertCircle size={18} style={{ color: '#DC2626', flexShrink: 0 }} />
                <div className="flex-1">
                  <h3 className="font-semibold text-sm" style={{ color: colors.text }}>
                    Antes de continuar
                  </h3>
                  <p style={{ color: colors.textSecondary }} className="text-xs mt-1">
                    {pendingItems.length} campo{pendingItems.length > 1 ? 's' : ''} obrigatório{pendingItems.length > 1 ? 's' : ''} para completar esta etapa.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {pendingItems.slice(0, 5).map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveTab(item.tab)}
                    className="w-full text-left text-xs px-3 py-2 rounded-lg transition hover:opacity-80"
                    style={{
                      backgroundColor: colors.backgroundAlt,
                      color: colors.textSecondary,
                    }}
                  >
                    {item.label}
                    <span style={{ color: colors.textMuted }} className="ml-2">
                      →
                    </span>
                  </button>
                ))}
              </div>

              {pendingItems.length > 5 && (
                <button
                  className="w-full text-left text-xs px-3 py-2 rounded-lg mt-2 transition hover:opacity-80"
                  style={{ color: colors.primary }}
                >
                  + {pendingItems.length - 5} mais
                </button>
              )}
            </div>
          )}

          {/* Tabs */}
          <EditorTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            formData={formData}
            onFieldChange={handleFieldChange}
            draftId={draftId}
          />
        </div>

        {/* Preview Column - Hidden on mobile, sticky on desktop */}
        <div className="hidden lg:block w-full max-w-md">
          <div
            className="sticky top-24 rounded-xl border p-4"
            style={{
              backgroundColor: colors.background,
              borderColor: colors.border,
            }}
          >
            <h3 className="font-bold mb-4 text-sm" style={{ color: colors.text }}>
              Prévia do anúncio
            </h3>
            <ProductPreview data={formData} />
          </div>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div
        className="fixed bottom-0 left-0 right-0 border-t px-6 py-4"
        style={{
          backgroundColor: colors.background,
          borderColor: colors.border,
        }}
      >
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div>
            <p style={{ color: colors.textSecondary }} className="text-sm">
              Seu rascunho ainda não foi publicado.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {saveState === 'saving' && (
              <span style={{ color: colors.primary }} className="text-xs font-semibold">
                Salvando…
              </span>
            )}
            {saveState === 'saved' && (
              <span style={{ color: colors.primary }} className="text-xs font-semibold flex items-center gap-1">
                <CheckCircle2 size={14} />
                Salvo
              </span>
            )}

            <button
              onClick={() => router.push('/vendedor/aplicativos')}
              className="px-4 py-2 rounded-lg font-semibold text-sm transition"
              style={{
                backgroundColor: colors.backgroundAlt,
                color: colors.text,
              }}
            >
              Voltar
            </button>

            <button
              onClick={handleManualSave}
              disabled={saveState === 'saving'}
              className="px-4 py-2 rounded-lg font-semibold text-sm text-white transition disabled:opacity-50"
              style={{ backgroundColor: colors.primary }}
            >
              Salvar e sair
            </button>

            <button
              onClick={handleContinue}
              disabled={pendingItems.length > 0 || saveState === 'saving'}
              className="px-6 py-2 rounded-lg font-semibold text-sm text-white transition disabled:opacity-50"
              style={{ backgroundColor: pendingItems.length > 0 ? '#9CA3AF' : colors.primary }}
            >
              Continuar para planos
            </button>
          </div>
        </div>
      </div>

      {/* Add padding to prevent content from being covered by bottom bar */}
      <div style={{ height: '80px' }} />

      {/* Save Error Alert */}
      {saveState === 'error' && (
        <div
          className="fixed bottom-24 left-6 right-6 p-4 rounded-lg flex gap-3 sm:max-w-md"
          style={{
            backgroundColor: '#FEE2E2',
            borderLeft: '4px solid #DC2626',
          }}
        >
          <AlertCircle size={20} style={{ color: '#DC2626' }} className="flex-shrink-0" />
          <div>
            <p style={{ color: '#991B1B' }} className="font-semibold text-sm">
              Erro ao salvar
            </p>
            <p style={{ color: '#991B1B' }} className="text-xs mt-1">
              {saveError}
            </p>
            <button
              onClick={handleManualSave}
              className="text-xs mt-2 underline"
              style={{ color: '#991B1B' }}
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function debounce(func: Function, wait: number) {
  let timeout: NodeJS.Timeout
  return function executedFunction(...args: any[]) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}
