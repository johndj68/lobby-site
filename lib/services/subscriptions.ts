/** Assinatura recorrente via Stripe Billing — status espelha 1:1 o objeto
 *  Subscription do Stripe (Subscription.Status), sincronizado só via
 *  webhook. Nunca inventado/derivado do lado do app. */
export type SubscriptionStatus = 'incomplete' | 'incomplete_expired' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused' | 'trialing'
export type SubscriptionProductType = 'app_plan' | 'mensalidade'

export interface Subscription {
  id:                     string
  stripe_subscription_id: string | null
  product_type:           SubscriptionProductType
  app_plan_id:             string | null
  client_project_id:       string | null
  user_id:                 string
  partner_id:               string | null
  plan_name:                string
  amount:                   number
  currency:                 string
  billing_interval:         'month' | 'year'
  commission_percent:       number
  status:                   SubscriptionStatus
  current_period_start:     string | null
  current_period_end:       string | null
  cancel_at_period_end:     boolean
  canceled_at:               string | null
  created_at:               string
  updated_at:               string
}

export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, { label: string; color: string; bg: string }> = {
  incomplete:         { label: 'Aguardando pagamento', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  incomplete_expired: { label: 'Expirada',              color: '#94A3B8', bg: 'rgba(148,163,184,0.1)' },
  active:              { label: 'Ativa',                 color: '#16A34A', bg: 'rgba(22,163,74,0.1)'  },
  past_due:            { label: 'Pagamento atrasado',    color: '#DC2626', bg: 'rgba(220,38,38,0.1)'  },
  canceled:            { label: 'Cancelada',             color: '#94A3B8', bg: 'rgba(148,163,184,0.1)' },
  unpaid:              { label: 'Não paga',              color: '#DC2626', bg: 'rgba(220,38,38,0.1)'  },
  paused:              { label: 'Pausada',               color: '#94A3B8', bg: 'rgba(148,163,184,0.1)' },
  trialing:            { label: 'Período de teste',      color: '#38BDF8', bg: 'rgba(56,189,248,0.1)' },
}

export const BILLING_INTERVAL_LABEL: Record<'month' | 'year', string> = {
  month: '/mês',
  year:  '/ano',
}
