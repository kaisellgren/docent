import { test, expect } from '@playwright/test'
import { authFile } from './auth'

test.use({ storageState: authFile })

test.describe('authenticated chat', () => {
  test('renders conversation workspace and supports new conversation', async ({ page }) => {
    await page.goto('/chat')
    await page.waitForTimeout(250)

    await expect(page.getByRole('heading', { name: 'Conversations', exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Find a conversation' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Ask Docent' })).toBeVisible()
    await page.getByRole('button', { name: 'New conversation' }).click()
    await expect(page.getByRole('textbox', { name: 'Ask Docent' })).toBeFocused()
  })

  test('filters conversation history', async ({ page }) => {
    await page.goto('/chat')
    await page.waitForTimeout(250)
    const search = page.getByRole('textbox', { name: 'Find a conversation' })
    await search.fill('does-not-match')
    await expect(page.getByText('Your conversations will appear here.')).toBeVisible()
  })
})
