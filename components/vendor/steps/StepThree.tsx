'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { colors } from '@/lib/design-tokens'
import { Loader, Plus, Trash2 } from 'lucide-react'

interface Plan {
  id?: string
  name: string
  currency: string
  price: number | ''
  billing_period: string
  features: string[]
  users_limit: number | ''
  support_level: string
  activation_method: string
}

interface StepThreeProps {
  draftId: string
  draft: any
  onSaved: (data: any) => void
  onNext: () => void
  onPrevious: () => void
}

export default function StepThree({
  draftId,
  draft,
  onSaved,
  onNext,
  onPrevious,
}: StepThreeProps) {
  const [saving, setSaving] = useState(false)
  const [plans, setPlans] = useState<Plan[]>(draft?.plans || [])
  const supabase = createClient()

  const addPlan = () => {
    setPlans([
      ...plans,
      {
        id: Math.random().toString(),
        name: '',
        currency: 'BRL',
        price: '',
        billing_period: 'monthly',
        features: [],
        users_limit: '',
        support_level: 'email',
        activation_method: 'manual',
      },
    ])
  }

  const updatePlan = (index: number, field: string, value: any) => {
    const updated = [...plans]
    updated[index] = { ...updated[index], [field]: value }
    setPlans(updated)
  }

  const removePlan = (index: number) => {
    setPlans(plans.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('app_drafts')
        .update({
          plans,
          stage: 3,
          last_edited_at: new Date().toISOString(),
        })
        .eq('id', draftId)
        .select()
        .single()

      if (error) throw error
      onSaved(data)
    } catch (error) {
      alert((error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold mb-2" style={{ color: colors.text }}>
          Oferta e planos
        </h2>
        <p style={{ color: colors.textSecondary }}>
          Configure as modalidades de precificação.
        </p>
      </div>

      {/* Plans list */}
      <div className="space-y-4">
        {plans.map((plan, idx) => (
          <div
            key={plan.id || idx}
            className="p-6 rounded-2xl border space-y-4"
            style={{ borderColor: colors.border, backgroundColor: colors.background }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold" style={{ color: colors.text }}>
                Plano {idx + 1}
              </h3>
              <button
                onClick={() => removePlan(idx)}
                className="p-2 hover:opacity-70"
                style={{ color: '#DC2626' }}
              >
                <Trash2 size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Nome do plano"
                value={plan.name}
                onChange={(e) => updatePlan(idx, 'name', e.target.value)}
                className="col-span-2 px-4 py-2 border rounded-lg text-sm"
                style={{ borderColor: colors.border }}
                maxLength={50}
              />

              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: colors.text }}>
                  Preço
                </label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={plan.price}
                  onChange={(e) => updatePlan(idx, 'price', parseFloat(e.target.value) || '')}
                  className="w-full px-4 py-2 border rounded-lg text-sm"
                  style={{ borderColor: colors.border }}
                  step="0.01"
                />
              </div>

              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: colors.text }}>
                  Modalidade
                </label>
                <select
                  value={plan.billing_period}
                  onChange={(e) => updatePlan(idx, 'billing_period', e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg text-sm"
                  style={{ borderColor: colors.border }}
                >
                  <option value="one-time">Pagamento único</option>
                  <option value="monthly">Mensal</option>
                  <option value="yearly">Anual</option>
                  <option value="lifetime">Vitalício</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: colors.text }}>
                  Limite de usuários
                </label>
                <input
                  type="number"
                  placeholder="Sem limite"
                  value={plan.users_limit}
                  onChange={(e) => updatePlan(idx, 'users_limit', parseInt(e.target.value) || '')}
                  className="w-full px-4 py-2 border rounded-lg text-sm"
                  style={{ borderColor: colors.border }}
                />
              </div>

              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: colors.text }}>
                  Nível de suporte
                </label>
                <select
                  value={plan.support_level}
                  onChange={(e) => updatePlan(idx, 'support_level', e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg text-sm"
                  style={{ borderColor: colors.border }}
                >
                  <option value="none">Nenhum</option>
                  <option value="email">Email</option>
                  <option value="priority">Prioritário</option>
                  <option value="24/7">24/7</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: colors.text }}>
                  Ativação
                </label>
                <select
                  value={plan.activation_method}
                  onChange={(e) => updatePlan(idx, 'activation_method', e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg text-sm"
                  style={{ borderColor: colors.border }}
                >
                  <option value="manual">Manual</option>
                  <option value="api">API</option>
                  <option value="oauth">OAuth</option>
                  <option value="saas">SaaS</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: colors.text }}>
                Recursos (separar por Enter)
              </label>
              <textarea
                placeholder="Recurso 1&#10;Recurso 2"
                value={plan.features.join('\n')}
                onChange={(e) => updatePlan(idx, 'features', e.target.value.split('\n').filter(f => f.trim()))}
                className="w-full px-4 py-2 border rounded-lg text-sm h-20"
                style={{ borderColor: colors.border }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Add plan button */}
      <button
        onClick={addPlan}
        className="w-full py-3 rounded-full font-semibold flex items-center justify-center gap-2 border"
        style={{ borderColor: colors.primary, color: colors.primary }}
      >
        <Plus size={18} />
        Adicionar plano
      </button>

      {/* Actions */}
      <div className="flex gap-4">
        <button
          onClick={onPrevious}
          className="px-6 py-3 rounded-full font-semibold border"
          style={{ borderColor: colors.primary, color: colors.primary }}
        >
          ← Voltar
        </button>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-3 rounded-full font-semibold text-white flex items-center gap-2 disabled:opacity-50"
          style={{ backgroundColor: colors.primary }}
        >
          {saving && <Loader size={18} className="animate-spin" />}
          Salvar
        </button>

        <button
          onClick={onNext}
          disabled={plans.length === 0}
          className="px-6 py-3 rounded-full font-semibold text-white flex items-center gap-2 disabled:opacity-50 ml-auto"
          style={{ backgroundColor: colors.primary }}
        >
          Próximo →
        </button>
      </div>
    </div>
  )
}
