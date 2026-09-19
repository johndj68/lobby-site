'use client'

// Hooks do React para memoização e estado local
import { useMemo, useState } from 'react'
// Biblioteca de animações para transições suaves
import { motion, AnimatePresence } from 'framer-motion'
// Notificações de feedback para o usuário
import { toast } from 'sonner'
// Ícones da interface
import {
  Coins, Plus, Wallet, TrendingUp, TrendingDown, Clock, Users,
  Pencil, X, Save, Loader2, Star, ShoppingCart,
  SlidersHorizontal, CheckCircle2, Ban,
} from 'lucide-react'
// Layout padrão das páginas admin
import AdminShell from '@/components/layout/AdminShell'
// Modal de ajuste manual de saldo de créditos
import CreditManualAdjustmentModal from '@/components/credits/CreditManualAdjustmentModal'
// Cliente do Supabase para operações no banco
import { createClient } from '@/lib/supabase'
// Hook genérico de modal CRUD
import { useCrudModal } from '@/hooks/useCrudModal'
// Funções utilitárias: formatar valor em BRL e créditos
import { formatCurrencyBRL } from '@/lib/finance'
import { formatCredits, getCreditPurchaseStyle } from '@/lib/credits'
// Tipos globais de pacotes e compras de crédito
import type { CreditPackage, CreditPurchase } from '@/types'
// Tipo da carteira — shape da query feita na page.tsx
import type { WalletRow } from './page'
import type { User as SupabaseUser } from '@supabase/supabase-js'

// Props recebidas da Server Component (page.tsx)
interface Props {
  user:             SupabaseUser           // Técnico autenticado
  profile:          { full_name?: string } | null // Perfil do técnico logado
  initialWallets:   WalletRow[]            // Carteiras de crédito de todos os clientes
  initialPackages:  CreditPackage[]        // Pacotes de crédito cadastrados
  initialPurchases: CreditPurchase[]       // Histórico de compras (todas, incluindo pagas)
}

// Estado inicial do formulário de pacote de créditos
const EMPTY_PKG_FORM = { name: '', description: '', credits_amount: '', price: '', is_featured: false }

