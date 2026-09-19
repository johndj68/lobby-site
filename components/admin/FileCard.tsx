'use client'

import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText, X, PenLine, Tag, CheckCircle, Copy,
  ExternalLink, Loader2, Trash2, Save, Lock, Gift, DollarSign, Upload, ShieldCheck,
} from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import { timeAgo } from '@/lib/utils'
import { CATEGORY_CFG } from '@/lib/categories'
import { formatCurrencyBRL } from '@/lib/finance'
import { SALE_STATUS_LABEL, DELIVERY_TYPE_LABEL } from '@/lib/ebooks'
import type { SaleStatus, DeliveryType } from '@/types'

/**
 * Representa um arquivo armazenado no bucket do Supabase Storage.
 * O campo `id` pode ser null antes de o arquivo ser totalmente indexado.
 */
export interface StorageFile {
  id:          string | null
  name:        string
  updated_at?: string | null
  created_at?: string | null
  metadata?:   { size?: number; mimetype?: string } | null
}

/**
 * Metadados editoriais de um recurso (e-book, guia, etc.) armazenados
 * separadamente do arquivo bruto. Inclui campos comuns a todos os
 * materiais e campos exclusivos de e-books pagos (prefixados com `sale_`
 * ou `payment_`).
 */
export interface ResourceMeta {
  file_name:    string
  title:        string
  category:     string
  description?: string
  format?:      string
  read_time?:   string
  level?:       string
  // E-books pagos — ausente/false em todo material gratuito já existente.
  is_paid?:              boolean
  price?:                number | null
  credit_price?:         number | null
  sale_description?:     string | null
  sale_status?:          SaleStatus
  delivery_type?:        DeliveryType
  payment_product_id?:   string | null
  protected_file_path?:  string | null
}

/**
 * Estado do formulário de edição inline de metadados.
 * Campos numéricos (price, credit_price) são strings aqui para permitir
 * digitação livre no input — conversão para número ocorre no save.
 */
export interface EditForm {
  title:        string
  category:     string
  description:  string
  format:       string
  read_time:    string
  level:        string
  is_paid:              boolean
  price:                string   // string no form (aceita digitação livre), número no banco
  credit_price:         string   // idem — preço alternativo em créditos, opcional
  sale_description:     string
  sale_status:          SaleStatus
  delivery_type:        DeliveryType
  payment_product_id:   string
}

/**
 * Formata um tamanho em bytes para exibição legível (B, KB ou MB).
 * Retorna "—" se o valor for undefined ou zero.
 */
export function formatSize(bytes?: number): string {
  if (!bytes) return '—'
  if (bytes < 1024)         return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export { timeAgo }

/**
 * Determina o tipo de arquivo com base na extensão do nome.
 * Usado para aplicar estilo visual diferenciado por tipo.
 */
export function getFileType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf')                        return 'PDF'
  if (['doc', 'docx', 'txt'].includes(ext)) return 'Documentos'
  if (['zip', 'rar', '7z'].includes(ext))   return 'ZIP'
  return 'Outros'
}

/**
 * Retorna as cores (texto e fundo) do ícone do arquivo conforme seu tipo.
 * PDFs são vermelhos, ZIPs são amarelos, documentos de texto são azuis.
 */
export function getFileStyle(name: string) {
  const t = getFileType(name)
  if (t === 'PDF')        return { color: '#F87171', bg: 'rgba(248,113,113,0.12)' }
  if (t === 'ZIP')        return { color: '#FBBF24', bg: 'rgba(251,191,36,0.12)'  }
  if (t === 'Documentos') return { color: '#60A5FA', bg: 'rgba(96,165,250,0.12)'  }
  return                         { color: '#94A3B8', bg: 'rgba(148,163,184,0.12)' }
}

// Categorias e níveis disponíveis nos selects do formulário de metadados
const CATEGORIES = ['Software', 'Automação', 'Dados', 'Cibersegurança'] as const
const LEVELS     = ['Iniciante', 'Intermediário', 'Avançado'] as const


