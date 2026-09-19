'use client'

import { useState } from 'react'
import {
  ShieldCheck, LayoutGrid, FileText, CheckCircle2, Plus, Trash2, AlertTriangle,
  Wand2, ListChecks, Eye, EyeOff, Lock, LayoutDashboard, FolderKanban, Download,
  Users, Bell, FileBarChart, UserCog, Headphones,
} from 'lucide-react'
import { getModuleStatusStyle, normalizeSecurityItems } from '@/lib/project-status'
import type { ClientProgress, ProjectModule, SecurityChecklistItem } from '@/types'

interface Props {
  value:    ClientProgress
  onChange: (next: ClientProgress) => void
}

const SUB_TABS = [
  { key: 'seguranca' as const,  label: 'Segurança',  icon: ShieldCheck },
  { key: 'modulos' as const,    label: 'Módulos',     icon: LayoutGrid },
  { key: 'relatorio' as const,  label: 'Relatório',   icon: FileText },
  { key: 'aprovacao' as const,  label: 'Aprovação',   icon: CheckCircle2 },
]
type SubTab = typeof SUB_TABS[number]['key']

const MODULE_ICONS: Record<string, React.ElementType> = {
  Lock, LayoutDashboard, FolderKanban, Download, Users, Bell, FileBarChart, UserCog, Headphones,
}

const MODULE_STATUS_OPTIONS: { value: ProjectModule['status']; label: string }[] = [
  { value: 'nao_iniciado',          label: 'Planejado'          },
  { value: 'em_andamento',          label: 'Em andamento'       },
  { value: 'aguardando_validacao',  label: 'Em validação'       },
  { value: 'concluido',             label: 'Concluído'          },
  { value: 'aguardando_cliente',    label: 'Aguardando cliente' },
  { value: 'bloqueado',             label: 'Bloqueado'          },
]

const MODULE_DEFAULTS: { name: string; description: string; icon: string }[] = [
  { name: 'Login seguro',           description: 'Acesso protegido com autenticação segura.',            icon: 'Lock' },
  { name: 'Dashboard do cliente',   description: 'Visão geral do projeto e métricas principais.',         icon: 'LayoutDashboard' },
  { name: 'Área de projetos',       description: 'Acompanhamento detalhado de cada projeto.',              icon: 'FolderKanban' },
  { name: 'Downloads de materiais', description: 'Acesso a arquivos, documentos e entregas.',               icon: 'Download' },
  { name: 'Suporte',                description: 'Canal de atendimento e suporte técnico.',                 icon: 'Headphones' },
  { name: 'Conta',                  description: 'Gerenciamento de dados e preferências da conta.',         icon: 'UserCog' },
  { name: 'Notificações',           description: 'Alertas e atualizações em tempo real.',                   icon: 'Bell' },
  { name: 'Relatórios',             description: 'Relatórios executivos e histórico do projeto.',           icon: 'FileBarChart' },
]

const SECURITY_CHECKLIST_DEFAULTS = [
  'Login protegido',
  'Controle de acesso por perfil',
  'Dados sensíveis protegidos',
  'Sessões seguras',
  'Arquivos armazenados com segurança',
  'Permissões separadas por usuário',
]

const SUGGESTED_SECURITY_SUMMARY = 'Seu projeto será estruturado com acesso protegido e dados seguros para garantir a integridade das informações.'
const SUGGESTED_APPROVAL_MESSAGE = 'Revise a prévia enviada e confirme se podemos seguir para a próxima etapa.'

const APPROVAL_STATUS_INFO: Record<string, { label: string; color: string; bg: string }> = {
  none:                { label: 'Não precisa de aprovação', color: '#94A3B8', bg: 'rgba(148,163,184,0.10)' },
  aguardando:          { label: 'Aguardando aprovação',      color: '#F59E0B', bg: 'rgba(245,158,11,0.10)'  },
  aprovado:            { label: 'Aprovado',                  color: '#10B981', bg: 'rgba(16,185,129,0.10)'  },
  ajustes_solicitados: { label: 'Ajuste solicitado',         color: '#EF4444', bg: 'rgba(239,68,68,0.10)'   },
}

const inputClass = 'h-10 w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-2.5 text-xs text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50'
const textareaClass = 'w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.05] px-2.5 py-2 text-xs text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50'
const labelClass = 'mb-1.5 block text-xs font-semibold text-white/60'

function withModuleIds(mods: ProjectModule[] | undefined): ProjectModule[] {
  return (mods ?? []).map((m, i) => m.id ? m : { ...m, id: `mod-${i}` })
}

