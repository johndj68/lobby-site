'use client'

// Componente cliente da página de Arquivos do Admin.
// Responsável por upload, listagem, edição de metadados e exclusão de arquivos
// armazenados no Supabase Storage (bucket público "materials" e privado "materials-paid").

/* ── Imports ────────────────────────────────────────────────────── */
// Hooks do React: estado, referência a DOM, callbacks memoizados e efeitos colaterais
import { useState, useRef, useCallback } from 'react'
// Biblioteca de animações: motion para transições e AnimatePresence para mount/unmount
import { motion, AnimatePresence } from 'framer-motion'
// Sistema de notificações toast (mensagens flutuantes de feedback)
import { toast } from 'sonner'
// Ícones do Lucide utilizados ao longo do componente
import {
  Trash2, Copy, CheckCircle, CheckCircle2,
  Loader2, FolderOpen, Link2, AlertCircle, Database,
  Clock, Search, X, UploadCloud, Shield, Zap,
  Code2, FileText,
} from 'lucide-react'
// Layout administrativo compartilhado entre todas as páginas do admin
import AdminShell from '@/components/layout/AdminShell'
// Modal de confirmação genérico para ações destrutivas (ex: excluir arquivo)
import ConfirmDialog from '@/components/admin/ConfirmDialog'
// Card de arquivo com formulário de metadados inline; funções e tipos auxiliares
import FileCard, {
  formatSize, timeAgo, getFileType,
  type StorageFile, type ResourceMeta, type EditForm,
} from '@/components/admin/FileCard'
// Cliente do Supabase para operações de banco e storage no lado cliente
import { createClient } from '@/lib/supabase'
// Tipo do usuário autenticado do Supabase
import type { User as SupabaseUser } from '@supabase/supabase-js'

/* ── Constantes de configuração ─────────────────────────────────── */

// Bucket público onde ficam os materiais gratuitos
const BUCKET = 'materials'

// Tipos de arquivo aceitos no input de upload
const ACCEPTED = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip'

// Tamanho máximo por arquivo em megabytes
const MAX_MB = 50

// Bucket privado para e-books pagos — acesso liberado apenas para quem comprou
const PAID_BUCKET = 'materials-paid'

/* ── Funções utilitárias ─────────────────────────────────────────── */

/**
 * Gera um caminho seguro e único para o arquivo protegido (e-book pago).
 * Remove acentos, caracteres especiais e adiciona timestamp para evitar colisões.
 * @param fileName   Nome do arquivo público no bucket (usado como prefixo)
 * @param originalName Nome original do arquivo enviado pelo técnico
 * @returns Caminho sanitizado com timestamp, ex: "guia-automacao-1718000000000-arquivo.pdf"
 */
function buildProtectedFilePath(fileName: string, originalName: string): string {
  const safeName = originalName
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .toLowerCase()
  return `${fileName.replace(/\.[^.]+$/, '')}-${Date.now()}-${safeName}`
}

/* ── Tipos e interfaces ─────────────────────────────────────────── */

// Props recebidas pelo componente via Server Component pai
interface Props {
  user:            SupabaseUser        // Usuário autenticado do Supabase
  profile:         { full_name?: string } | null  // Perfil do técnico
  isLeader:        boolean             // Se é técnico líder (tem permissões extras de e-book pago)
  initialFiles:    StorageFile[]       // Lista inicial de arquivos do bucket carregada no servidor
  initialMetadata: ResourceMeta[]      // Metadados dos arquivos (nome, categoria, preço, etc.)
}

// Opções de filtro por tipo de arquivo na listagem
const FILE_FILTERS = ['Todos', 'PDF', 'Documentos', 'ZIP', 'Outros']

/* ── Guia de publicação ─────────────────────────────────────────── */

// Passos numerados do guia "Como publicar um material" exibido no final da página
const GUIDE_STEPS = [
  { n: 1, title: 'Faça upload',        desc: 'Envie seu arquivo para a biblioteca acima.'   },
  { n: 2, title: 'Copie a URL pública', desc: 'Após o upload, copie a URL gerada.'           },
  { n: 3, title: 'Cole em lib/data.ts', desc: 'Cole a URL no campo fileUrl do recurso.'      },
  { n: 4, title: 'Usuário pode baixar', desc: 'O material ficará na página de Recursos.'     },
]

// Exemplo de código TypeScript para inserir o arquivo em lib/data.ts —
// exibido no card do guia e pode ser copiado com um clique
const CODE_EXAMPLE = `{
  title: "Guia de Automação",
  category: "Automação",
  fileUrl: "URL_PUBLICA_DO_ARQUIVO",
  format: "PDF",
  readTime: "8 min",
  level: "Iniciante",
}`

