'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  ChevronRight, ClipboardList, ImageIcon, ListChecks, BookOpen, ShieldCheck, HelpCircle, Sparkles, Copy, Check,
} from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import EditorChrome from '@/components/vendor/editor/EditorChrome'
import SaveStateBadge, { type SaveState } from '@/components/vendor/editor/SaveStateBadge'
import UnsavedChangesDialog from '@/components/vendor/editor/UnsavedChangesDialog'
import LivePreviewPanel from '@/components/vendor/editor/LivePreviewPanel'
import BasicInfoTab from './tabs/BasicInfoTab'
import MediaTab from './tabs/MediaTab'
import FeaturesTab from './tabs/FeaturesTab'
import HistoryTab from './tabs/HistoryTab'
import SignalsTab from './tabs/SignalsTab'
import FaqTab from './tabs/FaqTab'
import { draftToFormData, type DraftFormData } from './types'

type Tab = 'basico' | 'media' | 'features' | 'history' | 'signals' | 'faq'

const TABS: { id: Tab; label: string; icon: React.ElementType; optional: boolean }[] = [
  { id: 'basico', label: 'Informações básicas', icon: ClipboardList, optional: false },
  { id: 'media', label: 'Mídia', icon: ImageIcon, optional: false },
  { id: 'features', label: 'Funcionalidades', icon: ListChecks, optional: true },
  { id: 'history', label: 'História do produto', icon: BookOpen, optional: true },
  { id: 'signals', label: 'Sinais de confiança', icon: ShieldCheck, optional: true },
  { id: 'faq', label: 'Perguntas frequentes', icon: HelpCircle, optional: true },
]

interface Props {
  draft: Record<string, unknown> & { id: string }
  vendorName: string | null
  completion: { 1: boolean; 2: boolean; 3: boolean }
  reviewByTab: Record<string, 'complete' | 'pending' | 'optional' | 'warning' | undefined>
}

