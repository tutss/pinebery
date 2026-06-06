import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url))
const DIST_PATH = path.resolve(CURRENT_DIR, '../../dist')

// Matches DEFAULT_PANEL_ID in src/shared/types.ts. State is v2: root order is
// nested per panel under each window.
const DEFAULT_PANEL = 'default'

let context: BrowserContext
let extensionId: string
let extPage: Page

interface NodeInfo {
  id: string
  tabId: number
  parentId: string | null
  childIds: string[]
  url: string
  panelId: string
}

interface TreeState {
  nodesByWindow: Record<string, Record<string, NodeInfo>>
  rootOrderByWindow: Record<string, Record<string, string[]>>
  settings: Record<string, string>
}

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

  extPage = await context.newPage()
  await extPage.goto(`chrome-extension://${extensionId}/src/options/index.html`)
  await extPage.waitForSelector('.layout')
})

test.afterAll(async () => {
  await context?.close()
})

async function getTreeState(): Promise<TreeState> {
  return extPage.evaluate(() => {
    return new Promise<any>((resolve) => {
      chrome.runtime.sendMessage({ type: 'pinebery/request-tree' }, (response: any) =>
        resolve(response.state),
      )
    })
  })
}

async function updateSetting(patch: Record<string, string>): Promise<void> {
  await extPage.evaluate((p) => {
    chrome.runtime.sendMessage({ type: 'pinebery/update-settings', patch: p })
  }, patch)
  await extPage.waitForTimeout(300)
}

function getWindowId(state: TreeState): string {
  return Object.keys(state.rootOrderByWindow)[0]
}

function rootList(state: TreeState, windowId: string, panelId = DEFAULT_PANEL): string[] {
  return state.rootOrderByWindow[windowId]?.[panelId] ?? []
}

function findNodeByUrl(state: TreeState, windowId: string, urlPart: string): NodeInfo | undefined {
  return Object.values(state.nodesByWindow[windowId] ?? {}).find((n) => n.url.includes(urlPart))
}

async function openLinkTab(parentPage: Page, href: string): Promise<Page> {
  const [childPage] = await Promise.all([
    context.waitForEvent('page'),
    parentPage.evaluate((url) => {
      const a = document.createElement('a')
      a.href = url
      a.target = '_blank'
      document.body.appendChild(a)
      a.click()
    }, href),
  ])
  await childPage.waitForTimeout(800)
  return childPage
}

test.describe('blank tab placement', () => {
  test('root-end: Ctrl+T blank tab lands at end of root list', async () => {
    await updateSetting({ newTabBlank: 'root-end' })

    const helperPage = await context.newPage()
    await helperPage.goto('https://example.com')
    await helperPage.waitForTimeout(500)

    const stateBefore = await getTreeState()
    const windowId = getWindowId(stateBefore)
    const rootCountBefore = rootList(stateBefore, windowId).length

    await extPage.evaluate(async () => {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
      await chrome.tabs.create({ openerTabId: activeTab.id })
    })
    await extPage.waitForTimeout(800)

    const stateAfter = await getTreeState()
    const rootsAfter = rootList(stateAfter, windowId)

    expect(rootsAfter.length).toBe(rootCountBefore + 1)
    const lastNode = stateAfter.nodesByWindow[windowId][rootsAfter[rootsAfter.length - 1]]
    expect(lastNode.parentId).toBeNull()

    await helperPage.close()
    await extPage.waitForTimeout(300)
  })

  test('root-top: Ctrl+T blank tab lands at top of root list', async () => {
    await updateSetting({ newTabBlank: 'root-top' })

    const helperPage = await context.newPage()
    await helperPage.goto('https://example.com')
    await helperPage.waitForTimeout(500)

    const stateBefore = await getTreeState()
    const windowId = getWindowId(stateBefore)
    const firstRootBefore = rootList(stateBefore, windowId)[0]

    await extPage.evaluate(async () => {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
      await chrome.tabs.create({ openerTabId: activeTab.id })
    })
    await extPage.waitForTimeout(800)

    const stateAfter = await getTreeState()
    const rootsAfter = rootList(stateAfter, windowId)

    expect(rootsAfter[0]).not.toBe(firstRootBefore)
    const topNode = stateAfter.nodesByWindow[windowId][rootsAfter[0]]
    expect(topNode.parentId).toBeNull()

    await helperPage.close()
    await extPage.waitForTimeout(300)
  })
})

