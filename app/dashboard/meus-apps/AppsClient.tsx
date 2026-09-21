'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, FileText, MessageSquare, CheckCircle2, Clock, AlertCircle } from 'lucide-react'
import { colors } from '@/lib/design-tokens'

interface AppDraft {
  id: string
  name: string | null
  status: string
  stage: number
  created_at: string
  updated_at: string
}

interface AppsClientProps {
  initialDrafts: AppDraft[]
  userId: string
}

const statusConfig = {
  draft: { label: 'Rascunho', icon: FileText, color: '#6B7280' },
  submitted: { label: 'Enviado', icon: MessageSquare, color: '#F59E0B' },
  under_review: { label: 'Em análise', icon: Clock, color: '#3B82F6' },
  changes_requested: { label: 'Ajustes solicitados', icon: AlertCircle, color: '#EF4444' },
  approved: { label: 'Aprovado', icon: CheckCircle2, color: '#10B981' },
  published: { label: 'Publicado', icon: CheckCircle2, color: '#06B6D4' },
}

export default function AppsClient({ initialDrafts, userId }: AppsClientProps) {
  const router = useRouter()
  const [drafts, setDrafts] = useState<AppDraft[]>(initialDrafts)

  const createNewDraft = async () => {
    const res = await fetch('/api/apps/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) {
      alert('Erro ao criar rascunho')
      return
    }
    const { id } = await res.json()
    router.push(`/dashboard/meus-apps/cadastro/${id}`)
  }

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="rounded-2xl p-8" style={{ backgroundColor: '#F8FAFB', borderColor: colors.border, border: '1px solid' }}>
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold mb-2" style={{ color: colors.text }}>
            Venda seu aplicativo na LOBBY
          </h1>
          <p className="text-lg" style={{ color: colors.textSecondary }}>
            Prepare sua página comercial, configure sua oferta e envie para análise da nossa equipe.
          </p>
        </div>
      </div>

      {/* CTA Button */}
      <button
        onClick={createNewDraft}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-white font-semibold hover:shadow-lg transition-shadow"
        style={{ backgroundColor: colors.primary }}
      >
        <Plus size={20} />
        Novo Aplicativo
      </button>

      {/* Drafts List */}
      {drafts.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold" style={{ color: colors.text }}>
            Seus Aplicativos ({drafts.length})
          </h2>
          <div className="grid gap-4">
            {drafts.map((draft) => {
              const cfg = statusConfig[draft.status as keyof typeof statusConfig] || statusConfig.draft
              const StatusIcon = cfg.icon
              return (
                <div
                  key={draft.id}
                  className="p-4 rounded-2xl border cursor-pointer hover:shadow-md transition-shadow"
                  style={{ borderColor: colors.border }}
                  onClick={() => router.push(`/dashboard/meus-apps/cadastro/${draft.id}`)}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold mb-1" style={{ color: colors.text }}>
                        {draft.name || 'Sem nome'}
                      </h3>
                      <div className="flex items-center gap-2 text-sm">
                        <StatusIcon size={16} style={{ color: cfg.color }} />
                        <span style={{ color: cfg.color }}>{cfg.label}</span>
                        <span style={{ color: colors.textSecondary }}>• Etapa {draft.stage}/4</span>
                      </div>
                    </div>
                    <div className="text-xs text-right" style={{ color: colors.textSecondary }}>
                      {new Date(draft.updated_at).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Info Cards */}
      <div className="grid md:grid-cols-2 gap-6 mt-12">
        <div className="p-6 rounded-2xl" style={{ backgroundColor: '#F0F9FF', borderColor: colors.primary, border: '1px solid' }}>
          <h3 className="font-bold mb-2" style={{ color: colors.text }}>
            Como funciona?
          </h3>
          <ol className="space-y-2 text-sm">
            <li style={{ color: colors.textSecondary }}>1. Preencha informações do seu app</li>
            <li style={{ color: colors.textSecondary }}>2. Configure mídia e recursos</li>
            <li style={{ color: colors.textSecondary }}>3. Defina preços e planos</li>
            <li style={{ color: colors.textSecondary }}>4. Envie para análise</li>
          </ol>
        </div>

        <div className="p-6 rounded-2xl" style={{ backgroundColor: '#F0FDF4', borderColor: '#10B981', border: '1px solid' }}>
          <h3 className="font-bold mb-2" style={{ color: colors.text }}>
            O que avaliamos?
          </h3>
          <ul className="space-y-2 text-sm">
            <li style={{ color: colors.textSecondary }}>✓ Produto funcional</li>
            <li style={{ color: colors.textSecondary }}>✓ Informações e imagens corretas</li>
            <li style={{ color: colors.textSecondary }}>✓ Suporte disponível</li>
            <li style={{ color: colors.textSecondary }}>✓ Termos comerciais claros</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
