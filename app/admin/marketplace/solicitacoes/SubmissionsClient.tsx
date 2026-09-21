'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Filter, RotateCcw, Clock, Zap, AlertCircle, CheckCircle, XCircle } from 'lucide-react'

const darkColors = {
  bg: '#10151F',
  card: '#171F2D',
  header: '#131A26',
  border: '#2B3547',
  text: '#F1F5F9',
  textSecondary: '#A9B5C8',
  primary: '#1765FF',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
}

interface Submission {
  id: string
  status: string
  submitted_at: string
  app_draft_id: string
  submitted_by: string
  public_feedback: string | null
  data: any
  app_drafts?: any
}

interface SubmissionsClientProps {
  initialSubmissions: Submission[]
}

const statusConfig = {
  pending: { label: 'Aguardando análise', icon: Clock, color: darkColors.warning },
  changes_requested: { label: 'Aguardando ajustes', icon: AlertCircle, color: darkColors.warning },
  approved: { label: 'Aprovado', icon: CheckCircle, color: darkColors.success },
  rejected: { label: 'Rejeitado', icon: XCircle, color: darkColors.error },
  in_review: { label: 'Em análise', icon: Zap, color: darkColors.primary },
}

export default function SubmissionsClient({ initialSubmissions }: SubmissionsClientProps) {
  const router = useRouter()
  const [submissions] = useState<Submission[]>(initialSubmissions)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const pendingCount = submissions.filter((s) => s.status === 'pending').length
  const reviewingCount = submissions.filter((s) => s.status === 'in_review').length
  const adjustsCount = submissions.filter((s) => s.status === 'changes_requested').length
  const approvedCount = submissions.filter((s) => s.status === 'approved').length
  const rejectedCount = submissions.filter((s) => s.status === 'rejected').length

  const statusCards = [
    { label: 'Aguardando análise', count: pendingCount, icon: Clock, filter: 'pending', color: darkColors.warning },
    { label: 'Em análise', count: reviewingCount, icon: Zap, filter: 'in_review', color: darkColors.primary },
    { label: 'Aguardando ajustes', count: adjustsCount, icon: AlertCircle, filter: 'changes_requested', color: darkColors.warning },
    { label: 'Aprovadas', count: approvedCount, icon: CheckCircle, filter: 'approved', color: darkColors.success },
    { label: 'Rejeitadas', count: rejectedCount, icon: XCircle, filter: 'rejected', color: darkColors.error },
  ]

  const filtered = submissions.filter((s) => {
    const matchSearch = !searchTerm || s.app_drafts?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchStatus = statusFilter === 'all' || s.status === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <div style={{ background: darkColors.bg, color: darkColors.text, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ background: darkColors.header, borderBottom: `1px solid ${darkColors.border}`, padding: '32px 24px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '8px' }}>Solicitações do marketplace</h1>
        <p style={{ color: darkColors.textSecondary, marginBottom: '24px' }}>Revise os aplicativos de parceiros e acompanhe cada etapa até a publicação.</p>

        {/* Status Cards */}
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          {statusCards.map((card) => {
            const Icon = card.icon
            return (
              <div
                key={card.filter}
                onClick={() => setStatusFilter(card.filter)}
                style={{
                  background: darkColors.card,
                  border: statusFilter === card.filter ? `2px solid ${card.color}` : `1px solid ${darkColors.border}`,
                  borderRadius: '12px',
                  padding: '16px',
                  cursor: 'pointer',
                  transition: 'all 200ms',
                }}
              >
                <div className="flex items-center gap-3">
                  <Icon size={24} style={{ color: card.color }} />
                  <div className="flex-1">
                    <p style={{ color: darkColors.textSecondary, fontSize: '12px' }}>{card.label}</p>
                    <p style={{ fontSize: '28px', fontWeight: 'bold', lineHeight: 1 }}>{card.count}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Filters */}
      <div style={{ padding: '24px', borderBottom: `1px solid ${darkColors.border}`, display: 'flex', gap: '12px', alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: darkColors.textSecondary }} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar aplicativo ou desenvolvedor"
            style={{
              width: '100%',
              padding: '10px 12px 10px 40px',
              background: darkColors.card,
              border: `1px solid ${darkColors.border}`,
              borderRadius: '8px',
              color: darkColors.text,
              fontSize: '14px',
            }}
          />
        </div>
        <button
          onClick={() => {
            setSearchTerm('')
            setStatusFilter('all')
          }}
          style={{
            background: darkColors.card,
            border: `1px solid ${darkColors.border}`,
            color: darkColors.text,
            padding: '10px 16px',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          <RotateCcw size={16} />
          Limpar
        </button>
      </div>

      {/* Table */}
      <div style={{ padding: '24px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${darkColors.border}` }}>
              <th style={{ textAlign: 'left', padding: '12px', color: darkColors.textSecondary, fontSize: '12px', fontWeight: '600' }}>Aplicativo</th>
              <th style={{ textAlign: 'left', padding: '12px', color: darkColors.textSecondary, fontSize: '12px', fontWeight: '600' }}>Desenvolvedor</th>
              <th style={{ textAlign: 'left', padding: '12px', color: darkColors.textSecondary, fontSize: '12px', fontWeight: '600' }}>Categoria</th>
              <th style={{ textAlign: 'left', padding: '12px', color: darkColors.textSecondary, fontSize: '12px', fontWeight: '600' }}>Enviado em</th>
              <th style={{ textAlign: 'left', padding: '12px', color: darkColors.textSecondary, fontSize: '12px', fontWeight: '600' }}>Status</th>
              <th style={{ textAlign: 'left', padding: '12px', color: darkColors.textSecondary, fontSize: '12px', fontWeight: '600' }}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '40px 12px', color: darkColors.textSecondary }}>
                  Nenhuma solicitação encontrada
                </td>
              </tr>
            ) : (
              filtered.map((sub) => {
                const cfg = statusConfig[sub.status as keyof typeof statusConfig]
                const Icon = cfg?.icon || Clock
                return (
                  <tr
                    key={sub.id}
                    onClick={() => router.push(`/admin/marketplace/solicitacoes/${sub.id}`)}
                    style={{
                      borderBottom: `1px solid ${darkColors.border}`,
                      cursor: 'pointer',
                      transition: 'background 200ms',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = darkColors.card)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <img src={sub.app_drafts?.logo_url || ''} alt="Logo" style={{ width: '32px', height: '32px', borderRadius: '6px', background: darkColors.card }} />
                      <div>
                        <p style={{ fontWeight: '600', fontSize: '14px' }}>{sub.app_drafts?.name}</p>
                        <p style={{ color: darkColors.textSecondary, fontSize: '12px', marginTop: '2px' }}>{sub.app_drafts?.short_description}</p>
                      </div>
                    </td>
                    <td style={{ padding: '12px', color: darkColors.textSecondary, fontSize: '14px' }}>-</td>
                    <td style={{ padding: '12px', color: darkColors.textSecondary, fontSize: '14px' }}>{sub.app_drafts?.category}</td>
                    <td style={{ padding: '12px', color: darkColors.textSecondary, fontSize: '14px' }}>{new Date(sub.submitted_at).toLocaleDateString('pt-BR')}</td>
                    <td style={{ padding: '12px' }}>
                      <div className="flex items-center gap-2" style={{ color: cfg?.color, fontSize: '12px', fontWeight: '600' }}>
                        <Icon size={16} />
                        {cfg?.label}
                      </div>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <button
                        style={{
                          background: darkColors.primary,
                          color: 'white',
                          border: 'none',
                          padding: '8px 16px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '600',
                        }}
                      >
                        Analisar
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
