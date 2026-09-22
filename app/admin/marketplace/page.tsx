import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireTechnicianSession } from '@/lib/services/profile'
import { periodRange, type PeriodKey, type AppDraftRow, type SubmissionRow, type PlanRow } from '@/lib/marketplace'
import MarketplaceClient from './MarketplaceClient'

const VALID_PERIODS: PeriodKey[] = ['hoje', '7d', '30d', 'mes', 'custom']

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>
}) {
  const sp = await searchParams
  const period: PeriodKey = VALID_PERIODS.includes(sp.period as PeriodKey) ? (sp.period as PeriodKey) : '30d'
  const from = sp.from ?? null
  const to = sp.to ?? null
  const range = periodRange(period, from, to)

  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireTechnicianSession(supabase)

  // Situação atual do pipeline de apps (mesma fonte que a central de
  // revisão em /admin/marketplace/solicitacoes, para não haver dois
  // números divergentes de "quantos apps existem").
  const [{ data: drafts, error: draftsError }, { data: submissions, error: submissionsError }, { data: plans, error: plansError }] =
    await Promise.all([
      supabase
        .from('app_drafts')
        .select('id, name, short_description, logo_url, category, status, created_at, created_by')
        .order('created_at', { ascending: false }),
      supabase
        .from('app_submissions')
        .select('id, app_draft_id, status, submitted_at, reviewed_at, reviewer_id, submitted_by')
        .order('submitted_at', { ascending: false }),
      supabase
        .from('app_plans')
        .select('id, app_draft_id, billing_period, price, currency'),
    ])

  // Destaques patrocinados — tabela real usada pela home (app/page.tsx),
  // desconectada do pipeline de submissão acima (ver nota em lib/marketplace.ts).
  const { data: campaigns, error: campaignsError } = await supabase
    .from('sponsored_campaigns')
    .select(`
      id, title, starts_at, ends_at, is_approved, is_active, is_paid, payment_status, created_at,
      application:applications(id, name, slug, logo_url)
    `)
    .order('created_at', { ascending: false })
    .limit(5)

  // Nomes de parceiros (dono do app) e de quem revisou — join manual porque
  // app_drafts.created_by referencia auth.users, não profiles diretamente.
  const peopleIds = new Set<string>()
  for (const d of drafts ?? []) peopleIds.add(d.created_by)
  for (const s of submissions ?? []) {
    if (s.reviewer_id) peopleIds.add(s.reviewer_id)
    peopleIds.add(s.submitted_by)
  }
  const { data: people } = peopleIds.size
    ? await supabase.from('profiles').select('id, full_name, email').in('id', [...peopleIds])
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] }

  return (
    <MarketplaceClient
      user={user}
      profile={profile}
      period={period}
      from={from}
      to={to}
      range={{ start: range.start.toISOString(), end: range.end.toISOString() }}
      drafts={(drafts ?? []) as AppDraftRow[]}
      submissions={(submissions ?? []) as SubmissionRow[]}
      plans={(plans ?? []) as PlanRow[]}
      campaigns={(campaigns ?? []) as any}
      people={people ?? []}
      loadErrors={{
        drafts: !!draftsError,
        submissions: !!submissionsError,
        plans: !!plansError,
        campaigns: !!campaignsError,
      }}
    />
  )
}
