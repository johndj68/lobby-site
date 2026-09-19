'use client'

import { motion } from 'framer-motion'
import {
  Eye, UserCheck, Mail, Check, X, UserPlus, Pencil, Lock, Loader2, Trash2,
} from 'lucide-react'
import { gradients } from '@/lib/design-tokens'
import type { ClientProject, Technician } from '@/types'

export interface Client {
  id: string; full_name?: string; email?: string; company_name?: string; phone?: string; document?: string
}

export interface TeamRow {
  id: string; project_id: string; technician_id: string
  status: 'pending' | 'accepted'; invited_by?: string | null
}

export const STATUSES = [
  { value: 'solicitado',         label: 'Solicitado'         },
  { value: 'em_analise',         label: 'Em análise'         },
  { value: 'em_desenvolvimento', label: 'Em desenvolvimento' },
  { value: 'em_validacao',       label: 'Em validação'       },
  { value: 'concluido',          label: 'Concluído'          },
  { value: 'pausado',            label: 'Pausado'            },
]

export const STATUS_COLOR: Record<string, string> = {
  solicitado: '#60A5FA', em_analise: '#A78BFA', em_desenvolvimento: '#005BFF',
  em_validacao: '#F59E0B', concluido: '#10B981', pausado: '#64748B',
}

