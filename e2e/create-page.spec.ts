import { test, expect } from '@playwright/test'
import { authFile, testSpaceId } from './auth'

test.use({ storageState: authFile })

test.describe('create page', () => {
  test('edits markdown and switches editor modes', async ({ page }) => {
    await page.goto(`/spaces/new?spaceId=${testSpaceId}&parentPageId=`)
    await page.waitForTimeout(250)

    await page.getByPlaceholder('Untitled page').fill('E2E Draft Page')
    const markdown = page.getByPlaceholder('Start writing in Markdown…')
    await markdown.fill('A paragraph')
    await expect(page.getByTitle('Bold')).toBeVisible()
    await expect(page.getByTitle('Italic')).toBeVisible()

    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Write', exact: true }).click()
    await expect(markdown).toBeVisible()
    await page.getByRole('button', { name: 'Split', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeVisible()
  })

  test('publishes a page into the selected space', async ({ page }) => {
    await page.goto(`/spaces/new?spaceId=${testSpaceId}&parentPageId=`)
    await page.waitForTimeout(250)
    await page.getByPlaceholder('Untitled page').fill(`E2E Published ${Date.now()}`)
    await page.getByPlaceholder('Start writing in Markdown…').fill('Published by Playwright')
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    await expect(page).toHaveURL(/\/spaces\/e2e-published-/)
    await expect(page.locator('article').getByText('Published by Playwright', { exact: true })).toBeVisible()
  })
})
