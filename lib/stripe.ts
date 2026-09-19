import Stripe from 'stripe'

// Initialize Stripe — used for future payment flows:
// - E-book / template sales
// - Consultancy subscriptions
// - SaaS plans
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia',
})

// Future: call stripe.checkout.sessions.create() in a route handler
// to start a checkout session for a plan or one-time purchase.
export const STRIPE_PLANS = {
  // starter: 'price_xxx',
  // professional: 'price_xxx',
  // enterprise: 'price_xxx',
} as const