function fmtDoc(d: string) {
  return d.length === 11
    ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    : d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

interface Props {
  project:          ClientProject
  index:            number
  fallbackClient:   Client | null
  projectTeam:      TeamRow[]
  techMap:          Record<string, Technician>
  technicians:      Technician[]
  currentUserId:    string
  accepting:        string | null
  addTechFor:       string | null
  deleting:         string | null
  onAccept:            (projectId: string) => void
  onToggleAddTechMenu: (projectId: string) => void
  onAddTechnician:      (projectId: string, technicianId: string) => void
  onAcceptInvite:       (projectId: string) => void
  onDeclineInvite:      (projectId: string) => void
  onRemoveTechnician:   (projectId: string, technicianId: string) => void
  onEdit:           (project: ClientProject) => void
  onRequestDelete:  (projectId: string) => void
}

/**
 * Card de um projeto de cliente na lista principal — nome, progresso,
 * equipe (aceitar/convidar/remover técnico), dados do cliente e ações.
 * Extraído de ProjetosClientesClient.tsx, que tinha ~170 linhas desse
 * bloco dentro de um único .map().
 */
export default function ProjectClientCard({
  project: p, index, fallbackClient, projectTeam, techMap, technicians, currentUserId,
  accepting, addTechFor, deleting,
  onAccept, onToggleAddTechMenu, onAddTechnician, onAcceptInvite, onDeclineInvite, onRemoveTechnician,
  onEdit, onRequestDelete,
}: Props) {
  const color = STATUS_COLOR[p.status] ?? '#64748B'

  // Prioridade: dados embutidos no projeto (preenchidos na solicitação).
  // Fallback: perfil do cliente no banco.
  const cEmail   = p.client_email    || fallbackClient?.email        || null
  const cName    = p.client_name     || fallbackClient?.full_name    || cEmail?.split('@')[0] || `Cliente ${p.client_id.slice(0, 6)}`
  const cPhone   = p.client_phone    || fallbackClient?.phone        || null
  const cCompany = p.client_company  || fallbackClient?.company_name || null
  const cDoc     = p.client_document || fallbackClient?.document     || null

  const acceptedTeam = projectTeam.filter(t => t.status === 'accepted')
  const pendingTeam  = projectTeam.filter(t => t.status === 'pending')
  const myInvite     = projectTeam.find(t => t.technician_id === currentUserId && t.status === 'pending')
  const isProjectClaimed = !!p.lead_technician_id
  const isMember     = acceptedTeam.some(t => t.technician_id === currentUserId)
  const canEdit       = !isProjectClaimed || isMember
  const invitedIds    = projectTeam.map(t => t.technician_id)

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}
      className="rounded-2xl border border-white/[0.07] bg-white/[0.03]">
      <div className="h-0.5 w-full rounded-t-2xl" style={{ background: `linear-gradient(to right, ${color}, ${color}44)` }} />
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">

        {/* Left: project info */}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border px-2 py-0.5 text-[10px] font-bold"
              style={{ borderColor: `${color}33`, background: `${color}14`, color }}>
              {STATUSES.find(s => s.value === p.status)?.label ?? p.status}
            </span>
            {p.category && <span className="text-[10px] text-white/30">{p.category}</span>}
            {!canEdit && (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-white/40">
                <Eye size={9} />Somente leitura
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-white">{p.title}</p>
          <div className="flex items-center gap-2">
            <div className="relative h-1.5 w-32 overflow-hidden rounded-full bg-white/[0.08]">
              <div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${p.progress}%`, background: color }} />
            </div>
            <span className="text-[10px] text-white/35">{p.progress}%</span>
          </div>

          {/* Equipe do projeto */}
          <div className="pt-1">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-white/25">Equipe</p>
            {acceptedTeam.length === 0 && pendingTeam.length === 0 ? (
              <span className="text-[11px] text-white/30">Ninguém aceitou ainda</span>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                {acceptedTeam.map(t => {
                  const tech = techMap[t.technician_id]
                  const isLead = p.lead_technician_id === t.technician_id
                  return (
                    <span key={t.id}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${isLead ? 'bg-[#005BFF]/15 text-[#60A5FA]' : 'bg-white/[0.06] text-white/60'}`}>
                      <UserCheck size={9} />
                      {tech?.full_name ?? tech?.email ?? 'Técnico'}
                      {isLead && ' · líder'}
                      {isMember && !isLead && (
                        <button type="button" onClick={() => onRemoveTechnician(p.id, t.technician_id)}
                          className="ml-0.5 text-white/30 hover:text-red-400 transition-colors">
                          <X size={9} />
                        </button>
                      )}
                    </span>
                  )
                })}
                {pendingTeam.map(t => {
                  const tech = techMap[t.technician_id]
                  return (
                    <span key={t.id}
                      className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#F59E0B]/30 bg-[#F59E0B]/10 px-2 py-0.5 text-[10px] font-semibold text-[#F59E0B]">
                      <Mail size={9} />
                      {tech?.full_name ?? tech?.email ?? 'Técnico'} · convidado
                    </span>
                  )
                })}
              </div>
            )}
          </div>

          {/* Convite pendente para o usuário atual */}
          {myInvite && (
            <div className="flex items-center gap-2 rounded-xl border border-[#F59E0B]/25 bg-[#F59E0B]/10 px-3 py-2">
              <Mail size={13} className="shrink-0 text-[#F59E0B]" />
              <p className="flex-1 text-[11px] text-[#F59E0B]">Você foi convidado para esse projeto.</p>
              <button type="button" onClick={() => onAcceptInvite(p.id)}
                className="inline-flex items-center gap-1 rounded-lg bg-[#F59E0B] px-2.5 py-1 text-[10px] font-bold text-[#0D1428] hover:opacity-90 transition-opacity">
                <Check size={10} />Aceitar
              </button>
              <button type="button" onClick={() => onDeclineInvite(p.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-[#F59E0B]/30 px-2.5 py-1 text-[10px] font-semibold text-[#F59E0B]/70 hover:text-[#F59E0B] transition-colors">
                <X size={10} />Recusar
              </button>
            </div>
          )}
        </div>

        {/* Center: client info */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-xs space-y-1 sm:min-w-[220px]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-1.5">Cliente</p>
          <p className="font-semibold text-white">{cName}</p>
          {cCompany && <p className="text-white/50">{cCompany}</p>}
          <p className="text-white/40">{cEmail}</p>
          {cPhone && <p className="text-white/40">{cPhone}</p>}
          {cDoc && (
            <p className="text-white/30 text-[10px] font-mono">{fmtDoc(cDoc)}</p>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          {!isProjectClaimed && (
            <button type="button" disabled={accepting === p.id} onClick={() => onAccept(p.id)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-3 py-1.5 text-xs font-bold text-white shadow-[0_4px_12px_rgba(0,91,255,0.25)] transition-all hover:-translate-y-0.5 disabled:opacity-60">
              {accepting === p.id ? <><Loader2 size={11} className="animate-spin" />Aceitando...</> : <><UserCheck size={12} />Aceitar projeto</>}
            </button>
          )}
          {isMember && (
            <div className="relative">
              <button type="button" onClick={() => onToggleAddTechMenu(p.id)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#10B981]/10 px-3 py-1.5 text-xs font-semibold text-[#34D399] hover:bg-[#10B981]/20 transition-all">
                <UserPlus size={12} />Adicionar técnico
              </button>
              {addTechFor === p.id && (
                <div className="absolute right-0 z-20 mt-1.5 w-56 overflow-hidden rounded-xl border border-white/[0.08] bg-[#0D1428] shadow-[0_12px_40px_rgba(0,0,0,0.40)]">
                  {technicians.filter(t => !invitedIds.includes(t.id)).length === 0 ? (
                    <p className="px-3 py-2.5 text-xs text-white/30">Todos já foram convidados</p>
                  ) : (
                    technicians.filter(t => !invitedIds.includes(t.id)).map(t => (
                      <button key={t.id} type="button" onClick={() => onAddTechnician(p.id, t.id)}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs text-white/80 hover:bg-white/[0.06] transition-colors">
                        <UserPlus size={11} className="text-white/30" />
                        {t.full_name ?? t.email}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
          {canEdit ? (
            <button type="button" onClick={() => onEdit(p)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#A78BFA]/10 px-3 py-1.5 text-xs font-semibold text-[#A78BFA] hover:bg-[#A78BFA]/20 transition-all">
              <Pencil size={12} />Editar
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-white/25">
              <Lock size={11} />Sem acesso de edição
            </span>
          )}
          <button type="button" onClick={() => onRequestDelete(p.id)} disabled={deleting === p.id}
            className="inline-flex items-center gap-1.5 rounded-xl bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50">
            {deleting === p.id ? <><Loader2 size={11} className="animate-spin" />Excluindo...</> : <><Trash2 size={12} />Excluir</>}
          </button>
        </div>
      </div>
    </motion.div>
  )
}
