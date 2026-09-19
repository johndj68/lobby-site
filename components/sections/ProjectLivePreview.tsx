'use client'

import { useState } from 'react'
import {
  Flag, CheckCircle2, AlertTriangle, MessageCircle,
  ShieldCheck, History as HistoryIcon, Sparkles, Monitor, Smartphone, Layers, Paperclip, FileText, ArrowRight,
  LayoutGrid,
} from 'lucide-react'
import { STATUS_CFG, DEFAULT_STATUS_CFG, PHASE_STATUS_STYLE, normalizeSecurityItems, getModuleStatusStyle } from '@/lib/project-status'
import { DEFAULT_PROJECT_PHASES } from '@/types'
import type { ClientProgress } from '@/types'
import SignedVisualImage from './SignedVisualImage'

interface Props {
  title:       string
  status:      string
  progress:    number
  deadline:    string
  description?: string
  value:       ClientProgress
  variant:     'compact' | 'full'
  onViewFullPreview?: () => void
  onViewSecurityExtras?: () => void
}

function getDeadlineAlert(deadline?: string): { title: string; message: string; tone: 'late' | 'ok' } | null {
  if (!deadline) return null
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000)
  if (days < 0) {
    return { title: 'Atrasado', message: `Prazo vencido há ${Math.abs(days)} dia${Math.abs(days) > 1 ? 's' : ''}`, tone: 'late' }
  }
  return { title: 'No prazo', message: 'As etapas estão seguindo conforme o planejamento.', tone: 'ok' }
}

