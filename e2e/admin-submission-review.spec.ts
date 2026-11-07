import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

/**
 * Cobertura e2e do fluxo de aprovação/rejeição admin — jornada "aprovação/
 * rejeição admin" do programa de cobertura identificado na auditoria
 * (checkout/submissão/convite/financeiro/aprovação, hoje zero cobertura de
 * interação real). Testa a decisão "Rejeitar" ponta a ponta via UI real
 * (login técnico, navegar até a lista, abrir a solicitação, confirmar no
 * diálogo) — menos fixture que "Aprovar" (não exige checklist zerado de
 * bloqueios) e já cobre o mecanismo completo: PATCH de decisão, sincronia
 * de app_drafts.status, e-mail ao parceiro (tolerante a falha, não trava
 * a decisão).
 *
 * A submissão pendente é semeada direto no banco (service role) em vez
 * de criada via UI: TERMS_DOCUMENTS_AVAILABLE=false bloqueia de propósito
 * qualquer envio real pela tela enquanto não existir documento de termos
 * — gate de negócio documentado, não bug. O que está sob teste aqui é o
 * lado do ADMIN decidindo uma submissão já pendente, não a criação dela.
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

test.describe('Rejeitar solicitação de app (admin)', () => {
  let draftId: string
  let submissionId: string
  const appName = `E2E Reject App ${Date.now()}`

  test.beforeAll(async () => {
    const admin = adminClient()

    const { data: ownerProfile, error: ownerErr } = await admin
      .from('profiles').select('id').eq('email', OWNER_EMAIL).single()
    if (ownerErr || !ownerProfile) throw new Error(`Owner profile not found for ${OWNER_EMAIL}: ${ownerErr?.message}`)

    const { data: draft, error: draftErr } = await admin
      .from('app_drafts')
      .insert({
        created_by: ownerProfile.id,
        name: appName,
        short_description: 'App de teste e2e pra fluxo de rejeição admin.',
        status: 'submitted',
      })
      .select('id')
      .single()
    if (draftErr || !draft) throw new Error(`Failed to seed draft: ${draftErr?.message}`)
    draftId = draft.id

    const { data: submission, error: subErr } = await admin
      .from('app_submissions')
      .insert({
        app_draft_id: draftId,
        submitted_by: ownerProfile.id,
        status: 'pending',
        data: { name: appName, short_description: 'App de teste e2e pra fluxo de rejeição admin.' },
      })
      .select('id')
      .single()
    if (subErr || !submission) throw new Error(`Failed to seed submission: ${subErr?.message}`)
    submissionId = submission.id
  })

  test.afterAll(async () => {
    if (draftId) await adminClient().from('app_drafts').delete().eq('id', draftId)
  })

  test('técnico vê a solicitação na lista e rejeita com sucesso', async ({ page }) => {
    await loginAdmin(page)

    await page.goto('/admin/marketplace/solicitacoes')
    const row = page.locator('tr', { hasText: appName }).first()
    await expect(row).toBeVisible({ timeout: 15_000 })
    await row.getByRole('link', { name: 'Analisar' }).click()

    await expect(page).toHaveURL(new RegExp(`/admin/marketplace/solicitacoes/${submissionId}`), { timeout: 30_000 })
    await expect(page.getByRole('heading', { name: appName })).toBeVisible({ timeout: 15_000 })

    await page.click('button:has-text("Rejeitar solicitação")')

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByPlaceholder('Mensagem que será enviada por e-mail…').fill('Rejeitado via teste e2e — motivo de teste.')
    await dialog.getByRole('button', { name: 'Rejeitar solicitação' }).click()

    await expect(page.getByText('Decisão registrada')).toBeVisible({ timeout: 15_000 })

    const admin = adminClient()
    const { data: submissionRow } = await admin
      .from('app_submissions').select('status, reviewer_id, public_feedback').eq('id', submissionId).single()
    expect(submissionRow?.status).toBe('rejected')
    expect(submissionRow?.reviewer_id).toBeTruthy()
    expect(submissionRow?.public_feedback).toContain('Rejeitado via teste e2e')

    const { data: draftRow } = await admin
      .from('app_drafts').select('status').eq('id', draftId).single()
    // changes_requested: único estado que reabre reenvio pro parceiro — não
    // existe um status "rejected" próprio em app_drafts (ver route.ts).
    expect(draftRow?.status).toBe('changes_requested')
  })

  test('decisão já tomada não pode ser repetida (corrida entre dois admins)', async ({ page }) => {
    // Essa submissão já foi decidida pelo teste anterior — chamar a rota
    // de novo deve recusar (409), nunca sobrescrever ou duplicar e-mail.
    await loginAdmin(page)

    const res = await page.request.patch(`/api/admin/submissions/${submissionId}/review`, {
      data: { action: 'approve', public_feedback: 'tentativa tardia' },
    })
    expect(res.status()).toBe(409)
  })
})
