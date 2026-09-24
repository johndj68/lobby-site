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
  const [messageTab, setMessageTab] = useState<'dev' | 'internal'>('dev')
  const [message, setMessage] = useState(submission.public_feedback || '')
  const [internalNotes, setInternalNotes] = useState(submission.internal_notes || '')
  const [saving, setSaving] = useState(false)
  const [pendingAction, setPendingAction] = useState<'approve' | 'reject' | 'request_changes' | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

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

  const handleAction = async (action: 'approve' | 'reject' | 'request_changes') => {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/submissions/${submission.id}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, public_feedback: message, internal_notes: internalNotes }),
      })
      if (res.ok) {
        alert('Decisão registrada')
        router.push('/admin/marketplace/solicitacoes')
      }
    } catch (err) {
      console.error(err)
      alert('Erro ao registrar decisão')
    } finally {
      setActionLoading(false)
      setPendingAction(null)
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

          {/* Conteúdo Tab */}
          {activeTab === 'conteudo' && (
            <div style={{ background: darkColors.card, border: `1px solid ${darkColors.border}`, borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '8px', color: darkColors.textSecondary }}>DESCRIÇÃO</h4>
                <p style={{ lineHeight: '1.6' }}>{submission.app_drafts?.long_description || submission.app_drafts?.short_description}</p>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '8px', color: darkColors.textSecondary }}>LOGO</h4>
                <img src={submission.app_drafts?.logo_url} alt="Logo" style={{ width: '80px', height: '80px', borderRadius: '8px' }} />
              </div>
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '8px', color: darkColors.textSecondary }}>GALERIA</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '12px' }}>
                  {submission.app_drafts?.gallery_urls?.map((url: string, idx: number) => (
                    <img key={idx} src={url} alt={`Screenshot ${idx}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: '8px' }} />
                  )) || <p style={{ color: darkColors.textSecondary }}>Sem imagens</p>}
                </div>
              </div>
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '8px', color: darkColors.textSecondary }}>FEATURES</h4>
                <ul style={{ lineHeight: '1.8', color: darkColors.textSecondary }}>
                  {submission.app_drafts?.features?.map((f: string, idx: number) => (
                    <li key={idx}>• {f}</li>
                  )) || <li>Sem features informadas</li>}
                </ul>
              </div>
            </div>
          )}

          {/* Oferta Tab */}
          {activeTab === 'oferta' && (
            <div style={{ background: darkColors.card, border: `1px solid ${darkColors.border}`, borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '16px', color: darkColors.textSecondary }}>PLANOS</h4>
              {submission.app_drafts?.plans?.length > 0 ? (
                <div style={{ display: 'grid', gap: '12px' }}>
                  {submission.app_drafts.plans.map((plan: any, idx: number) => (
                    <div key={idx} style={{ background: darkColors.bg, border: `1px solid ${darkColors.border}`, borderRadius: '8px', padding: '16px' }}>
                      <h5 style={{ fontWeight: '600', marginBottom: '8px' }}>{plan.name}</h5>
                      <p style={{ color: darkColors.textSecondary, fontSize: '12px', marginBottom: '8px' }}>{plan.description}</p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '18px', fontWeight: '700', color: darkColors.success }}>
                          ${plan.price} {plan.billing_period}
                        </span>
                        <span style={{ color: darkColors.textSecondary, fontSize: '12px' }}>
                          {plan.trial_days && `Teste ${plan.trial_days}d`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: darkColors.textSecondary }}>Sem planos informados</p>
              )}
            </div>
          )}

          {/* Ativação Tab */}
          {activeTab === 'ativacao' && (
            <div style={{ background: darkColors.card, border: `1px solid ${darkColors.border}`, borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '8px', color: darkColors.textSecondary }}>MÉTODO</h4>
                <p>{submission.app_drafts?.activation_method || '—'}</p>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '8px', color: darkColors.textSecondary }}>LINK ATIVAÇÃO</h4>
                <a href={submission.app_drafts?.activation_url} target="_blank" style={{ color: darkColors.primary, wordBreak: 'break-all' }}>
                  {submission.app_drafts?.activation_url || '—'}
                </a>
              </div>
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '8px', color: darkColors.textSecondary }}>EMAIL SUPORTE</h4>
                <p>{submission.app_drafts?.support_email || '—'}</p>
              </div>
            </div>
          )}

          {/* Histórico Tab */}
          {activeTab === 'historico' && (
            <div style={{ background: darkColors.card, border: `1px solid ${darkColors.border}`, borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
              <p style={{ color: darkColors.textSecondary }}>Versão atual: {submission.id.slice(0, 8)}</p>
              <p style={{ color: darkColors.textSecondary, fontSize: '12px', marginTop: '4px' }}>Enviado em {new Date(submission.submitted_at).toLocaleDateString('pt-BR')}</p>
            </div>
          )}

          {/* Messages */}
          <div style={{ background: darkColors.card, border: `1px solid ${darkColors.border}`, borderRadius: '12px', padding: '20px' }}>
            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', borderBottom: `1px solid ${darkColors.border}`, paddingBottom: '16px' }}>
              <button
                onClick={() => setMessageTab('dev')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: messageTab === 'dev' ? darkColors.text : darkColors.textSecondary,
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  paddingBottom: '8px',
                  borderBottom: messageTab === 'dev' ? `2px solid ${darkColors.primary}` : 'none',
                }}
              >
                Mensagem ao desenvolvedor
              </button>
              <button
                onClick={() => setMessageTab('internal')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: messageTab === 'internal' ? darkColors.text : darkColors.textSecondary,
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  paddingBottom: '8px',
                  borderBottom: messageTab === 'internal' ? `2px solid ${darkColors.primary}` : 'none',
                }}
              >
                Nota interna
              </button>
            </div>
            <textarea
              value={messageTab === 'dev' ? message : internalNotes}
              onChange={(e) => messageTab === 'dev' ? setMessage(e.target.value) : setInternalNotes(e.target.value)}
              placeholder={messageTab === 'dev' ? 'Mensagem ao desenvolvedor...' : 'Nota interna (não será enviada)...'}
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
                onClick={() => setPendingAction('request_changes')}
                disabled={actionLoading}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: darkColors.primary,
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: actionLoading ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                  fontSize: '14px',
                  opacity: actionLoading ? 0.6 : 1,
                }}
              >
                {actionLoading && pendingAction === 'request_changes' ? 'Enviando...' : 'Solicitar ajustes'}
              </button>
              <button
                onClick={() => setPendingAction('reject')}
                disabled={actionLoading}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'transparent',
                  border: `1px solid ${darkColors.border}`,
                  color: darkColors.error,
                  borderRadius: '8px',
                  cursor: actionLoading ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                  fontSize: '14px',
                  opacity: actionLoading ? 0.6 : 1,
                }}
              >
                {actionLoading && pendingAction === 'reject' ? 'Enviando...' : 'Rejeitar solicitação'}
              </button>
              <button
                onClick={() => setPendingAction('approve')}
                disabled={blockerCount > 0 || actionLoading}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: blockerCount > 0 || actionLoading ? darkColors.border : darkColors.success,
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: blockerCount > 0 || actionLoading ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                  fontSize: '14px',
                  opacity: blockerCount > 0 || actionLoading ? 0.5 : 1,
                }}
              >
                {actionLoading && pendingAction === 'approve' ? 'Enviando...' : 'Aprovar aplicativo'}
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

      {/* Action Confirmation Modal */}
      {pendingAction && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => !actionLoading && setPendingAction(null)}
        >
          <div
            style={{
              background: darkColors.card,
              border: `1px solid ${darkColors.border}`,
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '500px',
              width: '90%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>
              {pendingAction === 'approve' && 'Aprovar aplicativo'}
              {pendingAction === 'reject' && 'Rejeitar solicitação'}
              {pendingAction === 'request_changes' && 'Solicitar ajustes'}
            </h3>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ color: darkColors.textSecondary, fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '8px' }}>
                Feedback ao desenvolvedor
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Mensagem que será enviada por email..."
                style={{
                  width: '100%',
                  padding: '12px',
                  background: darkColors.bg,
                  border: `1px solid ${darkColors.border}`,
                  borderRadius: '8px',
                  color: darkColors.text,
                  fontFamily: 'system-ui',
                  fontSize: '14px',
                  minHeight: '100px',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ color: darkColors.textSecondary, fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '8px' }}>
                Notas internas
              </label>
              <textarea
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Apenas para admin (não será enviado)..."
                style={{
                  width: '100%',
                  padding: '12px',
                  background: darkColors.bg,
                  border: `1px solid ${darkColors.border}`,
                  borderRadius: '8px',
                  color: darkColors.text,
                  fontFamily: 'system-ui',
                  fontSize: '14px',
                  minHeight: '80px',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => handleAction(pendingAction)}
                disabled={actionLoading}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: pendingAction === 'approve' ? darkColors.success : pendingAction === 'reject' ? darkColors.error : darkColors.primary,
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: actionLoading ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                  fontSize: '14px',
                  opacity: actionLoading ? 0.6 : 1,
                }}
              >
                {actionLoading ? 'Enviando...' : 'Confirmar'}
              </button>
              <button
                onClick={() => !actionLoading && setPendingAction(null)}
                disabled={actionLoading}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: 'transparent',
                  border: `1px solid ${darkColors.border}`,
                  color: darkColors.text,
                  borderRadius: '8px',
                  cursor: actionLoading ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                  fontSize: '14px',
                  opacity: actionLoading ? 0.6 : 1,
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
