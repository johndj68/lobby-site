/**
 * Webhook retry queue — handles failed webhook deliveries
 * Stores failed webhooks in Supabase for later retry
 */

import { createAdminClient } from './supabase-admin'

interface WebhookJob {
  event_type: string
  event_id: string
  payload: Record<string, unknown>
  attempt: number
  max_attempts: number
  next_retry_at?: string | null
}

const MAX_RETRIES = 3
const RETRY_DELAYS = [60, 300, 3600] // 1min, 5min, 1hour

/**
 * Enqueue webhook delivery — will be retried on failure
 */
export async function enqueueWebhookJob(job: Omit<WebhookJob, 'attempt' | 'max_attempts'>) {
  const admin = createAdminClient()
  const { error } = await admin.from('webhook_queue').insert({
    event_type: job.event_type,
    event_id: job.event_id,
    payload: job.payload,
    attempt: 0,
    max_attempts: MAX_RETRIES,
    status: 'pending',
    next_retry_at: new Date(Date.now() + RETRY_DELAYS[0] * 1000).toISOString(),
  })

  if (error) {
    console.error('[webhook-queue] Failed to enqueue job:', error)
    throw error
  }
}

/**
 * Mark webhook job as succeeded
 */
export async function completeWebhookJob(eventId: string) {
  const admin = createAdminClient()
  const { error } = await admin
    .from('webhook_queue')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('event_id', eventId)

  if (error) console.error('[webhook-queue] Failed to mark job complete:', error)
}

/**
 * Mark webhook job as failed and schedule retry
 */
export async function retryWebhookJob(eventId: string) {
  const admin = createAdminClient()

  const { data: job, error: fetchError } = await admin
    .from('webhook_queue')
    .select('*')
    .eq('event_id', eventId)
    .single() as any

  if (fetchError || !job) {
    console.error('[webhook-queue] Failed to fetch job for retry:', fetchError)
    return
  }

  const nextAttempt = job.attempt + 1
  if (nextAttempt >= MAX_RETRIES) {
    await admin
      .from('webhook_queue')
      .update({ status: 'failed', failed_at: new Date().toISOString() })
      .eq('event_id', eventId)
    return
  }

  const nextRetryAt = new Date(Date.now() + RETRY_DELAYS[nextAttempt] * 1000)
  await admin
    .from('webhook_queue')
    .update({
      attempt: nextAttempt,
      next_retry_at: nextRetryAt.toISOString(),
      status: 'pending',
    })
    .eq('event_id', eventId)

  console.info(`[webhook-queue] Scheduled retry ${nextAttempt} for ${eventId}`)
}
