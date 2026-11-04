import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireTechnicianSession } from '@/lib/services/profile'
import { partnerDisplayName } from '@/lib/partners'
import RecebimentosClient from './RecebimentosClient'

const SELECT = `
  id, partner_id, status, payout_method, account_holder, person_type, document,
  pix_key_type, pix_key, bank_name, bank_agency, bank_account, bank_account_digit,
  bank_account_type, notes, reviewed_by, reviewed_at, rejection_reason, created_at
`

export default async function RecebimentosPage() {
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireTechnicianSession(supabase)

  // Pendentes sem limite (índice parcial único garante no máximo 1 por
  // parceiro — nunca cresce descontrolado), histórico com janela de 200,
  // mesmo padrão de app/admin/marketplace/promocoes/page.tsx.
  const [
    { data: pendingRows, error: pendingError },
    { data: historyRows, error: historyError },
  ] = await Promise.all([
    supabase.from('partner_payout_destination_requests').select(SELECT).eq('status', 'pending').order('created_at', { ascending: false }),
    supabase.from('partner_payout_destination_requests').select(SELECT).neq('status', 'pending').order('created_at', { ascending: false }).limit(200),
  ])
  const loadError = pendingError || historyError
  const rows = [...(pendingRows ?? []), ...(historyRows ?? [])]

  const partnerIds = [...new Set(rows.map(r => r.partner_id))]
  const { data: partnerProfiles } = partnerIds.length
    ? await supabase.from('profiles').select('id, full_name, email, company_name, role').in('id', partnerIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null; company_name: string | null; role: string }[] }
  const partnerById = new Map((partnerProfiles ?? []).map(p => [p.id, p]))

  const mapRow = (r: typeof rows[number]) => ({
    id: r.id,
    partnerId: r.partner_id,
    partnerName: partnerById.has(r.partner_id) ? partnerDisplayName(partnerById.get(r.partner_id)!) : 'Parceiro removido',
    status: r.status as 'pending' | 'approved' | 'rejected' | 'cancelled',
    payoutMethod: r.payout_method as 'pix' | 'bank_transfer',
    accountHolder: r.account_holder,
    personType: r.person_type,
    document: r.document,
    pixKeyType: r.pix_key_type,
    pixKey: r.pix_key,
    bankName: r.bank_name,
    bankAgency: r.bank_agency,
    bankAccount: r.bank_account,
    bankAccountDigit: r.bank_account_digit,
    bankAccountType: r.bank_account_type,
    notes: r.notes,
    reviewedAt: r.reviewed_at,
    rejectionReason: r.rejection_reason,
    createdAt: r.created_at,
  })

  const pending = (pendingRows ?? []).map(mapRow)
  const history = (historyRows ?? []).map(mapRow)

  return <RecebimentosClient user={user} profile={profile} pending={pending} history={history} loadError={!!loadError} />
}
