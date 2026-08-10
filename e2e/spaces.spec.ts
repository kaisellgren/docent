import { test, expect } from '@playwright/test'
import { authFile, testSpaceSlug } from './auth'

test.use({ storageState: authFile })

test.describe('spaces page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/spaces')
    await page.waitForTimeout(250)
  })

  test('shows spaces and supports search and view switching', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Spaces', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'E2E Engineering', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: /E2E E2E Engineering.*1 page/ })).toBeVisible()

    const search = page.getByRole('textbox', { name: 'Find a space' })
    await search.click()
    await search.press('Control+A')
    await search.pressSequentially('engineering')
    await expect(page.getByRole('heading', { name: /E2E Engineering/ })).toBeVisible()
    await page.getByRole('button', { name: 'List view' }).click()
    await expect(page.getByRole('heading', { name: 'E2E Engineering', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Grid view' }).click()
  })

  test('creates and cancels a space', async ({ page }) => {
    await page.getByRole('button', { name: 'Create space', exact: true }).click({ force: true })
    await expect(page.getByPlaceholder('Space name')).toBeVisible()
    const name = `E2E Created ${Date.now()}`
    await page.getByPlaceholder('Space name').fill(name)
    await page.getByPlaceholder('What belongs in this space?').fill('Created by Playwright')
    await page.getByRole('button', { name: 'Create space', exact: true }).last().click()
    await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible()
  })

  test('cancels space creation', async ({ page }) => {
    await page.getByRole('button', { name: 'Create space', exact: true }).click({ force: true })
    await expect(page.getByPlaceholder('Space name')).toBeVisible()
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByPlaceholder('Space name')).toHaveCount(0)
  })

  test('opens a space detail page', async ({ page }) => {
    await page.getByRole('heading', { name: 'E2E Engineering', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/spaces/space/${testSpaceSlug}(?:\\?.*)?$`))
    await expect(page.getByRole('heading', { name: 'E2E Engineering', exact: true })).toBeVisible()
  })
})