export default function EditorClient({ draft, vendorName, completion, reviewByTab }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeTab = (TABS.find(t => t.id === searchParams.get('tab'))?.id ?? 'basico') as Tab

  const [formData, setFormData] = useState<DraftFormData>(() => draftToFormData(draft))
  const [savedData, setSavedData] = useState<DraftFormData>(() => draftToFormData(draft))
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [copied, setCopied] = useState(false)
  const [pendingNav, setPendingNav] = useState<string | null>(null)
  const [uploadInFlight, setUploadInFlight] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)

  const isDirty = JSON.stringify(formData) !== JSON.stringify(savedData)
  const saveInFlightRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function setActiveTab(tab: Tab) {
    const params = new URLSearchParams(searchParams.toString())
    if (tab === 'basico') params.delete('tab')
    else params.set('tab', tab)
    router.replace(`/dashboard/meus-app/novo/${draft.id}/editar${params.toString() ? `?${params}` : ''}`, { scroll: false })
  }

  function handleFieldChange<K extends keyof DraftFormData>(field: K, value: DraftFormData[K]) {
    setFormData(prev => ({ ...prev, [field]: value }))
  }
  function handleCategoryChange(categoryId: string | null, label?: string | null) {
    setFormData(prev => ({ ...prev, category_id: categoryId, category: label ?? null }))
  }

  const save = useCallback(async (): Promise<boolean> => {
    if (!navigator.onLine) { setSaveState('offline'); return false }
    saveInFlightRef.current?.abort()
    const controller = new AbortController()
    saveInFlightRef.current = controller
    setSaveState('saving')
    const payload = formData
    try {
      const res = await fetch(`/api/apps/drafts/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      if (!res.ok) { setSaveState('error'); return false }
      // resposta antiga não sobrescreve o mais recente: só aceita se ainda for a chamada em curso
      if (saveInFlightRef.current !== controller) return true
      setSavedData(payload)
      setSaveState('saved')
      return true
    } catch (err) {
      if ((err as Error).name === 'AbortError') return false
      setSaveState('error')
      return false
    }
  }, [formData, draft.id])

  // Autosave com debounce — só reagenda enquanto há alteração real.
  useEffect(() => {
    if (!isDirty) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { save() }, 1200)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData])

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (isDirty || uploadInFlight) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty, uploadInFlight])

  // Correção direta a partir da Revisão: #f-xxx na URL rola até o campo e
  // move o foco pra ele, depois de a aba certa já estar montada.
  useEffect(() => {
    const id = window.location.hash.replace('#', '')
    if (!id) return
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.focus({ preventScroll: true })
    }
  }, [activeTab])

  async function saveAndGo(href: string) {
    if (uploadInFlight) { toast.error('Aguarde o upload terminar antes de continuar.'); return }
    if (isDirty) {
      const ok = await save()
      if (!ok) { toast.error('Não foi possível salvar. Tente novamente.'); return }
    }
    router.push(href)
  }

  function attemptNav(href: string) {
    if (uploadInFlight) { toast.error('Aguarde o upload terminar antes de continuar.'); return }
    if (isDirty) setPendingNav(href)
    else router.push(href)
  }

  const continueHref = `/dashboard/meus-app/novo/${draft.id}/planos`

  const promptText = `Escreva o conteúdo de marketing para o app "${formData.name || '[nome do app]'}": uma descrição curta (até 120 caracteres), um diferencial de produto (até 600 caracteres) e 2 benefícios curtos. Categoria: ${formData.category || '[categoria]'}.`

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(promptText)
      setCopied(true)
      setCopyFailed(false)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyFailed(true)
      toast.error('Não foi possível copiar automaticamente — selecione o texto abaixo.')
    }
  }

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden" style={{ background: colors.backgroundAlt }}>
      <EditorChrome appId={draft.id} appName={(draft.name as string) || 'Aplicativo sem nome'} breadcrumbLabel="Editar"
        currentStep={2} completed={completion} onStepIntercept={attemptNav} />

      {/* Título + ações */}
      <div className="bg-white border-b px-4 py-5 sm:px-8" style={{ borderColor: colors.border }}>
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl" style={{ color: colors.text, fontFamily: 'Space Grotesk, sans-serif' }}>Crie a página do seu aplicativo</h1>
            <p className="mt-1 text-sm" style={{ color: colors.textSecondary }}>Edite as informações e acompanhe a prévia do anúncio.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide" style={{ background: colors.backgroundAlt, color: colors.textSecondary }}>
              Rascunho
            </span>
            <SaveStateBadge state={isDirty && saveState !== 'saving' ? 'dirty' : saveState} />
            <button type="button" onClick={() => save()} disabled={saveState === 'saving'}
              className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-60" style={{ borderColor: colors.primary, color: colors.primary }}>
              Salvar rascunho
            </button>
            <button type="button" onClick={() => saveAndGo(continueHref)} disabled={saveState === 'saving'}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ background: colors.primary }}>
              Continuar para oferta e planos <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Ajuda com IA */}
      <div className="mx-auto w-full max-w-[1440px] px-4 pt-5 sm:px-8">
        <div className="flex flex-col items-start gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: '#DBEAFE', background: '#EFF6FF' }}>
          <div className="flex items-start gap-2.5">
            <Sparkles size={16} className="mt-0.5 shrink-0" style={{ color: colors.primary }} aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold" style={{ color: colors.text }}>Quer ajuda para escrever?</p>
              <p className="text-xs" style={{ color: colors.textSecondary }}>Prepare o conteúdo com seu agente de IA e revise antes de aplicar.</p>
            </div>
          </div>
          <button type="button" onClick={copyPrompt}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold" style={{ borderColor: colors.primary, color: colors.primary }}>
            {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />} {copied ? 'Copiado!' : 'Copiar prompt'}
          </button>
        </div>
        <p className="sr-only" aria-live="polite">{copied ? 'Prompt copiado para a área de transferência' : ''}</p>
        {/* Alternativa selecionável caso o clipboard falhe (ex.: permissão negada pelo navegador) */}
        {copyFailed && (
          <div className="mt-2 rounded-xl border p-3" style={{ borderColor: colors.border, background: '#fff' }}>
            <label htmlFor="prompt-fallback" className="mb-1 block text-xs font-semibold" style={{ color: colors.text }}>
              Copie manualmente:
            </label>
            <textarea id="prompt-fallback" readOnly value={promptText} rows={3} onFocus={e => e.currentTarget.select()}
              className="w-full rounded-lg border px-3 py-2 text-xs" style={{ borderColor: colors.border, color: colors.text }} />
          </div>
        )}
      </div>

      {/* Conteúdo principal */}
      <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-6 px-4 py-6 sm:px-8 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-[58]">
          <nav aria-label="Seções do formulário" className="mb-4 flex gap-1 overflow-x-auto rounded-xl border bg-white p-1" style={{ borderColor: colors.border }}>
            {TABS.map(t => {
              const isActive = t.id === activeTab
              const status = reviewByTab[t.id]
              const Icon = t.icon
              return (
                <button key={t.id} type="button" onClick={() => setActiveTab(t.id)} aria-current={isActive ? 'page' : undefined}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005BFF]"
                  style={{ background: isActive ? colors.backgroundAlt : 'transparent', color: isActive ? colors.primary : colors.textSecondary }}>
                  <Icon size={14} aria-hidden="true" />
                  {t.label}
                  {status === 'complete' && <Check size={12} style={{ color: '#16A34A' }} aria-hidden="true" />}
                  {status === 'pending' && <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#DC2626' }} aria-hidden="true" />}
                  {t.optional && !status && <span className="text-[10px] font-normal" style={{ color: colors.textMuted }}>(opcional)</span>}
                </button>
              )
            })}
          </nav>

          <div className="rounded-2xl border bg-white p-6 sm:p-8" style={{ borderColor: colors.border, boxShadow: '0 8px 40px rgba(11,16,32,0.06)' }}>
            {activeTab === 'basico' && <BasicInfoTab formData={formData} onChange={handleFieldChange} onCategoryChange={handleCategoryChange} />}
            {activeTab === 'media' && <MediaTab formData={formData} onChange={handleFieldChange} appId={draft.id} onUploadingChange={setUploadInFlight} />}
            {activeTab === 'features' && <FeaturesTab formData={formData} onChange={handleFieldChange} />}
            {activeTab === 'history' && <HistoryTab formData={formData} onChange={handleFieldChange} />}
            {activeTab === 'signals' && <SignalsTab formData={formData} onChange={handleFieldChange} />}
            {activeTab === 'faq' && <FaqTab formData={formData} onChange={handleFieldChange} />}
          </div>
        </div>

        <div className="w-full shrink-0 lg:flex-[42]">
          <LivePreviewPanel data={{
            name: formData.name, category: formData.category, vendorName,
            shortDescription: formData.short_description, logoUrl: formData.logo_url,
            mainImageUrl: formData.media_gallery.find(m => m.type === 'main')?.url ?? formData.media_gallery[0]?.url ?? null,
            benefits: formData.benefits, features: formData.features, integrations: formData.integrations,
            targetAudience: formData.target_audience,
          }} />
        </div>
      </div>

      {/* Barra inferior */}
      <div className="sticky bottom-0 z-10 border-t bg-white px-4 py-3 sm:px-8" style={{ borderColor: colors.border }}>
        <div className="mx-auto flex w-full max-w-[1440px] flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={() => attemptNav(`/dashboard/meus-app/novo/${draft.id}/comecar`)}
            className="rounded-lg border px-4 py-2 text-sm font-semibold" style={{ borderColor: colors.border, color: colors.text }}>
            ← Voltar
          </button>
          <div className="flex items-center justify-center sm:justify-end">
            <SaveStateBadge state={isDirty && saveState !== 'saving' ? 'dirty' : saveState} />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => saveAndGo(`/dashboard/meus-app/${draft.id}`)} disabled={saveState === 'saving'}
              className="flex-1 rounded-lg border px-6 py-2 text-sm font-semibold disabled:opacity-60 sm:flex-none" style={{ borderColor: colors.border, color: colors.text }}>
              Salvar e sair
            </button>
            <button type="button" onClick={() => saveAndGo(continueHref)} disabled={saveState === 'saving'}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-6 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:flex-none" style={{ background: colors.primary }}>
              Continuar para oferta e planos <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <UnsavedChangesDialog
        open={pendingNav !== null}
        onOpenChange={next => !next && setPendingNav(null)}
        busy={saveState === 'saving'}
        onSaveAndLeave={async () => {
          if (!pendingNav) return
          const ok = await save()
          if (ok) { const href = pendingNav; setPendingNav(null); router.push(href) }
          else toast.error('Não foi possível salvar. Tente novamente.')
        }}
        onDiscard={() => { if (pendingNav) { const href = pendingNav; setPendingNav(null); router.push(href) } }}
      />
    </div>
  )
}
