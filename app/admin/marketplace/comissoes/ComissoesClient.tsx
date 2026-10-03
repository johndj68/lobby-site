'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Percent, Plus, X, Loader2, Ban, Info } from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import AdminShell from '@/components/layout/AdminShell'
import { createClient } from '@/lib/supabase'
import { MARKETPLACE_COLORS as C } from '@/lib/marketplace'
import { DEFAULT_COMMISSION_PERCENT, commissionScopeLabel, type CommissionTerm } from '@/lib/services/commission'

export interface PartnerOption  { id: string; name: string }
export interface CategoryOption { id: string; name: string }

interface Props {
  user:         SupabaseUser
  profile:      { full_name?: string; email?: string; is_leader?: boolean } | null
  partners:     PartnerOption[]
  categories:   CategoryOption[]
  terms:        CommissionTerm[]
  creatorNames: Record<string, string>
}

const NAV_TABS = [
  { label: 'Visão geral', href: '/admin/marketplace', enabled: true },
  { label: 'Aplicativos', href: '/admin/marketplace/aplicativos', enabled: true },
  { label: 'Solicitações', href: '/admin/marketplace/solicitacoes', enabled: true },
  { label: 'Ofertas', href: '/admin/marketplace/ofertas', enabled: true },
  { label: 'Destaques', href: '/admin/marketplace/destaques', enabled: true },
  { label: 'Categorias', href: '/admin/marketplace/categorias', enabled: true },
  { label: 'Parceiros', href: '/admin/marketplace/parceiros', enabled: true },
  { label: 'Comissões', href: '/admin/marketplace/comissoes', enabled: true },
  { label: 'Repasses', href: '/admin/marketplace/repasses', enabled: true },
  { label: 'Preços', href: '/admin/marketplace/precos', enabled: true },
]

const EMPTY_FORM = { partnerId: '', categoryId: '', percent: '' }

