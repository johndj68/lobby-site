import type { SupabaseClient } from '@supabase/supabase-js'
import { calculateReview, type ReviewResult } from '@/lib/validations/app-review'

export interface StepCompletion {
  step1: boolean // Começar — identidade mínima existe
  step2: boolean // Produto e mídia — informações básicas + mídia sem bloqueio
  step3: boolean // Oferta e planos — ao menos 1 plano válido
  review: ReviewResult
  plansCount: number
}

/** Conclusão real das 4 etapas do editor, a partir do MESMO motor de
 *  validação que a Revisão (etapa 4) já usa via calculateReview — evita ter
 *  uma segunda régua de "completo" divergente da que decide se o envio
 *  para análise é permitido. Busca só o necessário pra essa conta
 *  (RLS já escopa por dono/equipe). */
export async function getStepCompletion(supabase: SupabaseClient, draft: Record<string, unknown> & { id: string }): Promise<StepCompletion> {
  const [{ data: plans }, { data: config }, { data: members }, { data: invitations }] = await Promise.all([
    supabase.from('app_plans').select('*').eq('app_draft_id', draft.id),
    supabase.from('app_activation_config').select('*').eq('app_draft_id', draft.id).maybeSingle(),
    supabase.from('app_team_members').select('*').eq('app_draft_id', draft.id),
    supabase.from('app_team_invitations').select('*').eq('app_draft_id', draft.id).eq('status', 'pending'),
  ])

  const review = calculateReview(draft, plans ?? [], config, members ?? [], invitations ?? [])
  const byId = new Map(review.items.map(i => [i.id, i]))

  return {
    step1: !!(draft.name as string | null)?.trim(),
    step2: byId.get('basicInfo')?.status === 'complete' && byId.get('media')?.status === 'complete',
    step3: byId.get('offer')?.status === 'complete',
    review,
    plansCount: plans?.length ?? 0,
  }
}
