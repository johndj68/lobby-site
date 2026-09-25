'use client'

import { useRouter } from 'next/navigation'
import { CheckCircle, ChevronRight } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import { SUBMISSION_STATUS_LABELS } from '@/lib/marketplace'

interface SucessoClientProps {
  draft: any
  submission: any
}

export default function SucessoClient({ draft, submission }: SucessoClientProps) {
  const router = useRouter()

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: '#F9FAFB' }}>
      {/* Header */}
      <div className="bg-white border-b px-8 py-4" style={{ borderColor: colors.border }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: colors.text }}>LOBBY | PARCEIROS</p>
          <button onClick={() => router.push('/dashboard/meus-app')} className="text-sm" style={{ color: colors.primary }}>
            ← Voltar ao painel
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="bg-white rounded-lg p-8 max-w-md w-full text-center" style={{ border: `1px solid ${colors.border}` }}>
          <div className="flex justify-center mb-4">
            <CheckCircle size={48} style={{ color: colors.primary }} />
          </div>

          <h1 className="text-2xl font-bold mb-2" style={{ color: colors.text }}>Aplicativo enviado para análise</h1>

          <p className="text-sm mb-6" style={{ color: colors.textSecondary }}>
            Você pode acompanhar o andamento e as mensagens da equipe pelo painel.
          </p>

          <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-2">
            <div>
              <p className="text-xs" style={{ color: colors.textSecondary }}>Aplicativo</p>
              <p className="font-semibold" style={{ color: colors.text }}>{draft.name}</p>
            </div>
            <div className="border-t pt-2" style={{ borderColor: colors.border }}>
              <p className="text-xs" style={{ color: colors.textSecondary }}>Submissão ID</p>
              <p className="font-mono text-sm" style={{ color: colors.text }}>{submission.id}</p>
            </div>
            <div className="border-t pt-2" style={{ borderColor: colors.border }}>
              <p className="text-xs" style={{ color: colors.textSecondary }}>Enviado em</p>
              <p className="text-sm" style={{ color: colors.text }}>{new Date(submission.submitted_at).toLocaleDateString('pt-BR')}</p>
            </div>
            <div className="border-t pt-2" style={{ borderColor: colors.border }}>
              <p className="text-xs" style={{ color: colors.textSecondary }}>Estado</p>
              <p className="text-sm font-semibold" style={{ color: colors.primary }}>{SUBMISSION_STATUS_LABELS[submission.status] ?? submission.status}</p>
            </div>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => router.push(`/dashboard/meus-app/${draft.id}`)}
              className="w-full py-2 px-4 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2"
              style={{ backgroundColor: colors.primary }}
            >
              Acompanhar análise <ChevronRight size={16} />
            </button>
            <button
              onClick={() => router.push('/dashboard/meus-app')}
              className="w-full py-2 px-4 rounded-lg text-sm font-semibold border"
              style={{ borderColor: colors.border, color: colors.text }}
            >
              Voltar aos meus aplicativos
            </button>
          </div>

          <p className="text-xs mt-6" style={{ color: colors.textSecondary }}>
            Você receberá notificações sobre o andamento da análise por e-mail.
          </p>
        </div>
      </div>
    </div>
  )
}
