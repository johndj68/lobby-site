'use client'

import { useRef, useState } from 'react'
import {
  Image as ImageIcon, FileText, Network, Users, LayoutTemplate, Truck,
  Plus, Loader2, Eye, EyeOff, Lock, LayoutDashboard, FolderKanban,
  MessageSquareText, Download, Headphones,
} from 'lucide-react'
import { uploadProjectVisual, VisualUploadError } from '@/lib/project-visuals-upload'
import { getVisualStatusStyles } from '@/lib/project-status'
import SelectedVisualItemPanel, { type SelectedVisualItem } from './SelectedVisualItemPanel'
import SignedVisualImage from './SignedVisualImage'
import type {
  ClientProgress, VisualImage, VisualDocument, FlowStep, OrgChartRole, ScreenMapGroup, Deliverable,
} from '@/types'

/* Props do componente:
   value    — estado atual dos ativos visuais do projeto (ClientProgress)
   onChange — callback chamado ao modificar qualquer ativo visual */
interface Props {
  value:    ClientProgress
  onChange: (next: ClientProgress) => void
}

/* Abas de navegação do centro visual.
   Cada aba corresponde a uma categoria de material: imagens, documentos,
   fluxo do sistema, organograma, mapa de telas e entregas. */
const TABS = [
  { key: 'images',       label: 'Imagens',          icon: ImageIcon },
  { key: 'documents',    label: 'Documentos',       icon: FileText },
  { key: 'flow',         label: 'Fluxo do sistema', icon: Network },
  { key: 'org',          label: 'Organograma',      icon: Users },
  { key: 'screen',       label: 'Mapa de telas',    icon: LayoutTemplate },
  { key: 'deliverables', label: 'Entregas',         icon: Truck },
] as const
type TabKey = typeof TABS[number]['key']

/* Mapeamento de ícones disponíveis para etapas do fluxo do sistema.
   O nome da string (ex: 'Lock') é o valor salvo no campo `icon` de FlowStep. */
const FLOW_ICONS: Record<string, React.ElementType> = {
  Lock, LayoutDashboard, FolderKanban, MessageSquareText, Download, Headphones,
}

/* Retorna true se o item deve ser exibido para o cliente.
   Por padrão (undefined) considera visível. */
function isVisible(item: { visibleToClient?: boolean }) {
  return item.visibleToClient !== false
}

/* Gera um ID único usando a Web Crypto API. */
function newId() {
  return crypto.randomUUID()
}

/* Garante que todos os itens de um array possuam um campo `id`.
   Itens sem id recebem `${prefix}-${índice}` como identificador temporário. */
function withIds<T extends { id?: string }>(items: T[] | undefined, prefix: string): T[] {
  return (items ?? []).map((it, i) => it.id ? it : { ...it, id: `${prefix}-${i}` })
}

/* Componente principal de materiais visuais do projeto.
   Permite ao admin gerenciar imagens, documentos, fluxo, organograma,
   mapa de telas e entregas — com controle de visibilidade para o cliente. */
