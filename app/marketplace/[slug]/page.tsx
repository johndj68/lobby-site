'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Loader2, ShoppingCart, CheckCircle2, ArrowLeft } from 'lucide-react'
import Container from '@/components/layout/Container'
import { createClient } from '@/lib/supabase'
import { formatCurrencyBRL } from '@/lib/finance'

interface ApplicationRow {
  id: string
  name: string
  slug: string
  description: string | null
  short_description: string | null
  logo_url: string | null
  developer_name: string
  is_lobby_made: boolean
  category: string
}

interface PlanRow {
  id: string
  name: string
  description: string | null
  price: number | null
  currency: string | null
  billing_period: string | null
  features: string[] | null
}

// Função de módulo (fora do componente) de propósito — redirecionar pro
// Stripe é uma navegação de página inteira pra fora do app, não uma rota
// interna (router.push não serve aqui), e mantê-la fora do corpo do
// componente evita falso positivo do lint de pureza em componentes que
// usam hooks de navegação (useParams/useRouter/useSearchParams juntos).
function redirectToExternalUrl(url: string) {
  window.location.href = url
}

const BILLING_LABEL: Record<string, string> = {
  'one-time': 'Pagamento único',
  lifetime:   'Acesso vitalício',
  monthly:    'Assinatura mensal',
  yearly:     'Assinatura anual',
}

export default function AppDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [app, setApp]       = useState<ApplicationRow | null>(null)
  const [plans, setPlans]   = useState<PlanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [buyingPlanId, setBuyingPlanId] = useState<string | null>(null)
  const [error, setError]   = useState('')

  useEffect(() => {
    let active = true
    const supabase = createClient()

    Promise.all([
      supabase.from('applications')
        .select('id, name, slug, description, short_description, logo_url, developer_name, is_lobby_made, category')
        .eq('slug', slug).eq('is_published', true).is('suspended_at', null).maybeSingle(),
      supabase.auth.getUser(),
    ]).then(async ([appRes, userRes]) => {
      if (!active) return
      if (!appRes.data) { setNotFound(true); setLoading(false); return }
      setApp(appRes.data as ApplicationRow)
      setUserId(userRes.data.user?.id ?? null)

      const { data: plansData } = await supabase.rpc('get_public_app_plans', { p_application_id: appRes.data.id })
      if (active) {
        setPlans((plansData as PlanRow[]) ?? [])
        setLoading(false)
      }
    })

    return () => { active = false }
  }, [slug])

  const handleBuy = async (plan: PlanRow) => {
    if (!app) return
    if (!userId) { router.push('/login'); return }

    setBuyingPlanId(plan.id)
    setError('')
    try {
      const res = await fetch(`/api/apps/${app.id}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: plan.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao iniciar pagamento')
      redirectToExternalUrl(data.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível iniciar o pagamento. Tente novamente.')
      setBuyingPlanId(null)
    }
  }

  if (loading) {
    return <Container className="py-24 text-center"><Loader2 size={24} className="mx-auto animate-spin text-[#005BFF]" aria-hidden="true" /></Container>
  }
  if (notFound || !app) {
    return (
      <Container className="py-24 text-center">
        <p className="text-sm text-[#5D6475]">Aplicativo não encontrado.</p>
        <Link href="/marketplace" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#005BFF]"><ArrowLeft size={14} />Voltar ao marketplace</Link>
      </Container>
    )
  }

  return (
    <Container className="py-16">
      <Link href="/marketplace" className="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold text-[#5D6475] hover:text-[#0B1020]">
        <ArrowLeft size={13} aria-hidden="true" />Marketplace
      </Link>

      <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-center">
        {app.logo_url ? (
          <Image src={app.logo_url} alt="" width={72} height={72} className="rounded-2xl object-cover" />
        ) : (
          <div className="flex h-[72px] w-[72px] items-center justify-center rounded-2xl bg-[#F7F8FC] text-2xl font-bold text-[#005BFF]">
            {app.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-[#0B1020] sm:text-3xl" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{app.name}</h1>
          <p className="mt-1 text-sm text-[#5D6475]">{app.is_lobby_made ? 'Aplicativo LOBBY' : `por ${app.developer_name}`} · {app.category}</p>
        </div>
      </div>

      {(app.description || app.short_description) && (
        <p className="mb-10 max-w-2xl text-sm leading-relaxed text-[#374151]">{app.description || app.short_description}</p>
      )}

      {searchParams.get('checkout') === 'canceled' && (
        <p className="mb-6 rounded-xl bg-[#FFFBEB] px-4 py-3 text-xs text-[#92400E]">Pagamento cancelado — nenhum valor foi cobrado.</p>
      )}
      {error && <p role="alert" className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-xs text-red-600">{error}</p>}

      <h2 className="mb-4 text-lg font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Planos</h2>
      {plans.length === 0 ? (
        <p className="text-sm text-[#5D6475]">Nenhum plano disponível no momento — entre em contato com o suporte.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map(plan => {
            const recurring = plan.billing_period === 'monthly' || plan.billing_period === 'yearly'
            return (
              <div key={plan.id} className="flex flex-col rounded-2xl border border-[#E3E7F0] bg-white p-5">
                <p className="text-sm font-bold text-[#0B1020]">{plan.name}</p>
                {plan.description && <p className="mt-1 text-xs text-[#5D6475]">{plan.description}</p>}
                <p className="mt-3 text-xl font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  {plan.price != null ? formatCurrencyBRL(plan.price) : 'Sob consulta'}
                </p>
                <p className="mb-4 text-xs text-[#5D6475]">{plan.billing_period ? BILLING_LABEL[plan.billing_period] ?? plan.billing_period : ''}</p>
                {plan.features && plan.features.length > 0 && (
                  <ul className="mb-4 flex-1 space-y-1.5">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-[#374151]">
                        <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-[#16A34A]" aria-hidden="true" />{f}
                      </li>
                    ))}
                  </ul>
                )}
                {recurring ? (
                  <button type="button" disabled
                    title="Assinatura recorrente — cobrança automática ainda não disponível"
                    className="mt-auto rounded-xl border border-[#E3E7F0] py-2.5 text-sm font-semibold text-[#94A3B8] opacity-60 cursor-not-allowed">
                    Assinatura em breve
                  </button>
                ) : (
                  <button type="button" disabled={buyingPlanId === plan.id || !plan.price} onClick={() => handleBuy(plan)}
                    className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl lobby-gradient py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60">
                    {buyingPlanId === plan.id ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <ShoppingCart size={14} aria-hidden="true" />}
                    {buyingPlanId === plan.id ? 'Redirecionando...' : (userId ? 'Comprar' : 'Entrar para comprar')}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Container>
  )
}
