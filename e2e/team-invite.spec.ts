import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

/**
 * Cobertura e2e do fluxo de convite de equipe (AUTH-1, Fase 7 audit) —
 * antes desta correção, criar um convite sempre quebrava com 500
 * (supabase.auth.admin.listUsers() chamado num client sem privilégio de
 * service-role). Dois testes independentes, pelo motivo abaixo:
 *
 * - "Enviar convite": 100% via UI real, ponta a ponta — prova que o POST
 *   /api/apps/team/[appId]/invite funciona de novo.
 * - "Aceitar convite": a metade de ACEITE também é testada via UI real,
 *   mas a invitation pendente é semeada direto no banco (service role) em
 *   vez de criada pela UI — depois do fix de token em claro (AUTH-3,
 *   mesma Fase 7), o token só existe em memória durante a criação e no
 *   e-mail enviado. Sem acesso a uma caixa de entrada real, não há como
 *   um teste puramente client-side recuperar o token de um convite criado
 *   pela UI. Semear a precondição é prática padrão de fixture — o que
 *   está sob teste aqui é a tela/rota de ACEITE, não a criação.
 */

const OWNER_EMAIL    = process.env.E2E_EMAIL ?? ''
const OWNER_PASSWORD = process.env.E2E_PASSWORD ?? ''
const INVITEE_EMAIL    = process.env.E2E_INVITEE_EMAIL ?? ''
const INVITEE_PASSWORD = process.env.E2E_INVITEE_PASSWORD ?? ''

test.beforeAll(() => {
  if (!OWNER_EMAIL || !OWNER_PASSWORD || !INVITEE_EMAIL || !INVITEE_PASSWORD) {
    throw new Error('Set E2E_EMAIL/E2E_PASSWORD and E2E_INVITEE_EMAIL/E2E_INVITEE_PASSWORD before running this spec')
  }
})

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY before running this spec')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 })
}

test.describe('Enviar convite de equipe (AUTH-1)', () => {
  let createdDraftId: string | null = null

  test.afterEach(async () => {
    // Limpa o draft criado pelo teste — cascade apaga o convite com ele.
    if (createdDraftId) {
      await adminClient().from('app_drafts').delete().eq('id', createdDraftId)
      createdDraftId = null
    }
  })

  test('dono consegue convidar colaborador sem o 500 que existia antes do fix', async ({ page }) => {
    await login(page, OWNER_EMAIL, OWNER_PASSWORD)

    await page.goto('/dashboard/meus-app/novo')
    await page.click('text=Cadastrar manualmente')
    await expect(page).toHaveURL(/\/dashboard\/meus-app\/novo\/[^/]+\/editar/, { timeout: 30_000 })

    const match = page.url().match(/\/novo\/([^/]+)\/editar/)
    const draftId = match?.[1]
    expect(draftId).toBeTruthy()
    createdDraftId = draftId!

    await page.goto(`/dashboard/meus-app/novo/${draftId}/equipe`)

    const inviteEmail = `invite-test-${Date.now()}@lobby-site.test`
    await page.fill('input[placeholder="Nome do colaborador"]', 'Colega E2E')
    await page.fill('input[placeholder="pessoa@empresa.com"]', inviteEmail)
    await page.getByText('Editar aplicativo').click()
    await page.click('button:has-text("Enviar convite")')

    await expect(page.getByText('Convite enviado com sucesso')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(inviteEmail)).toBeVisible()
  })
})

test.describe('Aceitar convite de equipe (AUTH-1)', () => {
  let draftId: string
  let token: string
  let inviteeUserId: string

  test.beforeAll(async () => {
    const admin = adminClient()

    const { data: ownerProfile, error: ownerErr } = await admin
      .from('profiles').select('id').eq('email', OWNER_EMAIL).single()
    if (ownerErr || !ownerProfile) throw new Error(`Owner profile not found for ${OWNER_EMAIL}: ${ownerErr?.message}`)

    const { data: inviteeProfile, error: inviteeErr } = await admin
      .from('profiles').select('id').eq('email', INVITEE_EMAIL).single()
    if (inviteeErr || !inviteeProfile) throw new Error(`Invitee profile not found for ${INVITEE_EMAIL}: ${inviteeErr?.message}`)
    inviteeUserId = inviteeProfile.id

    const { data: draft, error: draftErr } = await admin
      .from('app_drafts')
      .insert({ created_by: ownerProfile.id, name: 'E2E Accept Invite Draft' })
      .select('id')
      .single()
    if (draftErr || !draft) throw new Error(`Failed to seed draft: ${draftErr?.message}`)
    draftId = draft.id

    token = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

    const { error: inviteErr } = await admin.from('app_team_invitations').insert({
      app_draft_id:  draftId,
      invited_by:    ownerProfile.id,
      invited_email: INVITEE_EMAIL,
      invited_name:  'E2E Invitee Tester',
      permissions:   ['edit_app'],
      scope:         'app',
      token_hash:    tokenHash,
      expires_at:    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      status:        'pending',
    })
    if (inviteErr) throw new Error(`Failed to seed invitation: ${inviteErr.message}`)
  })

  test.afterAll(async () => {
    if (draftId) await adminClient().from('app_drafts').delete().eq('id', draftId)
  })

  test('convidado vê os detalhes do convite e aceita com sucesso', async ({ page }) => {
    await login(page, INVITEE_EMAIL, INVITEE_PASSWORD)

    await page.goto(`/dashboard/meus-app/novo/${draftId}/equipe/aceitar?token=${token}`)

    await expect(page.getByText('E2E Accept Invite Draft')).toBeVisible()
    await expect(page.getByText('Editar aplicativo')).toBeVisible()
    await expect(page.getByText('Somente este aplicativo')).toBeVisible()

    await page.click('button:has-text("Aceitar convite")')

    await expect(page.getByText('Convite aceito')).toBeVisible({ timeout: 15_000 })
    await expect(page).toHaveURL(/\/dashboard\/meus-app/, { timeout: 15_000 })

    const admin = adminClient()
    const { data: member } = await admin
      .from('app_team_members')
      .select('id, permissions')
      .eq('app_draft_id', draftId)
      .eq('user_id', inviteeUserId)
      .maybeSingle()
    expect(member).toBeTruthy()
    expect(member?.permissions).toContain('edit_app')

    const { data: invitation } = await admin
      .from('app_team_invitations')
      .select('status')
      .eq('app_draft_id', draftId)
      .eq('invited_email', INVITEE_EMAIL)
      .single()
    expect(invitation?.status).toBe('accepted')
  })
})