export default function ProjectVisualCenter({ value, onChange }: Props) {
  // Aba ativa no momento
  const [tab, setTab] = useState<TabKey>('images')
  // Filtro de visibilidade: 'all' | 'visible' | 'hidden'
  const [filter, setFilter] = useState<'all' | 'visible' | 'hidden'>('all')
  // Aba e ID do item selecionado no painel lateral de edição
  const [selectedTab, setSelectedTab] = useState<TabKey | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Estado do upload de arquivo
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  // Refs para os inputs de arquivo ocultos
  const imageInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)

  // Extrai os ativos visuais do ClientProgress com fallback para arrays vazios
  const va = value.clientVisualAssets ?? {}
  const images       = va.images ?? []
  const documents     = va.documents ?? []
  const flowSteps     = withIds(va.flowSteps, 'flow')
  const orgChart       = withIds(va.organizationChart, 'org')
  const screenMap       = withIds(va.screenMap, 'screen')
  const deliverables     = va.deliverables ?? []

  /* Atualiza parcialmente os ativos visuais no ClientProgress pai. */
  const setAssets = (patch: Partial<NonNullable<ClientProgress['clientVisualAssets']>>) => {
    onChange({ ...value, clientVisualAssets: { ...va, ...patch } })
  }

  // Contadores para o rodapé de visibilidade
  const totalVisible = [...images, ...documents, ...flowSteps, ...orgChart, ...screenMap, ...deliverables]
    .filter(isVisible).length
  const totalAll = images.length + documents.length + flowSteps.length + orgChart.length + screenMap.length + deliverables.length

  /* Retorna o item selecionado no formato esperado pelo SelectedVisualItemPanel.
     Retorna null se nenhum item estiver selecionado. */
  function getSelected(): SelectedVisualItem | null {
    if (!selectedTab || !selectedId) return null
    if (selectedTab === 'images')    { const it = images.find(i => i.id === selectedId);   return it ? { kind: 'image', item: it } : null }
    if (selectedTab === 'documents') { const it = documents.find(i => i.id === selectedId); return it ? { kind: 'document', item: it } : null }
    if (selectedTab === 'flow')      { const it = flowSteps.find(i => i.id === selectedId); return it ? { kind: 'flow', item: it } : null }
    if (selectedTab === 'org')       { const it = orgChart.find(i => i.id === selectedId);  return it ? { kind: 'org', item: it } : null }
    if (selectedTab === 'screen')    { const it = screenMap.find(i => i.id === selectedId); return it ? { kind: 'screen', item: it } : null }
    const it = deliverables.find(i => i.id === selectedId); return it ? { kind: 'deliverable', item: it } : null
  }
  const selected = getSelected()

  /* Seleciona um item pelo tipo de aba e ID para exibição no painel lateral. */
  const select = (t: TabKey, id: string) => { setSelectedTab(t); setSelectedId(id) }
  /* Fecha a seleção do painel lateral. */
  const closeSelection = () => { setSelectedTab(null); setSelectedId(null) }

  /* Atualiza os campos do item selecionado com o patch recebido do painel lateral. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleUpdate = (patch: Record<string, any>) => {
    if (!selectedTab || !selectedId) return
    if (selectedTab === 'images')    setAssets({ images: images.map(i => i.id === selectedId ? { ...i, ...patch } : i) })
    if (selectedTab === 'documents') setAssets({ documents: documents.map(i => i.id === selectedId ? { ...i, ...patch } : i) })
    if (selectedTab === 'flow')      setAssets({ flowSteps: flowSteps.map(i => i.id === selectedId ? { ...i, ...patch } : i) })
    if (selectedTab === 'org')       setAssets({ organizationChart: orgChart.map(i => i.id === selectedId ? { ...i, ...patch } : i) })
    if (selectedTab === 'screen')    setAssets({ screenMap: screenMap.map(i => i.id === selectedId ? { ...i, ...patch } : i) })
    if (selectedTab === 'deliverables') setAssets({ deliverables: deliverables.map(i => i.id === selectedId ? { ...i, ...patch } : i) })
  }

  /* Remove o item selecionado da sua lista e fecha o painel lateral. */
  const handleRemove = () => {
    if (!selectedTab || !selectedId) return
    if (selectedTab === 'images')    setAssets({ images: images.filter(i => i.id !== selectedId) })
    if (selectedTab === 'documents') setAssets({ documents: documents.filter(i => i.id !== selectedId) })
    if (selectedTab === 'flow')      setAssets({ flowSteps: flowSteps.filter(i => i.id !== selectedId) })
    if (selectedTab === 'org')       setAssets({ organizationChart: orgChart.filter(i => i.id !== selectedId) })
    if (selectedTab === 'screen')    setAssets({ screenMap: screenMap.filter(i => i.id !== selectedId) })
    if (selectedTab === 'deliverables') setAssets({ deliverables: deliverables.filter(i => i.id !== selectedId) })
    closeSelection()
  }

  /* Faz upload de uma imagem para o storage e adiciona ao array de imagens.
     Em caso de erro, exibe mensagem e não altera o estado. */
  const handleImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true); setError('')
    try {
      const file = files[0]
      const url = await uploadProjectVisual(file, 'image')
      const item: VisualImage = { id: newId(), title: file.name, description: '', url, phase: '', status: 'planejado', createdAt: new Date().toISOString() }
      setAssets({ images: [...images, item] })
      select('images', item.id)
    } catch (e) {
      setError(e instanceof VisualUploadError ? e.message : 'Erro ao enviar imagem. Tente novamente.')
    } finally {
      setUploading(false)
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  /* Faz upload de um documento para o storage e adiciona ao array de documentos.
     Preserva o tipo MIME do arquivo original. */
  const handleDocUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true); setError('')
    try {
      const file = files[0]
      const url = await uploadProjectVisual(file, 'document')
      const item: VisualDocument = {
        id: newId(), title: file.name, description: '', fileUrl: url, type: file.type || 'application/octet-stream',
        fileName: file.name, fileType: file.type, phase: '', status: 'planejado', createdAt: new Date().toISOString(),
      }
      setAssets({ documents: [...documents, item] })
      select('documents', item.id)
    } catch (e) {
      setError(e instanceof VisualUploadError ? e.message : 'Erro ao enviar documento. Tente novamente.')
    } finally {
      setUploading(false)
      if (docInputRef.current) docInputRef.current.value = ''
    }
  }

  /* Adiciona uma nova etapa vazia ao fluxo do sistema e a seleciona. */
  const addFlowStep = () => {
    const item: FlowStep = { id: newId(), title: '', description: '', icon: 'LayoutDashboard', status: 'planejado', order: flowSteps.length }
    setAssets({ flowSteps: [...flowSteps, item] }); setTab('flow'); select('flow', item.id)
  }
  /* Adiciona um novo papel vazio ao organograma e o seleciona. */
  const addRole = () => {
    const item: OrgChartRole = { id: newId(), role: '', name: '', description: '', level: 0 }
    setAssets({ organizationChart: [...orgChart, item] }); setTab('org'); select('org', item.id)
  }
  /* Adiciona um novo grupo vazio ao mapa de telas e o seleciona. */
  const addScreenGroup = () => {
    const item: ScreenMapGroup = { id: newId(), module: '', screens: [], status: 'planejado' }
    setAssets({ screenMap: [...screenMap, item] }); setTab('screen'); select('screen', item.id)
  }
  /* Adiciona uma nova entrega vazia e a seleciona. */
  const addDeliverable = () => {
    const item: Deliverable = { id: newId(), title: '', description: '', status: 'planejado', phase: '' }
    setAssets({ deliverables: [...deliverables, item] }); setTab('deliverables'); select('deliverables', item.id)
  }

  /* Resumo de contagens por categoria para os cards de navegação rápida. */
  const summary = [
    { key: 'images' as TabKey,       label: 'Imagens',    count: images.length,       icon: ImageIcon },
    { key: 'documents' as TabKey,    label: 'Documentos', count: documents.length,     icon: FileText },
    { key: 'flow' as TabKey,         label: 'Fluxo',       count: flowSteps.length,     icon: Network },
    { key: 'org' as TabKey,          label: 'Organograma', count: orgChart.length,       icon: Users },
    { key: 'screen' as TabKey,       label: 'Telas',        count: screenMap.length,       icon: LayoutTemplate },
    { key: 'deliverables' as TabKey, label: 'Entregas',      count: deliverables.length,     icon: Truck },
  ]

  /* Aplica o filtro de visibilidade ao array passado.
     'all' retorna tudo; 'visible' retorna visíveis; 'hidden' retorna ocultos. */
  function applyFilter<T extends { visibleToClient?: boolean }>(items: T[]): T[] {
    if (filter === 'all') return items
    return items.filter(i => filter === 'visible' ? isVisible(i) : !isVisible(i))
  }

  // Estilos base para cards de item da lista
  const cardBase = 'cursor-pointer rounded-xl border p-3 text-left transition-colors'
  // Estilo condicional: azul quando ativo, neutro quando inativo
  const cardActive = (active: boolean) => active
    ? 'border-[#005BFF]/50 bg-[#005BFF]/[0.08]'
    : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14]'

  /* Badge de visibilidade — exibido em cada card de item.
     Verde com olho aberto = visível ao cliente | cinza com olho fechado = oculto. */
  const VisibilityBadge = ({ visible }: { visible: boolean }) => (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${visible ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/[0.06] text-white/35'}`}>
      {visible ? <Eye size={9} aria-hidden="true" /> : <EyeOff size={9} aria-hidden="true" />}
      {visible ? 'Visível' : 'Oculto'}
    </span>
  )

  return (
    <div className="space-y-5">
      {/* Cabeçalho da seção */}
      <div>
        <h3 className="text-lg font-bold text-white">Visão visual do projeto</h3>
        <p className="mt-0.5 text-xs text-white/40">Imagens, documentos, fluxo, organograma, mapa de telas e entregas visíveis para o cliente.</p>
      </div>

      {/* Botões de ação rápida para adicionar itens — disparam inputs ocultos de arquivo */}
      <div className="flex flex-wrap gap-2">
        {/* Botão de upload de imagem — abre input de arquivo oculto */}
        <button type="button" disabled={uploading} onClick={() => { setTab('images'); imageInputRef.current?.click() }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-2 text-xs font-bold text-white/70 hover:bg-white/[0.10] disabled:opacity-50">
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} aria-hidden="true" />}Imagem
        </button>
        {/* Botão de upload de documento — abre input de arquivo oculto */}
        <button type="button" disabled={uploading} onClick={() => { setTab('documents'); docInputRef.current?.click() }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-2 text-xs font-bold text-white/70 hover:bg-white/[0.10] disabled:opacity-50">
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} aria-hidden="true" />}Documento
        </button>
        {/* Botão para adicionar etapa de fluxo */}
        <button type="button" onClick={addFlowStep}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-2 text-xs font-bold text-white/70 hover:bg-white/[0.10]">
          <Plus size={12} aria-hidden="true" />Etapa do fluxo
        </button>
        {/* Botão para adicionar entrega */}
        <button type="button" onClick={addDeliverable}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-2 text-xs font-bold text-white/70 hover:bg-white/[0.10]">
          <Plus size={12} aria-hidden="true" />Entrega
        </button>
        {/* Inputs de arquivo ocultos — acionados pelos botões acima */}
        <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e.target.files)} />
        <input ref={docInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip" className="hidden" onChange={e => handleDocUpload(e.target.files)} />
      </div>

      {/* Mensagem de erro de upload */}
      {error && <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400">{error}</p>}

      {/* Cards de resumo numérico por categoria — clique navega para a aba */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {summary.map(s => (
          <button key={s.key} type="button" onClick={() => setTab(s.key)}
            className={`rounded-xl border p-2.5 text-left transition-colors ${tab === s.key ? 'border-[#005BFF]/50 bg-[#005BFF]/[0.08]' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14]'}`}>
            <s.icon size={14} className="text-white/40" aria-hidden="true" />
            <p className="mt-1.5 text-lg font-bold text-white">{s.count}</p>
            <p className="text-[10px] text-white/40">{s.label}</p>
          </button>
        ))}
      </div>

      {/* Barra de abas de navegação com indicador de aba ativa (underline gradiente) */}
      <div className="flex items-center justify-between gap-3 overflow-x-auto border-b border-white/[0.08] pb-px">
        <div className="flex gap-1">
          {TABS.map(t => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={`relative flex shrink-0 items-center gap-1.5 px-3 py-2 text-xs font-bold transition-colors ${tab === t.key ? 'text-white' : 'text-white/35 hover:text-white/60'}`}>
              <t.icon size={13} aria-hidden="true" />{t.label}
              {/* Indicador de aba ativa — linha gradiente na base */}
              {tab === t.key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-[#005BFF] to-[#7B2CFF]" />}
            </button>
          ))}
        </div>
      </div>

      {/* Filtros de visibilidade: Todos / Visíveis / Ocultos */}
      <div className="flex items-center gap-1.5">
        {(['all', 'visible', 'hidden'] as const).map(f => (
          <button key={f} type="button" onClick={() => setFilter(f)}
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors ${filter === f ? 'bg-white/[0.10] text-white' : 'text-white/35 hover:text-white/60'}`}>
            {f === 'all' ? 'Todos' : f === 'visible' ? 'Visíveis' : 'Ocultos'}
          </button>
        ))}
      </div>

      {/* Layout de duas colunas: lista de itens (esquerda) + painel de edição (direita) */}
      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        {/* Coluna principal: lista de itens da aba ativa */}
        <div>
          {/* Botão de adição contextual — exibido apenas nas abas que não usam upload */}
          {(tab === 'flow' || tab === 'org' || tab === 'screen' || tab === 'deliverables') && (
            <div className="mb-2 flex justify-end">
              <button type="button"
                onClick={tab === 'flow' ? addFlowStep : tab === 'org' ? addRole : tab === 'screen' ? addScreenGroup : addDeliverable}
                className="inline-flex items-center gap-1 rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-xs font-bold text-white/70 hover:bg-white/[0.10]">
                <Plus size={12} aria-hidden="true" />
                {tab === 'flow' ? 'Adicionar etapa' : tab === 'org' ? 'Adicionar papel' : tab === 'screen' ? 'Adicionar módulo' : 'Adicionar entrega'}
              </button>
            </div>
          )}

          {/* ── Aba: Imagens — grade 2 colunas com thumbnail ── */}
          {tab === 'images' && (
            applyFilter(images).length === 0 ? (
              <p className="text-xs text-white/30">Nenhuma imagem adicionada.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {applyFilter(images).map(img => (
                  <button key={img.id} type="button" onClick={() => select('images', img.id)}
                    className={`${cardBase} ${cardActive(selectedId === img.id)} overflow-hidden !p-0`}>
                    {/* Thumbnail da imagem com URL assinada */}
                    <SignedVisualImage src={img.url} alt={img.title} className="h-28 w-full object-cover" />
                    <div className="space-y-1 p-2.5">
                      <p className="truncate text-xs font-semibold text-white">{img.title || 'Sem título'}</p>
                      <div className="flex items-center gap-1.5">
                        {/* Badge de status (planejado, em andamento, concluído...) */}
                        <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ background: getVisualStatusStyles(img.status).bg, color: getVisualStatusStyles(img.status).color }}>
                          {getVisualStatusStyles(img.status).label}
                        </span>
                        <VisibilityBadge visible={isVisible(img)} />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )
          )}

          {/* ── Aba: Documentos — lista com ícone e nome do arquivo ── */}
          {tab === 'documents' && (
            applyFilter(documents).length === 0 ? (
              <p className="text-xs text-white/30">Nenhum documento adicionado.</p>
            ) : (
              <div className="space-y-2">
                {applyFilter(documents).map(doc => (
                  <button key={doc.id} type="button" onClick={() => select('documents', doc.id)}
                    className={`${cardBase} ${cardActive(selectedId === doc.id)} flex w-full items-center gap-3`}>
                    <FileText size={18} className="shrink-0 text-[#60A5FA]" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-white">{doc.title || 'Sem título'}</p>
                      <p className="truncate text-[10px] text-white/35">{doc.documentType || doc.fileName || 'Documento'}</p>
                    </div>
                    <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold shrink-0" style={{ background: getVisualStatusStyles(doc.status).bg, color: getVisualStatusStyles(doc.status).color }}>
                      {getVisualStatusStyles(doc.status).label}
                    </span>
                    <VisibilityBadge visible={isVisible(doc)} />
                  </button>
                ))}
              </div>
            )
          )}

          {/* ── Aba: Fluxo do sistema — lista ordenada por `order` ── */}
          {tab === 'flow' && (
            applyFilter(flowSteps).length === 0 ? (
              <p className="text-xs text-white/30">Nenhuma etapa cadastrada. Ex: Login → Dashboard → Projetos → Materiais.</p>
            ) : (
              <div className="space-y-2">
                {[...applyFilter(flowSteps)].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(s => {
                  // Resolve o ícone salvo no campo `icon` do FlowStep
                  const Icon = FLOW_ICONS[s.icon] ?? LayoutDashboard
                  return (
                    <button key={s.id} type="button" onClick={() => select('flow', s.id)}
                      className={`${cardBase} ${cardActive(selectedId === s.id)} flex w-full items-center gap-3`}>
                      <Icon size={16} className="shrink-0 text-[#7B2CFF]" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-white">{s.title || 'Sem título'}</p>
                        <p className="truncate text-[10px] text-white/35">{s.description || 'Sem descrição'}</p>
                      </div>
                      <VisibilityBadge visible={isVisible(s)} />
                    </button>
                  )
                })}
              </div>
            )
          )}

          {/* ── Aba: Organograma — lista ordenada por `level` (nível hierárquico) ── */}
          {tab === 'org' && (
            applyFilter(orgChart).length === 0 ? (
              <p className="text-xs text-white/30">Nenhum papel cadastrado. Ex: Cliente, Gestor LOBBY, Front-end, Back-end.</p>
            ) : (
              <div className="space-y-2">
                {[...applyFilter(orgChart)].sort((a, b) => (a.level ?? 0) - (b.level ?? 0)).map(r => (
                  <button key={r.id} type="button" onClick={() => select('org', r.id)}
                    className={`${cardBase} ${cardActive(selectedId === r.id)} flex w-full items-center gap-3`}>
                    <Users size={16} className="shrink-0 text-white/40" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-white">{r.role || 'Sem papel'}</p>
                      <p className="truncate text-[10px] text-white/35">{r.name || 'Sem responsável'}</p>
                    </div>
                    <VisibilityBadge visible={isVisible(r)} />
                  </button>
                ))}
              </div>
            )
          )}

          {/* ── Aba: Mapa de telas — grade 2 colunas com contagem de telas ── */}
          {tab === 'screen' && (
            applyFilter(screenMap).length === 0 ? (
              <p className="text-xs text-white/30">Nenhum módulo cadastrado.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {applyFilter(screenMap).map(g => (
                  <button key={g.id} type="button" onClick={() => select('screen', g.id)}
                    className={`${cardBase} ${cardActive(selectedId === g.id)} w-full`}>
                    <p className="truncate text-xs font-semibold text-white">{g.module || 'Sem nome'}</p>
                    <p className="mt-0.5 truncate text-[10px] text-white/35">{g.screens.length} tela(s)</p>
                    <div className="mt-1.5"><VisibilityBadge visible={isVisible(g)} /></div>
                  </button>
                ))}
              </div>
            )
          )}

          {/* ── Aba: Entregas — grade 2 colunas com imagem opcional ── */}
          {tab === 'deliverables' && (
            applyFilter(deliverables).length === 0 ? (
              <p className="text-xs text-white/30">Nenhuma entrega cadastrada.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {applyFilter(deliverables).map(d => (
                  <button key={d.id} type="button" onClick={() => select('deliverables', d.id)}
                    className={`${cardBase} ${cardActive(selectedId === d.id)} w-full`}>
                    {/* Thumbnail opcional da entrega */}
                    {d.imageUrl && (
                      <SignedVisualImage src={d.imageUrl} alt={d.title} className="mb-2 h-20 w-full rounded-lg object-cover" />
                    )}
                    <p className="truncate text-xs font-semibold text-white">{d.title || 'Sem título'}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ background: getVisualStatusStyles(d.status).bg, color: getVisualStatusStyles(d.status).color }}>
                        {getVisualStatusStyles(d.status).label}
                      </span>
                      <VisibilityBadge visible={isVisible(d)} />
                    </div>
                  </button>
                ))}
              </div>
            )
          )}
        </div>

        {/* Painel lateral de edição do item selecionado — sticky no desktop */}
        <div className="xl:sticky xl:top-4 xl:self-start">
          <SelectedVisualItemPanel selected={selected} onUpdate={handleUpdate} onRemove={handleRemove} onClose={closeSelection} />
        </div>
      </div>

      {/* Rodapé: contagem de materiais visíveis vs. total */}
      <p className="border-t border-white/[0.08] pt-3 text-xs text-white/40">
        <strong className="text-white/70">{totalVisible}</strong> de {totalAll} materiais visíveis para o cliente.
      </p>
    </div>
  )
}
