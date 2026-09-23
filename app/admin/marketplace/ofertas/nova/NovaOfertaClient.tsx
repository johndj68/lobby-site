'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, Plus, X } from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import AdminShell from '@/components/layout/AdminShell'
import { MARKETPLACE_COLORS as C } from '@/lib/marketplace'
import { formatOfferPrice } from '@/lib/services/offers'

interface AppOption { id: string; name: string; logoUrl: string | null; partnerName: string }

interface Props {
  user: SupabaseUser
  profile: { full_name?: string; email?: string; is_leader?: boolean } | null
  apps: AppOption[]
}

const BILLING_PERIODS: [string, string][] = [['one-time', 'Pagamento único'], ['monthly', 'Assinatura mensal'], ['yearly', 'Assinatura anual'], ['lifetime', 'Vitalício']]

export default function NovaOfertaClient({ user, profile, apps }: Props) {
  const router = useRouter()
  const [appDraftId, setAppDraftId] = useState('')
  const [form, setForm] = useState({
    name: '', description: '', currency: 'BRL', price: '', billingPeriod: 'one-time',
    usersLimit: '', supportLevel: '', activationMethod: 'manual', activationInstructions: '',
  })
  const [features, setFeatures] = useState<string[]>([])
  const [newFeature, setNewFeature] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedApp = apps.find(a => a.id === appDraftId)

  async function create() {
    if (saving) return
    if (!appDraftId) { toast.error('Selecione o aplicativo desta oferta.'); return }
    if (!form.name.trim()) { toast.error('Informe o nome da oferta.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/offers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appDraftId, name: form.name.trim(), description: form.description || null, currency: form.currency,
          price: form.price === '' ? null : Number(form.price), billingPeriod: form.billingPeriod, features,
          usersLimit: form.usersLimit === '' ? null : Number(form.usersLimit), supportLevel: form.supportLevel || null,
          activationMethod: form.activationMethod || null, activationInstructions: form.activationInstructions || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Não foi possível criar a oferta.'); setSaving(false); return }
      toast.success('Rascunho de oferta criado.')
      router.push(`/admin/marketplace/ofertas/${data.id}`)
    } catch {
      toast.error('Falha de conexão. Tente novamente.')
      setSaving(false)
    }
  }

  return (
    <AdminShell user={user} profile={profile}>
      <div style={{ background: C.bg, minHeight: '100vh' }} className="px-4 py-6 sm:px-6 lg:px-8">
        <Link href="/admin/marketplace/ofertas" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: C.primary }}>
          <ArrowLeft size={14} aria-hidden="true" /> Voltar às ofertas
        </Link>
        <h1 className="mb-1 text-2xl font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Nova oferta</h1>
        <p className="mb-6 text-sm" style={{ color: C.textSecondary }}>Cria um rascunho — não publica, não cobra e não ativa nenhuma assinatura.</p>

        <div className="max-w-xl space-y-4 rounded-2xl border p-5 text-sm" style={{ background: C.card, borderColor: C.border, color: C.text }}>
          <Field label="Aplicativo">
            <select value={appDraftId} onChange={e => setAppDraftId(e.target.value)} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }}>
              <option value="" style={{ color: 'black' }}>Selecione…</option>
              {apps.map(a => <option key={a.id} value={a.id} style={{ color: 'black' }}>{a.name}</option>)}
            </select>
          </Field>
          {selectedApp && (
            <p className="text-xs" style={{ color: C.textSecondary }}>Organização responsável (derivada do aplicativo): <strong style={{ color: C.text }}>{selectedApp.partnerName}</strong></p>
          )}

          <Field label="Nome da oferta">
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Starter, Professional" className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} />
          </Field>
          <Field label="Descrição comercial">
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Moeda">
              <input value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={3} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} />
            </Field>
            <Field label="Preço (deixe em branco para definir depois)">
              <input type="number" min={0} step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} />
            </Field>
          </div>
          <Field label="Modalidade de cobrança">
            <select value={form.billingPeriod} onChange={e => setForm({ ...form, billingPeriod: e.target.value })} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }}>
              {BILLING_PERIODS.map(([v, l]) => <option key={v} value={v} style={{ color: 'black' }}>{l}</option>)}
            </select>
          </Field>
          {form.price !== '' && <p className="text-xs" style={{ color: C.textSecondary }}>{formatOfferPrice(Number(form.price), form.currency, form.billingPeriod)}</p>}

          <Field label="Recursos incluídos">
            <div className="flex flex-wrap gap-1.5">
              {features.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]" style={{ background: C.header, color: C.text }}>
                  {f} <button type="button" onClick={() => setFeatures(features.filter((_, j) => j !== i))}><X size={10} aria-hidden="true" /></button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input value={newFeature} onChange={e => setNewFeature(e.target.value)} placeholder="Adicionar recurso" className="flex-1 rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} />
              <button type="button" onClick={() => { if (newFeature.trim()) { setFeatures([...features, newFeature.trim()]); setNewFeature('') } }} className="rounded-lg border px-3" style={{ borderColor: C.border, color: C.primary }}><Plus size={14} aria-hidden="true" /></button>
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Limite de usuários">
              <input type="number" min={0} value={form.usersLimit} onChange={e => setForm({ ...form, usersLimit: e.target.value })} placeholder="Sem limite" className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} />
            </Field>
            <Field label="Nível de suporte">
              <input value={form.supportLevel} onChange={e => setForm({ ...form, supportLevel: e.target.value })} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} />
            </Field>
          </div>
          <Field label="Forma de entrega/ativação">
            <select value={form.activationMethod} onChange={e => setForm({ ...form, activationMethod: e.target.value })} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }}>
              <option value="manual" style={{ color: 'black' }}>Manual (código de ativação)</option>
              <option value="api" style={{ color: 'black' }}>API</option>
              <option value="oauth" style={{ color: 'black' }}>OAuth</option>
              <option value="saas" style={{ color: 'black' }}>SaaS (acesso direto)</option>
            </select>
          </Field>
          <Field label="Condições de suporte, atualização e reembolso">
            <textarea value={form.activationInstructions} onChange={e => setForm({ ...form, activationInstructions: e.target.value })} rows={3} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} />
          </Field>

          <div className="flex gap-2 pt-2">
            <button type="button" disabled={saving} onClick={create} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: C.primary }}>
              {saving ? <><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Criando…</> : 'Salvar rascunho'}
            </button>
            <Link href="/admin/marketplace/ofertas" className="rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: C.border, color: C.text }}>Cancelar</Link>
          </div>
        </div>
      </div>
    </AdminShell>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-medium" style={{ color: C.text }}>{label}<div className="mt-1">{children}</div></label>
}
