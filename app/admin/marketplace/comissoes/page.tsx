import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireLeaderSession } from '@/lib/services/profile'
import { partnerDisplayName } from '@/lib/partners'
import ComissoesClient, { type PartnerOption, type CategoryOption } from './ComissoesClient'
import type { CommissionTerm } from '@/lib/services/commission'

export default async function ComissoesPage() {
  const supabase = await createServerSupabaseClient()
  // Financeiro sensível — só líder, igual /admin/financeiro e /admin/creditos.
  const { user, profile } = await requireLeaderSession(supabase)

  const [{ data: drafts }, { data: categories }, { data: terms }] = await Promise.all([
    supabase.from('app_drafts').select('created_by'),
    supabase.from('app_categories').select('id, name').eq('status', 'active').order('name'),
    supabase.from('partner_commission_terms').select('*').order('created_at', { ascending: false }),
  ])

  // Parceiro = dono de app_drafts (mesmo modelo de app/admin/marketplace/parceiros/page.tsx — não existe tabela de organização).
  const partnerIds = [...new Set((drafts ?? []).map(d => d.created_by))]
  const { data: partnerProfiles } = partnerIds.length
    ? await supabase.from('profiles').select('id, full_name, email, company_name').in('id', partnerIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null; company_name: string | null }[] }

  const partners: PartnerOption[] = (partnerProfiles ?? [])
    .map(p => ({ id: p.id, name: partnerDisplayName(p) }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const categoriesList: CategoryOption[] = (categories ?? []).map(c => ({ id: c.id, name: c.name }))

  // Nomes pra exibir nos termos já cadastrados — pode incluir parceiros que
  // não têm mais app_drafts, ou o autor (created_by), então busca à parte
  // em vez de depender só do mapa de `partners` acima.
  const termsRows = (terms ?? []) as CommissionTerm[]
  const referencedIds = [...new Set(
    termsRows.flatMap(t => [t.partner_id, t.created_by, t.deactivated_by]).filter((id): id is string => !!id)
  )]
  const { data: referencedProfiles } = referencedIds.length
    ? await supabase.from('profiles').select('id, full_name, email, company_name').in('id', referencedIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null; company_name: string | null }[] }
  const nameById = new Map((referencedProfiles ?? []).map(p => [p.id, partnerDisplayName(p)]))
  const categoryNameById = new Map(categoriesList.map(c => [c.id, c.name]))

  const enrichedTerms: CommissionTerm[] = termsRows.map(t => ({
    ...t,
    partner_name:  t.partner_id  ? (nameById.get(t.partner_id) ?? null) : null,
    category_name: t.category_id ? (categoryNameById.get(t.category_id) ?? null) : null,
  }))

  return (
    <ComissoesClient
      user={user}
      profile={profile}
      partners={partners}
      categories={categoriesList}
      terms={enrichedTerms}
      creatorNames={Object.fromEntries(nameById)}
    />
  )
}