export default function CreditosAdminClient({ user, profile, initialWallets, initialPackages, initialPurchases }: Props) {
  // Lista de carteiras (saldo de créditos por cliente)
  const [wallets,   setWallets]   = useState(initialWallets)
  // Lista de pacotes de crédito disponíveis para venda
  const [packages,  setPackages]  = useState(initialPackages)
  // Histórico completo de compras de crédito
  const [purchases, setPurchases] = useState(initialPurchases)
  // ID da compra em processamento de confirmação/cancelamento (evita cliques duplos)
  const [processingPurchase, setProcessingPurchase] = useState<string | null>(null)

  // Estado do modal de criação/edição de pacote via hook genérico de CRUD
  const {
    showForm, setShowForm, editingId, setEditingId, form, setForm,
    saving, setSaving, error, setError,
  } = useCrudModal(EMPTY_PKG_FORM)

  // Controla a abertura do modal de ajuste manual de créditos
  const [adjustOpen, setAdjustOpen] = useState(false)
  // Cliente pré-selecionado para ajuste (null = seleção manual no modal)
  const [adjustClient, setAdjustClient] = useState<{ id: string; full_name: string | null; email: string | null } | null>(null)

  /* Stats derivados das compras e carteiras — recalculados apenas quando os dados mudam */
  const stats = useMemo(() => {
    const paid = purchases.filter(p => p.status === 'paid')
    return {
      revenue:       paid.reduce((s, p) => s + p.amount_paid, 0),    // Receita total com créditos
      creditsSold:   paid.reduce((s, p) => s + p.credits_amount, 0), // Total de créditos vendidos
      creditsUsed:   wallets.reduce((s, w) => s + w.total_spent, 0), // Total de créditos gastos pelos clientes
      pendingCount:  purchases.filter(p => p.status === 'pending').length, // Compras aguardando confirmação
      activeClients: wallets.filter(w => w.balance > 0).length,      // Clientes com saldo positivo
    }
  }, [purchases, wallets])

  // Lista filtrada apenas de compras pendentes (para a seção de confirmação manual)
  const pendingPurchases = useMemo(() => purchases.filter(p => p.status === 'pending'), [purchases])

  /* Abre formulário limpo para criar novo pacote de créditos */
  const openAddPkg = () => {
    setForm(EMPTY_PKG_FORM)
    setEditingId(null)
    setShowForm(true)
    setError('')
  }

  /* Abre formulário preenchido com os dados do pacote para edição */
  const openEditPkg = (pkg: CreditPackage) => {
    setForm({
      name: pkg.name, description: pkg.description ?? '',
      credits_amount: String(pkg.credits_amount),
      // Converte ponto para vírgula para o campo de preço (padrão BR)
      price: String(pkg.price).replace('.', ','),
      is_featured: pkg.is_featured,
    })
    setEditingId(pkg.id)
    setShowForm(true)
    setError('')
  }

  /* Salva o pacote de créditos (criar ou atualizar) */
  const handleSavePkg = async () => {
    const creditsNum = Number(form.credits_amount)
    const priceNum = Number(form.price.replace(',', '.'))
    // Validações antes de persistir
    if (!form.name.trim()) { setError('Informe o nome do pacote.'); return }
    if (!creditsNum || creditsNum <= 0 || !Number.isInteger(creditsNum)) { setError('Quantidade de créditos deve ser um número inteiro maior que zero.'); return }
    if (!priceNum || priceNum <= 0) { setError('Informe um preço válido, maior que zero.'); return }

    setSaving(true)
    setError('')
    try {
      const supabase = createClient()
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        credits_amount: creditsNum,
        price: priceNum,
        is_featured: form.is_featured,
      }
      if (editingId) {
        // Atualiza pacote existente e reflete no estado local
        const { data, error: err } = await supabase.from('credit_packages').update(payload).eq('id', editingId).select('*').single()
        if (err) throw err
        setPackages(prev => prev.map(p => p.id === editingId ? (data as CreditPackage) : p))
      } else {
        // Cria novo pacote e adiciona ao final da lista
        const { data, error: err } = await supabase.from('credit_packages').insert({ ...payload, created_by: user.id }).select('*').single()
        if (err) throw err
        setPackages(prev => [...prev, data as CreditPackage])
      }
      setShowForm(false)
      setEditingId(null)
      toast.success('Pacote salvo com sucesso.')
    } catch {
      setError('Não foi possível salvar o pacote. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  /* Ativa ou desativa um pacote — pacotes inativos não aparecem para os clientes */
  const toggleActive = async (pkg: CreditPackage) => {
    const supabase = createClient()
    const { data, error: err } = await supabase
      .from('credit_packages').update({ is_active: !pkg.is_active }).eq('id', pkg.id).select('*').single()
    if (err) { toast.error('Não foi possível atualizar o pacote.'); return }
    setPackages(prev => prev.map(p => p.id === pkg.id ? (data as CreditPackage) : p))
    toast.success(data.is_active ? 'Pacote ativado.' : 'Pacote desativado.')
  }

  /* Confirma o pagamento de uma compra pendente via RPC do banco
     A função confirm_credit_purchase credita os créditos na carteira do cliente */
  const confirmPurchase = async (purchase: CreditPurchase) => {
    setProcessingPurchase(purchase.id)
    const supabase = createClient()
    const { error: err } = await supabase.rpc('confirm_credit_purchase', { p_purchase_id: purchase.id })
    if (err) {
      toast.error(err.message || 'Não foi possível confirmar o pagamento.')
      setProcessingPurchase(null)
      return
    }
    // Atualiza compra para 'paid' no estado local
    setPurchases(prev => prev.map(p => p.id === purchase.id ? { ...p, status: 'paid', paid_at: new Date().toISOString() } : p))
    // Atualiza carteira do cliente otimisticamente (sem recarregar a página)
    setWallets(prev => {
      const idx = prev.findIndex(w => w.user_id === purchase.user_id)
      if (idx === -1) return prev
      const next = [...prev]
      next[idx] = { ...next[idx], balance: next[idx].balance + purchase.credits_amount, total_purchased: next[idx].total_purchased + purchase.credits_amount }
      return next
    })
    toast.success('Pagamento confirmado. Créditos liberados na carteira do cliente.')
    setProcessingPurchase(null)
  }

  /* Cancela uma compra pendente via RPC do banco */
  const cancelPurchase = async (purchase: CreditPurchase) => {
    setProcessingPurchase(purchase.id)
    const supabase = createClient()
    const { error: err } = await supabase.rpc('cancel_credit_purchase', { p_purchase_id: purchase.id })
    if (err) {
      toast.error(err.message || 'Não foi possível cancelar a compra.')
      setProcessingPurchase(null)
      return
    }
    setPurchases(prev => prev.map(p => p.id === purchase.id ? { ...p, status: 'canceled' } : p))
    toast.success('Compra cancelada.')
    setProcessingPurchase(null)
  }

  /* Abre o modal de ajuste manual pré-selecionando o cliente da carteira */
  const openAdjustFor = (w: WalletRow) => {
    setAdjustClient({ id: w.user_id, full_name: w.profiles?.full_name ?? null, email: w.profiles?.email ?? null })
    setAdjustOpen(true)
  }

  /* Abre o modal de ajuste manual sem pré-seleção (técnico escolhe o cliente) */
  const openAdjustGeneral = () => {
    setAdjustClient(null)
    setAdjustOpen(true)
  }

  /* Recarrega a página após ajuste manual para refletir o novo saldo
     Ajuste manual muda o saldo direto no banco — recarrega a página pra
     refletir o novo total sem precisar duplicar a lógica de soma aqui. */
  const reloadAfterAdjust = () => {
    window.location.reload()
  }

  return (
    <AdminShell user={user} profile={profile}>
      <div className="space-y-6">

        {/* ── HEADER: título e botões de ação ── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              <Coins size={26} className="text-[#FBBF24]" aria-hidden="true" />
              Gestão de créditos
            </h1>
            <p className="mt-1 text-sm text-white/40">Pacotes, carteiras dos clientes e movimentações de crédito.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {/* Botão para ajuste manual de saldo (sem selecionar cliente) */}
            <button type="button" onClick={openAdjustGeneral}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-white/[0.10] bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/60 transition-all hover:border-white/20 hover:text-white">
              <SlidersHorizontal size={15} aria-hidden="true" />
              Ajuste manual
            </button>
            {/* Botão para criar novo pacote de créditos */}
            <button type="button" onClick={openAddPkg}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-5 py-2.5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(0,91,255,0.28)] transition-all hover:-translate-y-0.5">
              <Plus size={16} aria-hidden="true" />
              Novo pacote
            </button>
          </div>
        </motion.div>

        {/* ── STATS: 5 indicadores de créditos (receita, vendidos, usados, pendentes, clientes) ── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5" role="list" aria-label="Indicadores de créditos">
          {[
            { icon: TrendingUp,   title: 'Receita com créditos', value: formatCurrencyBRL(stats.revenue),        color: '#34D399', bg: 'rgba(52,211,153,0.12)' },
            { icon: Coins,        title: 'Créditos vendidos',    value: formatCredits(stats.creditsSold),        color: '#FBBF24', bg: 'rgba(251,191,36,0.12)' },
            { icon: TrendingDown, title: 'Créditos usados',      value: formatCredits(stats.creditsUsed),        color: '#F87171', bg: 'rgba(248,113,113,0.12)' },
            { icon: Clock,        title: 'Compras pendentes',    value: String(stats.pendingCount),              color: '#FB923C', bg: 'rgba(251,146,60,0.12)' },
            { icon: Users,        title: 'Clientes com saldo',   value: String(stats.activeClients),             color: '#60A5FA', bg: 'rgba(96,165,250,0.12)' },
          ].map(({ icon: Icon, title, value, color, bg }, i) => (
            <motion.article key={title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 + i * 0.05 }}
              className="rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.25)]" role="listitem">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: bg }}>
                <Icon size={19} style={{ color }} aria-hidden="true" />
              </div>
              <p className="truncate text-xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{value}</p>
              <p className="mt-0.5 text-xs text-white/40">{title}</p>
            </motion.article>
          ))}
        </div>

        {/* ── FORMULÁRIO DE PACOTE: aparece/desaparece com animação ── */}
        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
              className="overflow-hidden rounded-2xl border border-[#005BFF]/25 bg-[#0D1428] p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  {editingId ? 'Editar pacote' : 'Novo pacote de créditos'}
                </h2>
                {/* Fecha o formulário sem salvar */}
                <button type="button" onClick={() => setShowForm(false)} className="text-white/40 hover:text-white transition-colors">
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Nome do pacote */}
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold text-white/60">Nome do pacote *</label>
                  <input type="text" placeholder="Ex: Pacote Profissional" value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50" />
                </div>
                {/* Quantidade de créditos — aceita apenas inteiros */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-white/60">Quantidade de créditos *</label>
                  <input type="text" inputMode="numeric" placeholder="100" value={form.credits_amount}
                    onChange={e => setForm(f => ({ ...f, credits_amount: e.target.value.replace(/[^0-9]/g, '') }))}
                    className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50" />
                </div>
                {/* Preço em BRL — aceita vírgula como separador decimal */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-white/60">Preço (R$) *</label>
                  <input type="text" inputMode="decimal" placeholder="89,90" value={form.price}
                    onChange={e => setForm(f => ({ ...f, price: e.target.value.replace(/[^0-9,.]/g, '') }))}
                    className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50" />
                </div>
                {/* Descrição opcional do pacote */}
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold text-white/60">Descrição <span className="text-white/30 font-normal">(opcional)</span></label>
                  <input type="text" placeholder="Ex: Ideal para comprar um e-book premium." value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50" />
                </div>
                {/* Toggle "Mais vendido" — destaca o pacote visualmente para o cliente */}
                <div className="sm:col-span-2">
                  <button type="button" aria-pressed={form.is_featured}
                    onClick={() => setForm(f => ({ ...f, is_featured: !f.is_featured }))}
                    className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold transition-all ${
                      form.is_featured ? 'border-[#FBBF24]/50 bg-[#FBBF24]/10 text-[#FBBF24]' : 'border-white/[0.08] bg-white/[0.03] text-white/50'
                    }`}>
                    <Star size={13} aria-hidden="true" />
                    Destacar como &quot;Mais vendido&quot;
                  </button>
                </div>
                {/* Mensagem de erro de validação */}
                {error && <p role="alert" className="sm:col-span-2 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400">{error}</p>}
                {/* Botões de ação do formulário */}
                <div className="flex gap-3 sm:col-span-2">
                  <button type="button" onClick={handleSavePkg} disabled={saving}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-5 py-2.5 text-sm font-bold text-white shadow transition-all hover:-translate-y-0.5 disabled:opacity-60">
                    {saving ? <><Loader2 size={14} className="animate-spin" aria-hidden="true" />Salvando...</> : <><Save size={14} aria-hidden="true" />{editingId ? 'Atualizar' : 'Criar pacote'}</>}
                  </button>
                  <button type="button" onClick={() => setShowForm(false)}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-white/50 hover:text-white transition-colors">
                    Cancelar
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── SEÇÃO: PACOTES DE CRÉDITOS — grid de cards por pacote ── */}
        <section aria-label="Pacotes de créditos">
          <h2 className="mb-4 text-lg font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Pacotes de créditos</h2>
          {packages.length === 0 ? (
            // Estado vazio: nenhum pacote cadastrado
            <div className="rounded-2xl border border-white/[0.06] p-10 text-center">
              <Coins size={28} className="mx-auto mb-3 text-white/20" aria-hidden="true" />
              <p className="text-sm text-white/30">Nenhum pacote cadastrado ainda.</p>
            </div>
          ) : (
            // Grid de cards: pacotes inativos ficam opacos (opacity-60)
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {packages.map(pkg => (
                <div key={pkg.id} className={`rounded-2xl border p-4 ${pkg.is_active ? 'border-white/[0.07] bg-white/[0.03]' : 'border-white/[0.04] bg-white/[0.01] opacity-60'}`}>
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-white">{pkg.name}</p>
                    {/* Ícone de estrela para pacotes destacados como "Mais vendido" */}
                    {pkg.is_featured && <Star size={13} className="shrink-0 text-[#FBBF24]" aria-hidden="true" />}
                  </div>
                  {/* Quantidade de créditos e preço em destaque */}
                  <p className="text-lg font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{formatCredits(pkg.credits_amount)}</p>
                  <p className="text-sm font-semibold text-[#60A5FA]">{formatCurrencyBRL(pkg.price)}</p>
                  {pkg.description && <p className="mt-1.5 text-xs text-white/35">{pkg.description}</p>}
                  {/* Ações: editar e ativar/desativar o pacote */}
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => openEditPkg(pkg)}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#A78BFA]/10 px-2.5 py-1.5 text-[11px] font-semibold text-[#A78BFA] hover:bg-[#A78BFA]/20">
                      <Pencil size={11} aria-hidden="true" />Editar
                    </button>
                    {/* Botão de toggle: desativar (vermelho) ou ativar (verde) */}
                    <button type="button" onClick={() => toggleActive(pkg)}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${
                        pkg.is_active ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-[#10B981]/10 text-[#34D399] hover:bg-[#10B981]/20'
                      }`}>
                      {pkg.is_active ? 'Desativar' : 'Ativar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── SEÇÃO: COMPRAS PENDENTES — só aparece quando há compras aguardando ── */}
        {pendingPurchases.length > 0 && (
          <section aria-label="Compras de créditos pendentes">
            <h2 className="mb-4 text-lg font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Compras pendentes ({pendingPurchases.length})
            </h2>
            <div className="space-y-2">
              {pendingPurchases.map(p => (
                <div key={p.id} className="flex flex-col gap-2 rounded-2xl border border-[#F59E0B]/25 bg-[#F59E0B]/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    {/* Nome do comprador, pacote e valor pago */}
                    <p className="truncate text-sm font-semibold text-white">
                      {p.buyer_name || p.buyer_email || 'Cliente'} · {formatCredits(p.credits_amount)}
                    </p>
                    <p className="text-xs text-white/40">{p.package?.name} · {formatCurrencyBRL(p.amount_paid)}</p>
                  </div>
                  {/* Botões de cancelar e confirmar pagamento */}
                  <div className="flex shrink-0 gap-2">
                    <button type="button" disabled={processingPurchase === p.id} onClick={() => cancelPurchase(p)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/20 disabled:opacity-50">
                      <Ban size={12} aria-hidden="true" />Cancelar
                    </button>
                    {/* Confirmar libera os créditos na carteira do cliente via RPC */}
                    <button type="button" disabled={processingPurchase === p.id} onClick={() => confirmPurchase(p)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#10B981]/12 px-3 py-1.5 text-xs font-bold text-[#34D399] hover:bg-[#10B981]/20 disabled:opacity-50">
                      <CheckCircle2 size={12} aria-hidden="true" />
                      {processingPurchase === p.id ? 'Confirmando...' : 'Confirmar pagamento'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── SEÇÃO: CARTEIRAS DOS CLIENTES — tabela com saldo e histórico ── */}
        <section aria-label="Carteiras dos clientes">
          <h2 className="mb-4 text-lg font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Carteiras de clientes</h2>
          {wallets.length === 0 ? (
            // Estado vazio: nenhuma movimentação de crédito ainda
            <div className="rounded-2xl border border-white/[0.06] p-10 text-center">
              <Wallet size={28} className="mx-auto mb-3 text-white/20" aria-hidden="true" />
              <p className="text-sm text-white/30">Nenhuma movimentação de crédito registrada ainda.</p>
            </div>
          ) : (
            // Tabela responsiva: cliente, saldo atual, total comprado, total usado, ação
            <div className="overflow-x-auto rounded-2xl border border-white/[0.07]">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.07] text-[11px] uppercase tracking-wider text-white/35">
                    <th className="px-4 py-3 font-semibold">Cliente</th>
                    <th className="px-4 py-3 font-semibold">Saldo</th>
                    <th className="px-4 py-3 font-semibold">Total comprado</th>
                    <th className="px-4 py-3 font-semibold">Total usado</th>
                    <th className="px-4 py-3 font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {wallets.map(w => (
                    <tr key={w.id} className="text-white/80">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-white">{w.profiles?.full_name || 'Sem nome'}</p>
                        <p className="text-xs text-white/35">{w.profiles?.email}</p>
                      </td>
                      {/* Saldo atual em destaque (amarelo) */}
                      <td className="px-4 py-3 font-bold text-[#FBBF24]">{formatCredits(w.balance)}</td>
                      <td className="px-4 py-3 text-white/60">{formatCredits(w.total_purchased)}</td>
                      <td className="px-4 py-3 text-white/60">{formatCredits(w.total_spent)}</td>
                      <td className="px-4 py-3">
                        {/* Botão para ajuste manual do saldo deste cliente */}
                        <button type="button" onClick={() => openAdjustFor(w)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-semibold text-white/60 hover:bg-white/[0.12] hover:text-white">
                          <SlidersHorizontal size={11} aria-hidden="true" />Ajustar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── SEÇÃO: COMPRAS RECENTES — histórico de todas as compras (máx. 30) ── */}
        <section aria-label="Compras recentes">
          <h2 className="mb-4 text-lg font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Compras recentes</h2>
          {purchases.length === 0 ? (
            // Estado vazio: nenhuma compra registrada
            <div className="rounded-2xl border border-white/[0.06] p-10 text-center">
              <ShoppingCart size={28} className="mx-auto mb-3 text-white/20" aria-hidden="true" />
              <p className="text-sm text-white/30">Nenhuma compra de créditos registrada ainda.</p>
            </div>
          ) : (
            // Lista de compras com badge de status colorido por estado
            <div className="space-y-2">
              {purchases.slice(0, 30).map(p => {
                // Retorna cor e label do badge baseado no status (paid/pending/canceled)
                const style = getCreditPurchaseStyle(p.status)
                return (
                  <div key={p.id} className="flex flex-col gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{p.buyer_name || p.buyer_email || 'Cliente'}</p>
                      <p className="text-xs text-white/40">{p.package?.name} · {formatCredits(p.credits_amount)} · {formatCurrencyBRL(p.amount_paid)}</p>
                    </div>
                    {/* Badge de status: pago (verde), pendente (laranja), cancelado (vermelho) */}
                    <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: style.bg, color: style.color }}>{style.label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {/* ── MODAL DE AJUSTE MANUAL: add/sub créditos diretamente na carteira ── */}
      <CreditManualAdjustmentModal
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        presetClient={adjustClient}   // null = técnico escolhe o cliente no modal
        onAdjusted={reloadAfterAdjust} // Recarrega a página para refletir o novo saldo
      />
    </AdminShell>
  )
}
