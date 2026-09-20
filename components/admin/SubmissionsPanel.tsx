'use client'

import { useState } from 'react'
import { colors } from '@/lib/design-tokens'
import { Check, X, Clock, MessageSquare } from 'lucide-react'
import Container from '@/components/layout/Container'

interface Submission {
  id: string
  app_draft_id: string
  status: string
  submitted_at: string
  reviewed_at?: string
  data: any
  app_drafts: {
    organization_id: string
    created_by: string
  }
}

interface SubmissionsPanelProps {
  submissions: Submission[]
}

const statusColors: Record<string, { bg: string; text: string; icon: any }> = {
  pending: {
    bg: '#FEF3C7',
    text: '#B45309',
    icon: Clock,
  },
  approved: {
    bg: '#D1FAE5',
    text: '#065F46',
    icon: Check,
  },
  rejected: {
    bg: '#FEE2E2',
    text: '#7F1D1D',
    icon: X,
  },
  changes_requested: {
    bg: '#E0E7FF',
    text: '#312E81',
    icon: MessageSquare,
  },
}

export default function SubmissionsPanel({
  submissions,
}: SubmissionsPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')

  const filtered = submissions.filter((s) =>
    filter === 'all' ? true : s.status === filter
  )

  const selected = submissions.find((s) => s.id === selectedId)

  return (
    <div
      style={{ backgroundColor: colors.backgroundAlt, minHeight: '100vh' }}
      className="py-8"
    >
      <Container>
        <div className="space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold" style={{ color: colors.text }}>
              Submissões de Aplicativos
            </h1>
            <p style={{ color: colors.textSecondary }}>
              Analise e aprove novos aplicativos.
            </p>
          </div>

          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            {['all', 'pending', 'approved', 'rejected', 'changes_requested'].map(
              (status) => (
                <button
                  key={status}
                  onClick={() => setFilter(status)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                    filter === status
                      ? 'text-white'
                      : 'border'
                  }`}
                  style={{
                    backgroundColor:
                      filter === status ? colors.primary : 'transparent',
                    borderColor:
                      filter === status ? 'transparent' : colors.border,
                    color: filter === status ? 'white' : colors.text,
                  }}
                >
                  {status === 'all'
                    ? 'Todas'
                    : status === 'pending'
                      ? 'Pendentes'
                      : status === 'approved'
                        ? 'Aprovadas'
                        : status === 'rejected'
                          ? 'Rejeitadas'
                          : 'Ajustes Solicitados'}
                </button>
              )
            )}
          </div>

          {/* List and Detail */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* List */}
            <div className="lg:col-span-1">
              <div
                className="rounded-2xl border overflow-hidden"
                style={{ borderColor: colors.border, backgroundColor: colors.background }}
              >
                <div
                  className="p-4 border-b"
                  style={{ borderColor: colors.border, backgroundColor: colors.backgroundAlt }}
                >
                  <p className="font-semibold" style={{ color: colors.text }}>
                    {filtered.length} submissão(ões)
                  </p>
                </div>

                <div className="divide-y" style={{ borderColor: colors.border }}>
                  {filtered.map((submission) => {
                    const statusInfo = statusColors[submission.status]
                    const Icon = statusInfo.icon

                    return (
                      <button
                        key={submission.id}
                        onClick={() => setSelectedId(submission.id)}
                        className="w-full p-4 text-left hover:bg-gray-50 transition-colors"
                        style={{
                          backgroundColor:
                            selectedId === submission.id ? colors.backgroundAlt : 'transparent',
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className="p-2 rounded"
                            style={{ backgroundColor: statusInfo.bg }}
                          >
                            <Icon size={16} style={{ color: statusInfo.text }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold truncate" style={{ color: colors.text }}>
                              {submission.data?.name || 'Sem nome'}
                            </p>
                            <p
                              className="text-xs truncate"
                              style={{ color: colors.textSecondary }}
                            >
                              {new Date(submission.submitted_at).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Detail */}
            <div className="lg:col-span-2">
              {selected ? (
                <div
                  className="rounded-2xl border p-6 space-y-6"
                  style={{ borderColor: colors.border, backgroundColor: colors.background }}
                >
                  <div>
                    <h3 className="text-2xl font-bold" style={{ color: colors.text }}>
                      {selected.data?.name || 'Sem nome'}
                    </h3>
                    <p style={{ color: colors.textSecondary }}>
                      Enviado em{' '}
                      {new Date(selected.submitted_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>

                  {/* Status */}
                  <div>
                    <p className="font-semibold mb-2" style={{ color: colors.text }}>
                      Status
                    </p>
                    <div
                      className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold"
                      style={{
                        backgroundColor: statusColors[selected.status].bg,
                        color: statusColors[selected.status].text,
                      }}
                    >
                      {statusColors[selected.status].icon && (
                        statusColors[selected.status].icon
                      )}
                      {selected.status === 'pending'
                        ? 'Pendente'
                        : selected.status === 'approved'
                          ? 'Aprovada'
                          : selected.status === 'rejected'
                            ? 'Rejeitada'
                            : 'Ajustes Solicitados'}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="border-t pt-6 space-y-3" style={{ borderColor: colors.border }}>
                    <p className="font-semibold" style={{ color: colors.text }}>
                      Ações
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        className="px-4 py-2 rounded-full font-semibold text-white text-sm"
                        style={{ backgroundColor: '#10B981' }}
                      >
                        Aprovar
                      </button>
                      <button
                        className="px-4 py-2 rounded-full font-semibold text-white text-sm"
                        style={{ backgroundColor: '#6B7280' }}
                      >
                        Solicitar Ajustes
                      </button>
                      <button
                        className="px-4 py-2 rounded-full font-semibold text-white text-sm"
                        style={{ backgroundColor: '#DC2626' }}
                      >
                        Rejeitar
                      </button>
                    </div>
                  </div>

                  {/* Data preview */}
                  <div className="border-t pt-6 space-y-3" style={{ borderColor: colors.border }}>
                    <p className="font-semibold" style={{ color: colors.text }}>
                      Dados
                    </p>
                    <pre
                      className="text-xs p-4 rounded overflow-x-auto"
                      style={{
                        backgroundColor: colors.backgroundAlt,
                        color: colors.text,
                      }}
                    >
                      {JSON.stringify(selected.data, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : (
                <div
                  className="rounded-2xl border p-12 text-center"
                  style={{ borderColor: colors.border, backgroundColor: colors.background }}
                >
                  <p style={{ color: colors.textSecondary }}>
                    Selecione uma submissão para revisar.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </Container>
    </div>
  )
}
