'use client'

import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { deleteContact } from '@/app/admin/solicitacoes/actions'
import type { Contact } from '@/app/admin/solicitacoes/page'
import type { User as SupabaseUser } from '@supabase/supabase-js'

export function useContactActions({ user, initialContacts }: { user: SupabaseUser; initialContacts: Contact[] }) {
  // Otimismo: guarda status local sem esperar reload da página
  const [localStatus,   setLocalStatus]   = useState<Record<string, string>>({})
  const [savingId,      setSavingId]      = useState<string | null>(null)
  // Atribuições locais (otimistas): contactId → technicianId | null
  const [localAssignees, setLocalAssignees] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(initialContacts.map(c => [c.id, c.assignee_id ?? null]))
  )
  const [assigningId,   setAssigningId]   = useState<string | null>(null)
  const [respondingContact, setRespondingContact] = useState<Contact | null>(null)
  const [analysisContact,   setAnalysisContact]   = useState<Contact | null>(null)
  const [archiveTarget,     setArchiveTarget]     = useState<Contact | null>(null)
  const [archivingId,       setArchivingId]       = useState<string | null>(null)
  const [deleteTarget,      setDeleteTarget]      = useState<Contact | null>(null)
  const [deletingId,        setDeletingId]        = useState<string | null>(null)
  const [deletedIds,        setDeletedIds]        = useState<Set<string>>(new Set())
  const supabaseRef = useRef(createClient())

  // Merge contacts com overrides locais de status (exclui excluídos permanentemente)
  const contacts = useMemo(
    () => initialContacts
      .filter(c => !deletedIds.has(c.id))
      .map(c => ({ ...c, status: localStatus[c.id] ?? c.status ?? 'novo' })),
    [initialContacts, localStatus, deletedIds]
  )

  // Atualiza status no Supabase + estado local (otimista)
  const handleStatusChange = async (id: string, newStatus: string) => {
    setLocalStatus(prev => ({ ...prev, [id]: newStatus }))
    setSavingId(id)
    try {
      await supabaseRef.current
        .from('contacts')
        .update({ status: newStatus })
        .eq('id', id)
    } catch {
      // Reverte se falhar
      setLocalStatus(prev => { const n = { ...prev }; delete n[id]; return n })
    } finally {
      setSavingId(null)
    }
  }

  /* ── Atribuição de técnico ── */
  const handleAssign = async (contactId: string, techId: string | null) => {
    setLocalAssignees(prev => ({ ...prev, [contactId]: techId }))
    setAssigningId(contactId)
    try {
      await supabaseRef.current
        .from('contacts')
        .update({ assignee_id: techId })
        .eq('id', contactId)
    } catch {
      // Reverte se falhar
      setLocalAssignees(prev => ({ ...prev, [contactId]: initialContacts.find(c => c.id === contactId)?.assignee_id ?? null }))
    } finally {
      setAssigningId(null)
    }
  }

  /* ── Responder: abre modal de resposta ── */
  const handleRespond = (contact: Contact) => setRespondingContact(contact)

  const handleResponseSent = (contactId: string) => {
    setLocalStatus(prev => ({ ...prev, [contactId]: 'respondido' }))
  }

  /* ── Iniciar análise: abre modal de confirmação ── */
  const handleStartAnalysis = (contact: Contact) => setAnalysisContact(contact)

  const handleAnalysisConfirmed = (contactId: string) => {
    setLocalStatus(prev => ({ ...prev, [contactId]: 'em_analise' }))
    setLocalAssignees(prev => ({ ...prev, [contactId]: user.id }))
  }

  /* ── Arquivar: abre confirmação, depois arquiva com opção de desfazer ── */
  const handleArchive = (contact: Contact) => setArchiveTarget(contact)

  const confirmArchive = async () => {
    if (!archiveTarget) return
    const id = archiveTarget.id
    const prevStatus = archiveTarget.status ?? 'novo'
    setArchivingId(id)
    try {
      await supabaseRef.current.from('contacts').update({ status: 'arquivado' }).eq('id', id)
      setLocalStatus(prev => ({ ...prev, [id]: 'arquivado' }))
      toast('Solicitação arquivada.', {
        action: { label: 'Desfazer', onClick: () => handleStatusChange(id, prevStatus) },
      })
      setArchiveTarget(null)
    } catch {
      toast.error('Erro ao arquivar. Tente novamente.')
    } finally {
      setArchivingId(null)
    }
  }

  /* ── Excluir permanentemente (só líder, só arquivados) ── */
  const handleDeletePermanently = (contact: Contact) => setDeleteTarget(contact)

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const id = deleteTarget.id
    setDeletingId(id)
    const result = await deleteContact(id)
    setDeletingId(null)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    setDeletedIds(prev => new Set(prev).add(id))
    toast.success('Solicitação excluída permanentemente.')
    setDeleteTarget(null)
  }

  return {
    contacts,
    localAssignees, assigningId, handleAssign,
    savingId, handleStatusChange,
    respondingContact, setRespondingContact, handleRespond, handleResponseSent,
    analysisContact, setAnalysisContact, handleStartAnalysis, handleAnalysisConfirmed,
    archiveTarget, setArchiveTarget, archivingId, handleArchive, confirmArchive,
    deleteTarget, setDeleteTarget, deletingId, handleDeletePermanently, confirmDelete,
  }
}
