'use client'

// Hooks React: estado do componente e referência ao input de arquivo
import { useState, useRef } from 'react'
// AnimatePresence permite animar o formulário na entrada e saída do DOM
import { motion, AnimatePresence } from 'framer-motion'
// Ícones utilizados no formulário, lista e ações
import {
  Plus, Briefcase, Pencil, Trash2, Loader2,
  Save, X, CheckCircle, Tag, TrendingUp,
  ImagePlus, UploadCloud, Gift, DollarSign,
} from 'lucide-react'
// Layout padrão do painel administrativo
import AdminShell from '@/components/layout/AdminShell'
// Dialog de confirmação genérico para ações destrutivas
import ConfirmDialog from '@/components/admin/ConfirmDialog'
// Componente de mockup visual gerado por código (quando não há imagem)
import ProjectMockup from '@/components/cards/ProjectMockup'
// Cliente Supabase para operações de CRUD no banco e storage de imagens
import { createClient } from '@/lib/supabase'
// Hook que gerencia estado do formulário de criação/edição (showForm, editingId, form, saving, etc.)
import { useCrudModal } from '@/hooks/useCrudModal'
// Hook que gerencia estado de confirmação antes de excluir (confirmId, deleting)
import { useConfirmDelete } from '@/hooks/useConfirmDelete'
// Utilitário para formatar valores em Real Brasileiro
import { formatCurrencyBRL } from '@/lib/finance'
// Configurações visuais das categorias de projeto (ícone, cor, bg)
import { CATEGORY_CFG } from '@/lib/categories'
import type { User as SupabaseUser } from '@supabase/supabase-js'

// Nome do bucket no Supabase Storage onde as imagens dos projetos são armazenadas
const IMG_BUCKET = 'project-images'

/* ── Tipos de dados ── */

/* Estrutura de um projeto interno da LOBBY (vitrine ou pago) */
interface Project {
  id:          string
  title:       string
  description: string
  category:    string
  slug:        string             // Identificador único na URL (/projetos/slug)
  impact?:     string | null      // Frase de impacto opcional (ex: "+35% eficiência")
  tags?:       string[]           // Tags para categorização extra
  mockup_type?: string            // Tipo de mockup visual quando não há imagem
  image_url?:  string | null      // URL da imagem personalizada do projeto
  is_paid?:    boolean            // true = projeto pago com preço visível no site
  price?:      number | null      // Preço em reais (apenas para projetos pagos)
  created_at:  string
}

/* Props recebidas do Server Component */
interface Props {
  user:            SupabaseUser
  profile:         { full_name?: string } | null
  isLeader:        boolean          // Apenas líderes podem definir tipo e preço
  initialProjects: Project[]        // Lista inicial carregada pelo servidor
}

/* ── Constantes de configuração ── */

// Categorias de projeto disponíveis no select
const CATEGORIES = ['Software', 'Automação', 'Dados', 'Cibersegurança'] as const
// Tipos de mockup visual disponíveis quando não há imagem personalizada
const MOCKUP_TYPES = ['default', 'finance', 'automation', 'portal'] as const

// Alias para as configurações visuais por categoria
const CAT_CFG = CATEGORY_CFG

/* Gera um slug URL-friendly a partir do título do projeto.
   Remove acentos, caracteres especiais e substitui espaços por hífen. */
function generateSlug(title: string) {
  return title.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim().replace(/\s+/g, '-')
}

/* Estado inicial do formulário de projeto — usado ao abrir o form de criação */
const EMPTY_FORM = {
  title: '', description: '', category: 'Software',
  slug: '', impact: '', tags: '', mockup_type: 'default', image_url: '',
  is_paid: false, price: '',
}

