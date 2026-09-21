'use client'

import { useState, useCallback, useEffect } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'
import { colors } from '@/lib/design-tokens'
import { Save, AlertCircle, CheckCircle2 } from 'lucide-react'
import EditorHeader from './EditorHeader'
import EditorTabs from './EditorTabs'
import ProductPreview from './preview/ProductPreview'
import SaveIndicator from './SaveIndicator'

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
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')
  const supabase = createClient()
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

  return (
    <div style={{ backgroundColor: colors.backgroundAlt, minHeight: '100vh' }}>
      <EditorHeader
        draftName={formData?.name || 'Seu aplicativo'}
        saveState={saveState}
        onSave={handleManualSave}
      />

      <div className="flex gap-6 p-6 mx-auto max-w-7xl">
        {/* Editor Column */}
        <div className="flex-1">
          <EditorTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            formData={formData}
            onFieldChange={handleFieldChange}
            draftId={draftId}
          />
        </div>

        {/* Preview Column */}
        <div className="w-full max-w-md">
          <div
            className="sticky top-24 rounded-xl border p-4"
            style={{
              backgroundColor: colors.background,
              borderColor: colors.border,
            }}
          >
            <h3
              className="font-bold mb-4"
              style={{ color: colors.text }}
            >
              Prévia do anúncio
            </h3>
            <ProductPreview data={formData} />
          </div>
        </div>
      </div>

      {/* Save Error Alert */}
      {saveState === 'error' && (
        <div
          className="fixed bottom-6 left-6 right-6 p-4 rounded-lg flex gap-3 sm:max-w-md"
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
          </div>
        </div>
      )}

      {/* Save Success Toast */}
      {saveState === 'saved' && (
        <div
          className="fixed bottom-6 left-6 right-6 p-4 rounded-lg flex gap-3 sm:max-w-md"
          style={{
            backgroundColor: '#DCFCE7',
            borderLeft: '4px solid #16A34A',
          }}
        >
          <CheckCircle2 size={20} style={{ color: '#16A34A' }} className="flex-shrink-0" />
          <p style={{ color: '#166534' }} className="text-sm font-semibold">
            Rascunho salvo
          </p>
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
