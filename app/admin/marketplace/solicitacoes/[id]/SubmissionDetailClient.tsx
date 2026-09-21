'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, CheckCircle, AlertCircle, Eye } from 'lucide-react'

const darkColors = {
  bg: '#10151F',
  card: '#171F2D',
  border: '#2B3547',
  text: '#F1F5F9',
  textSecondary: '#A9B5C8',
  primary: '#1765FF',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
}

interface SubmissionDetailClientProps {
  submission: any
  checklistItems: any[]
  issues: any[]
}

export default function SubmissionDetailClient({
  submission,
  checklistItems,
  issues,
}: SubmissionDetailClientProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('visao-geral')
  const [message, setMessage] = useState(submission.public_feedback || '')
  const [internalNotes, setInternalNotes] = useState(submission.internal_notes || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/submissions/${submission.id}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_analysis', public_feedback: message, internal_notes: internalNotes }),
      })
      if (res.ok) {
        alert('Análise salva')
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const blockerCount = issues.filter((i) => i.severity === 'blocker').length

  return (
    <div style={{ background: darkColors.bg, color: darkColors.text, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ background: '#131A26', borderBottom: `1px solid ${darkColors.border}`, padding: '24px' }}>
        <button onClick={() => router.back()} className="flex items-center gap-2 mb-4" style={{ color: darkColors.primary }}>
          <ChevronLeft size={20} />
          Voltar às solicitações
        </button>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <img
              src={submission.app_drafts?.logo_url || 'https://via.placeholder.com/64'}
              alt="Logo"
              className="w-16 h-16 rounded"
            />
            <div>
              <h1 className="text-2xl font-bold">{submission.app_drafts?.name}</h1>
              <p style={{ color: darkColors.textSecondary, fontSize: '14px' }}>
                {submission.app_drafts?.short_description}
              </p>
              <p style={{ color: darkColors.textSecondary, fontSize: '12px', marginTop: '8px' }}>
                Versão {submission.id.slice(0, 8)} • Enviado em {new Date(submission.submitted_at).toLocaleDateString('pt-BR')}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              style={{
                background: 'transparent',
                border: `1px solid ${darkColors.border}`,
                color: darkColors.text,
                padding: '8px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              <Eye size={16} /> Visualizar
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex gap-6 p-8" style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Left column */}
        <div className="flex-1">
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '24px', borderBottom: `1px solid ${darkColors.border}`, marginBottom: '24px' }}>
            {['visao-geral', 'conteudo', 'oferta', 'ativacao', 'historico'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '12px 0',
                  borderBottom: activeTab === tab ? `2px solid ${darkColors.primary}` : `2px solid transparent`,
                  color: activeTab === tab ? darkColors.text : darkColors.textSecondary,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                }}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Checklist */}
          {activeTab === 'visao-geral' && (
            <div style={{ background: darkColors.card, border: `1px solid ${darkColors.border}`, borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px' }}>Checklist de revisão</h3>
              <div className="space-y-2">
                {['Informações básicas', 'Conteúdo e mídia', 'Oferta e planos', 'Ativação e entrega', 'Empresa e suporte'].map((item) => (
                  <div
                    key={item}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px',
                      background: darkColors.bg,
                      borderRadius: '8px',
                    }}
                  >
                    <CheckCircle size={20} style={{ color: darkColors.success }} />
                    <span style={{ flex: 1 }}>{item}</span>
                    <span style={{ color: darkColors.textSecondary, fontSize: '12px' }}>Conferido</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          <div style={{ background: darkColors.card, border: `1px solid ${darkColors.border}`, borderRadius: '12px', padding: '20px' }}>
            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', borderBottom: `1px solid ${darkColors.border}`, paddingBottom: '16px' }}>
              <button
                style={{
                  background: 'none',
                  border: 'none',
                  color: darkColors.text,
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  paddingBottom: '8px',
                  borderBottom: `2px solid ${darkColors.primary}`,
                }}
              >
                Mensagem ao desenvolvedor
              </button>
              <button
                style={{
                  background: 'none',
                  border: 'none',
                  color: darkColors.textSecondary,
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Nota interna
              </button>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Mensagem ao desenvolvedor..."
              style={{
                width: '100%',
                padding: '12px',
                background: darkColors.bg,
                border: `1px solid ${darkColors.border}`,
                borderRadius: '8px',
                color: darkColors.text,
                fontFamily: 'system-ui',
                fontSize: '14px',
                minHeight: '120px',
                resize: 'vertical',
              }}
            />
          </div>
        </div>

        {/* Right column - Decision */}
        <div style={{ width: '360px' }}>
          <div style={{ background: darkColors.card, border: `1px solid ${darkColors.border}`, borderRadius: '12px', padding: '20px', position: 'sticky', top: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px' }}>Decisão da análise</h3>

            {blockerCount > 0 && (
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  padding: '12px',
                  background: darkColors.bg,
                  border: `1px solid ${darkColors.border}`,
                  borderRadius: '8px',
                  marginBottom: '16px',
                }}
              >
                <AlertCircle size={20} style={{ color: darkColors.warning, flexShrink: 0 }} />
                <div style={{ fontSize: '14px' }}>
                  <p style={{ fontWeight: '600' }}>{blockerCount} pendência impede a aprovação</p>
                  <p style={{ color: darkColors.textSecondary, fontSize: '12px', marginTop: '4px' }}>Resolva os pontos indicados no checklist para continuar.</p>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <button
                style={{
                  width: '100%',
                  padding: '12px',
                  background: darkColors.primary,
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '14px',
                }}
              >
                Solicitar ajustes
              </button>
              <button
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'transparent',
                  border: `1px solid ${darkColors.border}`,
                  color: darkColors.error,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '14px',
                }}
              >
                Rejeitar solicitação
              </button>
              <button
                disabled={blockerCount > 0}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: blockerCount > 0 ? darkColors.border : darkColors.success,
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: blockerCount > 0 ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                  fontSize: '14px',
                  opacity: blockerCount > 0 ? 0.5 : 1,
                }}
              >
                Aprovar aplicativo
              </button>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                width: '100%',
                marginTop: '16px',
                padding: '12px',
                background: darkColors.bg,
                border: `1px solid ${darkColors.border}`,
                color: darkColors.text,
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '14px',
              }}
            >
              {saving ? 'Salvando...' : 'Salvar análise'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
