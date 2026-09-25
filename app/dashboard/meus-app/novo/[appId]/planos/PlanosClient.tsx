'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ChevronRight, Plus, Pencil, Trash2, X, Loader2 } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import EditorChrome from '@/components/vendor/editor/EditorChrome'
import { formatCurrencyBRL } from '@/lib/finance'

interface Plan {
  id: string; name: string; currency: string; price: number | null; billing_period: string | null
  features: string[]; users_limit: number | null; support_level: string | null
}

const BILLING_LABEL: Record<string, string> = { 'one-time': 'Pagamento único', monthly: 'Mensal', yearly: 'Anual', lifetime: 'Vitalício' }

export default function PlanosClient({ appId, appName, initialPlans, completion }: {
  appId: string; appName: string; initialPlans: Plan[]; completion: { 1: boolean; 2: boolean; 3: boolean }
}) {
  const [plans, setPlans] = useState<Plan[]>(initialPlans)
  const [editing, setEditing] = useState<Plan | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Plan | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleDelete() {
    if (!deleting) return
    setBusy(true)
    try {
      const res = await fetch(`/api/apps/plans/${deleting.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setPlans(prev => prev.filter(p => p.id !== deleting.id))
      toast.success('Plano removido.')
      setDeleting(null)
    } catch {
      toast.error('Não foi possível remover o plano. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  function handleSaved(plan: Plan) {
    setPlans(prev => {
      const exists = prev.some(p => p.id === plan.id)
      return exists ? prev.map(p => (p.id === plan.id ? plan : p)) : [...prev, plan]
    })
    setEditing(null)
  }

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden" style={{ background: colors.backgroundAlt }}>
      <EditorChrome appId={appId} appName={appName} breadcrumbLabel="Oferta e planos" currentStep={3} completed={completion} />

      <div className="mx-auto w-full max-w-[1000px] flex-1 px-4 py-8 sm:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl" style={{ color: colors.text, fontFamily: 'Space Grotesk, sans-serif' }}>Oferta e planos</h1>
            <p className="mt-1 text-sm" style={{ color: colors.textSecondary }}>Configure como o seu aplicativo será vendido. Nada aqui gera cobrança real.</p>
          </div>
          <button type="button" onClick={() => setEditing('new')}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: colors.primary }}>
            <Plus size={14} aria-hidden="true" /> Adicionar plano
          </button>
        </div>

        {plans.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed p-10 text-center" style={{ borderColor: colors.border, background: '#fff' }}>
            <p className="font-semibold" style={{ color: colors.text }}>Nenhum plano cadastrado ainda</p>
            <p className="mt-1 text-sm" style={{ color: colors.textSecondary }}>Pelo menos um plano é obrigatório para enviar para análise.</p>
            <button type="button" onClick={() => setEditing('new')}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: colors.primary }}>
              <Plus size={14} aria-hidden="true" /> Adicionar primeiro plano
            </button>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {plans.map(plan => (
              <div key={plan.id} className="rounded-2xl border bg-white p-5" style={{ borderColor: colors.border, boxShadow: '0 8px 40px rgba(11,16,32,0.06)' }}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold" style={{ color: colors.text }}>{plan.name || 'Plano sem nome'}</p>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => setEditing(plan)} aria-label={`Editar ${plan.name}`} className="rounded-lg border p-1.5" style={{ borderColor: colors.border, color: colors.textSecondary }}>
                      <Pencil size={13} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => setDeleting(plan)} aria-label={`Remover ${plan.name}`} className="rounded-lg border p-1.5 hover:border-red-300 hover:text-red-500" style={{ borderColor: colors.border, color: colors.textSecondary }}>
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-lg font-bold" style={{ color: '#16A34A' }}>
                  {plan.price != null ? (plan.currency === 'BRL' ? formatCurrencyBRL(plan.price) : `${plan.currency} ${plan.price}`) : 'Sem preço definido'}
                  {plan.billing_period && <span className="text-xs font-normal" style={{ color: colors.textSecondary }}> / {BILLING_LABEL[plan.billing_period] ?? plan.billing_period}</span>}
                </p>
                {plan.features.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs" style={{ color: colors.textSecondary }}>
                    {plan.features.map((f, i) => <li key={i}>• {f}</li>)}
                  </ul>
                )}
                {(plan.users_limit || plan.support_level) && (
                  <p className="mt-2 text-xs" style={{ color: colors.textSecondary }}>
                    {plan.users_limit ? `Até ${plan.users_limit} usuários` : ''}{plan.users_limit && plan.support_level ? ' · ' : ''}{plan.support_level ?? ''}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 z-10 border-t bg-white px-4 py-3 sm:px-8">
        <div className="mx-auto flex w-full max-w-[1000px] items-center justify-between">
          <Link href={`/dashboard/meus-app/novo/${appId}/editar`} className="rounded-lg border px-4 py-2 text-sm font-semibold" style={{ borderColor: colors.border, color: colors.text }}>
            ← Voltar
          </Link>
          <div className="flex gap-3">
            <Link href={`/dashboard/meus-app/${appId}`} className="rounded-lg border px-6 py-2 text-sm font-semibold" style={{ borderColor: colors.border, color: colors.text }}>
              Salvar e sair
            </Link>
            <Link href={`/dashboard/meus-app/novo/${appId}/revisao`}
              className="inline-flex items-center gap-1.5 rounded-lg px-6 py-2 text-sm font-semibold text-white" style={{ background: colors.primary }}>
              Continuar para revisão <ChevronRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>

      {editing && <PlanFormDialog appId={appId} plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={handleSaved} />}

      <Dialog open={!!deleting} onOpenChange={next => !next && setDeleting(null)}>
        <DialogContent showCloseButton={false} className="max-w-sm rounded-2xl border p-6" style={{ borderColor: colors.border }}>
          <h2 className="text-lg font-bold" style={{ color: colors.text, fontFamily: 'Space Grotesk, sans-serif' }}>Remover plano?</h2>
          <p className="mt-2 text-sm" style={{ color: colors.textSecondary }}>
            <strong style={{ color: colors.text }}>{deleting?.name}</strong> será removido da oferta. Isso não afeta compradores anteriores.
          </p>
          <div className="mt-5 flex gap-3">
            <button type="button" disabled={busy} onClick={() => setDeleting(null)} className="flex-1 rounded-xl border py-2.5 text-sm font-semibold disabled:opacity-60" style={{ borderColor: colors.border, color: colors.text }}>Cancelar</button>
            <button type="button" disabled={busy} onClick={handleDelete} className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-bold text-white disabled:opacity-60">
              {busy ? 'Removendo…' : 'Remover'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PlanFormDialog({ appId, plan, onClose, onSaved }: { appId: string; plan: Plan | null; onClose: () => void; onSaved: (p: Plan) => void }) {
  const [name, setName] = useState(plan?.name ?? '')
  const [billingPeriod, setBillingPeriod] = useState(plan?.billing_period ?? 'monthly')
  const [price, setPrice] = useState(plan?.price != null ? String(plan.price) : '')
  const [currency] = useState(plan?.currency ?? 'BRL')
  const [usersLimit, setUsersLimit] = useState(plan?.users_limit != null ? String(plan.users_limit) : '')
  const [supportLevel, setSupportLevel] = useState(plan?.support_level ?? '')
  const [features, setFeatures] = useState<string[]>(plan?.features ?? [])
  const [featureInput, setFeatureInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function addFeature() {
    const v = featureInput.trim()
    if (!v) return
    setFeatures(f => [...f, v])
    setFeatureInput('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Informe o nome do plano.'); return }
    if (!price.trim() || isNaN(Number(price))) { setError('Informe um preço válido.'); return }
    setSaving(true)
    setError('')
    const body = {
      app_draft_id: appId, name: name.trim(), currency, price: Number(price), billing_period: billingPeriod,
      features, users_limit: usersLimit ? Number(usersLimit) : null, support_level: supportLevel || null,
    }
    try {
      const res = await fetch(plan ? `/api/apps/plans/${plan.id}` : '/api/apps/plans', {
        method: plan ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plan ? { ...body, app_draft_id: undefined } : body),
      })
      if (!res.ok) throw new Error()
      const saved = await res.json()
      onSaved({ id: saved.id, name: saved.name, currency: saved.currency, price: saved.price, billing_period: saved.billing_period, features: saved.features ?? [], users_limit: saved.users_limit, support_level: saved.support_level })
      toast.success('Plano salvo.')
    } catch {
      setError('Não foi possível salvar. Seus dados foram preservados — tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={next => !next && !saving && onClose()}>
      <DialogContent className="max-w-md border" style={{ borderColor: colors.border }}>
        <DialogHeader>
          <DialogTitle style={{ color: colors.text }}>{plan ? 'Editar plano' : 'Novo plano'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-semibold" style={{ color: colors.text }}>Nome do plano *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Plano Pro"
              className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: colors.border, color: colors.text }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-semibold" style={{ color: colors.text }}>Preço *</label>
              <input type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="99.90"
                className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: colors.border, color: colors.text }} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold" style={{ color: colors.text }}>Periodicidade</label>
              <select value={billingPeriod} onChange={e => setBillingPeriod(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: colors.border, color: colors.text }}>
                <option value="one-time">Pagamento único</option>
                <option value="monthly">Mensal</option>
                <option value="yearly">Anual</option>
                <option value="lifetime">Vitalício</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-semibold" style={{ color: colors.text }}>Limite de usuários</label>
              <input type="number" min="0" value={usersLimit} onChange={e => setUsersLimit(e.target.value)} placeholder="Opcional"
                className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: colors.border, color: colors.text }} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold" style={{ color: colors.text }}>Nível de suporte</label>
              <input value={supportLevel} onChange={e => setSupportLevel(e.target.value)} placeholder="Ex.: E-mail, Prioritário"
                className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: colors.border, color: colors.text }} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold" style={{ color: colors.text }}>Recursos incluídos</label>
            <div className="mb-2 flex flex-wrap gap-2">
              {features.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: colors.backgroundAlt, color: colors.text }}>
                  {f}
                  <button type="button" onClick={() => setFeatures(fs => fs.filter((_, idx) => idx !== i))} aria-label={`Remover ${f}`} className="text-gray-400 hover:text-red-500">
                    <X size={11} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={featureInput} onChange={e => setFeatureInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFeature() } }}
                placeholder="Ex.: Suporte prioritário" className="flex-1 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: colors.border, color: colors.text }} />
              <button type="button" onClick={addFeature} className="rounded-lg border px-3 py-2 text-sm font-semibold" style={{ borderColor: colors.primary, color: colors.primary }}>+ Adicionar</button>
            </div>
          </div>

          {error && <p className="text-sm font-medium" style={{ color: '#DC2626' }}>{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={saving} className="flex-1 rounded-xl border py-2.5 text-sm font-semibold disabled:opacity-60" style={{ borderColor: colors.border, color: colors.text }}>Cancelar</button>
            <button type="submit" disabled={saving} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-60" style={{ background: colors.primary }}>
              {saving && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} {saving ? 'Salvando…' : 'Salvar plano'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
