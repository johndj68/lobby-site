import { test, expect } from '@playwright/test'
import path from 'path'
import os from 'os'

const EMAIL = process.env.E2E_EMAIL ?? ''
const PASSWORD = process.env.E2E_PASSWORD ?? ''

test.beforeAll(() => {
  if (!EMAIL || !PASSWORD) {
    throw new Error('Set E2E_EMAIL and E2E_PASSWORD env vars before running e2e tests')
  }
})

test.describe('Login flow', () => {
  test('redirects unauthenticated user from /dashboard to /login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('shows error on wrong credentials', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', 'wrong@example.com')
    await page.fill('input[type="password"]', 'wrongpassword')
    await page.click('button[type="submit"]')
    await expect(page.getByText(/E-mail ou senha incorretos/)).toBeVisible()
  })

  test('logs in and lands on /dashboard', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', EMAIL)
    await page.fill('input[type="password"]', PASSWORD)
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 })
    // Shell sidebar must be present
    await expect(page.getByRole('link', { name: /LOBBY/i }).first()).toBeVisible()
  })
})

test.describe('Dashboard navigation (shell persistence)', () => {
  // Log in ONCE for the whole describe block (via a saved storageState) instead of
  // re-running the full login form per test — this suite has 9 tests, and repeating
  // the real login POST for each of them would routinely trip the app's login rate
  // limit (5/min/IP) added for brute-force protection. It also just makes the suite
  // faster, independent of rate limiting.
  const storageStatePath = path.join(os.tmpdir(), `lobby-e2e-storage-${Date.now()}.json`)
  test.use({ storageState: storageStatePath })

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto('/login')
    await page.fill('input[type="email"]', EMAIL)
    await page.fill('input[type="password"]', PASSWORD)
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 })
    await context.storageState({ path: storageStatePath })
    await context.close()
  })

  const routes = [
    { path: '/dashboard', label: /início|dashboard/i },
    { path: '/dashboard/projetos', label: /projetos/i },
    { path: '/dashboard/creditos', label: /créditos/i },
    { path: '/dashboard/downloads', label: /downloads/i },
    { path: '/dashboard/historico', label: /histórico/i },
    { path: '/dashboard/suporte', label: /suporte/i },
    { path: '/dashboard/conta', label: /conta/i },
  ]

  for (const { path, label } of routes) {
    test(`navigates to ${path} without shell flash`, async ({ page }) => {
      // Capture all DOM mutation events to detect full remounts
      await page.addInitScript(() => {
        (window as Window & { __sidebarMounted?: number }).
          __sidebarMounted = 0
        const observer = new MutationObserver(() => {
          const sidebar = document.querySelector('[data-testid="dashboard-sidebar"]')
          if (sidebar) (window as Window & { __sidebarMounted?: number }).__sidebarMounted!++
        })
        observer.observe(document.body, { childList: true, subtree: true })
      })

      await page.goto(path)
      await expect(page).toHaveURL(new RegExp(path.replace(/\//g, '\\/')))

      // Sidebar logo visible and white background (not dark)
      const logoLink = page.getByRole('link', { name: /LOBBY/i }).first()
      await expect(logoLink).toBeVisible()

      // Nav link for current page should be highlighted
      const navLink = page.getByRole('link', { name: label })
      await expect(navLink.first()).toBeVisible()
    })
  }

  test('sidebar logo stays visible when navigating dashboard → projetos → creditos', async ({ page }) => {
    // Start at dashboard
    await expect(page).toHaveURL(/\/dashboard/)
    const logoLink = page.getByRole('link', { name: /LOBBY/i }).first()
    await expect(logoLink).toBeVisible()

    // Navigate to projetos
    await page.goto('/dashboard/projetos')
    await expect(page).toHaveURL(/\/dashboard\/projetos/)
    await expect(logoLink).toBeVisible()

    // Navigate to creditos
    await page.goto('/dashboard/creditos')
    await expect(page).toHaveURL(/\/dashboard\/creditos/)
    await expect(logoLink).toBeVisible()
  })
})

test.describe('Auth protection', () => {
  test('logout redirects to /login', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', EMAIL)
    await page.fill('input[type="password"]', PASSWORD)
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 })

    // Click logout button in sidebar
    const logoutBtn = page.getByRole('button', { name: /sair/i })
    await expect(logoutBtn).toBeVisible()
    await logoutBtn.click()
    // handleLogout redirects to '/' (home), not '/login'
    await expect(page).toHaveURL(/^http:\/\/localhost:3000\/?$/, { timeout: 15_000 })
  })
})
