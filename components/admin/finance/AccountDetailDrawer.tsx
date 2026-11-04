'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, Paperclip, Undo2, Ban, Pencil, Save } from 'lucide-react'
import type { AccountEntry, AccountSettlement, AccountAuditEvent, AccountAuditAction } from '@/types'
import { formatCurrencyBRL, formatDateBR, ACCOUNT_STATUS_LABEL, getAccountStatusStyle, isAccountOverdue } from '@/lib/finance'
import { resolveAccountAttachmentUrl } from '@/lib/services/account-storage'
import SettleAccountModal from './SettleAccountModal'

interface Props {
  account: AccountEntry | null
  onClose: () => void
  onChanged: () => void
}

interface HistoryData { settlements: AccountSettlement[]; events: AccountAuditEvent[] }

const AUDIT_ACTION_LABEL: Record<AccountAuditAction, string> = {
  criado: 'Criado', editado: 'Editado', liquidado: 'Liquidação registrada',
  estorno_liquidacao: 'Liquidação estornada', cancelado: 'Cancelado',
}

type Tab = 'liquidacoes' | 'documentos' | 'historico'

export default function AccountDetailDrawer({ account, onClose, onChanged }: Props) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [tab, setTab] = useState<Tab>('liquidacoes')
  const [history, setHistory] = useState<HistoryData | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [showSettle, setShowSettle] = useState(false)
  const [editing, setEditing] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Campos de edição (só carregam com valores atuais ao entrar em modo edição)
  const [editDescription, setEditDescription] = useState('')
  const [editDueDate, setEditDueDate] = useState('')
  const [editNotes, setEditNotes] = useState('')

  const open = account !== null

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    titleRef.current?.focus()
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  useEffect(() => {
    // Busca síncrona à troca de conta selecionada — não dá pra derivar
    // durante o render porque depende de fetch assíncrono ao servidor.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!account) { setHistory(null); return }
    setTab('liquidacoes'); setEditing(false); setActionError(null)
    setLoadingHistory(true)
    fetch(`/api/admin/accounts/${account.kind}/${account.id}/history`)
      .then(r => r.json())
      .then((data: HistoryData) => setHistory(data))
      .finally(() => setLoadingHistory(false))
  }, [account])

  if (!account) return null

  const balance = account.amount - account.amountSettled
  const overdue = isAccountOverdue(account.dueDate, account.status)
  const style = getAccountStatusStyle(account.status)
  const canEdit   = account.status === 'pendente' && account.amountSettled === 0
  const canSettle = account.status !== 'cancelado' && balance > 0.001
  const canCancel = account.status !== 'cancelado' && account.amountSettled === 0

  const startEdit = () => {
    setEditDescription(account.description)
    setEditDueDate(account.dueDate ?? '')
    setEditNotes(account.notes ?? '')
    setEditing(true)
  }

  const saveEdit = async () => {
    setBusy(true); setActionError(null)
    try {
      const res = await fetch(`/api/admin/accounts/${account.kind}/${account.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: editDescription, dueDate: editDueDate || null, notes: editNotes || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao editar.')
      setEditing(false)
      onChanged()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Falha ao editar.')
    } finally {
      setBusy(false)
    }
  }

  const handleCancel = async () => {
    const reason = window.prompt('Motivo do cancelamento:')
    if (!reason || !reason.trim()) return
    setBusy(true); setActionError(null)
    try {
      const res = await fetch(`/api/admin/accounts/${account.kind}/${account.id}/cancel`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao cancelar.')
      onChanged()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Falha ao cancelar.')
    } finally {
      setBusy(false)
    }
  }

  const handleReverse = async (settlementId: string) => {
    const reason = window.prompt('Motivo do estorno desta liquidação:')
    if (!reason || !reason.trim()) return
    setBusy(true); setActionError(null)
    try {
      const res = await fetch(`/api/admin/accounts/settlements/${settlementId}/reverse`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao estornar.')
      onChanged()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Falha ao estornar.')
    } finally {
      setBusy(false)
    }
  }

  const openAttachment = async (path: string) => {
    const url = await resolveAccountAttachmentUrl(path)
    if (url) window.open(url, '_blank')
    else setActionError('Não foi possível abrir o arquivo.')
  }

  return (
    <>
      <AnimatePresence>
        <motion.div key="account-drawer-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

        <motion.div key="account-drawer-panel" initial={{ opacity: 0, x: 32 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 32 }}
          transition={{ duration: 0.22 }} role="dialog" aria-modal="true" aria-labelledby="account-drawer-title"
          className="fixed inset-y-0 right-0 z-[70] flex w-full flex-col overflow-y-auto border-l border-white/[0.08] bg-[#0F172A] shadow-[0_30px_100px_rgba(0,0,0,0.55)] sm:w-[70%] lg:w-[500px]">

          <div className="shrink-0 border-b border-white/[0.08] p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ color: style.color, background: style.bg }}>
                  {ACCOUNT_STATUS_LABEL[account.status]}{overdue && ' · Atrasada'}
                </span>
                <h2 id="account-drawer-title" ref={titleRef} tabIndex={-1} className="mt-2 truncate text-lg font-bold text-white outline-none">
                  {account.description}
                </h2>
                <p className="text-xs text-white/40">{account.kind === 'payable' ? 'Conta a pagar' : 'Conta a receber'} · Origem: Manual{account.reference && ` · Ref: ${account.reference}`}</p>
              </div>
              <button type="button" onClick={onClose} aria-label="Fechar detalhe" className="shrink-0 rounded-lg p-1.5 text-white/40 hover:bg-white/[0.06] hover:text-white">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-5 p-5">
            {/* ── Resumo ── */}
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              {editing ? (
                <div className="space-y-3">
                  <div>
                    <label htmlFor="edit-desc" className="mb-1 block text-xs font-semibold text-white/40">Descrição</label>
                    <input id="edit-desc" value={editDescription} onChange={e => setEditDescription(e.target.value)}
                      className="w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-white outline-none" />
                  </div>
                  <div>
                    <label htmlFor="edit-due" className="mb-1 block text-xs font-semibold text-white/40">Vencimento</label>
                    <input id="edit-due" type="date" value={editDueDate} onChange={e => setEditDueDate(e.target.value)}
                      className="w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-white outline-none" />
                  </div>
                  <div>
                    <label htmlFor="edit-notes" className="mb-1 block text-xs font-semibold text-white/40">Observações</label>
                    <textarea id="edit-notes" value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={2}
                      className="w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-white outline-none" />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-white/[0.10] px-3 py-1.5 text-xs font-semibold text-white/60">Cancelar</button>
                    <button type="button" onClick={saveEdit} disabled={busy}
                      className="flex items-center gap-1.5 rounded-lg bg-[#005BFF] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                      <Save size={12} aria-hidden="true" />Salvar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-y-2 text-xs">
                  <span className="text-white/40">Valor original</span><span className="text-right text-white/80">{formatCurrencyBRL(account.amount)}</span>
                  <span className="text-white/40">Valor liquidado</span><span className="text-right text-white/80">{formatCurrencyBRL(account.amountSettled)}</span>
                  <span className="text-white/40">Saldo em aberto</span><span className="text-right font-semibold text-white">{formatCurrencyBRL(balance)}</span>
                  <span className="text-white/40">Emissão</span><span className="text-right text-white/80">{formatDateBR(account.createdAt.slice(0, 10))}</span>
                  <span className="text-white/40">Vencimento</span><span className="text-right text-white/80">{account.dueDate ? formatDateBR(account.dueDate) : '—'}</span>
                  <span className="text-white/40">{account.kind === 'payable' ? 'Categoria/fornecedor' : 'Cliente/pagador'}</span>
                  <span className="text-right text-white/80">{account.category ?? account.payerName ?? '—'}</span>
                  <span className="text-white/40">Moeda</span><span className="text-right text-white/80">BRL</span>
                </div>
              )}
            </div>

            {/* ── Ações ── */}
            {!editing && (
              <div className="flex flex-wrap gap-2">
                {canEdit && (
                  <button type="button" onClick={startEdit} className="flex items-center gap-1.5 rounded-xl border border-white/[0.10] px-3 py-1.5 text-xs font-semibold text-white/60 hover:text-white">
                    <Pencil size={12} aria-hidden="true" />Editar
                  </button>
                )}
                {canSettle && (
                  <button type="button" onClick={() => setShowSettle(true)}
                    className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-3 py-1.5 text-xs font-bold text-white">
                    Registrar {account.kind === 'payable' ? 'pagamento' : 'recebimento'}
                  </button>
                )}
                {canCancel && (
                  <button type="button" onClick={handleCancel} disabled={busy} className="flex items-center gap-1.5 rounded-xl border border-[#EF4444]/30 px-3 py-1.5 text-xs font-semibold text-[#F87171] disabled:opacity-50">
                    <Ban size={12} aria-hidden="true" />Cancelar lançamento
                  </button>
                )}
              </div>
            )}
            {actionError && <p className="text-xs text-[#F87171]">{actionError}</p>}

            {/* ── Abas ── */}
            <div>
              <div className="mb-3 flex gap-1.5 border-b border-white/[0.08]">
                {([['liquidacoes', 'Liquidações'], ['documentos', 'Documentos'], ['historico', 'Histórico']] as const).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setTab(k)}
                    className={`border-b-2 px-3 py-2 text-xs font-semibold transition-all ${tab === k ? 'border-[#005BFF] text-white' : 'border-transparent text-white/40 hover:text-white/70'}`}>
                    {label}
                  </button>
                ))}
              </div>

              {loadingHistory ? (
                <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-white/30" /></div>
              ) : (
                <>
                  {tab === 'liquidacoes' && (
                    history?.settlements.length ? (
                      <div className="space-y-2">
                        {history.settlements.map(s => (
                          <div key={s.id} className={`rounded-xl border p-3 text-xs ${s.reversedAt ? 'border-white/[0.05] bg-white/[0.01] opacity-50' : 'border-white/[0.06] bg-white/[0.02]'}`}>
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-white">{formatCurrencyBRL(s.amount)}</span>
                              <span className="text-white/40">{formatDateBR(s.effectiveDate)}</span>
                            </div>
                            <p className="mt-1 text-white/40">{s.paymentMethod ?? '—'}{s.reference ? ` · ${s.reference}` : ''}</p>
                            {s.reversedAt ? (
                              <p className="mt-1 text-[#F87171]">Estornada em {formatDateBR(s.reversedAt.slice(0, 10))} — {s.reversalReason}</p>
                            ) : (
                              <button type="button" onClick={() => handleReverse(s.id)} disabled={busy}
                                className="mt-2 flex items-center gap-1 text-[#F87171] hover:underline disabled:opacity-50">
                                <Undo2 size={11} aria-hidden="true" />Estornar
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : <p className="py-6 text-center text-xs text-white/30">Nenhuma liquidação registrada.</p>
                  )}

                  {tab === 'documentos' && (
                    <div className="space-y-2">
                      {account.attachmentPath && (
                        <button type="button" onClick={() => openAttachment(account.attachmentPath!)}
                          className="flex w-full items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-left text-xs text-white/70 hover:border-white/20">
                          <Paperclip size={13} aria-hidden="true" />Documento do lançamento
                        </button>
                      )}
                      {history?.settlements.filter(s => s.receiptPath).map(s => (
                        <button key={s.id} type="button" onClick={() => openAttachment(s.receiptPath!)}
                          className="flex w-full items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-left text-xs text-white/70 hover:border-white/20">
                          <Paperclip size={13} aria-hidden="true" />Comprovante de {formatDateBR(s.effectiveDate)}
                        </button>
                      ))}
                      {!account.attachmentPath && !history?.settlements.some(s => s.receiptPath) && (
                        <p className="py-6 text-center text-xs text-white/30">Nenhum documento anexado.</p>
                      )}
                    </div>
                  )}

                  {tab === 'historico' && (
                    history?.events.length ? (
                      <div className="space-y-2">
                        {history.events.map(e => (
                          <div key={e.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-white">{AUDIT_ACTION_LABEL[e.action]}</span>
                              <span className="text-white/40">{new Date(e.createdAt).toLocaleString('pt-BR')}</span>
                            </div>
                            {e.amount !== null && <p className="mt-1 text-white/50">{formatCurrencyBRL(e.amount)}</p>}
                            {e.reason && <p className="mt-1 text-white/40">{e.reason}</p>}
                          </div>
                        ))}
                      </div>
                    ) : <p className="py-6 text-center text-xs text-white/30">Sem histórico registrado.</p>
                  )}
                </>
              )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {showSettle && (
        <SettleAccountModal account={account} onClose={() => setShowSettle(false)} onSettled={() => { onChanged(); }} />
      )}
    </>
  )
}