export default function ComissoesClient({ user, profile, partners, categories, terms: initialTerms, creatorNames }: Props) {
  const [terms, setTerms]   = useState(initialTerms)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]     = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [deactivating, setDeactivating] = useState<string | null>(null)

  const activeTerms   = terms.filter(t => t.is_active)
  const inactiveTerms = terms.filter(t => !t.is_active)

  const handleSubmit = async () => {
    const percentNum = Number(form.percent.replace(',', '.'))
    if (!form.partnerId && !form.categoryId) {
      setError('Selecione ao menos um parceiro ou uma categoria — os dois em branco seria o próprio fallback padrão, não precisa cadastrar.')
      return
    }
    if (!form.percent || isNaN(percentNum) || percentNum < 0 || percentNum > 100) {
      setError('Informe um percentual válido, entre 0 e 100.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const supabase = createClient()
      const { data, error: err } = await supabase
        .from('partner_commission_terms')
        .insert({
          partner_id:  form.partnerId || null,
          category_id: form.categoryId || null,
          percent:     percentNum,
          created_by:  user.id,
        })
        .select('*')
        .single()
      if (err) throw err

      const partnerName  = form.partnerId  ? partners.find(p => p.id === form.partnerId)?.name ?? null : null
      const categoryName = form.categoryId ? categories.find(c => c.id === form.categoryId)?.name ?? null : null
      setTerms(prev => [{ ...(data as CommissionTerm), partner_name: partnerName, category_name: categoryName }, ...prev])
      setForm(EMPTY_FORM)
      setShowForm(false)
    } catch (err) {
      // Índice único parcial rejeita 2 regras ativas pro mesmo escopo —
      // a mensagem crua do Postgres já é clara o suficiente pra esse caso.
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a condição comercial.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = async (term: CommissionTerm) => {
    setDeactivating(term.id)
    const supabase = createClient()
    const { error: err } = await supabase
      .from('partner_commission_terms')
      .update({ is_active: false, deactivated_at: new Date().toISOString(), deactivated_by: user.id })
      .eq('id', term.id)
    setDeactivating(null)
    if (err) return
    setTerms(prev => prev.map(t => t.id === term.id ? { ...t, is_active: false, deactivated_at: new Date().toISOString(), deactivated_by: user.id } : t))
  }

  return (
    <AdminShell user={user} profile={profile}>
      <div style={{ background: C.bg, minHeight: '100vh' }} className="px-4 py-6 sm:px-6 lg:px-8">
        <p className="mb-2 text-xs" style={{ color: C.textSecondary }}>
          <Link href="/admin/marketplace" className="hover:underline">Marketplace</Link> / Comissões
        </p>

        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>
              <Percent size={24} aria-hidden="true" />
              Comissões
            </h1>
            <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>
              Condições comerciais de comissão sobre venda de app de parceiro. Mais específico vence: parceiro+categoria &gt; parceiro &gt; categoria &gt; padrão.
            </p>
          </div>
          <button type="button" onClick={() => setShowForm(v => !v)}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ background: C.primary }}>
            {showForm ? <X size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
            {showForm ? 'Cancelar' : 'Nova condição'}
          </button>
        </div>

        {/* Navegação entre subseções do marketplace */}
        <div className="mb-5 flex gap-1 overflow-x-auto border-b" style={{ borderColor: C.border }}>
          {NAV_TABS.map(tab => (
            <Link key={tab.href} href={tab.href}
              className="shrink-0 px-3 py-2.5 text-sm font-semibold"
              style={tab.href === '/admin/marketplace/comissoes'
                ? { color: C.primary, borderBottom: `2px solid ${C.primary}` }
                : { color: C.textSecondary }}>
              {tab.label}
            </Link>
          ))}
        </div>

        {/* Indicador do fallback — não é uma linha no banco, é constante no código (ver comentário em get_partner_commission_percent) */}
        <div className="mb-5 flex items-start gap-3 rounded-2xl border p-4" style={{ borderColor: C.border, background: C.card }}>
          <Info size={16} className="mt-0.5 shrink-0" style={{ color: C.textSecondary }} aria-hidden="true" />
          <p className="text-sm" style={{ color: C.textSecondary }}>
            Quando nenhuma condição abaixo se aplica a uma venda, o padrão é <span className="font-bold" style={{ color: C.text }}>{DEFAULT_COMMISSION_PERCENT}%</span>.
            O checkout de app já usa essa resolução (<code>get_partner_commission_percent</code>) pra calcular a comissão no momento da venda — mudar uma condição aqui só afeta vendas futuras, nunca recalcula vendas já feitas.
          </p>
        </div>

        {/* Formulário de nova condição */}
        {showForm && (
          <div className="mb-5 rounded-2xl border p-5" style={{ borderColor: C.primary + '40', background: C.card }}>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold" style={{ color: C.textSecondary }}>Parceiro</label>
                <select value={form.partnerId} onChange={e => setForm(f => ({ ...f, partnerId: e.target.value }))} disabled={saving}
                  className="h-10 w-full rounded-xl border px-3 text-sm" style={{ borderColor: C.border, background: C.bg, color: C.text }}>
                  <option value="">Todos os parceiros</option>
                  {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold" style={{ color: C.textSecondary }}>Categoria</label>
                <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))} disabled={saving}
                  className="h-10 w-full rounded-xl border px-3 text-sm" style={{ borderColor: C.border, background: C.bg, color: C.text }}>
                  <option value="">Todas as categorias</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold" style={{ color: C.textSecondary }}>Percentual (%)</label>
                <input type="text" inputMode="decimal" placeholder="20" value={form.percent} disabled={saving}
                  onChange={e => setForm(f => ({ ...f, percent: e.target.value.replace(/[^0-9,.]/g, '') }))}
                  className="h-10 w-full rounded-xl border px-3 text-sm" style={{ borderColor: C.border, background: C.bg, color: C.text }} />
              </div>
            </div>
            {error && <p role="alert" className="mt-3 rounded-xl px-3 py-2 text-xs font-medium" style={{ background: C.error + '1A', color: C.error }}>{error}</p>}
            <div className="mt-4 flex gap-3">
              <button type="button" onClick={handleSubmit} disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60" style={{ background: C.primary }}>
                {saving ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
                {saving ? 'Salvando...' : 'Salvar condição'}
              </button>
            </div>
          </div>
        )}

        {/* Condições ativas */}
        <section aria-label="Condições comerciais ativas" className="mb-6">
          <h2 className="mb-3 text-sm font-bold" style={{ color: C.text }}>Ativas ({activeTerms.length})</h2>
          {activeTerms.length === 0 ? (
            <div className="rounded-2xl border p-8 text-center text-sm" style={{ borderColor: C.border, color: C.textSecondary }}>
              Nenhuma condição cadastrada — todas as vendas usam o padrão de {DEFAULT_COMMISSION_PERCENT}%.
            </div>
          ) : (
            <div className="space-y-2">
              {activeTerms.map(t => (
                <div key={t.id} className="flex items-center justify-between gap-3 rounded-2xl border p-4" style={{ borderColor: C.border, background: C.card }}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold" style={{ color: C.text }}>{commissionScopeLabel(t)}</p>
                    <p className="text-xs" style={{ color: C.textSecondary }}>
                      Criado por {t.created_by ? (creatorNames[t.created_by] ?? 'Usuário removido') : '—'} em {new Date(t.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-lg font-bold" style={{ color: C.primary, fontFamily: 'Space Grotesk, sans-serif' }}>{t.percent}%</span>
                    <button type="button" disabled={deactivating === t.id} onClick={() => handleDeactivate(t)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
                      style={{ background: C.error + '1A', color: C.error }}>
                      <Ban size={12} aria-hidden="true" />Desativar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Histórico de condições desativadas */}
        {inactiveTerms.length > 0 && (
          <section aria-label="Condições comerciais desativadas">
            <h2 className="mb-3 text-sm font-bold" style={{ color: C.textSecondary }}>Desativadas ({inactiveTerms.length})</h2>
            <div className="space-y-2 opacity-60">
              {inactiveTerms.map(t => (
                <div key={t.id} className="flex items-center justify-between gap-3 rounded-2xl border p-4" style={{ borderColor: C.border }}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold" style={{ color: C.text }}>{commissionScopeLabel(t)}</p>
                    <p className="text-xs" style={{ color: C.textSecondary }}>
                      Desativada {t.deactivated_at ? new Date(t.deactivated_at).toLocaleDateString('pt-BR') : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold" style={{ color: C.textSecondary }}>{t.percent}%</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </AdminShell>
  )
}
