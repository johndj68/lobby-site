'use client'

// Hooks do React para memoização, referências e estado local
import { useMemo, useRef, useState } from 'react'
// Biblioteca de animações para transições de entrada
import { motion } from 'framer-motion'
// Notificações de feedback para o usuário
import { toast } from 'sonner'
// Ícones da interface
import {
  Wallet, Plus, Download, TrendingUp, TrendingDown, BookOpen,
  Briefcase, MapPin, Receipt, Users, Search, ChevronDown, Trash2, CheckCircle2,
} from 'lucide-react'
// Layout padrão das páginas admin
import AdminShell from '@/components/layout/AdminShell'
// Modal de confirmação de exclusão
import ConfirmDialog from '@/components/admin/ConfirmDialog'
// Cliente do Supabase para operações no banco
import { createClient } from '@/lib/supabase'
// Hooks genéricos de modal CRUD e confirmação de exclusão
import { useCrudModal } from '@/hooks/useCrudModal'
import { useConfirmDelete } from '@/hooks/useConfirmDelete'
// Funções utilitárias financeiras: formatação, cálculos, filtros, exportação, labels
import {
  formatCurrencyBRL, calculateFinanceMetrics, filterFinanceTransactions,
  exportFinanceCSV, DEFAULT_FINANCE_FILTERS, FINANCE_TYPE_LABEL, FINANCE_STATUS_LABEL, PAYMENT_METHOD_LABEL,
} from '@/lib/finance'
import type { FinanceFilters } from '@/lib/finance'
// Sub-componentes da seção financeira
import FinanceMetricCard from '@/components/admin/finance/FinanceMetricCard'
import FinanceCharts from '@/components/admin/finance/FinanceCharts'
import FinanceTransactionTable, { FinanceTransactionEmptyState } from '@/components/admin/finance/FinanceTransactionTable'
import FinanceTransactionModal, {
  EMPTY_FINANCE_FORM, transactionToForm, type FinanceFormValues,
} from '@/components/admin/finance/FinanceTransactionModal'
// Tipos globais para transações financeiras
import type { FinancialTransaction, FinanceType, FinanceStatus, PaymentMethod } from '@/types'
// Tipo para compras de e-books pendentes de confirmação
import type { PendingEbookPurchase } from '@/lib/ebooks'
import type { User as SupabaseUser } from '@supabase/supabase-js'

// Props recebidas da Server Component (page.tsx)
interface Props {
  user:                     SupabaseUser                // Técnico autenticado
  profile:                  { full_name?: string } | null // Perfil do técnico logado
  initialTransactions:      FinancialTransaction[]       // Transações pré-carregadas no servidor
  initialPendingPurchases:  PendingEbookPurchase[]       // E-books aguardando confirmação de pagamento
}

// Opções de filtro de período para as transações
const PERIOD_OPTIONS: { value: FinanceFilters['period']; label: string }[] = [
  { value: 'hoje',  label: 'Hoje' },
  { value: '7d',    label: '7 dias' },
  { value: '30d',   label: '30 dias' },
  { value: 'mes',   label: 'Este mês' },
  { value: 'ano',   label: 'Este ano' },
  { value: 'todos', label: 'Todos' },
]

