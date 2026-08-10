import { test, expect } from '@playwright/test'
import { authFile, testPageSlug } from './auth'

test.use({ storageState: authFile })

test.describe('page detail', () => {
  test('renders markdown, revisions, and page navigation', async ({ page }) => {
    await page.goto(`/spaces/${testPageSlug}`)
    await page.waitForTimeout(250)

    await expect(page.getByRole('heading', { name: 'E2E Onboarding', exact: true })).toBeVisible()
    await expect(page.getByText('This is test content.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Revision history' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Space pages' })).toBeVisible()
  })

  test('edits and saves a page revision', async ({ page }) => {
    await page.goto(`/spaces/${testPageSlug}`)
    await page.waitForTimeout(250)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()

    const editForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Save revision' }) })
    await editForm.locator('input').fill('E2E Onboarding Updated')
    await editForm.locator('textarea').fill('# Updated\n\nSaved by Playwright.')
    await page.getByRole('button', { name: 'Save revision', exact: true }).click()
    await expect(page.getByText('Revision saved and queued for indexing.')).toBeVisible()
    await expect(page.getByText('Saved by Playwright.')).toBeVisible()
  })
})