function isTextUnclear(text?: string): boolean {
  if (!text || text.trim().length < 20) return true
  return text.length > 20 && !text.includes(' ')
}

function getApprovalStatusKey(value: ClientProgress): string {
  if (!value.approvalRequired) return 'none'
  return value.approvalStatus ?? 'aguardando'
}

function buildAutoReport(value: ClientProgress) {
  const phases = value.phases ?? []
  const current = phases.find(p => p.status === 'atual')
  const modules = withModuleIds(value.modules)
  const doneCount = modules.filter(m => m.status === 'concluido').length
  const weekSummary = current
    ? `Esta semana avançamos na etapa "${current.title}"${current.description ? `: ${current.description}` : '.'}`
    : 'Esta semana avançamos nas atividades planejadas para o projeto.'
  const completedProgress = modules.length > 0
    ? `${doneCount} de ${modules.length} módulo${modules.length > 1 ? 's' : ''} concluído${doneCount === 1 ? '' : 's'} até o momento.`
    : 'Os módulos do projeto ainda serão detalhados nas próximas atualizações.'
  const nextMilestone = value.nextMilestone
    ? `${value.nextMilestone}${value.nextMilestoneDescription ? ` — ${value.nextMilestoneDescription}` : ''}`
    : 'O próximo marco ainda será definido com a equipe.'
  return { weekSummary, completedProgress, nextMilestone }
}

