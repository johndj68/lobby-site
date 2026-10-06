'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Plus, Pencil, Eye } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { colors } from '@/lib/design-tokens'
import SituacaoRecebimento from './SituacaoRecebimento'
import DestinoRepasseCard from './DestinoRepasseCard'
import HistoricoRecebimento from './HistoricoRecebimento'
import ComoFuncionamRepasses from './ComoFuncionamRepasses'
import RecebimentoFormSheet from './RecebimentoFormSheet'
import PendingRequestSheet from './PendingRequestSheet'
import { resolveSituacao, type DestinationDetail, type HistoryEvent } from './types'

interface DestinationRpcRow {
  configured: boolean; payout_method: string | null; account_holder: string | null
  person_type: string | null; masked_document: string | null; pix_key_type: string | null
  masked_pix: string | null; bank_name: string | null; masked_bank_agency: string | null
  masked_bank_account: string | null; bank_account_type: string | null; updated_at: string | null
  pending_request_id: string | null; pending_method: string | null; pending_account_holder: string | null
  pending_masked_pix: string | null; pending_bank_name: string | null; pending_masked_bank_account: string | null
  pending_created_at: string | null
}
interface HistoryRpcRow { action: 'created' | 'updated'; description: string; created_at: string; actor_role: HistoryEvent['actorRole'] }

interface Props { partnerId: string | null }

function isPermissionDenied(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'message' in err &&
    typeof (err as { message: unknown }).message === 'string' &&
    (err as { message: string }).message.includes('Sem permissão')
}

export default function ConfiguracoesRecebimentoClient({ partnerId }: Props) {
  const [destination, setDestination] = useState<DestinationDetail | null>(null)
  const [history, setHistory] = useState<HistoryEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [pendingOpen, setPendingOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const [destRes, historyRes] = await Promise.all([
      supabase.rpc('get_partner_payout_destination_detail', { p_partner_id: partnerId }),
      supabase.rpc('get_partner_payout_destination_history', { p_partner_id: partnerId, p_limit: 20 }),
    ]) as unknown as [{ data: DestinationRpcRow[] | null; error: unknown }, { data: HistoryRpcRow[] | null; error: unknown }]

    if (destRes.error) {
      setPermissionDenied(isPermissionDenied(destRes.error))
      setError(!isPermissionDenied(destRes.error))
      setLoading(false); setHasLoaded(true)
      return
    }
    setPermissionDenied(false)
    setError(false)

    const d = destRes.data?.[0]
    setDestination(d ? {
      configured: d.configured,
      payoutMethod: d.payout_method as DestinationDetail['payoutMethod'],
      accountHolder: d.account_holder,
      personType: d.person_type as DestinationDetail['personType'],
      maskedDocument: d.masked_document,
      pixKeyType: d.pix_key_type as DestinationDetail['pixKeyType'],
      maskedPix: d.masked_pix,
      bankName: d.bank_name,
      maskedBankAgency: d.masked_bank_agency,
      maskedBankAccount: d.masked_bank_account,
      bankAccountType: d.bank_account_type as DestinationDetail['bankAccountType'],
      updatedAt: d.updated_at,
      pendingRequestId: d.pending_request_id,
      pendingMethod: d.pending_method as DestinationDetail['pendingMethod'],
      pendingAccountHolder: d.pending_account_holder,
      pendingMaskedPix: d.pending_masked_pix,
      pendingBankName: d.pending_bank_name,
      pendingMaskedBankAccount: d.pending_masked_bank_account,
      pendingCreatedAt: d.pending_created_at,
    } : null)

    setHistory(historyRes.error ? [] : (historyRes.data ?? []).map(h => ({
      action: h.action, description: h.description, createdAt: h.created_at, actorRole: h.actor_role,
    })))

    setLoading(false)
    setHasLoaded(true)
  }, [partnerId])

  useEffect(() => { load() }, [load])

  const situacao = resolveSituacao(destination)
  const hasPending = !!destination?.pendingRequestId
  const actionLabel = hasPending ? 'Ver alteração' : situacao === 'nao_cadastrado' ? 'Cadastrar recebimento' : 'Editar dados'
  const handleHeaderAction = () => { if (hasPending) setPendingOpen(true); else setFormOpen(true) }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold" style={{ color: colors.text }}>Configurações de recebimento</h2>
          <p className="mt-0.5 text-sm" style={{ color: colors.textSecondary }}>
            Configure os dados usados para receber os repasses das suas vendas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => load()} disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            style={{ borderColor: colors.border, color: colors.text, background: colors.card }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} aria-hidden="true" />Atualizar
          </button>
          {!permissionDenied && (
            <button type="button" onClick={handleHeaderAction}
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white" style={{ background: hasPending ? '#F59E0B' : colors.primary }}>
              {hasPending ? <Eye size={14} aria-hidden="true" /> : situacao === 'nao_cadastrado' ? <Plus size={14} aria-hidden="true" /> : <Pencil size={14} aria-hidden="true" />}
              {actionLabel}
            </button>
          )}
        </div>
      </div>

      {permissionDenied ? (
        <div className="rounded-xl border p-4 text-sm" style={{ borderColor: colors.border, color: colors.text }}>
          Você não tem permissão para ver os dados de recebimento deste parceiro.
        </div>
      ) : error ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border p-4 text-sm" style={{ borderColor: '#EF4444' }}>
          Não foi possível carregar os dados de recebimento agora.
          <button onClick={load} className="rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: colors.border, color: colors.text }}>Tentar novamente</button>
        </div>
      ) : (
        <>
          <SituacaoRecebimento situacao={situacao} destination={destination} loading={loading && !hasLoaded} />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
            <div>
              <DestinoRepasseCard data={destination} loading={loading && !hasLoaded} onCreate={() => setFormOpen(true)} onViewPending={() => setPendingOpen(true)} />
              <HistoricoRecebimento events={history} loading={loading && !hasLoaded} />
            </div>
            <div className="flex flex-col gap-4">
              <ComoFuncionamRepasses partnerId={partnerId} />
              <div className="rounded-xl border p-4" style={{ borderColor: colors.border, background: colors.backgroundAlt }}>
                <p className="text-sm font-semibold" style={{ color: colors.text }}>Precisa de ajuda?</p>
                <p className="mt-1 text-xs" style={{ color: colors.textSecondary }}>Fale com a equipe sobre seu cadastro ou o recebimento dos repasses.</p>
                <a href={`/dashboard/suporte${partnerId ? `?parceiro=${partnerId}` : ''}`} className="mt-1 inline-block text-xs font-semibold" style={{ color: colors.primary }}>Contatar suporte →</a>
              </div>
            </div>
          </div>
        </>
      )}

      <RecebimentoFormSheet
        open={formOpen}
        partnerId={partnerId}
        current={destination}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); load() }}
      />

      <PendingRequestSheet
        open={pendingOpen}
        partnerId={partnerId}
        current={destination}
        onClose={() => setPendingOpen(false)}
        onCancelled={() => { setPendingOpen(false); load() }}
      />
    </div>
  )
}