/* ── Component ──────────────────────────────────────────────────── */
export default function ArquivosClient({ user, profile, isLeader, initialFiles, initialMetadata }: Props) {

  /* ── Estado principal da listagem ───────────────────────────── */

  // Lista de arquivos no bucket (atualizada após uploads/exclusões)
  const [files,          setFiles]          = useState<StorageFile[]>(initialFiles)

  /* ── Estados de controle do upload ─────────────────────────── */

  // Indica se um upload está em andamento (desabilita a dropzone)
  const [uploading,      setUploading]      = useState(false)
  // Percentual de progresso do upload (0–100), atualizado por arquivo
  const [progress,       setProgress]       = useState(0)
  // Mensagem de erro caso algum arquivo falhe no upload
  const [uploadError,    setUploadError]    = useState('')
  // Flag de sucesso exibida por 4 segundos após upload concluído
  const [uploadSuccess,  setUploadSuccess]  = useState(false)
  // Indica se o usuário está arrastando um arquivo sobre a dropzone
  const [isDragging,     setIsDragging]     = useState(false)

  /* ── Estados de UI diversos ─────────────────────────────────── */

  // Nome do arquivo cuja URL foi copiada — exibe feedback visual por 2 s
  const [copied,         setCopied]         = useState<string | null>(null)

  // Nome do arquivo sendo excluído (exibe loading no card correto)
  const [deleting,       setDeleting]       = useState<string | null>(null)

  // Texto digitado no campo de busca da biblioteca
  const [fileSearch,     setFileSearch]     = useState('')

  // Tipo de arquivo selecionado nos chips de filtro (padrão: 'Todos')
  const [fileFilter,     setFileFilter]     = useState('Todos')

  // Flag de cópia do exemplo de código no guia de publicação
  const [codeCopied,     setCodeCopied]     = useState(false)

  /* ── Referência ao input de arquivo ─────────────────────────── */

  // Referência ao input[type=file] oculto — acionado programaticamente
  // ao clicar na dropzone ou no botão "Selecionar arquivos"
  const inputRef = useRef<HTMLInputElement>(null)

  /* ── Mapa de metadados ──────────────────────────────────────── */

  // Mapa de metadados indexado por file_name para acesso O(1).
  // Ex: metaMap['guia-automacao.pdf'] = { title: 'Guia', category: 'Software', ... }
  // Inicializado a partir de initialMetadata usando Object.fromEntries.
  const [metaMap, setMetaMap] = useState<Record<string, ResourceMeta>>(
    () => Object.fromEntries(initialMetadata.map(m => [m.file_name, m]))
  )

  /* ── Estado do formulário de metadados inline ───────────────── */

  // Nome do arquivo cujo formulário de metadados está aberto (null = nenhum aberto)
  const [editingFile, setEditingFile] = useState<string | null>(null)

  // Valores atuais do formulário de edição de metadados —
  // pré-populados com os dados existentes ao abrir (ver openEdit)
  const [editForm,    setEditForm]    = useState<EditForm>({
    title: '', category: 'Software', description: '', format: 'PDF', read_time: '', level: 'Iniciante',
    is_paid: false, price: '', credit_price: '', sale_description: '', sale_status: 'active',
    delivery_type: 'automatic', payment_product_id: '',
  })

  // Indica se o salvamento de metadados está em andamento
  const [savingMeta,   setSavingMeta]   = useState(false)

  // file_name do último arquivo com metadados salvos com sucesso (para feedback visual)
  const [metaSuccess,  setMetaSuccess]  = useState<string | null>(null)

  /* ── Estado de confirmação e exclusão ───────────────────────── */

  // Nome do arquivo aguardando confirmação de exclusão no modal ConfirmDialog
  const [confirmFile,  setConfirmFile]  = useState<string | null>(null)

  /* ── Estado do upload de arquivo protegido ──────────────────── */

  // Nome do arquivo cujo arquivo protegido está sendo enviado ao bucket pago (materials-paid)
  const [uploadingProtected, setUploadingProtected] = useState<string | null>(null)

  /* ── Ref para remoção adiada do bucket público ──────────────── */

  // Conjunto de file_names cujo arquivo público já foi copiado para materials-paid
  // mas ainda não foi removido do bucket público.
  // A remoção só acontece quando saveMetadata é confirmado — se o técnico cancelar
  // a edição, o arquivo público permanece intacto (evita material gratuito quebrado).
  const pendingPublicRemovalRef = useRef<Set<string>>(new Set())

  /* ── Abrir formulário de metadados ─────────────────────────── */

  // Abre (ou fecha) o formulário de metadados de um arquivo.
  // Se já existem metadados salvos, pré-popula o formulário com os valores atuais.
  // Preço é convertido de número para string BR (vírgula) para exibição no input.
  const openEdit = useCallback((fileName: string) => {
    const existing = metaMap[fileName]
    setEditForm({
      title:       existing?.title       ?? '',
      category:    existing?.category    ?? 'Software',
      description: existing?.description ?? '',
      format:      existing?.format      ?? 'PDF',
      read_time:   existing?.read_time   ?? '',
      level:       existing?.level       ?? 'Iniciante',
      is_paid:             existing?.is_paid ?? false,
      price:               existing?.price != null ? String(existing.price).replace('.', ',') : '',
      credit_price:        existing?.credit_price != null ? String(existing.credit_price) : '',
      sale_description:    existing?.sale_description ?? '',
      sale_status:         existing?.sale_status ?? 'active',
      delivery_type:       existing?.delivery_type ?? 'automatic',
      payment_product_id:  existing?.payment_product_id ?? '',
    })
    // Toggle: clicando no mesmo arquivo fecha o formulário; em outro, abre o novo
    setEditingFile(prev => prev === fileName ? null : fileName)
  }, [metaMap])

  /* ── Salvar metadados ───────────────────────────────────────── */

  // Persiste os metadados do arquivo na tabela resource_metadata via upsert.
  // Valida campos obrigatórios e, para e-books pagos, exige preço e arquivo protegido.
  // Após salvar, remove a cópia pública do arquivo se o item foi marcado como pago.
  const saveMetadata = async (fileName: string) => {
    // Validação básica: título e categoria são obrigatórios
    if (!editForm.title.trim() || !editForm.category) return

    // Item pago exige preço e arquivo protegido já enviado antes de salvar —
    // sem isso o comprador nunca teria o que baixar após pagar.
    if (editForm.is_paid) {
      if (!editForm.price.trim()) {
        toast.error('Informe o preço do e-book pago.')
        return
      }
      if (!metaMap[fileName]?.protected_file_path) {
        toast.error('Envie o arquivo protegido do e-book antes de salvar.')
        return
      }
    }
    setSavingMeta(true)
    try {
      const supabase = createClient()
      // Converte preço de string (com vírgula BR) para número antes de salvar no banco
      const { price, credit_price, ...rest } = editForm
      const row: ResourceMeta = {
        file_name: fileName,
        ...rest,
        price:        editForm.is_paid && price.trim()        ? Number(price.replace(',', '.')) : null,
        credit_price: editForm.is_paid && credit_price.trim() ? Number(credit_price)             : null,
        // Preserva o caminho protegido já registrado (não sobrescreve com null)
        protected_file_path: metaMap[fileName]?.protected_file_path ?? null,
      }
      const { error } = await supabase
        .from('resource_metadata')
        .upsert(row, { onConflict: 'file_name' })
      if (error) throw error

      // Só agora, com o item confirmadamente salvo como pago, remove a cópia pública.
      // Cancelar a edição antes disso preserva o arquivo público intacto.
      if (editForm.is_paid && pendingPublicRemovalRef.current.has(fileName)) {
        await supabase.storage.from(BUCKET).remove([fileName]).catch(() => {})
        pendingPublicRemovalRef.current.delete(fileName)
      }

      // Atualiza o mapa local para refletir o que foi salvo
      setMetaMap(prev => ({ ...prev, [fileName]: row }))
      setEditingFile(null)
      setMetaSuccess(fileName)
      toast.success('Metadados salvos com sucesso.')
      // Remove o feedback de sucesso após 2,5 segundos
      setTimeout(() => setMetaSuccess(null), 2500)
    } catch (err) {
      // Mensagem específica para erro de Row Level Security (apenas líder pode salvar pago)
      toast.error(
        err instanceof Error && err.message.includes('row-level security')
          ? 'Somente o Técnico Líder pode salvar alterações em e-books pagos.'
          : 'Não foi possível salvar os metadados. Tente novamente.'
      )
    } finally {
      setSavingMeta(false)
    }
  }

  /* ── Upload de arquivo protegido (e-book pago) ─────────────────
     Bucket privado (materials-paid) — RLS só deixa líder inserir e só
     libera leitura/URL assinada pra quem tem ebook_purchases.status='paid'. */

  // Envia um arquivo diretamente ao bucket privado materials-paid.
  // Chamado quando o técnico seleciona manualmente o arquivo protegido de um e-book pago.
  // O caminho gerado é salvo no metaMap local (ainda não persistido no banco).
  const uploadProtectedFile = async (fileName: string, file: File) => {
    setUploadingProtected(fileName)
    try {
      const supabase = createClient()
      // Gera caminho único para evitar sobrescrever outro e-book acidentalmente
      const safePath = buildProtectedFilePath(fileName, file.name)
      const { error } = await supabase.storage
        .from(PAID_BUCKET)
        .upload(safePath, file, { upsert: true, cacheControl: '3600' })
      if (error) throw error
      // Registra o caminho protegido no mapa local (ainda não salvo no banco — aguarda saveMetadata)
      setMetaMap(prev => ({
        ...prev,
        [fileName]: { ...(prev[fileName] ?? { file_name: fileName, title: '', category: 'Software' }), protected_file_path: safePath },
      }))
      toast.success('Arquivo protegido enviado com sucesso.')
    } catch {
      toast.error('Não foi possível enviar o arquivo protegido.')
    } finally {
      setUploadingProtected(null)
    }
  }

  /* ── Reaproveitar arquivo público como arquivo protegido ────────
     Sem isso, o técnico via o arquivo que acabou de subir e tinha que
     escolher/enviar de novo o mesmo arquivo só pra virar "protegido" —
     confuso e redundante. Copia o que já está no bucket público pra
     materials-paid automaticamente; a remoção do público só é feita
     depois, quando a metadata for salva (ver saveMetadata). */

  // Quando o técnico marca um arquivo como "Pago", este handler copia automaticamente
  // o arquivo do bucket público para o bucket privado, evitando re-upload manual.
  // A remoção do arquivo público é adiada até saveMetadata ser confirmado.
  const handleChoosePaid = useCallback(async (fileName: string) => {
    // Se já tem caminho protegido registrado, não precisa copiar de novo
    if (metaMap[fileName]?.protected_file_path) return
    // Localiza o arquivo no bucket para garantir que existe
    const bucketFile = files.find(f => f.name === fileName && f.id)
    if (!bucketFile) return
    setUploadingProtected(fileName)
    try {
      const supabase = createClient()
      // Baixa o arquivo do bucket público para reenviar ao bucket privado
      const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(fileName)
      if (dlErr || !blob) throw dlErr ?? new Error('download falhou')
      const safePath = buildProtectedFilePath(fileName, fileName)
      const { error: upErr } = await supabase.storage.from(PAID_BUCKET).upload(safePath, blob, { upsert: true, cacheControl: '3600' })
      if (upErr) throw upErr
      // Agenda a remoção do arquivo público para quando saveMetadata for confirmado
      pendingPublicRemovalRef.current.add(fileName)
      // Registra o caminho protegido no mapa local
      setMetaMap(prev => ({
        ...prev,
        [fileName]: { ...(prev[fileName] ?? { file_name: fileName, title: '', category: 'Software' }), protected_file_path: safePath },
      }))
      toast.success('Arquivo já enviado foi reaproveitado como conteúdo protegido.')
    } catch {
      toast.error('Não foi possível reaproveitar o arquivo automaticamente. Envie manualmente abaixo.')
    } finally {
      setUploadingProtected(null)
    }
  }, [files, metaMap])

  /* ── URL pública ─────────────────────────────────────────────── */

  // Retorna a URL pública de um arquivo no bucket materials (sem autenticação)
  const getPublicUrl = (name: string) =>
    createClient().storage.from(BUCKET).getPublicUrl(name).data.publicUrl

  /* ── Upload principal ───────────────────────────────────────── */

  // Processa um ou mais arquivos enviados via dropzone ou seletor de arquivo.
  // Valida tamanho máximo, sanitiza o nome (remove acentos e espaços),
  // envia ao bucket e abre automaticamente o formulário de metadados.
  const handleUpload = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    setUploading(true)
    setUploadError('')
    setUploadSuccess(false)
    setProgress(0)

    const supabase = createClient()
    const errors: string[] = []         // Acumula erros por arquivo
    const uploadedNames: string[] = []  // Nomes sanitizados dos arquivos enviados com sucesso

    // Itera sobre cada arquivo selecionado — suporta múltiplos arquivos
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i]
      // Rejeita arquivos maiores que MAX_MB (50 MB)
      if (file.size > MAX_MB * 1024 * 1024) {
        errors.push(`${file.name}: arquivo muito grande (máx ${MAX_MB} MB).`)
        continue
      }
      // Reforça a mesma lista de extensões já anunciada no input (accept= é só uma
      // dica de UI do browser, não é validado — sem isso qualquer tipo de arquivo passa).
      const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
      if (!ACCEPTED.split(',').includes(ext)) {
        errors.push(`${file.name}: tipo de arquivo não permitido.`)
        continue
      }
      // Sanitiza o nome: remove acentos, substitui caracteres inválidos por hífen, lowercase
      const safeFileName = file.name
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '-')
        .toLowerCase()
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(safeFileName, file, { upsert: true, cacheControl: '3600' })
      if (error) errors.push(`${file.name}: ${error.message}`)
      else uploadedNames.push(safeFileName)
      // Atualiza barra de progresso após cada arquivo (porcentagem relativa ao total)
      setProgress(Math.round(((i + 1) / fileList.length) * 100))
    }

    // Recarrega a lista do bucket para refletir os novos arquivos
    const { data: updated } = await supabase.storage.from(BUCKET).list('', {
      limit: 100, sortBy: { column: 'created_at', order: 'desc' },
    })
    setFiles(updated ?? [])
    if (errors.length > 0) setUploadError(errors.join('\n'))
    else setUploadSuccess(true)
    setUploading(false)
    setProgress(0)
    // Limpa o input para permitir novo upload do mesmo arquivo
    if (inputRef.current) inputRef.current.value = ''
    // Remove o banner de sucesso após 4 segundos
    setTimeout(() => setUploadSuccess(false), 4000)

    // Abre o formulário de metadados automaticamente para o primeiro arquivo enviado —
    // evita que o arquivo fique "sem nome" até o técnico lembrar de clicar em "Nomear".
    if (uploadedNames.length > 0) openEdit(uploadedNames[0])
  }, [openEdit])

  /* ── Exclusão de arquivo ────────────────────────────────────── */

  // Remove o arquivo do bucket público (e do bucket pago, se existir)
  // e apaga os metadados associados na tabela resource_metadata.
  // É chamada após confirmação no modal ConfirmDialog.
  const handleDelete = async (name: string) => {
    setDeleting(name)
    const supabase = createClient()
    // Verifica se existe arquivo protegido associado para remover junto
    const protectedPath = metaMap[name]?.protected_file_path
    const { error: storageError } = await supabase.storage.from(BUCKET).remove([name])
    if (storageError) {
      toast.error('Não foi possível excluir o arquivo. Tente novamente.')
      setDeleting(null)
      return
    }
    // Remove também do bucket pago (se existir) — ignora erro pois o arquivo pode não existir lá
    if (protectedPath) await supabase.storage.from(PAID_BUCKET).remove([protectedPath]).catch(() => {})
    // Remove os metadados do banco de dados
    const { error: metaError } = await supabase.from('resource_metadata').delete().eq('file_name', name)
    if (metaError) {
      toast.error('Arquivo excluído, mas não foi possível remover os metadados. Atualize a página.')
      setDeleting(null)
      return
    }
    // Atualiza estado local removendo o arquivo e seus metadados
    setFiles(prev => prev.filter(f => f.name !== name))
    setMetaMap(prev => { const next = { ...prev }; delete next[name]; return next })
    toast.success('Arquivo excluído com sucesso.')
    setDeleting(null)
    setConfirmFile(null)
  }

  /* ── Cópia de URL ───────────────────────────────────────────── */

  // Copia a URL pública do arquivo para a área de transferência.
  // Exibe feedback visual de "copiado" por 2 segundos via estado `copied`.
  const handleCopy = async (name: string) => {
    await navigator.clipboard.writeText(getPublicUrl(name))
    setCopied(name)
    setTimeout(() => setCopied(null), 2000)
  }

  /* ── Drag-and-drop ──────────────────────────────────────────── */

  // Handler do evento drop: recebe os arquivos arrastados e inicia o upload.
  // Memorizado com useCallback pois é passado como prop para a dropzone.
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleUpload(e.dataTransfer.files)
  }, [handleUpload])

  /* ── Dados derivados ────────────────────────────────────────── */

  // Apenas arquivos com id são reais (entradas sem id são placeholders do Supabase)
  const bucketFiles = files.filter(f => f.id)

  // E-books pagos cuja cópia pública já foi removida (ver saveMetadata) somem
  // da listagem do bucket após reload. Reconstruímos a linha a partir da metadata
  // para que o líder não perca a visão/gestão do item pago.
  // Conjunto de nomes presentes no bucket para verificação rápida de existência
  const bucketNames = new Set(bucketFiles.map(f => f.name))

  // Arquivos sintéticos: e-books pagos que saíram do bucket público mas existem no privado.
  // São representados com um StorageFile artificial para que o FileCard possa renderizá-los.
  const syntheticFiles: StorageFile[] = Object.values(metaMap)
    .filter(m => m.is_paid && m.protected_file_path && !bucketNames.has(m.file_name))
    .map(m => ({ id: m.file_name, name: m.file_name, created_at: undefined, updated_at: undefined, metadata: null }))

  // Lista final combinando arquivos reais do bucket público e arquivos sintéticos (pagos)
  const validFiles   = [...bucketFiles, ...syntheticFiles]

  // Tamanho total em bytes ocupado no bucket público (usado no card de métricas)
  const totalSize    = bucketFiles.reduce((s, f) => s + (f.metadata?.size ?? 0), 0)

  // Arquivo mais recente para exibir "Último upload" no card de métricas
  const lastFile     = bucketFiles[0]

  // Aplica filtro de tipo e busca textual sobre a lista de arquivos válidos
  const filteredFiles = validFiles.filter(f => {
    const matchFilter = fileFilter === 'Todos' || getFileType(f.name) === fileFilter
    const matchSearch = !fileSearch || f.name.toLowerCase().includes(fileSearch.toLowerCase())
    return matchFilter && matchSearch
  })

  // Contagem de arquivos por tipo para os badges nos chips de filtro
  const filterCounts: Record<string, number> = { Todos: validFiles.length }
  FILE_FILTERS.slice(1).forEach(t => {
    filterCounts[t] = validFiles.filter(f => getFileType(f.name) === t).length
  })

  /* ── Render ─────────────────────────────────────────────────── */

  return (
    <>
    <AdminShell user={user} profile={profile}>
      <div className="space-y-7">

        {/* ── PAGE HEADER ──────────────────────────────────────── */}
        {/* Cabeçalho animado com ícone, título e descrição da página */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-start gap-4"
        >
          {/* Ícone da pasta com glow azul */}
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl shadow-[0_0_40px_rgba(0,91,255,0.18)]"
            style={{ background: 'rgba(96,165,250,0.12)' }}
          >
            <FolderOpen size={24} className="text-[#60A5FA]" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Biblioteca de arquivos
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-white/40">
              Gerencie materiais, PDFs e documentos disponíveis para download na plataforma.
            </p>
          </div>
        </motion.div>

        {/* ── STATS CARDS ──────────────────────────────────────── */}
        {/* Grid de 4 cards de métricas: total de arquivos, espaço usado,
            links públicos e data/hora do último upload */}
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {[
            { icon: FileText,  label: 'Total de arquivos', value: validFiles.length.toString(),                   color: '#60A5FA', bg: 'rgba(96,165,250,0.12)',  grad: '#3B82F6' },
            { icon: Database,  label: 'Espaço usado',      value: formatSize(totalSize),                          color: '#A78BFA', bg: 'rgba(167,139,250,0.12)', grad: '#8B5CF6' },
            { icon: Link2,     label: 'Links públicos',    value: validFiles.length.toString(),                   color: '#34D399', bg: 'rgba(52,211,153,0.12)',  grad: '#10B981' },
            { icon: Clock,     label: 'Último upload',     value: lastFile ? timeAgo(lastFile.updated_at ?? lastFile.created_at) : 'Nenhum', color: '#FBBF24', bg: 'rgba(251,191,36,0.12)', grad: '#F59E0B' },
          ].map(({ icon: Icon, label, value, color, bg, grad }, i) => (
            <motion.article
              key={label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.06 }}
              className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.25)] transition-all duration-300 hover:-translate-y-1 hover:border-[#005BFF]/35 hover:shadow-[0_12px_40px_rgba(0,91,255,0.15)]"
            >
              {/* Linha de cor no topo do card como identidade visual de cada métrica */}
              <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: `linear-gradient(to right, ${grad}, transparent)` }} aria-hidden="true" />
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: bg }}>
                <Icon size={19} style={{ color }} aria-hidden="true" />
              </div>
              <p className="truncate text-xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{value}</p>
              <p className="mt-0.5 text-xs text-white/40">{label}</p>
            </motion.article>
          ))}
        </div>

        {/* ── UPLOAD DROPZONE ──────────────────────────────────── */}
        {/* Área de drag-and-drop para envio de arquivos.
            Suporta clique para abrir seletor nativo e arrastar arquivos.
            Exibe três estados visuais: normal, dragging e uploading. */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          aria-label="Área de upload"
        >
          {/* Input de arquivo oculto — acionado programaticamente pelo clique na dropzone.
              sr-only mantém o elemento acessível para leitores de tela sem exibi-lo. */}
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED}
            aria-label="Selecionar arquivos para upload"
            className="sr-only"
            onChange={e => handleUpload(e.target.files)}
          />

          {/* Área clicável e receptora de drop — role="button" para semântica de interação */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => !uploading && inputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Área de upload — clique ou arraste arquivos"
            onKeyDown={e => e.key === 'Enter' && !uploading && inputRef.current?.click()}
            className={`relative cursor-pointer overflow-hidden rounded-[2rem] border-2 border-dashed p-10 text-center shadow-[0_24px_80px_rgba(0,0,0,0.28)] transition-all duration-300 ${
              uploading ? 'pointer-events-none' : ''
            } ${
              isDragging
                ? 'border-[#005BFF]/60 bg-[#005BFF]/10'
                : 'border-white/[0.14] bg-[#111827]/70 hover:border-[#7B2CFF]/50 hover:bg-[#111827]/90'
            }`}
          >
            {/* Gradiente de fundo decorativo — dois focos de luz (roxo e azul) */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: 'radial-gradient(circle at 50% 20%,rgba(123,44,255,0.12),transparent 40%),radial-gradient(circle at 50% 100%,rgba(0,91,255,0.08),transparent 42%)' }}
              aria-hidden="true"
            />

            <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center">
              {/* Ícone central da dropzone — muda para spinner animado durante o upload */}
              <div
                className={`flex h-20 w-20 items-center justify-center rounded-full border transition-all duration-300 ${
                  isDragging
                    ? 'border-[#005BFF]/60 bg-[#005BFF]/20 shadow-[0_0_50px_rgba(0,91,255,0.35)]'
                    : 'border-[#7B2CFF]/30 bg-[#005BFF]/10 shadow-[0_0_40px_rgba(0,91,255,0.20)]'
                }`}
              >
                {uploading
                  ? <Loader2 size={34} className="animate-spin text-[#60A5FA]" aria-hidden="true" />
                  : <UploadCloud size={34} className={isDragging ? 'text-[#60A5FA]' : 'text-[#60A5FA]/80'} aria-hidden="true" />
                }
              </div>

              {uploading ? (
                /* ── Estado de carregamento: barra de progresso animada ── */
                <div className="mt-6 w-full max-w-sm">
                  <p className="mb-1 text-sm font-semibold text-white/70">Enviando arquivos… {progress}%</p>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.08]">
                    {/* Barra de progresso: largura animada pelo framer-motion conforme `progress` */}
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-[#005BFF] to-[#7B2CFF]"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>
              ) : isDragging ? (
                /* ── Estado de drag ativo: instrução para soltar os arquivos ── */
                <div className="mt-6">
                  <p className="text-xl font-bold text-white">Solte os arquivos para enviar</p>
                  <p className="mt-1 text-sm text-[#60A5FA]">Largue aqui para iniciar o upload</p>
                </div>
              ) : (
                /* ── Estado normal: chamada para ação com botão e badges ── */
                <>
                  <h2 className="mt-6 text-xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                    Envie seus materiais para a biblioteca LOBBY
                  </h2>
                  <p className="mt-2 text-sm text-white/50">
                    Arraste arquivos aqui ou clique para selecionar.
                  </p>
                  <p className="mt-1 text-xs text-white/30">
                    PDF, Word, Excel, PowerPoint e ZIP — até {MAX_MB} MB por arquivo
                  </p>
                  {/* Botão que abre o seletor nativo — stopPropagation evita duplo clique na div pai */}
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); inputRef.current?.click() }}
                    className="mt-6 rounded-2xl border border-[#7B2CFF]/50 bg-[#7B2CFF]/10 px-6 py-3 text-sm font-bold text-white transition-all hover:bg-[#7B2CFF]/20 hover:border-[#7B2CFF]/70"
                  >
                    Selecionar arquivos
                  </button>
                  {/* Badges de benefícios do upload: segurança, URL automática e integração */}
                  <div className="mt-6 flex flex-wrap justify-center gap-4">
                    {[
                      { icon: Shield, text: 'Upload seguro' },
                      { icon: Link2,  text: 'URL pública automática' },
                      { icon: Zap,    text: 'Pronto para usar nos recursos' },
                    ].map(({ icon: Icon, text }) => (
                      <span key={text} className="flex items-center gap-1.5 text-xs text-white/35">
                        <Icon size={12} aria-hidden="true" />
                        {text}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Feedback de upload: erro ou banner de sucesso ── */}
          {/* AnimatePresence garante animação de entrada/saída para ambos os banners */}
          <AnimatePresence>
            {uploadError && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-3 flex items-start gap-3 rounded-2xl bg-red-500/10 px-4 py-3"
                role="alert"
              >
                <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-400" aria-hidden="true" />
                <div>
                  <p className="text-xs font-semibold text-red-400">Falha no upload</p>
                  {/* Exibe múltiplas mensagens de erro (uma por linha) */}
                  <p className="mt-0.5 text-xs leading-relaxed text-red-400/70 whitespace-pre-wrap">{uploadError}</p>
                </div>
              </motion.div>
            )}
            {uploadSuccess && !uploadError && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-3 flex items-center gap-3 rounded-2xl bg-[#10B981]/10 px-4 py-3"
                role="status"
              >
                <CheckCircle2 size={16} className="shrink-0 text-[#34D399]" aria-hidden="true" />
                <div>
                  <p className="text-xs font-semibold text-[#34D399]">Upload concluído</p>
                  <p className="mt-0.5 text-xs text-[#34D399]/60">URL pública gerada com sucesso.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>

        {/* ── FILE LIBRARY ─────────────────────────────────────── */}
        {/* Seção principal com lista de arquivos: busca, chips de filtro por tipo
            e renderização de um FileCard por arquivo na lista filtrada */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-5 shadow-[0_20px_70px_rgba(0,0,0,0.25)] sm:p-6"
          aria-label="Biblioteca de arquivos"
        >
          {/* Cabeçalho da biblioteca: título, contagem e campo de busca */}
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Biblioteca de arquivos
              </h2>
              {/* Exibe contagem total e nome do bucket para referência técnica */}
              <p className="mt-0.5 text-xs text-white/35">
                {validFiles.length} arquivo{validFiles.length !== 1 ? 's' : ''} no bucket{' '}
                <code className="font-mono text-white/50">{BUCKET}</code>
              </p>
            </div>

            {/* Campo de busca por nome de arquivo */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30" aria-hidden="true" />
                <input
                  type="text"
                  placeholder="Buscar arquivo..."
                  value={fileSearch}
                  onChange={e => setFileSearch(e.target.value)}
                  aria-label="Buscar arquivo"
                  className="h-9 w-full rounded-xl border border-white/[0.08] bg-[#0F172A] pl-9 pr-8 text-xs text-white placeholder:text-white/25 outline-none transition-all focus:border-[#005BFF]/50 focus:ring-2 focus:ring-[#005BFF]/10 sm:w-52"
                />
                {/* Botão X para limpar o campo de busca — aparece apenas quando há texto */}
                {fileSearch && (
                  <button
                    type="button"
                    onClick={() => setFileSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-white/30 hover:text-white transition-colors"
                    aria-label="Limpar busca"
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Chips de filtro por tipo de arquivo — cada chip mostra contagem de itens */}
          <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo">
            {FILE_FILTERS.map(f => {
              const isActive = fileFilter === f
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFileFilter(f)}
                  aria-pressed={isActive}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all duration-150 ${
                    isActive
                      ? 'bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] text-white shadow-[0_4px_12px_rgba(0,91,255,0.25)]'
                      : 'border border-white/[0.08] bg-white/[0.04] text-white/45 hover:border-[#005BFF]/35 hover:text-white/80'
                  }`}
                >
                  {f}
                  {/* Badge com contagem de arquivos neste tipo — estilo muda conforme ativo */}
                  <span className={`rounded-full px-1 text-[9px] font-bold ${isActive ? 'bg-white/25 text-white' : 'bg-white/[0.07] text-white/35'}`}>
                    {filterCounts[f] ?? 0}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Conteúdo condicional: estado vazio, sem resultados de busca ou lista de arquivos */}
          {validFiles.length === 0 ? (
            /* ── Estado vazio: biblioteca sem nenhum arquivo ── */
            <div className="rounded-3xl border border-white/[0.07] bg-[#0F172A]/80 p-8">
              <div className="flex flex-col items-center justify-center gap-6 text-center md:flex-row md:text-left">
                {/* Ilustração decorativa de três cards simulando arquivos */}
                <div className="flex shrink-0 items-end justify-center gap-2" aria-hidden="true">
                  <div className="h-20 w-14 rounded-2xl border border-white/[0.08] bg-[#111827] flex flex-col gap-2 p-3 rotate-[-6deg]">
                    <div className="h-1.5 rounded-full bg-[#60A5FA]/30" />
                    <div className="h-1.5 w-3/4 rounded-full bg-[#60A5FA]/20" />
                    <div className="h-1.5 w-1/2 rounded-full bg-[#60A5FA]/15" />
                  </div>
                  <div className="h-24 w-16 rounded-2xl border border-[#005BFF]/20 bg-[#111827] flex flex-col items-center justify-center gap-2 shadow-[0_0_30px_rgba(0,91,255,0.12)]">
                    <FolderOpen size={24} className="text-[#60A5FA]/50" />
                    <div className="h-1.5 w-8 rounded-full bg-[#60A5FA]/20" />
                  </div>
                  <div className="h-20 w-14 rounded-2xl border border-white/[0.08] bg-[#111827] flex flex-col gap-2 p-3 rotate-[6deg]">
                    <div className="h-1.5 rounded-full bg-[#A78BFA]/30" />
                    <div className="h-1.5 w-3/4 rounded-full bg-[#A78BFA]/20" />
                    <div className="h-1.5 w-1/2 rounded-full bg-[#A78BFA]/15" />
                  </div>
                </div>

                {/* Mensagem e botão CTA para enviar o primeiro arquivo */}
                <div>
                  <h3 className="text-xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                    Sua biblioteca ainda está vazia
                  </h3>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-white/45">
                    Envie PDFs, guias e materiais para disponibilizar downloads na página de Recursos.
                  </p>
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-5 py-3 text-sm font-bold text-white shadow-[0_8px_24px_rgba(0,91,255,0.25)] transition-all hover:-translate-y-0.5"
                  >
                    <UploadCloud size={15} aria-hidden="true" />
                    Enviar primeiro arquivo
                  </button>
                </div>
              </div>
            </div>
          ) : filteredFiles.length === 0 ? (
            /* ── Nenhum arquivo corresponde à busca ou filtro ativo ── */
            <div className="rounded-2xl border border-dashed border-white/[0.08] p-8 text-center">
              <p className="text-sm text-white/40">Nenhum arquivo corresponde à busca.</p>
              {/* Botão para limpar busca e filtro simultaneamente */}
              <button type="button" onClick={() => { setFileSearch(''); setFileFilter('Todos') }} className="mt-2 text-xs text-[#60A5FA] hover:underline">
                Limpar filtros
              </button>
            </div>
          ) : (
            /* ── Lista de arquivos filtrados ── */
            /* AnimatePresence com initial=false evita animação na montagem inicial */
            <AnimatePresence initial={false}>
              <div className="space-y-2.5">
                {filteredFiles.map((file, i) => (
                  <FileCard
                    key={file.id ?? file.name}
                    file={file}
                    meta={metaMap[file.name]}           // Metadados do arquivo (nome, categoria, preço, etc.)
                    index={i}
                    publicUrl={getPublicUrl(file.name)}
                    isCopied={copied === file.name}     // Se a URL deste arquivo foi copiada recentemente
                    isDeleting={deleting === file.name} // Se este arquivo está sendo excluído
                    isEditing={editingFile === file.name}
                    editForm={editForm}
                    setEditForm={setEditForm}
                    savingMeta={savingMeta}
                    metaSuccess={metaSuccess}
                    isLeader={isLeader}
                    uploadingProtected={uploadingProtected === file.name} // Se o arquivo protegido deste item está sendo enviado
                    onToggleEdit={() => openEdit(file.name)}
                    onSaveMeta={() => saveMetadata(file.name)}
                    onCopy={() => handleCopy(file.name)}
                    onRequestDelete={() => setConfirmFile(file.name)} // Abre o modal de confirmação
                    onUploadProtectedFile={f => uploadProtectedFile(file.name, f)}
                    onChoosePaid={() => handleChoosePaid(file.name)}
                  />
                ))}
              </div>
            </AnimatePresence>
          )}
        </motion.section>

        {/* ── GUIA DE PUBLICAÇÃO ───────────────────────────────── */}
        {/* Seção explicativa com passos numerados e exemplo de código copiável.
            Orienta o técnico a publicar o material na página de Recursos (lib/data.ts). */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-6 shadow-[0_20px_70px_rgba(0,0,0,0.25)]"
          aria-label="Como publicar um material"
        >
          {/* Cabeçalho com ícone de código */}
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#005BFF]/12">
              <Code2 size={17} className="text-[#60A5FA]" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Como publicar um material
            </h2>
          </div>

          {/* Layout de duas colunas: passos à esquerda, snippet de código à direita */}
          <div className="grid gap-6 lg:grid-cols-[1fr_auto]">

            {/* Passos numerados — grade de 4 colunas em telas grandes */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {GUIDE_STEPS.map(({ n, title, desc }) => (
                <div key={n} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    {/* Número do passo em círculo com gradiente */}
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#005BFF] to-[#7B2CFF] text-xs font-bold text-white shadow-[0_2px_8px_rgba(0,91,255,0.25)]">
                      {n}
                    </span>
                    <p className="text-sm font-bold text-white">{title}</p>
                  </div>
                  {/* Descrição do passo com recuo para alinhar com o texto do título */}
                  <p className="pl-9 text-xs leading-relaxed text-white/45">{desc}</p>
                </div>
              ))}
            </div>

            {/* Exemplo de código copiável para inserir o recurso em lib/data.ts */}
            <div className="min-w-0 shrink-0 lg:w-72">
              <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0A0F1E]">
                {/* Barra do snippet: nome do arquivo e botão de copiar */}
                <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2">
                  <span className="text-[10px] font-semibold text-white/35">lib/data.ts</span>
                  {/* Botão de cópia — alterna entre "Copiar" e "Copiado!" por 2 segundos */}
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(CODE_EXAMPLE)
                      setCodeCopied(true)
                      setTimeout(() => setCodeCopied(false), 2000)
                    }}
                    aria-label="Copiar exemplo de código"
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white/70"
                  >
                    {codeCopied
                      ? <><CheckCircle size={10} aria-hidden="true" />Copiado!</>
                      : <><Copy size={10} aria-hidden="true" />Copiar</>
                    }
                  </button>
                </div>
                {/* Bloco de código com rolagem horizontal para linhas longas */}
                <pre className="overflow-x-auto p-4 font-mono text-[11px] leading-relaxed text-white/50">
                  <code>{CODE_EXAMPLE}</code>
                </pre>
              </div>
            </div>
          </div>
        </motion.section>

      </div>
    </AdminShell>

    {/* ── Modal de confirmação de exclusão ─────────────────────────── */}
    {/* Renderizado fora do AdminShell para sobrepor o layout corretamente.
        Exige confirmação explícita antes de apagar arquivo e metadados permanentemente. */}
    <ConfirmDialog
      open={!!confirmFile}
      onOpenChange={(open) => !open && setConfirmFile(null)}
      icon={Trash2}
      title="Excluir arquivo?"
      description={
        <>
          O arquivo <span className="break-all font-mono text-white/80">{confirmFile}</span> e seus
          metadados serão removidos permanentemente. Esta ação não pode ser desfeita.
        </>
      }
      confirmLabel={<><Trash2 size={15} />Sim, excluir</>}
      confirmingLabel="Excluindo..."
      busy={!!deleting}
      onConfirm={() => confirmFile && handleDelete(confirmFile)}
    />
    </>
  )
}