function VisibilityBadge({ visible }: { visible: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${visible ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/[0.06] text-white/35'}`}>
      {visible ? <Eye size={9} aria-hidden="true" /> : <EyeOff size={9} aria-hidden="true" />}
      {visible ? 'Visível para cliente' : 'Oculto'}
    </span>
  )
}

export default function ProjectSecurityModulesEditor({ value, onChange }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('seguranca')

  const set = <K extends keyof ClientProgress>(key: K, v: ClientProgress[K]) =>
    onChange({ ...value, [key]: v })

  const securityItems = normalizeSecurityItems(value.securityItems)
  const setSecurityItems = (items: SecurityChecklistItem[]) => set('securityItems', items)
  const modules = withModuleIds(value.modules)
  const setModules = (mods: ProjectModule[]) => set('modules', mods)
  const report = value.executiveReport ?? {}
  const setReport = (patch: Partial<NonNullable<ClientProgress['executiveReport']>>) =>
    set('executiveReport', { ...report, ...patch })

  const reportFilled = Boolean(report.weekSummary || report.completedProgress || report.risks || report.nextMilestone || report.finalNote)
  const approvalStatusKey = getApprovalStatusKey(value)
  const approvalInfo = APPROVAL_STATUS_INFO[approvalStatusKey]
  const visibleSecurityCount = securityItems.filter(it => it.checked && it.visibleToClient !== false).length
  const visibleModulesCount = modules.filter(m => m.visibleToClient !== false).length

  const warnings: string[] = []
  if (isTextUnclear(value.securitySummary)) warnings.push('O resumo de segurança está vazio ou pode estar pouco claro para o cliente.')
  if (modules.some(m => !m.name.trim())) warnings.push('Um ou mais módulos estão sem nome.')
  if (modules.some(m => !m.description?.trim())) warnings.push('Um ou mais módulos estão sem descrição.')
  if (!reportFilled) warnings.push('O relatório executivo ainda não foi preenchido.')
  if (value.approvalRequired && !value.approvalMessage?.trim()) warnings.push('A aprovação está marcada como necessária, mas não há mensagem para o cliente.')

  /* Segurança */
  const toggleChecked = (id: string) => setSecurityItems(securityItems.map(it => it.id === id ? { ...it, checked: !it.checked } : it))
  const toggleItemVisible = (id: string) => setSecurityItems(securityItems.map(it => it.id === id ? { ...it, visibleToClient: it.visibleToClient === false } : it))
  const updateItemLabel = (id: string, label: string) => setSecurityItems(securityItems.map(it => it.id === id ? { ...it, label } : it))
  const removeItem = (id: string) => setSecurityItems(securityItems.filter(it => it.id !== id))
  const addItem = () => setSecurityItems([...securityItems, { id: `sec-${crypto.randomUUID()}`, label: '', checked: true, visibleToClient: true }])
  const applyDefaultChecklist = () => setSecurityItems(SECURITY_CHECKLIST_DEFAULTS.map((label, i) => ({ id: `sec-default-${i}`, label, checked: true, visibleToClient: true })))
  const applySuggestedSecuritySummary = () => set('securitySummary', SUGGESTED_SECURITY_SUMMARY)

  /* Módulos */
  const addModule = () => setModules([...modules, { id: `mod-${crypto.randomUUID()}`, name: '', description: '', status: 'nao_iniciado', progress: 0, icon: 'LayoutDashboard', visibleToClient: true }])
  const updateModule = (id: string, patch: Partial<ProjectModule>) => setModules(modules.map(m => m.id === id ? { ...m, ...patch } : m))
  const removeModule = (id: string) => setModules(modules.filter(m => m.id !== id))
  const applyDefaultModules = () => setModules([
    ...modules,
    ...MODULE_DEFAULTS.map(d => ({ id: `mod-default-${crypto.randomUUID()}`, name: d.name, description: d.description, icon: d.icon, status: 'nao_iniciado' as const, progress: 0, visibleToClient: true })),
  ])

  /* Relatório */
  const applyAutoReport = () => setReport(buildAutoReport(value))

  /* Aprovação */
  const applySuggestedApprovalMessage = () => set('approvalMessage', SUGGESTED_APPROVAL_MESSAGE)

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-bold text-white">Segurança & Extras</h3>
        <p className="mt-0.5 text-xs text-white/40">Defina segurança, módulos, relatório executivo e aprovações visíveis ao cliente.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button type="button" onClick={() => setSubTab('seguranca')}
          className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-left transition-colors hover:border-[#005BFF]/40">
          <ShieldCheck size={16} className="text-[#005BFF]" aria-hidden="true" />
          <p className="mt-1.5 text-lg font-bold text-white">{securityItems.length}</p>
          <p className="text-[10px] text-white/40">itens de segurança</p>
        </button>
        <button type="button" onClick={() => setSubTab('modulos')}
          className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-left transition-colors hover:border-[#7B2CFF]/40">
          <LayoutGrid size={16} className="text-[#7B2CFF]" aria-hidden="true" />
          <p className="mt-1.5 text-lg font-bold text-white">{modules.length}</p>
          <p className="text-[10px] text-white/40">módulos cadastrados</p>
        </button>
        <button type="button" onClick={() => setSubTab('relatorio')}
          className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-left transition-colors hover:border-[#00A3FF]/40">
          <FileText size={16} className="text-[#00A3FF]" aria-hidden="true" />
          <p className="mt-1.5 text-sm font-bold text-white">{reportFilled ? 'Preenchido' : 'Pendente'}</p>
          <p className="text-[10px] text-white/40">relatório executivo</p>
        </button>
        <button type="button" onClick={() => setSubTab('aprovacao')}
          className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-left transition-colors hover:border-white/[0.2]">
          <CheckCircle2 size={16} style={{ color: approvalInfo.color }} aria-hidden="true" />
          <p className="mt-1.5 text-sm font-bold text-white">{approvalInfo.label}</p>
          <p className="text-[10px] text-white/40">aprovação</p>
        </button>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-xl border border-[#F59E0B]/25 bg-[#F59E0B]/[0.06] p-3">
          <p className="flex items-center gap-1.5 text-xs font-bold text-[#F59E0B]">
            <AlertTriangle size={13} aria-hidden="true" />
            Alguns textos parecem incompletos para o cliente. Revise antes de publicar.
          </p>
          <ul className="mt-1.5 space-y-0.5 pl-5 text-[11px] text-white/50">
            {warnings.map((w, i) => <li key={i} className="list-disc">{w}</li>)}
          </ul>
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-white/[0.08] pb-px">
        {SUB_TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setSubTab(t.key)}
            className={`relative flex shrink-0 items-center gap-1.5 px-3 py-2 text-xs font-bold transition-colors ${subTab === t.key ? 'text-white' : 'text-white/35 hover:text-white/60'}`}>
            <t.icon size={13} aria-hidden="true" />{t.label}
            {subTab === t.key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-[#005BFF] to-[#7B2CFF]" />}
          </button>
        ))}
      </div>

      {subTab === 'seguranca' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className={labelClass + ' mb-0'}>Resumo para o cliente</p>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-400">Visível para cliente</span>
            </div>
            <textarea rows={2} placeholder="Ex: Seu projeto será estruturado com acesso protegido, permissões por usuário e cuidado com os dados importantes."
              value={value.securitySummary ?? ''} onChange={e => set('securitySummary', e.target.value)}
              className={textareaClass} />
            <div className="mt-2 flex items-center justify-between">
              <button type="button" onClick={applySuggestedSecuritySummary}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#005BFF] hover:underline">
                <Wand2 size={11} aria-hidden="true" />Usar texto sugerido
              </button>
              <label className="flex items-center gap-2 text-[11px] font-medium text-white/50">
                <input type="checkbox" checked={value.securityVisibleToClient ?? true}
                  onChange={e => set('securityVisibleToClient', e.target.checked)}
                  className="h-3.5 w-3.5 accent-[#005BFF]" />
                Mostrar segurança no dashboard do cliente
              </label>
            </div>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className={labelClass + ' mb-0'}>Checklist de segurança</p>
              <div className="flex gap-2">
                <button type="button" onClick={applyDefaultChecklist}
                  className="inline-flex items-center gap-1 rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-xs font-bold text-white/70 hover:bg-white/[0.10]">
                  <ListChecks size={12} aria-hidden="true" />Usar checklist padrão
                </button>
                <button type="button" onClick={addItem}
                  className="inline-flex items-center gap-1 rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-xs font-bold text-white/70 hover:bg-white/[0.10]">
                  <Plus size={12} aria-hidden="true" />Adicionar item
                </button>
              </div>
            </div>

            {securityItems.length === 0 ? (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center">
                <p className="text-xs text-white/40">Nenhum item de segurança cadastrado.</p>
                <p className="mt-1 text-[11px] text-white/25">Use o checklist padrão para explicar como o projeto será protegido.</p>
                <button type="button" onClick={applyDefaultChecklist}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#005BFF]/10 px-3 py-1.5 text-xs font-bold text-[#005BFF] hover:bg-[#005BFF]/20">
                  <ListChecks size={12} aria-hidden="true" />Usar checklist padrão
                </button>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {securityItems.map(it => (
                  <div key={it.id} className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                    <input type="checkbox" checked={it.checked} onChange={() => toggleChecked(it.id)}
                      aria-label={`Incluir item ${it.label || 'sem nome'}`}
                      className="h-4 w-4 shrink-0 accent-[#10B981]" />
                    <input type="text" placeholder="Ex: Login protegido" value={it.label}
                      onChange={e => updateItemLabel(it.id, e.target.value)}
                      className={inputClass + ' flex-1'} />
                    <button type="button" onClick={() => toggleItemVisible(it.id)} aria-label="Alternar visibilidade para o cliente"
                      className="shrink-0">
                      <VisibilityBadge visible={it.visibleToClient !== false} />
                    </button>
                    <button type="button" onClick={() => removeItem(it.id)} aria-label="Remover item"
                      className="shrink-0 rounded-lg p-1.5 text-white/25 transition-colors hover:bg-red-500/10 hover:text-red-400">
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[#7B2CFF]/20 bg-[#7B2CFF]/[0.04] p-4">
            <div className="mb-1 flex items-center justify-between">
              <p className={labelClass + ' mb-0'}>Detalhes técnicos internos</p>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#7B2CFF]/15 px-2 py-0.5 text-[9px] font-bold text-[#B794F6]">Interno</span>
            </div>
            <p className="mb-2 text-[11px] text-white/35">Use este campo para observações técnicas da equipe. O cliente não verá essa informação.</p>
            <textarea rows={3} placeholder="Ex: Autenticação JWT, controle de acesso por perfil, políticas de permissão, logs e proteção de arquivos."
              value={value.securityInternalNotes ?? ''} onChange={e => set('securityInternalNotes', e.target.value)}
              className={textareaClass} />
          </div>

          <div>
            <label className={labelClass}>Detalhes expansíveis para o cliente <span className="font-normal text-white/30">(accordion &ldquo;Ver detalhes da segurança&rdquo;)</span></label>
            <textarea rows={3} placeholder="Explicação mais detalhada de segurança, ainda em linguagem acessível ao cliente..."
              value={value.securityDetails ?? ''} onChange={e => set('securityDetails', e.target.value)}
              className={textareaClass} />
          </div>
        </div>
      )}

      {subTab === 'modulos' && (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-400">Visível para cliente</span>
            <div className="flex gap-2">
              <button type="button" onClick={applyDefaultModules}
                className="inline-flex items-center gap-1 rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-xs font-bold text-white/70 hover:bg-white/[0.10]">
                <LayoutGrid size={12} aria-hidden="true" />Adicionar módulos padrão
              </button>
              <button type="button" onClick={addModule}
                className="inline-flex items-center gap-1 rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-xs font-bold text-white/70 hover:bg-white/[0.10]">
                <Plus size={12} aria-hidden="true" />Adicionar módulo
              </button>
            </div>
          </div>

          {modules.length === 0 ? (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-center">
              <p className="text-xs text-white/40">Nenhum módulo cadastrado ainda.</p>
              <p className="mx-auto mt-1 max-w-xs text-[11px] text-white/25">Adicione os módulos que fazem parte do projeto para o cliente acompanhar o progresso.</p>
              <div className="mt-3 flex justify-center gap-2">
                <button type="button" onClick={addModule}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#005BFF]/10 px-3 py-1.5 text-xs font-bold text-[#005BFF] hover:bg-[#005BFF]/20">
                  <Plus size={12} aria-hidden="true" />Adicionar primeiro módulo
                </button>
                <button type="button" onClick={applyDefaultModules}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs font-bold text-white/70 hover:bg-white/[0.10]">
                  <LayoutGrid size={12} aria-hidden="true" />Usar módulos padrão
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {modules.map(m => {
                const Icon = MODULE_ICONS[m.icon ?? ''] ?? LayoutGrid
                const st = getModuleStatusStyle(m.status)
                return (
                  <div key={m.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 transition-colors hover:border-[#005BFF]/30">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <select value={m.icon ?? 'LayoutDashboard'} onChange={e => updateModule(m.id, { icon: e.target.value })}
                          aria-label="Ícone do módulo"
                          className="h-8 w-8 shrink-0 rounded-lg border border-white/[0.08] bg-[#0D1428] text-white/70 outline-none">
                          {Object.keys(MODULE_ICONS).map(name => <option key={name} value={name}>{name}</option>)}
                        </select>
                        <Icon size={14} className="shrink-0 text-white/40" aria-hidden="true" />
                      </div>
                      <button type="button" onClick={() => removeModule(m.id)} aria-label="Remover módulo"
                        className="shrink-0 rounded-lg p-1.5 text-white/25 transition-colors hover:bg-red-500/10 hover:text-red-400">
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                    <label className="sr-only" htmlFor={`mod-name-${m.id}`}>Nome do módulo</label>
                    <input id={`mod-name-${m.id}`} type="text" placeholder="Nome do módulo (ex: Dashboard)" value={m.name}
                      onChange={e => updateModule(m.id, { name: e.target.value })}
                      className={inputClass + (!m.name.trim() ? ' border-red-500/40' : '')} />
                    {!m.name.trim() && <p className="mt-1 text-[10px] text-red-400">Módulo sem nome.</p>}
                    <label className="sr-only" htmlFor={`mod-desc-${m.id}`}>Descrição do módulo</label>
                    <input id={`mod-desc-${m.id}`} type="text" placeholder="Descrição curta" value={m.description ?? ''}
                      onChange={e => updateModule(m.id, { description: e.target.value })}
                      className={inputClass + ' mt-2' + (!m.description?.trim() ? ' border-red-500/40' : '')} />
                    {!m.description?.trim() && <p className="mt-1 text-[10px] text-red-400">Módulo sem descrição.</p>}
                    <div className="mt-2.5 flex items-center gap-2">
                      <select value={m.status} onChange={e => updateModule(m.id, { status: e.target.value as ProjectModule['status'] })}
                        aria-label="Status do módulo"
                        className="h-9 shrink-0 rounded-lg border px-2 text-[11px] font-bold outline-none"
                        style={{ background: st.bg, borderColor: st.border, color: st.color }}>
                        {MODULE_STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value} className="bg-[#0D1428] text-white">{opt.label}</option>)}
                      </select>
                      <input type="range" min={0} max={100} step={5} value={m.progress}
                        aria-label="Progresso do módulo"
                        onChange={e => updateModule(m.id, { progress: Number(e.target.value) })}
                        className="flex-1 accent-[#005BFF]" />
                      <span className="w-9 shrink-0 text-right text-xs font-bold text-white/70">{m.progress}%</span>
                    </div>
                    <button type="button" onClick={() => updateModule(m.id, { visibleToClient: m.visibleToClient === false })}
                      className="mt-2.5">
                      <VisibilityBadge visible={m.visibleToClient !== false} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {subTab === 'relatorio' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-400">Visível para cliente</span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-[11px] font-medium text-white/50">
                <input type="checkbox" checked={report.visibleToClient ?? true}
                  onChange={e => setReport({ visibleToClient: e.target.checked })}
                  className="h-3.5 w-3.5 accent-[#005BFF]" />
                Mostrar relatório ao cliente
              </label>
              <button type="button" onClick={applyAutoReport}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#005BFF]/10 px-2.5 py-1.5 text-xs font-bold text-[#005BFF] hover:bg-[#005BFF]/20">
                <Wand2 size={12} aria-hidden="true" />Gerar relatório automático
              </button>
            </div>
          </div>

          {!reportFilled && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center">
              <p className="text-xs text-white/40">Relatório ainda não preenchido.</p>
              <p className="mt-1 text-[11px] text-white/25">Adicione um resumo simples do avanço do projeto.</p>
            </div>
          )}

          <div>
            <label className={labelClass}>Resumo da semana</label>
            <textarea rows={2} placeholder="Ex: Esta semana avançamos na estrutura principal do sistema e organizamos a base do dashboard."
              value={report.weekSummary ?? ''} onChange={e => setReport({ weekSummary: e.target.value })}
              className={textareaClass} />
          </div>
          <div>
            <label className={labelClass}>Avanços realizados</label>
            <textarea rows={2} placeholder="Ex: Protótipo do dashboard concluído e primeiros dados integrados."
              value={report.completedProgress ?? ''} onChange={e => setReport({ completedProgress: e.target.value })}
              className={textareaClass} />
          </div>
          <div>
            <label className={labelClass}>Pontos de atenção</label>
            <textarea rows={2} placeholder="Ex: Aguardando validação do layout final e acesso à API do cliente."
              value={report.risks ?? ''} onChange={e => setReport({ risks: e.target.value })}
              className={textareaClass} />
          </div>
          <div>
            <label className={labelClass}>Próximo marco</label>
            <textarea rows={2} placeholder="Ex: Finalizar dashboard e iniciar desenvolvimento da área de projetos."
              value={report.nextMilestone ?? ''} onChange={e => setReport({ nextMilestone: e.target.value })}
              className={textareaClass} />
          </div>
          <div>
            <label className={labelClass}>Observação final <span className="font-normal text-white/30">(opcional)</span></label>
            <textarea rows={2} placeholder="Observação final para o cliente..."
              value={report.finalNote ?? ''} onChange={e => setReport({ finalNote: e.target.value })}
              className={textareaClass} />
          </div>
        </div>
      )}

      {subTab === 'aprovacao' && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-400">Visível para cliente</span>
            <span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: approvalInfo.bg, color: approvalInfo.color }}>
              {approvalInfo.label}
            </span>
          </div>

          <label className="flex items-center gap-2.5 text-sm font-medium text-white/70">
            <input type="checkbox" checked={value.approvalRequired ?? false}
              onChange={e => set('approvalRequired', e.target.checked)}
              className="h-4 w-4 accent-[#005BFF]" />
            Esta etapa precisa de aprovação do cliente
          </label>

          {value.approvalRequired && (
            <div className="mt-3 space-y-2">
              <label className={labelClass}>Mensagem para o cliente</label>
              <textarea rows={2} placeholder="O que precisa ser aprovado? Ex: Aprovar o protótipo inicial."
                value={value.approvalMessage ?? ''} onChange={e => set('approvalMessage', e.target.value)}
                className={textareaClass} />
              <button type="button" onClick={applySuggestedApprovalMessage}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#005BFF] hover:underline">
                <Wand2 size={11} aria-hidden="true" />Usar mensagem sugerida
              </button>
            </div>
          )}

          {value.approvalStatus && value.approvalStatus !== 'aguardando' && (
            <div className="mt-3 rounded-lg border px-3 py-2 text-xs"
              style={{ borderColor: `${approvalInfo.color}55`, background: `${approvalInfo.color}15`, color: approvalInfo.color }}>
              <p className="font-bold">{approvalInfo.label}</p>
              {value.approvalClientNote && <p className="mt-1 text-white/70">&ldquo;{value.approvalClientNote}&rdquo;</p>}
              {value.approvalRespondedAt && (
                <p className="mt-1 text-white/40">
                  Respondido em {new Date(value.approvalRespondedAt).toLocaleString('pt-BR')}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <p className="border-t border-white/[0.08] pt-3 text-xs text-white/40">
        <strong className="text-white/70">{visibleSecurityCount}</strong> itens de segurança visíveis · <strong className="text-white/70">{visibleModulesCount}</strong> módulos visíveis · Relatório {reportFilled ? 'preenchido' : 'pendente'} · Aprovação: {approvalInfo.label}
      </p>
    </div>
  )
}
