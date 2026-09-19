import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { stripe } from '@/lib/stripe'
import { captureException } from '@/lib/monitoring'

// Retry endpoint called by cron job (Vercel, EasyCron, etc.)
// Protects against unauthorized access with SECRET token
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (token !== process.env.WEBHOOK_RETRY_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  try {
    // Fetch all pending jobs due for retry
    const { data: pending, error: queryError } = await admin
      .from('webhook_queue')
      .select('*')
      .eq('status', 'pending')
      .lt('next_retry_at', new Date().toISOString())
      .limit(50)

    if (queryError) throw queryError
    if (!pending || pending.length === 0) {
      return NextResponse.json({ processed: 0, skipped: 0 })
    }

    let processed = 0
    let skipped = 0

    for (const job of pending) {
      try {
        const payload = job.payload as { type: string; id: string }

        // Reconstruct event and attempt reprocessing via Stripe API
        if (payload.type === 'checkout.session.completed' || payload.type === 'payment_intent.payment_failed') {
          const event = await stripe.events.retrieve(payload.id)
          if (!event) {
            await admin.from('webhook_queue').update({ status: 'failed', failed_at: new Date().toISOString() }).eq('id', job.id)
            continue
          }

          // Re-dispatch the event handler (simplified: just update to indicate success)
          // In production, call your actual webhook handler logic
          await admin.from('webhook_queue').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', job.id)
          processed++
        } else {
          skipped++
        }
      } catch (err) {
        // Increment attempt, calculate next retry
        const nextAttempt = job.attempt + 1
        if (nextAttempt >= job.max_attempts) {
          await admin.from('webhook_queue').update({ status: 'failed', failed_at: new Date().toISOString() }).eq('id', job.id)
          captureException(err, { job_id: job.id, event_id: job.event_id })
        } else {
          const delays = [1, 5, 60] // minutes
          const nextRetryMs = (delays[nextAttempt - 1] ?? 60) * 60_000
          const nextRetryAt = new Date(Date.now() + nextRetryMs).toISOString()
          await admin.from('webhook_queue').update({ attempt: nextAttempt, next_retry_at: nextRetryAt }).eq('id', job.id)
        }
      }
    }

    return NextResponse.json({ processed, skipped, total: pending.length })
  } catch (err) {
    captureException(err, { context: 'webhook-retry-job' })
    return NextResponse.json({ error: 'Job failed' }, { status: 500 })
  }
}
