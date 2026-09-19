import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

interface CheckoutBody {
  package_id: string
}

export async function POST(req: NextRequest) {
  // Require authenticated session
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 5 checkout sessions per minute per user — prevents session spam
  const rl = checkRateLimit({ key: `stripe-checkout:${user.id}`, limit: 5, windowMs: 60_000 })
  const limited = rateLimitResponse(rl)
  if (limited) return limited

  let body: CheckoutBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { package_id } = body
  if (!package_id || typeof package_id !== 'string') {
    return NextResponse.json({ error: 'package_id is required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Fetch the package from the server — never trust client-supplied price
  const { data: pkg, error: pkgError } = await admin
    .from('credit_packages')
    .select('id, name, description, credits_amount, price, currency, stripe_price_id')
    .eq('id', package_id)
    .eq('is_active', true)
    .single()

  if (pkgError || !pkg) {
    return NextResponse.json({ error: 'Package not found' }, { status: 404 })
  }

  // Create a pending purchase record before the checkout session
  // so we have an ID to embed in Stripe metadata
  const { data: purchase, error: insertError } = await admin
    .from('credit_purchases')
    .insert({
      user_id:        user.id,
      package_id:     pkg.id,
      credits_amount: pkg.credits_amount,
      amount_paid:    pkg.price,
      currency:       pkg.currency,
      status:         'pending',
    })
    .select('id')
    .single()

  if (insertError || !purchase) {
    console.error('[checkout] Failed to create purchase record:', insertError)
    return NextResponse.json({ error: 'Failed to create purchase' }, { status: 500 })
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  // If the package has a Stripe Price ID, use it. Otherwise create a one-time price.
  const lineItems = pkg.stripe_price_id
    ? [{ price: pkg.stripe_price_id, quantity: 1 }]
    : [
        {
          price_data: {
            currency:     (pkg.currency ?? 'brl').toLowerCase(),
            unit_amount:  Math.round(pkg.price * 100), // Stripe uses cents
            product_data: {
              name:        `${pkg.name} — Créditos LOBBY`,
              description: pkg.description ?? undefined,
            },
          },
          quantity: 1,
        },
      ]

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items:           lineItems,
    mode:                 'payment',
    success_url:          `${siteUrl}/dashboard/creditos?checkout=success`,
    cancel_url:           `${siteUrl}/dashboard/creditos?checkout=canceled`,
    customer_email:       user.email,
    client_reference_id:  purchase.id,
    metadata: {
      purchase_id: purchase.id,
      user_id:     user.id,
      package_id:  pkg.id,
    },
  })

  // Save the session ID for reference / debugging
  await admin
    .from('credit_purchases')
    .update({ stripe_session_id: session.id })
    .eq('id', purchase.id)

  return NextResponse.json({ url: session.url })
}
