import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url))
const DIST_PATH = path.resolve(CURRENT_DIR, '../../dist')

let context: BrowserContext
let extensionId: string

test.beforeAll(async () => {
  if (!fs.existsSync(path.join(DIST_PATH, 'manifest.json'))) {
    throw new Error('Extension not built. Run `npm run build` first.')
  }

  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${DIST_PATH}`,
      `--load-extension=${DIST_PATH}`,
      '--no-first-run',
      '--disable-default-apps',
    ],
  })

  let serviceWorker = context.serviceWorkers()[0]
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker')
  }
  extensionId = serviceWorker.url().match(/chrome-extension:\/\/([a-z]+)/)![1]
})

test.afterAll(async () => {
  await context?.close()
})

function optionsUrl(): string {
  return `chrome-extension://${extensionId}/src/options/index.html`
}

test.describe('options page', () => {
  let page: Page

  test.beforeEach(async () => {
    page = await context.newPage()
    await page.goto(optionsUrl())
    await page.waitForSelector('.layout')
  })

  test.afterEach(async () => {
    await page?.close()
  })

  test('renders sidebar with three nav items', async () => {
    const navItems = page.locator('.nav-item')
    await expect(navItems).toHaveCount(3)
    await expect(navItems.nth(0)).toHaveText('Tabs')
    await expect(navItems.nth(1)).toHaveText('Appearance')
    await expect(navItems.nth(2)).toHaveText('About')
  })

  test('tabs section is active by default', async () => {
    const activeNav = page.locator('.nav-item.active')
    await expect(activeNav).toHaveText('Tabs')
    await expect(page.locator('.section-title')).toHaveText('Tabs')
  })

  test('navigating between sections updates content', async () => {
    await page.locator('.nav-item', { hasText: 'Appearance' }).click()
    await expect(page.locator('.section-title')).toHaveText('Appearance')

    await page.locator('.nav-item', { hasText: 'About' }).click()
    await expect(page.locator('.section-title')).toHaveText('About')

    await page.locator('.nav-item', { hasText: 'Tabs' }).click()
    await expect(page.locator('.section-title')).toHaveText('Tabs')
  })

  test('tabs section shows new tab placement and close behavior options', async () => {
    await expect(page.locator('h3', { hasText: 'Tabs opened from links' })).toBeVisible()
    await expect(page.locator('h3', { hasText: 'Blank new tabs' })).toBeVisible()
    await expect(page.locator('h3', { hasText: 'Default close behavior' })).toBeVisible()
  })

  test('new tab from links defaults to child of active tab', async () => {
    const childRadio = page.locator('input[name="newTabFromLink"][value="child"]')
    await expect(childRadio).toBeChecked()
  })

  test('blank new tabs defaults to end of root list', async () => {
    const rootEndRadio = page.locator('input[name="newTabBlank"][value="root-end"]')
    await expect(rootEndRadio).toBeChecked()
  })

  test('close behavior defaults to promote', async () => {
    const promoteRadio = page.locator('input[name="closeBehavior"][value="promote"]')
    await expect(promoteRadio).toBeChecked()
  })

  test('changing a tab placement setting persists across page reload', async () => {
    await page.locator('input[name="newTabFromLink"][value="sibling"]').click()
    await page.waitForTimeout(500)

    await page.reload()
    await page.waitForSelector('.layout')

    const siblingRadio = page.locator('input[name="newTabFromLink"][value="sibling"]')
    await expect(siblingRadio).toBeChecked()
  })

  test('appearance section shows theme and density options', async () => {
    await page.locator('.nav-item', { hasText: 'Appearance' }).click()

    await expect(page.locator('h3', { hasText: 'Theme' })).toBeVisible()
    await expect(page.locator('h3', { hasText: 'Density' })).toBeVisible()

    const systemRadio = page.locator('input[name="theme"][value="system"]')
    await expect(systemRadio).toBeChecked()

    const comfortableRadio = page.locator('input[name="density"][value="comfortable"]')
    await expect(comfortableRadio).toBeChecked()
  })

  test('changing theme to dark applies theme-dark class', async () => {
    await page.locator('.nav-item', { hasText: 'Appearance' }).click()
    await page.locator('input[name="theme"][value="dark"]').click()
    await page.waitForTimeout(200)

    const hasDarkClass = await page.evaluate(() =>
      document.documentElement.classList.contains('theme-dark'),
    )
    expect(hasDarkClass).toBe(true)
  })

  test('changing density to compact applies density-compact class', async () => {
    await page.locator('.nav-item', { hasText: 'Appearance' }).click()
    await page.locator('input[name="density"][value="compact"]').click()
    await page.waitForTimeout(200)

    const hasCompactClass = await page.evaluate(() =>
      document.documentElement.classList.contains('density-compact'),
    )
    expect(hasCompactClass).toBe(true)
  })

  test('about section shows version and reset button', async () => {
    await page.locator('.nav-item', { hasText: 'About' }).click()

    await expect(page.locator('.version-value')).toHaveText('0.0.1')
    await expect(page.locator('.reset-button')).toBeVisible()
  })

  test('reset to defaults restores all settings', async () => {
    await page.locator('input[name="newTabFromLink"][value="root-top"]').click()
    await page.waitForTimeout(300)

    await page.locator('.nav-item', { hasText: 'Appearance' }).click()
    await page.locator('input[name="theme"][value="dark"]').click()
    await page.locator('input[name="density"][value="compact"]').click()
    await page.waitForTimeout(300)

    await page.locator('.nav-item', { hasText: 'About' }).click()
    await page.locator('.reset-button').click()
    await page.waitForTimeout(300)

    await page.locator('.nav-item', { hasText: 'Tabs' }).click()
    const childRadio = page.locator('input[name="newTabFromLink"][value="child"]')
    await expect(childRadio).toBeChecked()

    await page.locator('.nav-item', { hasText: 'Appearance' }).click()
    const systemRadio = page.locator('input[name="theme"][value="system"]')
    await expect(systemRadio).toBeChecked()
    const comfortableRadio = page.locator('input[name="density"][value="comfortable"]')
    await expect(comfortableRadio).toBeChecked()
  })

  test('settings sync between two options pages', async () => {
    const page2 = await context.newPage()
    await page2.goto(optionsUrl())
    await page2.waitForSelector('.layout')

    await page.locator('.nav-item', { hasText: 'Appearance' }).click()
    await page.locator('input[name="theme"][value="light"]').click()
    await page.waitForTimeout(500)

    await page2.locator('.nav-item', { hasText: 'Appearance' }).click()
    const lightRadio = page2.locator('input[name="theme"][value="light"]')
    await expect(lightRadio).toBeChecked()

    await page2.close()
  })
})