test.describe('link tab placement', () => {
  test('child: tab from a target=_blank link becomes child of opener', async () => {
    await updateSetting({ newTabFromLink: 'child', newTabBlank: 'root-end' })

    const parentPage = await context.newPage()
    await parentPage.goto('https://example.com')
    await parentPage.waitForTimeout(500)

    const windowId = getWindowId(await getTreeState())
    const childPage = await openLinkTab(parentPage, 'https://example.org/')

    const stateAfter = await getTreeState()
    const parentNode = findNodeByUrl(stateAfter, windowId, 'example.com')
    const childNode = findNodeByUrl(stateAfter, windowId, 'example.org')

    expect(parentNode).toBeTruthy()
    expect(childNode).toBeTruthy()
    expect(childNode!.parentId).toBe(parentNode!.id)
    expect(parentNode!.childIds).toContain(childNode!.id)

    await childPage.close()
    await parentPage.close()
    await extPage.waitForTimeout(300)
  })

  test('child: tab from a window.open("about:blank") button becomes child of opener', async () => {
    await updateSetting({ newTabFromLink: 'child', newTabBlank: 'root-end' })

    const parentPage = await context.newPage()
    await parentPage.goto('https://example.com')
    await parentPage.waitForTimeout(500)

    const windowId = getWindowId(await getTreeState())

    // The popup-blocker-dodging pattern: open about:blank synchronously on a
    // user gesture, then navigate it to the real URL afterwards.
    await parentPage.evaluate(() => {
      const btn = document.createElement('button')
      btn.id = 'js-open'
      btn.addEventListener('click', () => {
        const w = window.open('about:blank', '_blank')
        setTimeout(() => {
          if (w) w.location.href = 'https://example.net/'
        }, 60)
      })
      document.body.appendChild(btn)
    })

    const [childPage] = await Promise.all([
      context.waitForEvent('page'),
      parentPage.click('#js-open'),
    ])
    await childPage.waitForTimeout(900)

    const stateAfter = await getTreeState()
    const parentNode = findNodeByUrl(stateAfter, windowId, 'example.com')
    const childNode = findNodeByUrl(stateAfter, windowId, 'example.net')

    expect(parentNode).toBeTruthy()
    expect(childNode).toBeTruthy()
    expect(childNode!.parentId).toBe(parentNode!.id)
    expect(parentNode!.childIds).toContain(childNode!.id)

    await childPage.close()
    await parentPage.close()
    await extPage.waitForTimeout(300)
  })

  test('sibling: tab from link becomes sibling of opener and sits next to it', async () => {
    await updateSetting({ newTabFromLink: 'sibling', newTabBlank: 'root-end' })

    const parentPage = await context.newPage()
    await parentPage.goto('https://example.com')
    await parentPage.waitForTimeout(500)

    const windowId = getWindowId(await getTreeState())
    const childPage = await openLinkTab(parentPage, 'https://example.org/')

    const stateAfter = await getTreeState()
    const parentNode = findNodeByUrl(stateAfter, windowId, 'example.com')
    const siblingNode = findNodeByUrl(stateAfter, windowId, 'example.org')

    expect(parentNode).toBeTruthy()
    expect(siblingNode).toBeTruthy()
    expect(siblingNode!.parentId).toBe(parentNode!.parentId)

    // Sibling of a root opener is itself a root, placed immediately after it.
    const roots = rootList(stateAfter, windowId)
    expect(roots.indexOf(siblingNode!.id)).toBe(roots.indexOf(parentNode!.id) + 1)

    await childPage.close()
    await parentPage.close()
    await extPage.waitForTimeout(300)
  })

  test('root-end: tab from link becomes root at end when configured', async () => {
    await updateSetting({ newTabFromLink: 'root-end', newTabBlank: 'root-top' })

    const parentPage = await context.newPage()
    await parentPage.goto('https://example.com')
    await parentPage.waitForTimeout(500)

    const windowId = getWindowId(await getTreeState())
    const childPage = await openLinkTab(parentPage, 'https://example.org/')

    const stateAfter = await getTreeState()
    const roots = rootList(stateAfter, windowId)
    const childNode = findNodeByUrl(stateAfter, windowId, 'example.org')

    expect(childNode).toBeTruthy()
    expect(childNode!.parentId).toBeNull()
    expect(roots[roots.length - 1]).toBe(childNode!.id)

    await childPage.close()
    await parentPage.close()
    await extPage.waitForTimeout(300)
  })
})

test.describe('settings persistence', () => {
  test('changed placement settings persist in extension state', async () => {
    await updateSetting({ newTabBlank: 'root-top', newTabFromLink: 'sibling' })

    const state = await getTreeState()
    expect(state.settings.newTabBlank).toBe('root-top')
    expect(state.settings.newTabFromLink).toBe('sibling')

    await updateSetting({ newTabBlank: 'root-end', newTabFromLink: 'child' })

    const stateReset = await getTreeState()
    expect(stateReset.settings.newTabBlank).toBe('root-end')
    expect(stateReset.settings.newTabFromLink).toBe('child')
  })
})
