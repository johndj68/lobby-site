'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { colors } from '@/lib/design-tokens'

interface Plan {
  id?: string
  name: string
  currency: string
  price: number | null
  billing_period: string
  features: string[] | null
  activation_method: string | null
}

interface StageThreeProps {
  plans: Plan[]
  onPlansUpdate: (plans: Plan[]) => void
  draftId: string
  onSave: (updates: any) => Promise<void>
}

export default function StageThree({ plans, onPlansUpdate, draftId, onSave }: StageThreeProps) {
  const [editing, setEditing] = useState<Plan | null>(null)

  const addPlan = () => {
    const newPlan: Plan = {
      name: '',
      currency: 'BRL',
      price: null,
      billing_period: 'one-time',
      features: [],
      activation_method: 'manual',
    }
    setEditing(newPlan)
  }

  const savePlan = async () => {
    if (!editing || !editing.name || editing.price === null) {
      alert('Preencha nome e preço')
      return
    }

    try {
      if (editing.id) {
        // Update existing
        const res = await fetch(`/api/apps/plans/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editing),
        })
        if (!res.ok) throw new Error('Failed to update plan')
      } else {
        // Create new
        const res = await fetch('/api/apps/plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...editing, app_draft_id: draftId }),
        })
        if (!res.ok) throw new Error('Failed to create plan')
        const saved = await res.json()
        editing.id = saved.id
      }

      const updated = plans.find((p) => p.id === editing.id) ? plans.map((p) => (p.id === editing.id ? editing : p)) : [...plans, editing]
      onPlansUpdate(updated)
      setEditing(null)
    } catch (err) {
      console.error('Save plan error:', err)
      alert('Erro ao salvar plano')
    }
  }

  const deletePlan = async (id?: string) => {
    if (!id) return
    try {
      const res = await fetch(`/api/apps/plans/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      onPlansUpdate(plans.filter((p) => p.id !== id))
    } catch (err) {
      console.error('Delete error:', err)
      alert('Erro ao deletar plano')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1" style={{ color: colors.text }}>
          Oferta e Planos
        </h2>
        <p style={{ color: colors.textSecondary }}>
          Configure os planos de preço para seu aplicativo
        </p>
      </div>

      {/* Plans List */}
      <div className="space-y-3">
        {plans.map((plan, idx) => (
          <div key={plan.id || idx} className="p-4 rounded-lg border flex items-center justify-between" style={{ borderColor: colors.border }}>
            <div>
              <p className="font-semibold" style={{ color: colors.text }}>
                {plan.name}
              </p>
              <p className="text-sm" style={{ color: colors.textSecondary }}>
                {plan.currency} {plan.price?.toFixed(2)} / {plan.billing_period}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(plan)}
                className="px-3 py-1 rounded text-sm font-medium"
                style={{ backgroundColor: colors.primary, color: 'white' }}
              >
                Editar
              </button>
              {plan.id && (
                <button onClick={() => deletePlan(plan.id)} className="p-1 text-red-500 hover:bg-red-50 rounded">
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add Plan Button */}
      {!editing && (
        <button onClick={addPlan} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border font-medium" style={{ borderColor: colors.primary, color: colors.primary }}>
          <Plus size={18} />
          Adicionar plano
        </button>
      )}

      {/* Edit Form */}
      {editing && (
        <div className="p-6 rounded-lg bg-gray-50">
          <h3 className="font-bold mb-4" style={{ color: colors.text }}>
            {editing.id ? 'Editar plano' : 'Novo plano'}
          </h3>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold" style={{ color: colors.text }}>
                Nome do plano *
              </label>
              <input
                type="text"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="Ex: Starter, Professional"
                className="w-full mt-1 px-3 py-2 rounded border"
                style={{ borderColor: colors.border, color: colors.text }}
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold" style={{ color: colors.text }}>
                  Preço *
                </label>
                <input
                  type="number"
                  value={editing.price ?? ''}
                  onChange={(e) => setEditing({ ...editing, price: e.target.value ? parseFloat(e.target.value) : null })}
                  placeholder="0.00"
                  className="w-full mt-1 px-3 py-2 rounded border"
                  style={{ borderColor: colors.border, color: colors.text }}
                />
              </div>

              <div>
                <label className="text-sm font-semibold" style={{ color: colors.text }}>
                  Período
                </label>
                <select
                  value={editing.billing_period}
                  onChange={(e) => setEditing({ ...editing, billing_period: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded border"
                  style={{ borderColor: colors.border, color: colors.text }}
                >
                  <option value="one-time">Único</option>
                  <option value="monthly">Mensal</option>
                  <option value="yearly">Anual</option>
                  <option value="lifetime">Vitalício</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold" style={{ color: colors.text }}>
                Método de ativação
              </label>
              <select
                value={editing.activation_method || 'manual'}
                onChange={(e) => setEditing({ ...editing, activation_method: e.target.value })}
                className="w-full mt-1 px-3 py-2 rounded border"
                style={{ borderColor: colors.border, color: colors.text }}
              >
                <option value="manual">Manual</option>
                <option value="api">API</option>
                <option value="oauth">OAuth</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button
                onClick={savePlan}
                className="px-4 py-2 rounded-lg text-white font-semibold"
                style={{ backgroundColor: colors.primary }}
              >
                Salvar plano
              </button>
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2 rounded-lg border font-semibold"
                style={{ borderColor: colors.border, color: colors.text }}
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