/**
 * Props do FileCard.
 * - file: dados brutos do arquivo no Storage
 * - meta: metadados editoriais (pode ser undefined se o arquivo ainda não foi nomeado)
 * - index: posição na lista, para delay de animação escalonado
 * - publicUrl: URL pública do arquivo (vazia em e-books pagos)
 * - isCopied: feedback visual após copiar a URL
 * - isDeleting: spinner no botão de excluir
 * - isEditing: controla visibilidade do formulário inline
 * - editForm / setEditForm: estado controlado do formulário de metadados
 * - savingMeta: spinner durante o salvamento dos metadados
 * - metaSuccess: nome do arquivo que acabou de ser salvo com sucesso (feedback)
 * - isLeader: controla visibilidade de campos e ações exclusivos do líder
 * - uploadingProtected: spinner durante o upload do arquivo protegido
 * - onToggleEdit: abre/fecha o formulário de edição
 * - onSaveMeta: persiste os metadados no banco
 * - onCopy: copia a URL pública para a área de transferência
 * - onRequestDelete: abre o modal de confirmação de exclusão
 * - onUploadProtectedFile: envia o arquivo para o bucket privado de e-books pagos
 * - onChoosePaid: callback disparado ao selecionar "Pago" no radio de tipo de acesso
 */
interface Props {
  file:         StorageFile
  meta:         ResourceMeta | undefined
  index:        number
  publicUrl:    string
  isCopied:     boolean
  isDeleting:   boolean
  isEditing:    boolean
  editForm:     EditForm
  setEditForm:  Dispatch<SetStateAction<EditForm>>
  savingMeta:   boolean
  metaSuccess:  string | null
  isLeader:            boolean
  uploadingProtected:  boolean
  onToggleEdit: () => void
  onSaveMeta:   () => void
  onCopy:       () => void
  onRequestDelete: () => void
  onUploadProtectedFile: (file: File) => void
  onChoosePaid: () => void
}

/**
 * Card de arquivo da biblioteca (linha + formulário de metadados inline).
 * Extraído de ArquivosClient.tsx, que tinha ~250 linhas só desse bloco
 * dentro de um único .map(). "Tipo de acesso" (Gratuito/Pago) só aparece
 * pra técnico líder — técnico comum nunca vê nem edita campos financeiros.
 */
