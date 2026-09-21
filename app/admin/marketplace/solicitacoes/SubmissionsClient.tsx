'use client'

import { useState } from 'react'
import { CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react'

interface Submission {
  id: string
  status: string
  submitted_at: string
  app_draft_id: string
  submitted_by: string
  public_feedback: string | null
  internal_notes: string | null
  data: any
}

interface SubmissionsClientProps {
  initialSubmissions: Submission[]
}

const statusConfig = {
  pending: { label: 'Pendente', icon: Clock, color: '#F59E0B' },
  approved: { label: 'Aprovado', icon: CheckCircle, color: '#10B981' },
  rejected: { label: 'Rejeitado', icon: XCircle, color: '#EF4444' },
  changes_requested: { label: 'Ajustes solicitados', icon: AlertCircle, color: '#3B82F6' },
}

export default function SubmissionsClient({ initialSubmissions }: SubmissionsClientProps) {
  const [submissions, setSubmissions] = useState<Submission[]>(initialSubmissions)
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null)
  const [action, setAction] = useState<'approve' | 'reject' | 'request_changes' | null>(null)
  const [publicFeedback, setPublicFeedback] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const handleAction = async () => {
    if (!selectedSubmission || !action) return

    setSaving(true)
    try {
      const res = await fetch(`/api/admin/submissions/${selectedSubmission.id}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          public_feedback: publicFeedback,
          internal_notes: internalNotes,
        }),
      })

      if (!res.ok) throw new Error('Failed to update')

      const updated = await res.json()
      setSubmissions(submissions.map((s) => (s.id === updated.id ? updated : s)))
      setSelectedSubmission(updated)
      setAction(null)
      setPublicFeedback('')
      setInternalNotes('')
    } catch (err) {
      console.error('Action error:', err)
      alert('Erro ao processar ação')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid md:grid-cols-3 gap-6">
      {/* List */}
      <div className="md:col-span-2 space-y-3">
        {submissions.map((sub) => {
          const cfg = statusConfig[sub.status as keyof typeof statusConfig]
          const StatusIcon = cfg?.icon || Clock
          return (
            <div
              key={sub.id}
              onClick={() => setSelectedSubmission(sub)}
              className="p-4 rounded-lg border cursor-pointer hover:shadow-md transition-shadow"
              style={{
                borderColor: selectedSubmission?.id === sub.id ? '#3B82F6' : '#E5E7EB',
                backgroundColor: selectedSubmission?.id === sub.id ? '#F0F9FF' : 'white',
              }}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-bold text-lg">{sub.data?.name || 'Sem nome'}</h3>
                <div className="flex items-center gap-1" style={{ color: cfg?.color }}>
                  <StatusIcon size={16} />
                  <span className="text-xs font-semibold">{cfg?.label}</span>
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-2">{sub.data?.short_description}</p>
              <p className="text-xs text-gray-500">{new Date(sub.submitted_at).toLocaleDateString('pt-BR')}</p>
            </div>
          )
        })}
      </div>

      {/* Details */}
      {selectedSubmission && (
        <div className="border rounded-lg p-6 space-y-4" style={{ borderColor: '#E5E7EB' }}>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Aplicativo</p>
            <h3 className="font-bold text-lg">{selectedSubmission.data?.name}</h3>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Descrição</p>
            <p className="text-sm">{selectedSubmission.data?.short_description}</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Categoria</p>
            <p className="text-sm">{selectedSubmission.data?.category}</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Planos</p>
            <p className="text-sm">{selectedSubmission.data?.plans || 0} plano(s)</p>
          </div>

          {selectedSubmission.status !== 'pending' && (
            <>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Feedback Público</p>
                <p className="text-sm">{selectedSubmission.public_feedback || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Notas Internas</p>
                <p className="text-sm">{selectedSubmission.internal_notes || '—'}</p>
              </div>
            </>
          )}

          {selectedSubmission.status === 'pending' && !action ? (
            <div className="space-y-2 border-t pt-4">
              <button
                onClick={() => setAction('approve')}
                className="w-full px-3 py-2 rounded text-white font-semibold text-sm bg-green-500 hover:bg-green-600"
              >
                ✓ Aprovar
              </button>
              <button
                onClick={() => setAction('request_changes')}
                className="w-full px-3 py-2 rounded text-white font-semibold text-sm bg-blue-500 hover:bg-blue-600"
              >
                ⚠ Solicitar ajustes
              </button>
              <button
                onClick={() => setAction('reject')}
                className="w-full px-3 py-2 rounded text-white font-semibold text-sm bg-red-500 hover:bg-red-600"
              >
                ✗ Rejeitar
              </button>
            </div>
          ) : action ? (
            <div className="border-t pt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Feedback (público)</label>
                <textarea
                  value={publicFeedback}
                  onChange={(e) => setPublicFeedback(e.target.value)}
                  placeholder="Mensagem que o dev verá..."
                  rows={2}
                  className="w-full p-2 border rounded text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Notas internas</label>
                <textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  placeholder="Apenas para admin..."
                  rows={2}
                  className="w-full p-2 border rounded text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAction}
                  disabled={saving}
                  className="flex-1 px-3 py-2 bg-blue-500 text-white rounded text-sm font-semibold hover:bg-blue-600 disabled:opacity-50"
                >
                  {saving ? 'Enviando...' : 'Confirmar'}
                </button>
                <button
                  onClick={() => {
                    setAction(null)
                    setPublicFeedback('')
                    setInternalNotes('')
                  }}
                  className="flex-1 px-3 py-2 border rounded text-sm font-semibold"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
