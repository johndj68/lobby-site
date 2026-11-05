import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

/**
 * Cobertura e2e da publicação de app pelo admin — valida na prática os
 * fixes de hoje (VEND-3/VEND-4, Fase 7 audit): allowlist no PATCH de
 * draft, RPC atômica publish_app_draft (applications + app_drafts numa
 * única transação, com revalidação de conflito de application_id).
 *
 * A submissão não pode ser criada via UI real (TERMS_DOCUMENTS_AVAILABLE
 * = false bloqueia todo envio de propósito, gate de negócio documentado,
 * não bug) — então o draft/submissão/plano/ativação chegam já "aprovados"
 * via fixture (service role), e o que está sob teste de verdade, via UI
 * real, é o botão "Publicar" do admin e seu efeito no banco.
 */

const ADMIN_EMAIL    = process.env.E2E_ADMIN_EMAIL ?? ''
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? ''
const OWNER_EMAIL     = process.env.E2E_EMAIL ?? ''

test.beforeAll(() => {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !OWNER_EMAIL) {
    throw new Error('Set E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD and E2E_EMAIL before running this spec')
  }
})

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY before running this spec')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function loginAdmin(page: Page) {
  await page.goto('/admin/login')
  await page.fill('input[type="email"]', ADMIN_EMAIL)
  await page.fill('input[type="password"]', ADMIN_PASSWORD)
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL(/\/admin(?!\/login)/, { timeout: 30_000 })
}

test.describe('Publicar app aprovado (admin)', () => {
  let draftId: string
  let applicationId: string | null = null
  const appName = `E2E Publish App ${Date.now()}`

  test.beforeAll(async () => {
    const admin = adminClient()

    const { data: ownerProfile, error: ownerErr } = await admin
      .from('profiles').select('id').eq('email', OWNER_EMAIL).single()
    if (ownerErr || !ownerProfile) throw new Error(`Owner profile not found for ${OWNER_EMAIL}: ${ownerErr?.message}`)

    const { data: adminProfile, error: adminErr } = await admin
      .from('profiles').select('id').eq('email', ADMIN_EMAIL).single()
    if (adminErr || !adminProfile) throw new Error(`Admin profile not found for ${ADMIN_EMAIL}: ${adminErr?.message}`)

    const { data: draft, error: draftErr } = await admin
      .from('app_drafts')
      .insert({
        created_by: ownerProfile.id,
        name: appName,
        short_description: 'App de teste e2e pra fluxo de publicação admin.',
        full_description: 'Descrição completa do app de teste e2e de publicação.',
        category: 'Automação',
        website_url: 'https://e2e-publish-app.lobby-site.test',
        status: 'submitted',
      })
      .select('id')
      .single()
    if (draftErr || !draft) throw new Error(`Failed to seed draft: ${draftErr?.message}`)
    draftId = draft.id

    const { error: subErr } = await admin.from('app_submissions').insert({
      app_draft_id:  draftId,
      submitted_by:  ownerProfile.id,
      status:        'approved',
      reviewer_id:   adminProfile.id,
      reviewed_at:   new Date().toISOString(),
      data:          { name: appName },
    })
    if (subErr) throw new Error(`Failed to seed submission: ${subErr.message}`)

    const { error: planErr } = await admin.from('app_plans').insert({
      app_draft_id:   draftId,
      name:           'Plano único',
      price:          29.9,
      currency:       'BRL',
      billing_period: 'one-time',
    })
    if (planErr) throw new Error(`Failed to seed plan: ${planErr.message}`)

    const { error: activationErr } = await admin.from('app_activation_config').insert({
      app_draft_id:  draftId,
      support_email: 'suporte-e2e@lobby-site.test',
    })
    if (activationErr) throw new Error(`Failed to seed activation config: ${activationErr.message}`)
  })

  test.afterAll(async () => {
    const admin = adminClient()
    if (draftId) await admin.from('app_drafts').delete().eq('id', draftId)
    // app_drafts.application_id é ON DELETE SET NULL, não cascade — a
    // linha de applications criada pela publicação sobrevive ao delete
    // do draft acima; precisa ser limpa à parte.
    if (applicationId) await admin.from('applications').delete().eq('id', applicationId)
  })

  test('técnico publica um app aprovado e ele aparece no catálogo público', async ({ page }) => {
    await loginAdmin(page)

    await page.goto(`/admin/marketplace/aplicativos/${draftId}`)
    await expect(page.getByRole('heading', { name: appName })).toBeVisible({ timeout: 15_000 })

    await page.click('button:has-text("Publicar")')

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Publicar aplicativo?')).toBeVisible()
    await dialog.getByRole('button', { name: 'Publicar', exact: true }).click()

    await expect(page.getByText(`${appName} publicado.`)).toBeVisible({ timeout: 15_000 })

    const admin = adminClient()
    const { data: draftRow } = await admin
      .from('app_drafts').select('status, application_id').eq('id', draftId).single()
    expect(draftRow?.status).toBe('published')
    expect(draftRow?.application_id).toBeTruthy()
    applicationId = draftRow!.application_id as string

    const { data: appRow } = await admin
      .from('applications').select('is_published, name, slug').eq('id', applicationId).single()
    expect(appRow?.is_published).toBe(true)
    expect(appRow?.name).toBe(appName)

    // Visível no catálogo público de verdade, não só no banco.
    await page.goto(`/marketplace/${appRow!.slug}`)
    await expect(page.getByRole('heading', { name: appName })).toBeVisible({ timeout: 15_000 })
  })

  test('publicar de novo o mesmo draft é bloqueado (já publicado)', async ({ page }) => {
    await loginAdmin(page)
    const res = await page.request.post(`/api/admin/apps/${draftId}/publish`)
    expect(res.status()).toBe(409)
  })
})
