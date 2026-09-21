'use client'

import { colors } from '@/lib/design-tokens'
import { CheckCircle2, Circle } from 'lucide-react'
import BasicInfoTab from './tabs/BasicInfoTab'
import MediaTab from './tabs/MediaTab'
import FeaturesTab from './tabs/FeaturesTab'
import HistoryTab from './tabs/HistoryTab'
import TrustSignalsTab from './tabs/TrustSignalsTab'
import FAQTab from './tabs/FAQTab'

interface EditorTabsProps {
  activeTab: string
  onTabChange: (tab: string) => void
  formData: any
  onFieldChange: (field: string, value: any) => void
  draftId: string
}

const tabs = [
  { id: 'basico', label: 'Informações básicas' },
  { id: 'midia', label: 'Mídia' },
  { id: 'funcionalidades', label: 'Funcionalidades' },
  { id: 'historia', label: 'História do produto' },
  { id: 'confianca', label: 'Sinais de confiança' },
  { id: 'faq', label: 'Perguntas frequentes' },
]

export default function EditorTabs({
  activeTab,
  onTabChange,
  formData,
  onFieldChange,
  draftId,
}: EditorTabsProps) {
  const isTabComplete = (tabId: string): boolean => {
    switch (tabId) {
      case 'basico':
        return !!(
          formData?.name &&
          formData?.category &&
          formData?.short_description &&
          formData?.full_description &&
          formData?.differentiator &&
          formData?.benefit_one &&
          formData?.benefit_two &&
          formData?.target_audience &&
          formData?.website_url
        )
      case 'midia':
        return !!(formData?.logo_url && formData?.media_gallery?.some((m: any) => m.type === 'main'))
      case 'funcionalidades':
        return formData?.features?.length >= 2
      case 'historia':
        return true // Optional section
      case 'confianca':
        return true // Optional section
      case 'faq':
        return true // Optional section
      default:
        return false
    }
  }

  const getTabStatus = (tabId: string) => {
    const isComplete = isTabComplete(tabId)
    if (tabId === 'historia' || tabId === 'confianca' || tabId === 'faq') {
      return 'optional'
    }
    return isComplete ? 'complete' : 'incomplete'
  }

  return (
    <div>
      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 mb-6 pb-4 border-b" style={{ borderColor: colors.border }}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id
          const status = getTabStatus(tab.id)
          const isComplete = status === 'complete'
          const isOptional = status === 'optional'

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg transition text-sm font-semibold relative"
              style={{
                color: isActive ? colors.primary : colors.textSecondary,
                backgroundColor: isActive ? colors.backgroundAlt : 'transparent',
              }}
              title={isOptional ? 'Seção opcional' : ''}
            >
              {isComplete && !isActive && (
                <CheckCircle2 size={16} style={{ color: colors.primary }} />
              )}
              {!isComplete && !isActive && (
                <Circle size={16} style={{ color: isOptional ? colors.textMuted : '#DC2626' }} />
              )}
              {tab.label}
              {isOptional && !isActive && (
                <span className="text-xs opacity-60">(opcional)</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div
        className="rounded-xl border p-6"
        style={{
          backgroundColor: colors.background,
          borderColor: colors.border,
        }}
      >
        {activeTab === 'basico' && (
          <BasicInfoTab formData={formData} onFieldChange={onFieldChange} />
        )}
        {activeTab === 'midia' && (
          <MediaTab
            formData={formData}
            onFieldChange={onFieldChange}
            draftId={draftId}
          />
        )}
        {activeTab === 'funcionalidades' && (
          <FeaturesTab formData={formData} onFieldChange={onFieldChange} />
        )}
        {activeTab === 'historia' && (
          <HistoryTab formData={formData} onFieldChange={onFieldChange} />
        )}
        {activeTab === 'confianca' && (
          <TrustSignalsTab formData={formData} onFieldChange={onFieldChange} />
        )}
        {activeTab === 'faq' && (
          <FAQTab formData={formData} onFieldChange={onFieldChange} />
        )}
      </div>
    </div>
  )
}
