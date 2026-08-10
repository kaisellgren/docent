import { test, expect } from '@playwright/test'

test.describe('public pages', () => {
  test('home page presents the public landing state', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle(/Docent/)
    await expect(page.getByRole('heading', { name: /Ask Docent anything/i })).toBeVisible()
    await expect(page.locator('header').getByRole('link', { name: /Sign in with Google/i })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Terms of Service' })).toBeVisible()
  })

  test('terms page renders its legal content and breadcrumb', async ({ page }) => {
    await page.goto('/terms')

    await expect(page.getByRole('heading', { name: 'Terms of Service', exact: true })).toBeVisible()
    await expect(page.getByText('Last updated: July 31, 2026')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Use of the service' })).toBeVisible()
    await expect(page.getByRole('article').getByRole('link', { name: 'Docent' })).toHaveAttribute('href', '/')
  })

  test('spaces page presents the unauthenticated state', async ({ page }) => {
    await page.goto('/spaces')

    await expect(page.getByRole('heading', { name: 'Spaces', exact: true })).toBeVisible()
    await expect(page.getByText('Sign in to browse your team’s knowledge spaces.')).toBeVisible()
    await expect(page.locator('section').getByRole('link', { name: /Sign in with Google/i })).toBeVisible()
  })

  test('create-page page presents the unauthenticated state', async ({ page }) => {
    await page.goto('/spaces/new')

    await expect(page.getByRole('heading', { name: 'Create page', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: /Sign in to create a page/i })).toBeVisible()
  })

  test('space detail page presents the unauthenticated state', async ({ page }) => {
    await page.goto('/spaces/engineering')

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: /Ask Docent anything/i })).toBeVisible()
  })

  test('chat page presents the unauthenticated state', async ({ page }) => {
    await page.goto('/chat')

    await expect(page.getByRole('heading', { name: 'Ask Docent', exact: true })).toBeVisible()
    await expect(page.getByText('Search your team’s spaces and get answers with source pages attached.')).toBeVisible()
    await expect(page.getByRole('link', { name: /Sign in to ask Docent/i })).toBeVisible()
  })
})

test.describe('public navigation', () => {
  test('footer terms link navigates from home', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Terms of Service' }).click()

    await expect(page).toHaveURL(/\/terms$/)
    await expect(page.getByRole('heading', { name: 'Terms of Service', exact: true })).toBeVisible()
  })

  test('home composer is unavailable until sign-in', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('textbox', { name: 'Ask Docent' })).toHaveCount(0)
    await expect(page.locator('header').getByRole('link', { name: /Sign in with Google/i })).toBeVisible()
  })
})
