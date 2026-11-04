import type { AccountSettlement, AccountAuditEvent } from '@/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapSettlementRow(row: any): AccountSettlement {
  return {
    id: row.id, accountKind: row.account_kind, accountId: row.account_id, amount: Number(row.amount),
    effectiveDate: row.effective_date, paymentMethod: row.payment_method, reference: row.reference,
    receiptPath: row.receipt_path, notes: row.notes, createdBy: row.created_by,
    reversedAt: row.reversed_at, reversedBy: row.reversed_by, reversalReason: row.reversal_reason,
    createdAt: row.created_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapAuditEventRow(row: any): AccountAuditEvent {
  return {
    id: row.id, accountKind: row.account_kind, accountId: row.account_id, actorId: row.actor_id,
    action: row.action, amount: row.amount !== null ? Number(row.amount) : null,
    previousStatus: row.previous_status, newStatus: row.new_status, reason: row.reason, createdAt: row.created_at,
  }
}
