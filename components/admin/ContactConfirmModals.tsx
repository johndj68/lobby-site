'use client'

import { Archive, Trash2 } from 'lucide-react'
import ConfirmDialog from './ConfirmDialog'
import type { Contact } from '@/app/admin/solicitacoes/page'

interface Props {
  archiveTarget: Contact | null
  archivingId:   string | null
  onCancelArchive:  () => void
  onConfirmArchive: () => void
  deleteTarget:  Contact | null
  deletingId:    string | null
  onCancelDelete:  () => void
  onConfirmDelete: () => void
}

export default function ContactConfirmModals({
  archiveTarget, archivingId, onCancelArchive, onConfirmArchive,
  deleteTarget, deletingId, onCancelDelete, onConfirmDelete,
}: Props) {
  return (
    <>
      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(open) => !open && onCancelArchive()}
        icon={Archive}
        variant="neutral"
        title="Arquivar solicitação?"
        description="Ela sairá da lista principal, mas poderá ser encontrada em solicitações arquivadas."
        confirmLabel={<><Archive size={15} />Arquivar</>}
        confirmingLabel="Arquivando..."
        busy={!!archivingId}
        onConfirm={onConfirmArchive}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && onCancelDelete()}
        icon={Trash2}
        title="Excluir permanentemente?"
        description={
          deleteTarget && (
            <>
              A solicitação de <span className="font-semibold text-white/80">{deleteTarget.name}</span>,
              junto com respostas e histórico, será apagada para sempre. Esta ação não pode ser desfeita.
            </>
          )
        }
        confirmLabel={<><Trash2 size={15} />Sim, excluir</>}
        confirmingLabel="Excluindo..."
        busy={!!deletingId}
        onConfirm={onConfirmDelete}
      />
    </>
  )
}