export default function ProjectLivePreview({ title, status, progress, deadline, description, value, variant, onViewFullPreview, onViewSecurityExtras }: Props) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const cfg = STATUS_CFG[status] ?? DEFAULT_STATUS_CFG
  const phases = value.phases?.length ? value.phases : DEFAULT_PROJECT_PHASES
  const deadlineAlert = getDeadlineAlert(deadline)
  const pending = value.clientPendingItems ?? []
  const securityItems = normalizeSecurityItems(value.securityItems).filter(it => it.checked && it.visibleToClient !== false)
  const modules = (value.modules ?? [])
    .map((m, i) => m.id ? m : { ...m, id: `mod-${i}` })
    .filter(m => m.visibleToClient !== false)
  const approvalPending = value.approvalRequired && (!value.approvalStatus || value.approvalStatus === 'aguardando')
  const history = value.updateHistory ?? []
  const currentPhase = phases.find(p => p.status === 'atual')
  const currentPhaseIndex = phases.findIndex(p => p.status === 'atual')
  const nextPhase = phases[currentPhaseIndex + 1] ?? phases.find(p => p.status === 'proximo')
  const materialsCount = (value.clientVisualAssets?.images ?? []).filter(i => i.phase === currentPhase?.title).length
    + (value.clientVisualAssets?.documents ?? []).filter(d => d.phase === currentPhase?.title).length

  const va = value.clientVisualAssets ?? {}
  const visibleImages = (va.images ?? []).filter(i => i.visibleToClient !== false)
  const visibleDocs = (va.documents ?? []).filter(d => d.visibleToClient !== false)
  const totalVisualMaterials = visibleImages.length + visibleDocs.length
    + (va.flowSteps ?? []).filter(i => i.visibleToClient !== false).length
    + (va.organizationChart ?? []).filter(i => i.visibleToClient !== false).length
    + (va.screenMap ?? []).filter(i => i.visibleToClient !== false).length
    + (va.deliverables ?? []).filter(i => i.visibleToClient !== false).length

  return (
    <div className="rounded-3xl border border-[#E3E7F0] bg-[#F7F8FC] p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#94A3B8]">
          <Sparkles size={11} aria-hidden="true" />
          Prévia do cliente
        </p>
        <div className="flex items-center gap-1 rounded-lg border border-[#E3E7F0] bg-white p-0.5">
          <button type="button" onClick={() => setDevice('desktop')} aria-label="Ver como desktop"
            className={`rounded-md p-1 transition-colors ${device === 'desktop' ? 'bg-[#005BFF]/10 text-[#005BFF]' : 'text-[#94A3B8] hover:text-[#5D6475]'}`}>
            <Monitor size={12} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setDevice('mobile')} aria-label="Ver como mobile"
            className={`rounded-md p-1 transition-colors ${device === 'mobile' ? 'bg-[#005BFF]/10 text-[#005BFF]' : 'text-[#94A3B8] hover:text-[#5D6475]'}`}>
            <Smartphone size={12} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className={device === 'mobile' ? 'mx-auto max-w-[300px]' : ''}>
      <div className="space-y-4">
        {/* Header */}
        <div className="rounded-2xl border border-[#E3E7F0] bg-white p-4">
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold"
            style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}>
            <cfg.icon size={10} aria-hidden="true" />
            {cfg.label}
          </span>
          <p className="mt-2 text-base font-bold text-[#0B1020]">{title || 'Título do projeto'}</p>
          {variant === 'full' && description && (
            <p className="mt-1 text-xs text-[#5D6475]">{description}</p>
          )}
        </div>

        {/* Progresso */}
        <div className="rounded-2xl border border-[#E3E7F0] bg-white p-4">
          <p className="text-xs font-semibold text-[#5D6475]">Progresso do projeto</p>
          <p className="text-xl font-bold text-[#0B1020]">{progress}%</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#F1F3F9]">
            <div className="h-full rounded-full bg-gradient-to-r from-[#005BFF] to-[#7B2CFF]" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Alerta de prazo */}
        {deadlineAlert && (
          <div className={`flex items-start gap-2 rounded-2xl border p-3 ${
            deadlineAlert.tone === 'late' ? 'border-[#EF4444]/25 bg-[#EF4444]/[0.05]' : 'border-[#10B981]/25 bg-[#10B981]/[0.05]'
          }`}>
            {deadlineAlert.tone === 'late'
              ? <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[#EF4444]" aria-hidden="true" />
              : <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-[#10B981]" aria-hidden="true" />}
            <div>
              <p className="text-xs font-bold" style={{ color: deadlineAlert.tone === 'late' ? '#EF4444' : '#10B981' }}>{deadlineAlert.title}</p>
              <p className="text-[11px] text-[#5D6475]">{deadlineAlert.message}</p>
            </div>
          </div>
        )}

        {/* Resumo */}
        {value.projectSummary && (
          <div className="flex items-start gap-2 rounded-2xl border border-[#005BFF]/15 bg-[#005BFF]/[0.04] p-3">
            <MessageCircle size={14} className="mt-0.5 shrink-0 text-[#005BFF]" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-[#3A4256]">{value.projectSummary}</p>
          </div>
        )}

        {/* Etapa atual */}
        {currentPhase && (
          <div className="rounded-2xl border border-[#005BFF]/15 bg-white p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">Etapa atual</p>
            <p className="text-sm font-bold text-[#0B1020]">{currentPhase.title}</p>
            {currentPhase.description && <p className="mt-0.5 text-xs text-[#5D6475]">{currentPhase.description}</p>}
          </div>
        )}

        {/* Próxima etapa */}
        {(nextPhase || value.nextMilestone) && (
          <div className="flex items-start gap-2 rounded-2xl border border-[#7B2CFF]/15 bg-[#7B2CFF]/[0.04] p-3">
            <Flag size={14} className="mt-0.5 shrink-0 text-[#7B2CFF]" aria-hidden="true" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">Próxima etapa</p>
              <p className="text-xs font-bold text-[#0B1020]">{value.nextMilestone || nextPhase?.title}</p>
              {value.nextMilestoneDate && (
                <p className="text-[11px] text-[#5D6475]">Previsão: {new Date(value.nextMilestoneDate).toLocaleDateString('pt-BR')}</p>
              )}
              {value.nextMilestoneDescription && <p className="mt-0.5 text-[11px] text-[#5D6475]">{value.nextMilestoneDescription}</p>}
            </div>
          </div>
        )}

        {/* Timeline simples */}
        <div className="rounded-2xl border border-[#E3E7F0] bg-white p-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[#0B1020]">
            <Layers size={12} className="text-[#7B2CFF]" aria-hidden="true" />
            Linha do tempo
          </p>
          <ul className="space-y-1.5">
            {phases.filter(p => p.visibleToClient !== false).map(p => {
              const style = PHASE_STATUS_STYLE[p.status] ?? PHASE_STATUS_STYLE.proximo
              return (
                <li key={p.title} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: style.color }} aria-hidden="true" />
                    <span className="text-[#3A4256]">{p.title}</span>
                  </span>
                  <span className="text-[10px] font-semibold" style={{ color: style.color }}>{style.label}</span>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Materiais visuais (global) */}
        {totalVisualMaterials > 0 && (
          <div className="rounded-2xl border border-[#E3E7F0] bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-[#3A4256]">
                <span className="font-bold">{totalVisualMaterials}</span> material{totalVisualMaterials > 1 ? 'is' : ''} disponíve{totalVisualMaterials > 1 ? 'is' : 'l'}
              </p>
              {onViewFullPreview && (
                <button type="button" onClick={onViewFullPreview}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[#005BFF] hover:underline">
                  Ver todos os materiais<ArrowRight size={11} aria-hidden="true" />
                </button>
              )}
            </div>
            {(visibleImages.length > 0 || visibleDocs.length > 0) && (
              <div className="mt-2 flex items-center gap-1.5">
                {visibleImages.slice(0, 2).map(img => (
                  <SignedVisualImage key={img.id} src={img.url} alt={img.title} className="h-10 w-10 rounded-lg border border-[#E3E7F0] object-cover" />
                ))}
                {visibleDocs.length > 0 && (
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#E3E7F0] bg-[#F7F8FC]">
                    <FileText size={14} className="text-[#60A5FA]" aria-hidden="true" />
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Materiais */}
        {materialsCount > 0 && (
          <div className="flex items-center gap-2 rounded-2xl border border-[#E3E7F0] bg-white p-3">
            <Paperclip size={13} className="shrink-0 text-[#005BFF]" aria-hidden="true" />
            <p className="text-xs text-[#3A4256]">Materiais desta etapa: <span className="font-bold">{materialsCount} arquivo{materialsCount > 1 ? 's' : ''}</span></p>
          </div>
        )}

        {variant === 'full' && (
          <>
            {/* Pendências */}
            <div className="rounded-2xl border border-[#F59E0B]/25 bg-[#F59E0B]/[0.05] p-4">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-[#0B1020]">
                <AlertTriangle size={13} className="text-[#F59E0B]" aria-hidden="true" />
                Aguardando sua ação
              </p>
              {pending.length === 0 ? (
                <p className="text-[11px] text-[#10B981]">Nenhuma pendência no momento.</p>
              ) : (
                <ul className="space-y-1">
                  {pending.map((item, i) => <li key={i} className="text-[11px] text-[#3A4256]">• {item}</li>)}
                </ul>
              )}
            </div>

            {/* Segurança resumida */}
            {value.securityVisibleToClient !== false && (value.securitySummary || securityItems.length > 0) && (
              <div className="rounded-2xl border border-[#E3E7F0] bg-white p-4">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-[#0B1020]">
                  <ShieldCheck size={13} className="text-[#005BFF]" aria-hidden="true" />
                  Segurança do projeto
                </p>
                {value.securitySummary && <p className="text-[11px] text-[#5D6475]">{value.securitySummary}</p>}
                {securityItems.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {securityItems.slice(0, 3).map(it => (
                      <li key={it.id} className="flex items-center gap-1.5 text-[11px] text-[#3A4256]">
                        <CheckCircle2 size={11} className="shrink-0 text-[#10B981]" aria-hidden="true" />{it.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Módulos do projeto */}
            {modules.length > 0 && (
              <div className="rounded-2xl border border-[#E3E7F0] bg-white p-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-[#0B1020]">
                    <LayoutGrid size={13} className="text-[#7B2CFF]" aria-hidden="true" />
                    Módulos do projeto
                  </p>
                  {onViewSecurityExtras && (
                    <button type="button" onClick={onViewSecurityExtras}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-[#005BFF] hover:underline">
                      Ver todos<ArrowRight size={11} aria-hidden="true" />
                    </button>
                  )}
                </div>
                <ul className="space-y-1.5">
                  {modules.slice(0, 3).map(m => {
                    const st = getModuleStatusStyle(m.status)
                    return (
                      <li key={m.id} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-[#3A4256]">{m.name || 'Sem nome'}</span>
                        <span className="font-semibold" style={{ color: st.color }}>{st.label}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {/* Aprovação pendente */}
            {approvalPending && (
              <div className="rounded-2xl border border-[#F59E0B]/25 bg-[#F59E0B]/[0.05] p-4">
                <p className="flex items-center gap-1.5 text-xs font-bold text-[#F59E0B]">
                  <CheckCircle2 size={13} aria-hidden="true" />
                  Aprovação pendente
                </p>
                <p className="mt-1 text-[11px] text-[#5D6475]">{value.approvalMessage || 'Aguardando sua aprovação para continuarmos para a próxima etapa.'}</p>
              </div>
            )}

            {/* Histórico */}
            {history.length > 0 && (
              <div className="rounded-2xl border border-[#E3E7F0] bg-white p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[#0B1020]">
                  <HistoryIcon size={13} className="text-[#005BFF]" aria-hidden="true" />
                  Histórico de atualizações
                </p>
                <ul className="space-y-2">
                  {history.slice(0, 3).map((h, i) => (
                    <li key={i} className="text-[11px]">
                      <span className="font-semibold text-[#0B1020]">{h.title}</span>
                      <span className="ml-1 text-[#94A3B8]">· {new Date(h.date).toLocaleDateString('pt-BR')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <p className="text-center text-[11px] text-[#94A3B8]">Você verá novas atualizações aqui.</p>
      </div>
      </div>
    </div>
  )
}