export default function FinanceiroClient({ user, profile, initialTransactions, initialPendingPurchases }: Props) {
  // Lista de transações exibida (atualizada otimisticamente)
  const [transactions, setTransactions] = useState<FinancialTransaction[]>(initialTransactions)
  // E-books com pagamento pendente de confirmação manual
  const [pendingPurchases, setPendingPurchases] = useState<PendingEbookPurchase[]>(initialPendingPurchases)
  // ID da compra de e-book em processo de confirmação (evita cliques duplos)
  const [confirmingPurchase, setConfirmingPurchase] = useState<string | null>(null)
  // Estado dos filtros ativos (período, tipo, status, forma de pagamento, busca)
  const [filters, setFilters] = useState<FinanceFilters>(DEFAULT_FINANCE_FILTERS)
  // ID da transação sendo editada (null = nova entrada)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Instância estável do Supabase (evita recriar a cada render)
  const sbRef = useRef(createClient())

  // Estado do modal de criação/edição via hook genérico de CRUD
  const {
    showForm, setShowForm, form, setForm, saving, setSaving, error, setError,
  } = useCrudModal<FinanceFormValues>(EMPTY_FINANCE_FORM)
  // Estado de confirmação de exclusão via hook dedicado
  const { confirmId: confirmDel, setConfirmId: setConfirmDel, deleting, setDeleting } = useConfirmDelete()

  // Transações filtradas (recalculadas só quando transactions ou filters mudam)
  const filtered = useMemo(() => filterFinanceTransactions(transactions, filters), [transactions, filters])
  // Métricas calculadas a partir das transações filtradas
  const metrics  = useMemo(() => calculateFinanceMetrics(filtered), [filtered])
  // Detecta se há algum filtro ativo (para exibir contador de resultados)
  const hasActiveFilters = filters.period !== 'todos' || filters.type !== 'todos' || filters.status !== 'todos'
    || filters.paymentMethod !== 'todos' || filters.search.trim() !== ''

  /* Abre o modal limpo para registrar uma nova entrada financeira */
  const openAdd = () => {
    setEditingId(null)
    setForm(EMPTY_FINANCE_FORM)
    setError('')
    setShowForm(true)
  }

  /* Abre o modal preenchido com os dados da transação para edição
     (também usado por "Ver detalhes" — o técnico líder tem acesso total) */
  const openEdit = (t: FinancialTransaction) => {
    setEditingId(t.id)
    setForm(transactionToForm(t))
    setError('')
    setShowForm(true)
  }

  /* Salva a entrada financeira (criar ou atualizar) */
  const handleSubmit = async () => {
    // Converte o valor digitado (aceita vírgula como separador decimal)
    const amountNum = Number(form.amount.replace(',', '.'))
    // Validações antes de prosseguir
    if (!form.type)               { setError('Selecione o tipo da entrada.'); return }
    if (!form.description.trim()) { setError('Informe a descrição.'); return }
    if (!form.amount || isNaN(amountNum) || amountNum <= 0) { setError('Informe um valor válido, maior que zero.'); return }
    if (!form.status)             { setError('Selecione o status.'); return }
    if (!form.sale_date)          { setError('Informe a data da venda.'); return }

    setSaving(true)
    setError('')
    try {
      const sb = sbRef.current
      // Monta o payload para inserção/atualização no banco
      const payload = {
        type:            form.type,
        client_name:     form.client_name.trim() || null,
        company_name:    form.company_name.trim() || null,
        description:     form.description.trim(),
        amount:          Number(form.amount.replace(',', '.')),
        status:          form.status,
        payment_method:  form.payment_method || null,
        sale_date:       form.sale_date,
        received_date:   form.received_date || null,
        notes:           form.notes.trim() || null,
        updated_at:      new Date().toISOString(),
      }

      if (editingId) {
        // Atualiza transação existente e reflete no estado local
        const { data, error: err } = await sb
          .from('financial_transactions').update(payload).eq('id', editingId).select('*').single()
        if (err) throw err
        setTransactions(prev => prev.map(t => t.id === editingId ? (data as FinancialTransaction) : t))
      } else {
        // Cria nova transação associada ao técnico responsável
        const { data, error: err } = await sb
          .from('financial_transactions')
          .insert({ ...payload, responsible_user_id: user.id })
          .select('*').single()
        if (err) throw err
        // Adiciona no topo da lista (mais recente primeiro)
        setTransactions(prev => [data as FinancialTransaction, ...prev])
      }
      setShowForm(false)
      toast.success('Entrada financeira registrada com sucesso.')
    } catch {
      setError('Não foi possível salvar. Verifique os campos e tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  /* Ação rápida na tabela: muda o status de uma transação (pago ou cancelado) */
  const updateStatus = async (t: FinancialTransaction, status: FinanceStatus, extra?: Partial<FinancialTransaction>) => {
    const { data, error: err } = await sbRef.current
      .from('financial_transactions')
      .update({ status, updated_at: new Date().toISOString(), ...extra })
      .eq('id', t.id).select('*').single()
    if (err) { toast.error('Não foi possível atualizar o status.'); return }
    // Atualiza otimisticamente sem recarregar a página
    setTransactions(prev => prev.map(x => x.id === t.id ? (data as FinancialTransaction) : x))
    toast.success(status === 'pago' ? 'Marcado como pago.' : 'Entrada cancelada.')
  }

  // Exclui a transação selecionada após confirmação no modal
  const handleDelete = async () => {
    if (!confirmDel) return
    setDeleting(confirmDel)
    const { error: err } = await sbRef.current.from('financial_transactions').delete().eq('id', confirmDel)
    setDeleting(null)
    if (err) { toast.error('Não foi possível excluir esta entrada.'); return }
    setTransactions(prev => prev.filter(t => t.id !== confirmDel))
    setConfirmDel(null)
    toast.success('Entrada financeira excluída.')
  }

  /* Confirmar pagamento de e-book pendente
     Sem gateway real, o líder confirma manualmente aqui. Marca a compra
     como paga (o que libera o download em /recursos via RLS) e lança a
     entrada correspondente em financial_transactions. */
  const confirmEbookPurchase = async (purchase: PendingEbookPurchase) => {
    setConfirmingPurchase(purchase.id)
    const sb = sbRef.current
    const nowIso = new Date().toISOString()
    const today  = nowIso.slice(0, 10)

    // 1. Marca a compra como paga — libera acesso ao e-book via RLS
    const { error: purchaseErr } = await sb
      .from('ebook_purchases')
      .update({ status: 'paid', paid_at: nowIso })
      .eq('id', purchase.id)
    if (purchaseErr) {
      toast.error('Não foi possível confirmar o pagamento.')
      setConfirmingPurchase(null)
      return
    }

    // 2. Lança entrada na tabela financeira para registrar a receita
    const { data: txData, error: txErr } = await sb
      .from('financial_transactions')
      .insert({
        type:                'ebook',
        client_name:         purchase.buyer_name || purchase.buyer_email || null,
        description:         `E-book: ${purchase.ebook_title}`,
        amount:              purchase.amount,
        status:              'pago',
        sale_date:           today,
        received_date:       today,
        responsible_user_id: user.id,
      })
      .select('*').single()
    if (txErr) {
      // Pagamento confirmado mas lançamento falhou — orienta registro manual
      toast.error('Pagamento confirmado, mas não foi possível lançar no financeiro. Registre manualmente.')
    } else {
      setTransactions(prev => [txData as FinancialTransaction, ...prev])
      toast.success('Pagamento confirmado e lançado no financeiro.')
    }
    // Remove da lista de pendentes independente do resultado do lançamento
    setPendingPurchases(prev => prev.filter(p => p.id !== purchase.id))
    setConfirmingPurchase(null)
  }

  // Descrição da transação sendo excluída (para exibir no modal de confirmação)
  const deletingTitle = transactions.find(t => t.id === confirmDel)?.description ?? ''

  return (
    <AdminShell user={user} profile={profile}>
      <div className="space-y-6">

        {/* ── HEADER: título, botão exportar CSV e botão nova entrada ─── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              <Wallet size={26} className="text-[#60A5FA]" aria-hidden="true" />
              Controle financeiro
            </h1>
            <p className="mt-1 text-sm text-white/40">
              Acompanhe receitas, vendas, projetos, e-books e visitas técnicas da empresa.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {/* Exporta as transações filtradas como arquivo CSV */}
            <button type="button" onClick={() => exportFinanceCSV(filtered)} disabled={filtered.length === 0}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-white/[0.10] bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/60 transition-all hover:border-white/20 hover:text-white disabled:opacity-40">
              <Download size={15} aria-hidden="true" />
              Exportar relatório
            </button>
            {/* Abre modal para registrar nova entrada financeira */}
            <button type="button" onClick={openAdd}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-5 py-2.5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(0,91,255,0.28)] transition-all hover:-translate-y-0.5">
              <Plus size={16} aria-hidden="true" />
              Nova entrada
            </button>
          </div>
        </motion.div>

        {/* ── E-BOOKS PENDENTES: seção só aparece quando há compras aguardando confirmação ── */}
        {pendingPurchases.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="rounded-3xl border border-[#F59E0B]/25 bg-[#F59E0B]/[0.04] p-5"
            aria-label="Compras de e-books pendentes de confirmação"
          >
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#FBBF24]">
              <BookOpen size={16} aria-hidden="true" />
              Compras de e-books aguardando confirmação ({pendingPurchases.length})
            </h2>
            <div className="space-y-2">
              {pendingPurchases.map(p => (
                <div key={p.id} className="flex flex-col gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{p.ebook_title}</p>
                    <p className="truncate text-xs text-white/40">
                      {p.buyer_name || p.buyer_email || 'Comprador desconhecido'} · {formatCurrencyBRL(p.amount)}
                    </p>
                  </div>
                  {/* Botão confirmar pagamento — libera e-book e lança no financeiro */}
                  <button
                    type="button"
                    disabled={confirmingPurchase === p.id}
                    onClick={() => confirmEbookPurchase(p)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#10B981]/12 px-3 py-1.5 text-xs font-bold text-[#34D399] transition-all hover:bg-[#10B981]/20 disabled:opacity-50"
                  >
                    <CheckCircle2 size={13} aria-hidden="true" />
                    {confirmingPurchase === p.id ? 'Confirmando...' : 'Confirmar pagamento'}
                  </button>
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {/* ── CARDS DE INDICADORES: 8 métricas financeiras do período filtrado ── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" role="list" aria-label="Indicadores financeiros">
          <FinanceMetricCard index={0} icon={TrendingUp}   title="Receita total"     value={formatCurrencyBRL(metrics.totalRevenue)}    sub={`${metrics.salesCount} venda(s) no período`} color="#60A5FA" bg="rgba(96,165,250,0.12)"  grad="#3B82F6" />
          <FinanceMetricCard index={1} icon={TrendingUp}   title="Receita recebida"  value={formatCurrencyBRL(metrics.receivedRevenue)} sub="Status: pago"                                 color="#34D399" bg="rgba(52,211,153,0.12)" grad="#10B981" />
          <FinanceMetricCard index={2} icon={TrendingDown} title="Receita pendente"  value={formatCurrencyBRL(metrics.pendingRevenue)}  sub="Status: pendente"                             color="#FBBF24" bg="rgba(251,191,36,0.12)" grad="#F59E0B" />
          <FinanceMetricCard index={3} icon={Users}        title="Clientes pagantes" value={String(metrics.payingClients)}               sub="Únicos, com pagamento confirmado"             color="#A78BFA" bg="rgba(167,139,250,0.12)" grad="#7B2CFF" />
          <FinanceMetricCard index={4} icon={BookOpen}     title="Vendas de e-books" value={String(metrics.ebookSales)}                  sub="No período filtrado"                          color="#7B2CFF" bg="rgba(123,44,255,0.12)" grad="#A78BFA" />
          <FinanceMetricCard index={5} icon={Briefcase}    title="Vendas de projetos" value={String(metrics.projectSales)}               sub="No período filtrado"                          color="#005BFF" bg="rgba(0,91,255,0.12)"   grad="#60A5FA" />
          <FinanceMetricCard index={6} icon={MapPin}       title="Visitas técnicas"  value={String(metrics.technicalVisits)}             sub="Presenciais, no período"                      color="#10B981" bg="rgba(16,185,129,0.12)" grad="#34D399" />
          <FinanceMetricCard index={7} icon={Receipt}      title="Ticket médio"      value={formatCurrencyBRL(metrics.averageTicket)}    sub={`${metrics.salesCount} venda(s)`}             color="#38BDF8" bg="rgba(56,189,248,0.12)" grad="#60A5FA" />
        </div>

        {/* ── GRÁFICOS: visualizações derivadas das métricas filtradas ── */}
        <FinanceCharts metrics={metrics} />

        {/* ── FILTROS: busca textual + período + tipo/status/forma de pagamento ── */}
        <div className="rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.25)]">
          <div className="flex flex-col gap-3">
            {/* Campo de busca textual (cliente, empresa, descrição ou valor) */}
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" aria-hidden="true" />
              <input
                type="text"
                value={filters.search}
                onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                placeholder="Buscar por cliente, empresa, descrição ou valor..."
                aria-label="Buscar transações"
                className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] pl-10 pr-3 text-sm text-white placeholder:text-white/25 outline-none focus:border-[#005BFF]/50 focus:ring-2 focus:ring-[#005BFF]/15"
              />
            </div>

            {/* Botões de filtro rápido por período */}
            <div className="flex flex-wrap gap-2">
              {PERIOD_OPTIONS.map(opt => (
                <button key={opt.value} type="button" onClick={() => setFilters(f => ({ ...f, period: opt.value }))}
                  aria-pressed={filters.period === opt.value}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    filters.period === opt.value ? 'bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] text-white' : 'border border-white/[0.08] bg-white/[0.03] text-white/50 hover:text-white/80'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Filtros adicionais: tipo de transação, status e forma de pagamento */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {/* Select de tipo (projeto, e-book, visita técnica, etc.) */}
              <div className="relative">
                <select value={filters.type} onChange={e => setFilters(f => ({ ...f, type: e.target.value as FinanceType | 'todos' }))}
                  aria-label="Filtrar por tipo"
                  className="h-10 w-full appearance-none rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 pr-8 text-xs font-medium text-white/70 outline-none focus:border-[#005BFF]/50">
                  <option value="todos">Todos os tipos</option>
                  {(Object.keys(FINANCE_TYPE_LABEL) as FinanceType[]).map(k => <option key={k} value={k}>{FINANCE_TYPE_LABEL[k]}</option>)}
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/30" aria-hidden="true" />
              </div>
              {/* Select de status (pago, pendente, cancelado) */}
              <div className="relative">
                <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value as FinanceStatus | 'todos' }))}
                  aria-label="Filtrar por status"
                  className="h-10 w-full appearance-none rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 pr-8 text-xs font-medium text-white/70 outline-none focus:border-[#005BFF]/50">
                  <option value="todos">Todos os status</option>
                  {(Object.keys(FINANCE_STATUS_LABEL) as FinanceStatus[]).map(k => <option key={k} value={k}>{FINANCE_STATUS_LABEL[k]}</option>)}
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/30" aria-hidden="true" />
              </div>
              {/* Select de forma de pagamento (pix, boleto, cartão, etc.) */}
              <div className="relative">
                <select value={filters.paymentMethod} onChange={e => setFilters(f => ({ ...f, paymentMethod: e.target.value as PaymentMethod | 'todos' }))}
                  aria-label="Filtrar por forma de pagamento"
                  className="h-10 w-full appearance-none rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 pr-8 text-xs font-medium text-white/70 outline-none focus:border-[#005BFF]/50">
                  <option value="todos">Todas as formas de pagamento</option>
                  {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map(k => <option key={k} value={k}>{PAYMENT_METHOD_LABEL[k]}</option>)}
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/30" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>

        {/* ── TABELA DE TRANSAÇÕES: lista filtrada com ações por linha ── */}
        <section aria-label="Transações financeiras">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Transações
              {/* Exibe contagem de resultados quando há filtros ativos */}
              {hasActiveFilters && (
                <span className="ml-2 text-sm font-normal text-white/40">({filtered.length} encontrada{filtered.length !== 1 ? 's' : ''})</span>
              )}
            </h2>
          </div>

          {filtered.length === 0 ? (
            // Estado vazio com CTA para criar primeira entrada
            <FinanceTransactionEmptyState hasFilters={hasActiveFilters} onCreate={openAdd} />
          ) : (
            // Tabela com ações rápidas: ver/editar, marcar pago, cancelar, excluir
            <FinanceTransactionTable
              transactions={filtered}
              onView={openEdit}
              onEdit={openEdit}
              onMarkPaid={(t) => updateStatus(t, 'pago', { received_date: t.received_date ?? new Date().toISOString().slice(0, 10) })}
              onCancel={(t) => updateStatus(t, 'cancelado')}
              onDelete={(t) => setConfirmDel(t.id)}
            />
          )}
        </section>
      </div>

      {/* ── MODAL: criar nova entrada ou editar existente ── */}
      <FinanceTransactionModal
        open={showForm}
        onOpenChange={setShowForm}
        editingTitle={editingId ? 'Editar entrada financeira' : 'Nova entrada financeira'}
        form={form}
        setForm={setForm}
        saving={saving}
        error={error}
        onSubmit={handleSubmit}
      />

      {/* ── MODAL: confirmação de exclusão permanente ── */}
      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={(open) => !open && setConfirmDel(null)}
        icon={Trash2}
        title="Excluir entrada financeira?"
        description={
          <>A entrada <span className="font-semibold text-white/80">{deletingTitle}</span> será removida permanentemente. Essa ação não poderá ser desfeita.</>
        }
        confirmLabel={<><Trash2 size={15} />Sim, excluir</>}
        confirmingLabel="Excluindo..."
        busy={!!deleting}
        onConfirm={handleDelete}
      />
    </AdminShell>
  )
}
