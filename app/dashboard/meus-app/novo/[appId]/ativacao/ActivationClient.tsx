'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Copy, Plus, Trash2, Edit2 } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import BackButton from '@/components/ui/BackButton'

interface ActivationClientProps {
  draft: any
  config: any
  plans: any[]
}

export default function ActivationClient({ draft, config, plans }: ActivationClientProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'planos' | 'ativacao'>('ativacao')
  const [formData, setFormData] = useState(config || {})
  const [selectedPlan, setSelectedPlan] = useState('')
  const [instructions, setInstructions] = useState(config?.instructions || [])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleFieldChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetch(`/api/apps/activation/${draft.id}/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, instructions }),
      })
      setSaved(true)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const handleContinueReview = async () => {
    await handleSave()
    router.push(`/dashboard/meus-app/novo/${draft.id}/equipe`)
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: '#F9FAFB' }}>
      {/* Back Button */}
      <div className="bg-white border-b px-8 py-3" style={{ borderColor: colors.border }}>
        <BackButton />
      </div>

      {/* Breadcrumb + Stage */}
      <div className="bg-white border-b px-8 py-3" style={{ borderColor: colors.border }}>
        <p className="text-xs mb-3" style={{ color: colors.textSecondary }}>
          Meus aplicativos / {draft.name} / Ativação
        </p>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4].map((stage) => (
            <div key={stage} className="flex items-center gap-2">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  stage < 3 ? 'bg-blue-600 text-white' : stage === 3 ? 'bg-blue-600 text-white' : 'bg-gray-200'
                }`}
              >
                {stage < 3 ? '✓' : stage}
              </div>
              {stage < 4 && <div className="w-6 h-0.5" style={{ backgroundColor: stage < 3 ? colors.primary : '#E5E7EB' }} />}
            </div>
          ))}
        </div>
      </div>

      {/* Title */}
      <div className="bg-white border-b px-8 py-6" style={{ borderColor: colors.border }}>
        <div className="flex items-start justify-between gap-8 mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-1" style={{ color: colors.text }}>
              Ativação e entrega
            </h1>
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              Defina como seus clientes vão acessar o aplicativo após a compra.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {saved && (
              <div className="flex items-center gap-1 px-3 py-2" style={{ color: colors.primary }}>
                <span className="text-sm">✓ Salvo agora</span>
              </div>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold border"
              style={{ borderColor: colors.primary, color: colors.primary }}
            >
              Salvar rascunho
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 border-t" style={{ borderColor: colors.border }}>
          <button
            onClick={() => setActiveTab('planos')}
            className={`py-3 text-sm font-semibold border-b-2 ${
              activeTab === 'planos' ? 'border-primary' : 'border-transparent'
            }`}
            style={{ color: activeTab === 'planos' ? colors.primary : colors.textSecondary }}
          >
            Planos e preços
          </button>
          <button
            onClick={() => setActiveTab('ativacao')}
            className={`py-3 text-sm font-semibold border-b-2 ${
              activeTab === 'ativacao' ? 'border-primary' : 'border-transparent'
            }`}
            style={{ color: activeTab === 'ativacao' ? colors.primary : colors.textSecondary }}
          >
            Ativação e entrega
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-6 p-8 max-w-7xl mx-auto w-full">
        <div className="flex-1">
          {activeTab === 'ativacao' && (
            <div className="space-y-6">
              {/* Método */}
              <div className="bg-white rounded-lg p-6" style={{ borderColor: colors.border, border: '1px solid' }}>
                <h3 className="font-bold mb-1" style={{ color: colors.text }}>Método de ativação</h3>
                <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>Escolha como os clientes vão receber e ativar o acesso ao seu aplicativo.</p>
                <div className="bg-gray-50 p-4 rounded-lg flex items-start justify-between">
                  <div>
                    <p className="font-semibold" style={{ color: colors.text }}>Código de resgate</p>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>Cada compra recebe um código exclusivo.</p>
                  </div>
                  <a href="#" className="text-sm font-semibold" style={{ color: colors.primary }}>
                    Alterar na oferta
                  </a>
                </div>
              </div>

              {/* Link */}
              <div className="bg-white rounded-lg p-6" style={{ borderColor: colors.border, border: '1px solid' }}>
                <label className="font-semibold mb-1 block" style={{ color: colors.text }}>Link de ativação</label>
                <p className="text-xs mb-3" style={{ color: colors.textSecondary }}>Página onde o cliente informa o código e ativa o plano.</p>
                <input
                  type="url"
                  value={formData.activation_link || ''}
                  onChange={(e) => handleFieldChange('activation_link', e.target.value)}
                  placeholder="https://seuapp.com/ativar"
                  className="w-full px-4 py-2 rounded-lg border text-sm"
                  style={{ borderColor: colors.border, color: colors.text }}
                />
              </div>

              {/* Suporte */}
              <div className="bg-white rounded-lg p-6" style={{ borderColor: colors.border, border: '1px solid' }}>
                <label className="font-semibold mb-1 block" style={{ color: colors.text }}>Suporte ao comprador</label>
                <p className="text-xs mb-3" style={{ color: colors.textSecondary }}>E-mail para dúvidas sobre ativação.</p>
                <input
                  type="email"
                  value={formData.support_email || ''}
                  onChange={(e) => handleFieldChange('support_email', e.target.value)}
                  placeholder="suporte@seuapp.com"
                  className="w-full px-4 py-2 rounded-lg border text-sm"
                  style={{ borderColor: colors.border, color: colors.text }}
                />
              </div>

              {/* Instruções */}
              <div className="bg-white rounded-lg p-6" style={{ borderColor: colors.border, border: '1px solid' }}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold" style={{ color: colors.text }}>Instruções de ativação</h3>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>Explique o passo a passo que o comprador receberá.</p>
                  </div>
                  <button className="text-sm font-semibold flex items-center gap-1" style={{ color: colors.primary }}>
                    ⚡ Sugestões editáveis
                  </button>
                </div>

                <div className="space-y-2">
                  {instructions.length === 0 ? (
                    <p style={{ color: colors.textSecondary }}>Nenhuma instrução adicionada</p>
                  ) : (
                    instructions.map((inst: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded">
                        <span className="font-bold" style={{ color: colors.primary }}>{i + 1}</span>
                        <span className="flex-1" style={{ color: colors.text }}>{inst.text || inst}</span>
                        <button className="p-1 hover:bg-gray-200 rounded"><Edit2 size={16} /></button>
                        <button className="p-1 hover:bg-red-200 rounded text-red-600"><Trash2 size={16} /></button>
                      </div>
                    ))
                  )}
                </div>

                <button className="mt-4 w-full py-2 border rounded-lg text-sm font-semibold flex items-center justify-center gap-2" style={{ borderColor: colors.border, color: colors.text }}>
                  <Plus size={16} /> Adicionar uma instrução
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="w-96 shrink-0">
          <div className="bg-white rounded-lg p-6 space-y-4" style={{ borderColor: colors.border, border: '1px solid' }}>
            <div>
              <p className="text-sm font-semibold" style={{ color: colors.text }}>Prévia do comprador</p>
              <p className="text-xs" style={{ color: colors.primary }}>Exemplo</p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg" style={{ backgroundColor: colors.primary }} />
                <div>
                  <p className="font-bold text-sm" style={{ color: colors.text }}>{draft.name}</p>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>Seu plano</p>
                </div>
              </div>

              <div className="border-t" style={{ borderColor: colors.border }}>
                <p className="text-xs font-semibold mt-3 mb-2" style={{ color: colors.text }}>Seu código de ativação</p>
                <div className="flex items-center gap-2 bg-white p-3 rounded border" style={{ borderColor: colors.border }}>
                  <code className="flex-1 text-sm font-mono" style={{ color: colors.text }}>EXEMPLO-NAO-VALIDO</code>
                  <button className="p-1 hover:bg-gray-100"><Copy size={16} style={{ color: colors.primary }} /></button>
                </div>
                <p className="text-xs mt-2" style={{ color: colors.textSecondary }}>Código ilustrativo</p>
              </div>

              <button className="w-full py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm flex items-center justify-center gap-2">
                Ativar aplicativo <ChevronRight size={16} />
              </button>

              {instructions.length > 0 && (
                <div className="border-t pt-3" style={{ borderColor: colors.border }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: colors.text }}>Como ativar</p>
                  <ol className="text-xs space-y-1" style={{ color: colors.textSecondary }}>
                    {instructions.map((inst: any, i: number) => (
                      <li key={i}>{i + 1}. {inst.text || inst}</li>
                    ))}
                  </ol>
                </div>
              )}

              {formData.support_email && (
                <div className="border-t pt-3" style={{ borderColor: colors.border }}>
                  <p className="text-xs font-semibold" style={{ color: colors.text }}>Precisa de ajuda?</p>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>{formData.support_email}</p>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs" style={{ color: '#1E40AF' }}>
                <strong>Entrega após a compra</strong>
                <p className="mt-1">O cliente recebe o código e as instruções após a confirmação do pagamento.</p>
              </div>

              <p className="text-xs" style={{ color: colors.textSecondary }}>Esta prévia não consome códigos.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom */}
      <div className="bg-white border-t px-8 py-4 flex items-center justify-between" style={{ borderColor: colors.border }}>
        <button className="text-sm font-semibold" style={{ color: colors.text }}>← Voltar para planos</button>
        <div className="flex items-center gap-3">
          <button onClick={handleSave} className="px-4 py-2 rounded-lg text-sm font-semibold border" style={{ borderColor: colors.border, color: colors.text }}>
            Salvar e sair
          </button>
          <button onClick={handleContinueReview} className="px-6 py-2 rounded-lg text-white text-sm font-semibold flex items-center gap-2" style={{ backgroundColor: colors.primary }}>
            Continuar para revisão <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