/* ── Componente principal ── */
export default function ProjetosAdminClient({ user, profile, isLeader, initialProjects }: Props) {
  // Lista de projetos gerenciada localmente com atualizações otimistas
  const [projects, setProjects] = useState<Project[]>(initialProjects)

  /* Hook com estado do formulário modal: visibilidade, ID em edição, campos, loading e feedback */
  const {
    showForm, setShowForm, editingId, setEditingId, form, setForm,
    saving, setSaving, error, setError, saved, setSaved,
  } = useCrudModal(EMPTY_FORM)

  /* Hook com estado do diálogo de confirmação de exclusão */
  const {
    confirmId: confirmDel, setConfirmId: setConfirmDel, deleting, setDeleting,
  } = useConfirmDelete()

  /* ── Estado do upload de imagem ── */
  // Arquivo de imagem selecionado pelo usuário (antes do upload)
  const [imageFile,    setImageFile]    = useState<File | null>(null)
  // URL temporária de preview (objeto URL local, descartado após o upload)
  const [imagePreview, setImagePreview] = useState<string>('')
  // Indica que o upload para o Supabase Storage está em andamento (só o
  // setter é usado — nenhuma UI consome o valor atualmente)
  const [, setUploadingImg] = useState(false)
  // Referência ao input[type=file] oculto — acionado programaticamente pelo botão de upload
  const imgInputRef = useRef<HTMLInputElement>(null)

  /* ── Funções auxiliares de imagem ── */

  /* Captura o arquivo selecionado e cria um preview local via object URL */
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  /* Remove a imagem selecionada/existente e reseta o input de arquivo */
  const clearImage = () => {
    setImageFile(null)
    setImagePreview('')
    setForm(f => ({ ...f, image_url: '' }))
    if (imgInputRef.current) imgInputRef.current.value = ''
  }

  /* Faz upload da imagem para o Supabase Storage e retorna a URL pública.
     Se não houver arquivo novo, retorna a URL atual do formulário (edição sem troca de imagem). */
  const uploadImage = async (slug: string): Promise<string | null> => {
    if (!imageFile) return form.image_url || null
    setUploadingImg(true)
    try {
      const ext  = imageFile.name.split('.').pop() ?? 'jpg'
      // Nome único: slug + timestamp evita colisões e força cache-bust
      const path = `${slug}-${Date.now()}.${ext}`
      const supabase = createClient()
      const { error: upErr } = await supabase.storage
        .from(IMG_BUCKET)
        .upload(path, imageFile, { upsert: true, cacheControl: '3600' })
      if (upErr) return null
      return supabase.storage.from(IMG_BUCKET).getPublicUrl(path).data.publicUrl
    } finally {
      setUploadingImg(false)
    }
  }

  /* ── Abrir formulário de criação ── */
  const openAdd = () => {
    setForm(EMPTY_FORM)
    setImageFile(null)
    setImagePreview('')
    setEditingId(null)
    setShowForm(true)
    setError('')
  }

  /* ── Abrir formulário de edição pré-preenchido com dados do projeto ── */
  const openEdit = (p: Project) => {
    setForm({
      title:       p.title,
      description: p.description,
      category:    p.category,
      slug:        p.slug,
      impact:      p.impact ?? '',
      tags:        (p.tags ?? []).join(', '),
      mockup_type: p.mockup_type ?? 'default',
      image_url:   p.image_url ?? '',
      is_paid:     p.is_paid ?? false,
      // Converte o preço de número para string com vírgula (padrão BR)
      price:       p.price != null ? String(p.price).replace('.', ',') : '',
    })
    setImageFile(null)
    setImagePreview(p.image_url ?? '')
    setEditingId(p.id)
    setShowForm(true)
    setError('')
  }

  /* ── Salvar projeto: cria novo ou atualiza existente ── */
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    // Validação dos campos obrigatórios
    if (!form.title || !form.description || !form.slug) {
      setError('Título, descrição e slug são obrigatórios.')
      return
    }
    // Projetos pagos precisam obrigatoriamente de um preço
    if (form.is_paid && !form.price.trim()) {
      setError('Informe o preço do projeto pago.')
      return
    }

    setSaving(true)
    setError('')

    try {
      const supabase = createClient()

      // Faz upload da imagem nova (se houver) antes de montar o payload
      const finalImageUrl = await uploadImage(form.slug.trim())

      const payload = {
        title:       form.title.trim(),
        description: form.description.trim(),
        category:    form.category,
        slug:        form.slug.trim(),
        impact:      form.impact.trim() || null,
        // Converte string de tags separadas por vírgula para array limpo
        tags:        form.tags.split(',').map(t => t.trim()).filter(Boolean),
        mockup_type: form.mockup_type,
        image_url:   finalImageUrl,
        is_paid:     form.is_paid,
        // Converte preço de string BR para número (ou null se gratuito/portfólio)
        price:       form.is_paid && form.price.trim() ? Number(form.price.replace(',', '.')) : null,
      }

      if (editingId) {
        // Modo edição: atualiza o registro existente
        const { error: err } = await supabase
          .from('lobby_projects').update(payload).eq('id', editingId)
        if (err) throw err
        // Atualização otimista: substitui o projeto na lista local
        setProjects(prev => prev.map(p => p.id === editingId ? { ...p, ...payload } : p))
      } else {
        // Modo criação: insere novo registro e recupera o objeto completo
        const { data, error: err } = await supabase
          .from('lobby_projects').insert(payload).select().single()
        if (err || !data) throw err
        // Adiciona ao início da lista para aparecer no topo
        setProjects(prev => [data as Project, ...prev])
      }

      setShowForm(false)
      setEditingId(null)
      setSaved(true)
      // Remove o toast de sucesso após 3 segundos
      setTimeout(() => setSaved(false), 3000)
    } catch (err: unknown) {
      // Mensagens de erro amigáveis mapeando erros comuns do Supabase
      const msg = err instanceof Error ? err.message : ''
      setError(
        msg.includes('slug')  ? 'Slug já existe. Use outro.' :
        msg.includes('preço') || msg.includes('pago') ? 'Somente Técnico Líder pode alterar preço/tipo do projeto.' :
        'Erro ao salvar. Tente novamente.'
      )
    } finally {
      setSaving(false)
    }
  }

  /* ── Excluir projeto permanentemente ── */
  const handleDelete = async (id: string) => {
    setDeleting(id)
    try {
      const supabase = createClient()
      await supabase.from('lobby_projects').delete().eq('id', id)
      // Remove o projeto da lista local após exclusão bem-sucedida
      setProjects(prev => prev.filter(p => p.id !== id))
    } finally {
      setDeleting(null)
      setConfirmDel(null)
    }
  }

  return (
    <>
    <AdminShell user={user} profile={profile}>
      <div className="space-y-6">

        {/* Cabeçalho da página com título e botão de adicionar projeto */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Projetos
            </h1>
            <p className="mt-1 text-sm text-white/40">
              Gerencie os projetos exibidos no site da LOBBY.
            </p>
          </div>
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-5 py-2.5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(0,91,255,0.28)] transition-all hover:-translate-y-0.5"
          >
            <Plus size={16} />
            Adicionar projeto
          </button>
        </div>

        {/* Toast de sucesso — exibido por 3 segundos após salvar */}
        {saved && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 rounded-2xl bg-[#10B981]/15 px-4 py-3 text-sm font-semibold text-[#34D399]">
            <CheckCircle size={16} />Projeto salvo com sucesso!
          </motion.div>
        )}

        {/* Cards de estatísticas: total geral + contagem por categoria */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([
            { label: 'Total', value: projects.length, color: '#60A5FA' },
            // Um card por categoria com a cor definida em CATEGORY_CFG
            ...CATEGORIES.map(cat => ({
              label: cat,
              value: projects.filter(p => p.category === cat).length,
              color: CAT_CFG[cat].color,
            })),
          ] as { label: string; value: number; color: string }[]).map(({ label, value, color }) => (
            <div key={label} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
              <p className="text-2xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif', color }}>{value}</p>
              <p className="text-xs text-white/40">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Formulário de Adicionar / Editar projeto ── */}
        {/* AnimatePresence garante animação de saída quando showForm vira false */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="overflow-hidden rounded-2xl border border-[#005BFF]/25 bg-[#0D1428] p-6"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  {/* Título muda conforme o modo (criação ou edição) */}
                  {editingId ? 'Editar projeto' : 'Novo projeto'}
                </h2>
                <button type="button" onClick={() => setShowForm(false)} className="text-white/40 hover:text-white transition-colors">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2">
                {/* Campo: Título — ao digitar, gera o slug automaticamente se ainda vazio */}
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold text-white/60">Título *</label>
                  <input
                    type="text" placeholder="Ex: Dashboard Financeiro Inteligente"
                    value={form.title}
                    onChange={e => {
                      const t = e.target.value
                      // Gera slug apenas se o usuário ainda não editou o campo de slug manualmente
                      setForm(f => ({ ...f, title: t, slug: f.slug || generateSlug(t) }))
                    }}
                    className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50"
                    required
                  />
                </div>

                {/* Campo: Descrição curta do projeto */}
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold text-white/60">Descrição *</label>
                  <textarea
                    placeholder="Descreva o projeto..."
                    rows={3}
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50"
                    required
                  />
                </div>

                {/* Campo: Categoria — define o visual e o ícone do projeto */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-white/60">Categoria *</label>
                  <select
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="h-11 w-full rounded-xl border border-white/[0.08] bg-[#0D1428] px-3 text-sm text-white outline-none focus:border-[#005BFF]/50"
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* Campo: Slug — identificador único na URL, sanitizado para lowercase e hífens */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-white/60">Slug * <span className="text-white/30 font-normal">(URL única)</span></label>
                  <input
                    type="text" placeholder="ex: dashboard-financeiro"
                    value={form.slug}
                    onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                    className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 font-mono text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50"
                    required
                  />
                </div>

                {/* Campo: Frase de impacto opcional exibida no card do projeto */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-white/60">Impacto <span className="text-white/30 font-normal">(opcional)</span></label>
                  <input
                    type="text" placeholder="Ex: +35% na eficiência"
                    value={form.impact}
                    onChange={e => setForm(f => ({ ...f, impact: e.target.value }))}
                    className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50"
                  />
                </div>

                {/* Campo: Tags separadas por vírgula para filtros e busca */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-white/60">Tags <span className="text-white/30 font-normal">(separadas por vírgula)</span></label>
                  <input
                    type="text" placeholder="Ex: BI, Relatórios, Dashboard"
                    value={form.tags}
                    onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                    className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50"
                  />
                </div>

                {/* Seletor de tipo de projeto — somente Técnico Líder pode ver e alterar */}
                {isLeader && (
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-xs font-semibold text-white/60">Tipo de projeto</label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Tipo de projeto">
                      {/* Opção Portfólio: exibido como vitrine sem preço */}
                      <button
                        type="button"
                        role="radio"
                        aria-checked={!form.is_paid}
                        onClick={() => setForm(f => ({ ...f, is_paid: false }))}
                        className={`rounded-xl border p-3 text-left transition-all ${
                          !form.is_paid ? 'border-[#10B981]/50 bg-[#10B981]/10' : 'border-white/[0.08] bg-white/[0.03] hover:border-white/20'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 text-xs font-bold text-white"><Gift size={13} className="text-[#34D399]" aria-hidden="true" />Portfólio</span>
                        <span className="mt-1 block text-[11px] text-white/40">Case exibido só como vitrine, sem preço.</span>
                      </button>
                      {/* Opção Projeto pago: exibe preço e botão de compra no site público */}
                      <button
                        type="button"
                        role="radio"
                        aria-checked={form.is_paid}
                        onClick={() => setForm(f => ({ ...f, is_paid: true }))}
                        className={`rounded-xl border p-3 text-left transition-all ${
                          form.is_paid ? 'border-[#F59E0B]/50 bg-[#F59E0B]/10' : 'border-white/[0.08] bg-white/[0.03] hover:border-white/20'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 text-xs font-bold text-white"><DollarSign size={13} className="text-[#F59E0B]" aria-hidden="true" />Projeto pago</span>
                        <span className="mt-1 block text-[11px] text-white/40">Mostra preço + botão de compra no site público.</span>
                      </button>
                    </div>
                    {/* Campo de preço — exibido condicionalmente apenas para projetos pagos */}
                    {form.is_paid && (
                      <div className="mt-3">
                        <label className="mb-1.5 block text-xs font-semibold text-white/60" htmlFor="project-price">
                          Preço (R$) <span className="text-[#FBBF24]">*</span>
                        </label>
                        <input
                          id="project-price"
                          type="text"
                          inputMode="decimal"
                          placeholder="4.990,00"
                          value={form.price}
                          // Permite apenas números, vírgula e ponto — rejeita outros caracteres
                          onChange={e => setForm(f => ({ ...f, price: e.target.value.replace(/[^0-9,.]/g, '') }))}
                          className="h-11 w-full max-w-xs rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#F59E0B]/50"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* ── Área de upload de imagem ── */}
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold text-white/60">
                    Imagem do projeto <span className="text-white/30 font-normal">(opcional — substitui o mockup visual)</span>
                  </label>
                  {/* Input oculto: acionado pelo botão de upload via ref */}
                  <input
                    ref={imgInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={handleImageSelect}
                  />
                  {imagePreview ? (
                    /* Preview da imagem selecionada com botões para trocar ou remover */
                    <div className="relative overflow-hidden rounded-2xl border border-white/[0.08]">
                      <img
                        src={imagePreview}
                        alt="Preview do projeto"
                        className="h-48 w-full object-cover"
                      />
                      {/* Overlay com botão de troca (visível apenas no hover) */}
                      <div className="group absolute inset-0 flex items-center justify-center gap-3 bg-black/0 transition-colors hover:bg-black/40">
                        <button
                          type="button"
                          onClick={() => imgInputRef.current?.click()}
                          className="hidden rounded-xl bg-white/90 px-3 py-2 text-xs font-bold text-[#0B1020] transition-all group-hover:flex"
                        >
                          <UploadCloud size={13} className="mr-1.5" />Trocar imagem
                        </button>
                      </div>
                      {/* Botões flutuantes no canto superior direito */}
                      <div className="absolute right-2 top-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => imgInputRef.current?.click()}
                          className="rounded-lg bg-black/60 p-1.5 text-white backdrop-blur hover:bg-black/80 transition-colors"
                          title="Trocar imagem"
                        >
                          <UploadCloud size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={clearImage}
                          className="rounded-lg bg-red-500/80 p-1.5 text-white backdrop-blur hover:bg-red-600 transition-colors"
                          title="Remover imagem"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Zona de upload vazia — clique abre o seletor de arquivo */
                    <button
                      type="button"
                      onClick={() => imgInputRef.current?.click()}
                      className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-white/[0.12] bg-white/[0.03] py-8 transition-all hover:border-[#005BFF]/40 hover:bg-[#005BFF]/[0.05]"
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl"
                        style={{ background: 'rgba(96,165,250,0.12)' }}>
                        <ImagePlus size={22} style={{ color: '#60A5FA' }} />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-white/60">Clique para selecionar uma imagem</p>
                        <p className="mt-0.5 text-xs text-white/30">JPG, PNG, WebP — máx 5 MB</p>
                      </div>
                    </button>
                  )}
                </div>

                {/* Seletor de tipo de mockup visual (usado apenas quando não há imagem) */}
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold text-white/60">Tipo de mockup visual <span className="text-white/30 font-normal">(usado quando não há imagem)</span></label>
                  <div className="flex flex-wrap gap-2">
                    {MOCKUP_TYPES.map(t => (
                      <button key={t} type="button" aria-pressed={form.mockup_type === t}
                        onClick={() => setForm(f => ({ ...f, mockup_type: t }))}
                        className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                          form.mockup_type === t
                            ? 'bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] text-white shadow-sm'
                            : 'border border-white/[0.08] bg-white/[0.04] text-white/50 hover:text-white/80'
                        }`}
                      >
                        {/* Rótulos em português para os tipos de mockup */}
                        {t === 'default' ? 'Genérico' : t === 'finance' ? 'Financeiro' : t === 'automation' ? 'Automação' : 'Portal'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mensagem de erro de validação ou do servidor */}
                {error && (
                  <p role="alert" className="sm:col-span-2 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400">{error}</p>
                )}

                {/* Botões de ação do formulário: salvar e cancelar */}
                <div className="flex gap-3 sm:col-span-2">
                  <button type="submit" disabled={saving}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-5 py-2.5 text-sm font-bold text-white shadow transition-all hover:-translate-y-0.5 disabled:opacity-60"
                  >
                    {/* Exibe spinner durante o salvamento; rótulo muda conforme modo */}
                    {saving ? <><Loader2 size={14} className="animate-spin" />Salvando...</> : <><Save size={14} />{editingId ? 'Atualizar' : 'Criar projeto'}</>}
                  </button>
                  <button type="button" onClick={() => setShowForm(false)}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-white/50 hover:text-white transition-colors">
                    Cancelar
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Lista de projetos existentes ── */}
        {projects.length === 0 ? (
          /* Estado vazio — sem projetos cadastrados */
          <div className="rounded-2xl border border-white/[0.06] p-12 text-center">
            <Briefcase size={32} className="mx-auto mb-3 text-white/20" />
            <p className="text-sm text-white/30">Nenhum projeto ainda. Clique em &quot;Adicionar projeto&quot;.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((p, i) => {
              // Configuração visual da categoria (cor, bg)
              const cfg = CAT_CFG[p.category] ?? CAT_CFG['Software']
              return (
                <motion.div key={p.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                  className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.03]"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    {/* Thumbnail: imagem real ou mockup visual gerado por código */}
                    <div className="relative h-20 w-full shrink-0 overflow-hidden sm:h-auto sm:w-28">
                      {p.image_url?.startsWith('http') ? (
                        <img src={p.image_url} alt={p.title} className="h-full w-full object-cover" />
                      ) : (
                        <ProjectMockup slug={p.slug} category={p.category} />
                      )}
                    </div>

                    {/* Informações do projeto: título, categoria, preço, slug, impacto, tags */}
                    <div className="flex flex-1 items-start gap-3 p-4 pr-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{p.title}</p>
                          {/* Badge de categoria */}
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: cfg.bg, color: cfg.color }}>{p.category}</span>
                          {/* Badge de projeto pago com preço formatado */}
                          {p.is_paid && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#F59E0B]/12 px-2 py-0.5 text-[10px] font-bold text-[#F59E0B]">
                              <DollarSign size={9} aria-hidden="true" />
                              {p.price != null ? formatCurrencyBRL(p.price) : 'Pago'}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-white/40">{p.description}</p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {/* Slug em monospace indicando a rota pública */}
                          <span className="font-mono text-[10px] text-white/25">/projetos/{p.slug}</span>
                          {p.impact && <span className="flex items-center gap-1 text-[10px] text-[#34D399]"><TrendingUp size={9} />{p.impact}</span>}
                          {p.tags && p.tags.length > 0 && (
                            <span className="flex items-center gap-1 text-[10px] text-white/30"><Tag size={9} />{p.tags.join(', ')}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Ações do card: editar e excluir */}
                    <div className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => openEdit(p)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#A78BFA]/10 px-3 py-1.5 text-xs font-semibold text-[#A78BFA] hover:bg-[#A78BFA]/20 transition-all">
                        <Pencil size={12} />Editar
                      </button>
                      {/* Botão excluir: abre dialog de confirmação antes de deletar */}
                      <button type="button" onClick={() => setConfirmDel(p.id)} disabled={deleting === p.id}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50">
                        {deleting === p.id ? <><Loader2 size={11} className="animate-spin" />Excluindo...</> : <><Trash2 size={12} />Excluir</>}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </AdminShell>

    {/* Dialog de confirmação antes de excluir — exibe o título do projeto para evitar engano */}
    <ConfirmDialog
      open={!!confirmDel}
      onOpenChange={(open) => !open && setConfirmDel(null)}
      icon={Trash2}
      title="Excluir projeto?"
      description={
        <>O projeto <span className="font-semibold text-white/80">{projects.find(p => p.id === confirmDel)?.title}</span> será removido permanentemente.</>
      }
      confirmLabel={<><Trash2 size={15} />Sim, excluir</>}
      confirmingLabel="Excluindo..."
      busy={!!deleting}
      onConfirm={() => confirmDel && handleDelete(confirmDel)}
    />
    </>
  )
}
