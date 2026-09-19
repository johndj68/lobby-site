// Error monitoring shim.
// To activate Sentry: npm install @sentry/nextjs, add SENTRY_DSN to .env,
// run `npx @sentry/wizard@latest -i nextjs`, then replace the stubs below
// with `import * as Sentry from '@sentry/nextjs'` calls.

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  console.error('[monitoring] Exception captured:', err, context ?? '')
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  const fn = level === 'error' ? console.error : level === 'warning' ? console.warn : console.info
  fn(`[monitoring] ${message}`)
}
