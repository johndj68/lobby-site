-- Webhook retry queue for Stripe and other webhooks
CREATE TABLE webhook_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  event_id TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | completed | failed
  attempt INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMP,
  completed_at TIMESTAMP,
  failed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_webhook_queue_status_retry ON webhook_queue(status, next_retry_at);
CREATE INDEX idx_webhook_queue_event_id ON webhook_queue(event_id);

-- Auto-update updated_at on modification
CREATE TRIGGER update_webhook_queue_updated_at
BEFORE UPDATE ON webhook_queue
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();
