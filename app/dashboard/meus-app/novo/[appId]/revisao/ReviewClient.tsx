'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, ChevronDown, AlertCircle, CheckCircle, HelpCircle } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import BackButton from '@/components/ui/BackButton'
import type { ReviewResult, ReviewChecklistItem } from '@/lib/validations/app-review'

interface ReviewClientProps {
  draft: any
}

export default function ReviewClient({ draft }: ReviewClientProps) {
  const router = useRouter()
  const [review, setReview] = useState<ReviewResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [acceptances, setAcceptances] = useState({
    authorized: false,
    reviewed: false,
    partnerTerms: false,
    commercialTerms: false,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadReview()
  }, [])

  const loadReview = async () => {
    try {
      const res = await fetch(`/api/apps/${draft.id}/review/checklist`)
      if (res.ok) {
        setReview(await res.json())
      }
      setLoading(false)
    } catch (err) {
      console.error(err)
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!acceptances.authorized || !acceptances.reviewed || !acceptances.partnerTerms || !acceptances.commercialTerms) {
      setError('Aceite todos os termos para continuar')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/apps/${draft.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acceptances: {
            authorized_to_commercialize: acceptances.authorized,
            reviewed_app_info: acceptances.reviewed,
            accepted_partner_terms: acceptances.partnerTerms,
            accepted_commercial_terms: acceptances.commercialTerms,
          },
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao enviar')
      }

      const data = await res.json()
      router.push(`/dashboard/meus-app/novo/${draft.id}/revisao/enviado`)
    } catch (err: any) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Carregando...</div>
  }

  if (!review) {
    return <div className="flex items-center justify-center min-h-screen">Erro ao carregar revisão</div>
  }

  const canSubmit = review.blockers === 0 && acceptances.authorized && acceptances.reviewed && acceptances.partnerTerms && acceptances.commercialTerms

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
                  stage < 4 ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'
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
        <h1 className="text-3xl font-bold mb-1" style={{ color: colors.text }}>Revise antes de enviar</h1>
        <p className="text-sm" style={{ color: colors.textSecondary }}>Confira seu cadastro e envie para análise da equipe LOBBY.</p>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8 max-w-6xl mx-auto w-full grid grid-cols-3 gap-6">
        {/* Left Column - Checklist + Terms */}
        <div className="col-span-2 space-y-6">
          {/* Status Alert */}
          {review.blockers > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex gap-3">
                <AlertCircle size={20} style={{ color: '#DC2626' }} />
                <div>
                  <p className="font-semibold" style={{ color: '#DC2626' }}>
                    {review.blockers === 1 ? 'Falta 1 informação para enviar' : `Faltam ${review.blockers} informações para enviar`}
                  </p>
                  <p className="text-sm" style={{ color: '#7F1D1D' }}>Complete os itens indicados abaixo para continuar.</p>
                </div>
              </div>
            </div>
          )}

          {review.blockers === 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex gap-3">
                <CheckCircle size={20} style={{ color: '#16A34A' }} />
                <div>
                  <p className="font-semibold" style={{ color: '#16A34A' }}>Cadastro pronto para sua confirmação</p>
                  <p className="text-sm" style={{ color: '#15803D' }}>Revise a página e confirme os termos antes de enviar.</p>
                </div>
              </div>
            </div>
          )}

          {/* Checklist */}
          <div className="bg-white rounded-lg p-6" style={{ borderColor: colors.border, border: '1px solid' }}>
            <h2 className="font-bold mb-4" style={{ color: colors.text }}>Checklist do cadastro</h2>

            <div className="space-y-2">
              {review.items.map((item) => (
                <div key={item.id} className="border rounded-lg" style={{ borderColor: colors.border }}>
                  <button
                    onClick={() => setExpanded({ ...expanded, [item.id]: !expanded[item.id] })}
                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-3 flex-1 text-left">
                      <span className="text-xl">{item.icon}</span>
                      <div className="flex-1">
                        <p className="font-semibold" style={{ color: colors.text }}>{item.name}</p>
                        <p className="text-xs" style={{ color: colors.textSecondary }}>{item.summary}</p>
                      </div>
                      {item.status === 'complete' && <CheckCircle size={16} style={{ color: colors.primary }} />}
                      {item.status === 'pending' && <AlertCircle size={16} style={{ color: '#DC2626' }} />}
                      {item.status === 'warning' && <AlertCircle size={16} style={{ color: '#EA8C55' }} />}
                      {item.status === 'optional' && <HelpCircle size={16} style={{ color: colors.textSecondary }} />}
                    </div>
                    <ChevronDown size={16} style={{ transform: expanded[item.id] ? 'rotate(180deg)' : '', color: colors.textSecondary }} />
                  </button>

                  {expanded[item.id] && (
                    <div className="border-t p-4 bg-gray-50" style={{ borderColor: colors.border }}>
                      {item.issues.length > 0 ? (
                        <div className="space-y-3 mb-4">
                          {item.issues.map((issue, idx) => (
                            <div key={idx} className="text-sm">
                              <p className="font-medium" style={{ color: issue.severity === 'blocked' ? '#DC2626' : '#EA8C55' }}>
                                {issue.message}
                              </p>
                              {issue.editRoute && (
                                <button
                                  onClick={() => router.push(`/dashboard/meus-app/novo/${draft.id}/${issue.editRoute}${issue.editTab ? `?tab=${issue.editTab}` : ''}`)}
                                  className="text-xs mt-1 font-semibold" style={{ color: colors.primary }}
                                >
                                  Corrigir →
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-green-600 mb-4">✓ Seção completa</p>
                      )}
                      <button
                        onClick={() => router.push(`/dashboard/meus-app/novo/${draft.id}/${item.editRoute}${item.editTab ? `?tab=${item.editTab}` : ''}`)}
                        className="text-sm font-semibold px-3 py-2 rounded border" style={{ borderColor: colors.border, color: colors.text }}
                      >
                        Editar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <p className="text-xs mt-4" style={{ color: colors.textSecondary }}>Itens opcionais não impedem o envio.</p>
          </div>

          {/* Terms */}
          <div className="bg-white rounded-lg p-6" style={{ borderColor: colors.border, border: '1px solid' }}>
            <h3 className="font-bold mb-2" style={{ color: colors.text }}>Confirmações e termos</h3>
            <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>Leia os documentos e confirme antes de enviar.</p>

            <div className="space-y-3">
              <label className="flex items-start gap-3 p-3 rounded hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptances.authorized}
                  onChange={(e) => setAcceptances({ ...acceptances, authorized: e.target.checked })}
                  className="mt-1"
                />
                <span className="text-sm" style={{ color: colors.text }}>Tenho autorização para comercializar este aplicativo.</span>
              </label>

              <label className="flex items-start gap-3 p-3 rounded hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptances.reviewed}
                  onChange={(e) => setAcceptances({ ...acceptances, reviewed: e.target.checked })}
                  className="mt-1"
                />
                <span className="text-sm" style={{ color: colors.text }}>Revisei as informações, imagens e condições da oferta.</span>
              </label>

              <label className="flex items-start gap-3 p-3 rounded hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptances.partnerTerms}
                  onChange={(e) => setAcceptances({ ...acceptances, partnerTerms: e.target.checked })}
                  className="mt-1"
                />
                <div>
                  <span className="text-sm" style={{ color: colors.text }}>Li e aceito os </span>
                  <a href="#" className="text-sm font-semibold" style={{ color: colors.primary }}>
                    Termos de Parceiros da LOBBY
                  </a>
                  <span className="text-sm" style={{ color: colors.text }}>.</span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptances.commercialTerms}
                  onChange={(e) => setAcceptances({ ...acceptances, commercialTerms: e.target.checked })}
                  className="mt-1"
                />
                <div>
                  <span className="text-sm" style={{ color: colors.text }}>Li e aceito as </span>
                  <a href="#" className="text-sm font-semibold" style={{ color: colors.primary }}>
                    condições comerciais aplicáveis
                  </a>
                  <span className="text-sm" style={{ color: colors.text }}>.</span>
                </div>
              </label>
            </div>

            <p className="text-xs mt-4" style={{ color: colors.textSecondary }}>O destaque patrocinado é opcional e contratado separadamente.</p>

            {error && <p className="text-sm mt-4" style={{ color: '#DC2626' }}>{error}</p>}
          </div>
        </div>

        {/* Right Column - Next Steps */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg p-6" style={{ borderColor: colors.border, border: '1px solid' }}>
            <h3 className="font-bold mb-4" style={{ color: colors.text }}>O que acontece depois?</h3>
            <div className="space-y-3">
              {[
                { num: 1, title: 'Envio para análise', desc: 'Seu cadastro entra na fila de revisão.' },
                { num: 2, title: 'Avaliação da equipe', desc: 'Conferimos o produto e as condições da oferta.' },
                { num: 3, title: 'Retorno pelo painel', desc: 'Você recebe a decisão ou solicitações de ajuste.' },
                { num: 4, title: 'Publicação', desc: 'Após aprovação e conclusão das condições necessárias.' },
              ].map((step) => (
                <div key={step.num} className="text-sm">
                  <p className="font-semibold" style={{ color: colors.text }}>{step.num}. {step.title}</p>
                  <p style={{ color: colors.textSecondary }}>{step.desc}</p>
                </div>
              ))}
            </div>

            <div className="border-t mt-4 pt-4 space-y-2 text-xs" style={{ borderColor: colors.border, color: colors.textSecondary }}>
              <p>✓ Enviar não publica seu aplicativo.</p>
              <p>✓ Você acompanha o andamento pelo painel.</p>
            </div>
          </div>

          <div className="bg-blue-50 rounded-lg p-6" style={{ borderColor: '#3B82F6', border: '1px solid' }}>
            <h3 className="font-bold mb-2" style={{ color: colors.primary }}>Precisa de ajuda?</h3>
            <p className="text-sm mb-3" style={{ color: colors.textSecondary }}>Acesse o suporte real da LOBBY para esclarecer dúvidas.</p>
            <a href="#" className="text-sm font-semibold" style={{ color: colors.primary }}>
              Contatar suporte →
            </a>
          </div>
        </div>
      </div>

      {/* Bottom */}
      <div className="bg-white border-t px-8 py-4 flex items-center justify-between" style={{ borderColor: colors.border }}>
        <button className="text-sm font-semibold" style={{ color: colors.text }} onClick={() => router.back()}>
          ← Voltar para equipe
        </button>
        <div className="flex gap-3">
          <button onClick={() => router.back()} className="px-4 py-2 rounded-lg text-sm font-semibold border" style={{ borderColor: colors.border, color: colors.text }}>
            Salvar e sair
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="px-6 py-2 rounded-lg text-white text-sm font-semibold flex items-center gap-2"
            style={{
              backgroundColor: canSubmit ? colors.primary : '#D1D5DB',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Enviando...' : 'Enviar para análise'} <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
