'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Loader2 } from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import AdminShell from '@/components/layout/AdminShell'
import { MARKETPLACE_COLORS as C } from '@/lib/marketplace'

interface AppOption { id: string; name: string; logoUrl: string | null; partnerName: string }
interface SpaceOption { id: string; name: string }

export default function NovaCampanhaClient({ user, profile, apps, spaces }: {
  user: SupabaseUser
  profile: { full_name?: string; email?: string; is_leader?: boolean } | null
  apps: AppOption[]
  spaces: SpaceOption[]
}) {
  const router = useRouter()
  const [appDraftId, setAppDraftId] = useState('')
  const [spaceId, setSpaceId] = useState(spaces[0]?.id ?? '')
  const [internalName, setInternalName] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedApp = apps.find(a => a.id === appDraftId)

  async function create() {
    if (saving) return
    if (!appDraftId) { toast.error('Selecione o aplicativo desta campanha.'); return }
    if (!internalName.trim()) { toast.error('Informe o nome interno da campanha.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/campaigns', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appDraftId, internalName: internalName.trim(), spaceId: spaceId || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Não foi possível criar a campanha.'); setSaving(false); return }
      toast.success('Rascunho de campanha criado.')
      router.push(`/admin/marketplace/destaques/${data.id}`)
    } catch {
      toast.error('Falha de conexão. Tente novamente.')
      setSaving(false)
    }
  }

  return (
    <AdminShell user={user} profile={profile}>
      <div style={{ background: C.bg, minHeight: '100vh' }} className="px-4 py-6 sm:px-6 lg:px-8">
        <Link href="/admin/marketplace/destaques" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: C.primary }}>
          <ArrowLeft size={14} aria-hidden="true" /> Voltar às campanhas
        </Link>
        <h1 className="mb-1 text-2xl font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Nova campanha</h1>
        <p className="mb-6 text-sm" style={{ color: C.textSecondary }}>Cria um rascunho — não publica, não cobra e não aprova nada automaticamente. Configure o anúncio, espaço e período no detalhe da campanha.</p>

        <div className="max-w-xl space-y-4 rounded-2xl border p-5 text-sm" style={{ background: C.card, borderColor: C.border, color: C.text }}>
          <Field label="Aplicativo">
            <select value={appDraftId} onChange={e => setAppDraftId(e.target.value)} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }}>
              <option value="" style={{ color: 'black' }}>Selecione…</option>
              {apps.map(a => <option key={a.id} value={a.id} style={{ color: 'black' }}>{a.name}</option>)}
            </select>
          </Field>
          {selectedApp && <p className="text-xs" style={{ color: C.textSecondary }}>Organização responsável (derivada do aplicativo): <strong style={{ color: C.text }}>{selectedApp.partnerName}</strong></p>}

          <Field label="Nome interno da campanha">
            <input value={internalName} onChange={e => setInternalName(e.target.value)} placeholder="Ex: Lançamento Q1 2026" className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} />
          </Field>

          <Field label="Espaço de exibição">
            <select value={spaceId} onChange={e => setSpaceId(e.target.value)} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }}>
              {spaces.map(s => <option key={s.id} value={s.id} style={{ color: 'black' }}>{s.name}</option>)}
            </select>
          </Field>

          <p className="text-xs" style={{ color: C.textSecondary }}>Depois de criar, você configura anúncio, pacote e período na tela de detalhe da campanha.</p>

          <div className="flex gap-2 pt-2">
            <button type="button" disabled={saving} onClick={create} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: C.primary }}>
              {saving ? <><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Criando…</> : 'Criar rascunho'}
            </button>
            <Link href="/admin/marketplace/destaques" className="rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: C.border, color: C.text }}>Cancelar</Link>
          </div>
        </div>
      </div>
    </AdminShell>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-medium" style={{ color: C.text }}>{label}<div className="mt-1">{children}</div></label>
}