export default function FileCard({
  file, meta, index, publicUrl, isCopied, isDeleting, isEditing,
  editForm, setEditForm, savingMeta, metaSuccess, isLeader, uploadingProtected,
  onToggleEdit, onSaveMeta, onCopy, onRequestDelete, onUploadProtectedFile, onChoosePaid,
}: Props) {
  // Estilo visual (cor e fundo do ícone) baseado na extensão do arquivo
  const style = getFileStyle(file.name)

  // Cores da categoria do material (quando os metadados já existem)
  const catColors = meta ? (CATEGORY_CFG[meta.category] ?? CATEGORY_CFG['Software']) : null

  // Indica se este item é um e-book pago
  const isPaidItem = meta?.is_paid === true

  // Técnico comum não pode editar e-books pagos — RLS bloquearia o save no banco
  const editLocked = isPaidItem && !isLeader

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ delay: index * 0.03 }}
      className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.03] transition-all hover:border-white/[0.12]"
    >
      {/* ── Linha principal do arquivo ── */}
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          {/* Ícone com cor diferenciada por tipo de arquivo */}
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: style.bg }}>
            <FileText size={18} style={{ color: style.color }} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            {/* Exibe título e badges de categoria/nível se os metadados existirem */}
            {meta ? (
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                <p className="text-sm font-bold text-white">{meta.title}</p>
                {/* Badge de categoria com cor da área */}
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: catColors!.bg, color: catColors!.color }}>
                  {meta.category}
                </span>
                {/* Badge de nível de dificuldade (opcional) */}
                {meta.level && (
                  <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[10px] text-white/40">
                    {meta.level}
                  </span>
                )}
                {/* Badge de preço (Pago) ou Gratuito */}
                {isPaidItem ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#F59E0B]/12 px-2 py-0.5 text-[10px] font-bold text-[#F59E0B]">
                    <DollarSign size={9} aria-hidden="true" />
                    {meta.price != null ? formatCurrencyBRL(meta.price) : 'Pago'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#10B981]/12 px-2 py-0.5 text-[10px] font-bold text-[#34D399]">
                    <Gift size={9} aria-hidden="true" />
                    Gratuito
                  </span>
                )}
              </div>
            ) : (
              // Arquivo ainda sem metadados — convida o técnico a nomear
              <p className="text-sm font-bold text-white/50 italic mb-0.5">Sem nome atribuído</p>
            )}
            {/* Nome do arquivo bruto no Storage (em fonte mono para distinguir do título) */}
            <p className="truncate text-[11px] text-white/30 font-mono" title={file.name}>{file.name}</p>
            {/* Tamanho e data de última modificação */}
            <div className="mt-0.5 flex flex-wrap gap-3 text-[11px] text-white/25">
              <span>{formatSize(file.metadata?.size)}</span>
              <span>{timeAgo(file.updated_at ?? file.created_at)}</span>
            </div>
          </div>
        </div>

        {/* Botões de ação do arquivo */}
        <div className="flex shrink-0 flex-wrap gap-2">
          {/* Botão de editar/nomear — bloqueado para técnicos comuns em e-books pagos */}
          <button
            type="button"
            onClick={onToggleEdit}
            disabled={editLocked}
            title={editLocked ? 'Somente Técnico Líder pode editar e-books pagos.' : undefined}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
              isEditing
                ? 'bg-white/[0.10] text-white'
                : meta
                  ? 'bg-[#A78BFA]/10 text-[#A78BFA] hover:bg-[#A78BFA]/18'
                  : 'bg-[#FBBF24]/10 text-[#FBBF24] hover:bg-[#FBBF24]/18'
            }`}
          >
            {editLocked
              ? <><Lock size={12} />Restrito</>
              : isEditing
                ? <><X size={12} />Cancelar</>
                : meta
                  ? <><PenLine size={12} />Editar</>
                  : <><Tag size={12} />Nomear</>
            }
          </button>

          {/* E-book pago nunca tem URL pública — arquivo real fica só no
              bucket privado, liberado por signed URL após compra confirmada. */}
          {!isPaidItem && (
            <>
              {/* Botão de copiar URL pública — muda para feedback "Copiado!" temporariamente */}
              <button type="button" onClick={onCopy}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                  isCopied ? 'bg-[#10B981]/15 text-[#34D399]' : 'bg-[#60A5FA]/10 text-[#60A5FA] hover:bg-[#60A5FA]/18'
                }`}
              >
                {isCopied ? <><CheckCircle size={12} />Copiado!</> : <><Copy size={12} />URL</>}
              </button>

              {/* Link para abrir o arquivo em nova aba */}
              <a href={publicUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-white/45 hover:bg-white/[0.10] hover:text-white/80 transition-all">
                <ExternalLink size={11} />Abrir
              </a>
            </>
          )}

          {/* Botão de excluir — técnico comum só pode excluir materiais gratuitos */}
          {(isLeader || !isPaidItem) && (
            <button type="button" disabled={isDeleting} onClick={onRequestDelete}
              className="inline-flex items-center gap-1.5 rounded-xl bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50">
              {isDeleting ? <><Loader2 size={11} className="animate-spin" />Excluindo...</> : <><Trash2 size={11} />Excluir</>}
            </button>
          )}
        </div>
      </div>

      {/* ── Formulário inline de edição de metadados ── */}
      <AnimatePresence>
        {isEditing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-white/[0.06]"
          >
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              {/* Campo de título — obrigatório para salvar */}
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-white/60">
                  Nome do material <span className="text-[#FBBF24]">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: Guia de Automação para PMEs"
                  value={editForm.title}
                  onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                  className="h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50 focus:ring-2 focus:ring-[#005BFF]/15"
                />
              </div>

              {/* Select de categoria — determina onde o material aparece na plataforma */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-white/60">
                  Categoria <span className="text-[#FBBF24]">*</span>
                </label>
                <select
                  value={editForm.category}
                  onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
                  className="h-10 w-full rounded-xl border border-white/[0.08] bg-[#0D1428] px-3 text-sm text-white outline-none focus:border-[#005BFF]/50 focus:ring-2 focus:ring-[#005BFF]/15"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Select de nível de dificuldade do conteúdo */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-white/60">Nível</label>
                <select
                  value={editForm.level}
                  onChange={e => setEditForm(f => ({ ...f, level: e.target.value }))}
                  className="h-10 w-full rounded-xl border border-white/[0.08] bg-[#0D1428] px-3 text-sm text-white outline-none focus:border-[#005BFF]/50 focus:ring-2 focus:ring-[#005BFF]/15"
                >
                  {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>

              {/* Estimativa de tempo de leitura (texto livre, ex: "8 min") */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-white/60">Tempo de leitura</label>
                <input
                  type="text"
                  placeholder="Ex: 8 min"
                  value={editForm.read_time}
                  onChange={e => setEditForm(f => ({ ...f, read_time: e.target.value }))}
                  className="h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50"
                />
              </div>

              {/* Descrição curta exibida nos cards de material para o usuário final */}
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-white/60">Descrição curta</label>
                <input
                  type="text"
                  placeholder="Ex: Como automatizar processos repetitivos e ganhar tempo..."
                  value={editForm.description}
                  onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  className="h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50"
                />
              </div>

              {/* ── Tipo de acesso — só técnico líder vê/mexe ────────── */}
              {isLeader && (
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold text-white/60">Tipo de acesso</label>
                  {/* Radio group visual: Gratuito vs Pago */}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Tipo de acesso">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={!editForm.is_paid}
                      onClick={() => setEditForm(f => ({ ...f, is_paid: false }))}
                      className={`rounded-xl border p-3 text-left transition-all ${
                        !editForm.is_paid ? 'border-[#10B981]/50 bg-[#10B981]/10' : 'border-white/[0.08] bg-white/[0.03] hover:border-white/20'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 text-xs font-bold text-white"><Gift size={13} className="text-[#34D399]" aria-hidden="true" />Gratuito</span>
                      <span className="mt-1 block text-[11px] text-white/40">Usuários poderão baixar sem pagamento.</span>
                    </button>
                    {/* Ao escolher "Pago", dispara onChoosePaid para pré-processar o arquivo protegido */}
                    <button
                      type="button"
                      role="radio"
                      aria-checked={editForm.is_paid}
                      onClick={() => { setEditForm(f => ({ ...f, is_paid: true })); onChoosePaid() }}
                      className={`rounded-xl border p-3 text-left transition-all ${
                        editForm.is_paid ? 'border-[#F59E0B]/50 bg-[#F59E0B]/10' : 'border-white/[0.08] bg-white/[0.03] hover:border-white/20'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 text-xs font-bold text-white"><DollarSign size={13} className="text-[#F59E0B]" aria-hidden="true" />Pago</span>
                      <span className="mt-1 block text-[11px] text-white/40">O download será liberado somente após confirmação do pagamento.</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ── Campos de e-book pago (visíveis apenas para líderes quando is_paid=true) ── */}
              {isLeader && editForm.is_paid && (
                <>
                  <div className="sm:col-span-2 rounded-xl border border-[#F59E0B]/20 bg-[#F59E0B]/[0.04] p-3">
                    <p className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#F59E0B]">
                      <Lock size={11} aria-hidden="true" />Detalhes do e-book pago
                    </p>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {/* Preço em BRL — aceita digitação com vírgula ou ponto */}
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-white/60" htmlFor="ebook-price">
                          Preço (R$) <span className="text-[#FBBF24]">*</span>
                        </label>
                        <input
                          id="ebook-price"
                          type="text"
                          inputMode="decimal"
                          placeholder="49,90"
                          value={editForm.price}
                          onChange={e => setEditForm(f => ({ ...f, price: e.target.value.replace(/[^0-9,.]/g, '') }))}
                          className="h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#F59E0B]/50"
                        />
                      </div>
                      {/* Status de venda: define se o e-book está disponível para compra */}
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-white/60" htmlFor="ebook-sale-status">Status de venda</label>
                        <select
                          id="ebook-sale-status"
                          value={editForm.sale_status}
                          onChange={e => setEditForm(f => ({ ...f, sale_status: e.target.value as SaleStatus }))}
                          className="h-10 w-full rounded-xl border border-white/[0.08] bg-[#0D1428] px-3 text-sm text-white outline-none focus:border-[#F59E0B]/50"
                        >
                          {(Object.keys(SALE_STATUS_LABEL) as SaleStatus[]).map(k => <option key={k} value={k}>{SALE_STATUS_LABEL[k]}</option>)}
                        </select>
                      </div>
                      {/* Preço alternativo em créditos da plataforma (opcional) */}
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-white/60" htmlFor="ebook-credit-price">
                          Preço em créditos <span className="font-normal text-white/25">(opcional)</span>
                        </label>
                        <input
                          id="ebook-credit-price"
                          type="text"
                          inputMode="numeric"
                          placeholder="Ex: 50"
                          value={editForm.credit_price}
                          onChange={e => setEditForm(f => ({ ...f, credit_price: e.target.value.replace(/[^0-9]/g, '') }))}
                          className="h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#F59E0B]/50"
                        />
                        <p className="mt-1 text-[10px] text-white/30">Se preenchido, o cliente também pode pagar com créditos.</p>
                      </div>
                    </div>

                    {/* Descrição comercial exibida na página de venda para o cliente */}
                    <div className="mt-3">
                      <label className="mb-1.5 block text-xs font-semibold text-white/60" htmlFor="ebook-sale-desc">Descrição comercial</label>
                      <textarea
                        id="ebook-sale-desc"
                        rows={2}
                        placeholder="Explique o valor do conteúdo para o comprador..."
                        value={editForm.sale_description}
                        onChange={e => setEditForm(f => ({ ...f, sale_description: e.target.value }))}
                        className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#F59E0B]/50"
                      />
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {/* Tipo de entrega: download imediato, e-mail, etc. */}
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-white/60" htmlFor="ebook-delivery">Entrega</label>
                        <select
                          id="ebook-delivery"
                          value={editForm.delivery_type}
                          onChange={e => setEditForm(f => ({ ...f, delivery_type: e.target.value as DeliveryType }))}
                          className="h-10 w-full rounded-xl border border-white/[0.08] bg-[#0D1428] px-3 text-sm text-white outline-none focus:border-[#F59E0B]/50"
                        >
                          {(Object.keys(DELIVERY_TYPE_LABEL) as DeliveryType[]).map(k => <option key={k} value={k}>{DELIVERY_TYPE_LABEL[k]}</option>)}
                        </select>
                      </div>
                      {/* ID do produto no gateway de pagamento (ex: Stripe) — opcional */}
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-white/60" htmlFor="ebook-product-id">
                          Produto vinculado <span className="font-normal text-white/25">(opcional)</span>
                        </label>
                        <input
                          id="ebook-product-id"
                          type="text"
                          placeholder="ID do produto no gateway, se houver"
                          value={editForm.payment_product_id}
                          onChange={e => setEditForm(f => ({ ...f, payment_product_id: e.target.value }))}
                          className="h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#F59E0B]/50"
                        />
                      </div>
                    </div>

                    {/* Seção de upload do arquivo protegido (bucket privado) */}
                    <div className="mt-3">
                      <label className="mb-1.5 block text-xs font-semibold text-white/60">
                        Arquivo protegido do e-book <span className="text-[#FBBF24]">*</span>
                      </label>
                      <p className="mb-2 text-[11px] text-white/35">
                        Fica em bucket privado — só é liberado após pagamento confirmado, nunca fica público.
                        O arquivo já enviado na biblioteca é reaproveitado automaticamente como conteúdo protegido.
                      </p>
                      {/* Estados do arquivo protegido: enviando / pronto / não enviado */}
                      {uploadingProtected ? (
                        <p className="mb-2 flex items-center gap-1.5 text-[11px] text-[#FBBF24]">
                          <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                          Protegendo o arquivo já enviado...
                        </p>
                      ) : meta?.protected_file_path ? (
                        <p className="mb-2 flex items-center gap-1.5 text-[11px] text-[#34D399]">
                          <ShieldCheck size={12} aria-hidden="true" />
                          Arquivo protegido pronto: <span className="font-mono text-white/60">{meta.protected_file_path}</span>
                        </p>
                      ) : (
                        <p className="mb-2 text-[11px] text-red-400">Nenhum arquivo protegido ainda — envie um manualmente abaixo.</p>
                      )}
                      {/* Input de arquivo oculto — ativado pelo label estilizado */}
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-3 py-1.5 text-xs font-semibold text-[#F59E0B] transition-all hover:bg-[#F59E0B]/20">
                        {uploadingProtected ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Upload size={12} aria-hidden="true" />}
                        {uploadingProtected ? 'Aguarde...' : meta?.protected_file_path ? 'Enviar outro arquivo' : 'Enviar arquivo protegido'}
                        <input
                          type="file"
                          className="sr-only"
                          disabled={uploadingProtected}
                          onChange={e => { const f = e.target.files?.[0]; if (f) onUploadProtectedFile(f); e.target.value = '' }}
                        />
                      </label>
                    </div>
                  </div>
                </>
              )}

              {/* Botão de salvar os metadados — desabilitado se título vazio ou salvamento em andamento */}
              <div className="flex items-center gap-3 sm:col-span-2">
                <button
                  type="button"
                  disabled={savingMeta || !editForm.title.trim()}
                  onClick={onSaveMeta}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-5 py-2 text-sm font-bold text-white shadow transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingMeta
                    ? <><Loader2 size={14} className="animate-spin" />Salvando...</>
                    : <><Save size={14} />Salvar metadados</>
                  }
                </button>
                {/* Feedback de sucesso após salvar — aparece por breve instante */}
                {metaSuccess === file.name && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-[#34D399]">
                    <CheckCircle size={13} />Salvo!
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
