'use client'

import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import BackButton from '@/components/ui/BackButton'

interface ReviewClientProps {
  draft: any
}

export default function ReviewClient({ draft }: ReviewClientProps) {
  const router = useRouter()

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: '#F9FAFB' }}>
      {/* Back Button */}
      <div className="bg-white border-b px-8 py-3" style={{ borderColor: colors.border }}>
        <BackButton />
      </div>

      {/* Breadcrumb + Stage */}
      <div className="bg-white border-b px-8 py-3" style={{ borderColor: colors.border }}>
        <p className="text-xs mb-3" style={{ color: colors.textSecondary }}>
          Meus aplicativos / {draft.name} / Revisão
        </p>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4].map((stage) => (
            <div key={stage} className="flex items-center gap-2">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  stage <= 4 ? 'bg-blue-600 text-white' : 'bg-gray-200'
                }`}
              >
                {stage < 4 ? '✓' : '4'}
              </div>
              {stage < 4 && <div className="w-6 h-0.5" style={{ backgroundColor: colors.primary }} />}
            </div>
          ))}
        </div>
      </div>

      {/* Title */}
      <div className="bg-white border-b px-8 py-6" style={{ borderColor: colors.border }}>
        <h1 className="text-3xl font-bold mb-1" style={{ color: colors.text }}>Revisão final</h1>
        <p className="text-sm" style={{ color: colors.textSecondary }}>
          Verifique todos os detalhes do seu aplicativo antes de enviar para análise.
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 p-8 max-w-4xl mx-auto w-full">
        <div className="space-y-6">
          {/* Summary */}
          <div className="bg-white rounded-lg p-6" style={{ borderColor: colors.border, border: '1px solid' }}>
            <h2 className="font-bold mb-4" style={{ color: colors.text }}>Resumo do aplicativo</h2>

            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium" style={{ color: colors.textSecondary }}>Nome</p>
                <p className="text-lg font-semibold" style={{ color: colors.text }}>{draft.name}</p>
              </div>

              {draft.short_description && (
                <div>
                  <p className="text-sm font-medium" style={{ color: colors.textSecondary }}>Descrição breve</p>
                  <p style={{ color: colors.text }}>{draft.short_description}</p>
                </div>
              )}

              {draft.category && (
                <div>
                  <p className="text-sm font-medium" style={{ color: colors.textSecondary }}>Categoria</p>
                  <p style={{ color: colors.text }}>{draft.category}</p>
                </div>
              )}

              <div className="border-t pt-4" style={{ borderColor: colors.border }}>
                <p className="text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>Próximos passos</p>
                <ol className="text-sm space-y-2" style={{ color: colors.text }}>
                  <li>1. Revise todas as informações acima</li>
                  <li>2. Clique em "Enviar para análise" para submeter</li>
                  <li>3. Nossa equipe revisará em 2-3 dias úteis</li>
                  <li>4. Você receberá um e-mail com o resultado</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Buttons to edit sections */}
          <div className="bg-white rounded-lg p-6" style={{ borderColor: colors.border, border: '1px solid' }}>
            <h3 className="font-bold mb-4" style={{ color: colors.text }}>Editar seções</h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => router.push(`/dashboard/meus-app/novo/${draft.id}/editar`)}
                className="px-4 py-3 rounded-lg text-sm font-semibold border text-center"
                style={{ borderColor: colors.border, color: colors.text }}
              >
                Editar informações
              </button>
              <button
                onClick={() => router.push(`/dashboard/meus-app/novo/${draft.id}/editar`)}
                className="px-4 py-3 rounded-lg text-sm font-semibold border text-center"
                style={{ borderColor: colors.border, color: colors.text }}
              >
                Editar ativação
              </button>
              <button
                onClick={() => router.push(`/dashboard/meus-app/novo/${draft.id}/equipe`)}
                className="px-4 py-3 rounded-lg text-sm font-semibold border text-center"
                style={{ borderColor: colors.border, color: colors.text }}
              >
                Gerenciar equipe
              </button>
              <button
                className="px-4 py-3 rounded-lg text-sm font-semibold border text-center opacity-50 cursor-not-allowed"
                style={{ borderColor: colors.border, color: colors.text }}
              >
                Visualizar prévia
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom */}
      <div className="bg-white border-t px-8 py-4 flex items-center justify-between" style={{ borderColor: colors.border }}>
        <button className="text-sm font-semibold" style={{ color: colors.text }} onClick={() => router.back()}>
          ← Voltar
        </button>
        <button className="px-6 py-2 rounded-lg text-white text-sm font-semibold flex items-center gap-2" style={{ backgroundColor: colors.primary }}>
          Enviar para análise <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}
