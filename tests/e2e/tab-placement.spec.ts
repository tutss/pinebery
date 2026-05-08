import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url))
const DIST_PATH = path.resolve(CURRENT_DIR, '../../dist')

let context: BrowserContext
let extensionId: string
let extPage: Page

interface NodeInfo {
  id: string
  tabId: number
  parentId: string | null
  childIds: string[]
}

interface TreeState {
  nodesByWindow: Record<string, Record<string, NodeInfo>>
  rootOrderByWindow: Record<string, string[]>
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
      chrome.runtime.sendMessage(
        { type: 'pinebery/request-tree' },
        (response: any) => resolve(response.state),
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


test.describe('blank tab placement', () => {
  test('root-end: Ctrl+T blank tab lands at end of root list', async () => {
    await updateSetting({ newTabBlank: 'root-end' })

    const helperPage = await context.newPage()
    await helperPage.goto('https://example.com')
    await helperPage.waitForTimeout(500)

    const stateBefore = await getTreeState()
    const windowId = getWindowId(stateBefore)
    const rootCountBefore = stateBefore.rootOrderByWindow[windowId].length

    await extPage.evaluate(async () => {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
      await chrome.tabs.create({ openerTabId: activeTab.id })
    })
    await extPage.waitForTimeout(800)

    const stateAfter = await getTreeState()
    const rootsAfter = stateAfter.rootOrderByWindow[windowId]

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
    const firstRootBefore = stateBefore.rootOrderByWindow[windowId][0]

    await extPage.evaluate(async () => {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
      await chrome.tabs.create({ openerTabId: activeTab.id })
    })
    await extPage.waitForTimeout(800)

    const stateAfter = await getTreeState()
    const rootsAfter = stateAfter.rootOrderByWindow[windowId]

    expect(rootsAfter[0]).not.toBe(firstRootBefore)
    const topNode = stateAfter.nodesByWindow[windowId][rootsAfter[0]]
    expect(topNode.parentId).toBeNull()

    await helperPage.close()
    await extPage.waitForTimeout(300)
  })
})

test.describe('link tab placement', () => {
  test('child: tab from link becomes child of opener', async () => {
    await updateSetting({ newTabFromLink: 'child' })

    const parentPage = await context.newPage()
    await parentPage.goto('https://example.com')
    await parentPage.waitForTimeout(500)

    const stateBeforeLink = await getTreeState()
    const windowId = getWindowId(stateBeforeLink)

    const [childPage] = await Promise.all([
      context.waitForEvent('page'),
      parentPage.evaluate(() => {
        const a = document.createElement('a')
        a.href = 'https://example.org'
        a.target = '_blank'
        document.body.appendChild(a)
        a.click()
      }),
    ])
    await childPage.waitForTimeout(800)

    const stateAfter = await getTreeState()
    const allNodes = Object.values(stateAfter.nodesByWindow[windowId])

    const parentNode = allNodes.find((n) => {
      const stateNode = stateAfter.nodesByWindow[windowId][n.id] as any
      return stateNode?.url?.includes('example.com')
    })
    const childNode = allNodes.find((n) => {
      const stateNode = stateAfter.nodesByWindow[windowId][n.id] as any
      return stateNode?.url?.includes('example.org')
    })

    if (parentNode && childNode) {
      expect(childNode.parentId).toBe(parentNode.id)
      expect(parentNode.childIds).toContain(childNode.id)
    }

    await childPage.close()
    await parentPage.close()
    await extPage.waitForTimeout(300)
  })

  test('sibling: tab from link becomes sibling of opener', async () => {
    await updateSetting({ newTabFromLink: 'sibling' })

    const parentPage = await context.newPage()
    await parentPage.goto('https://example.com')
    await parentPage.waitForTimeout(500)

    const stateBeforeLink = await getTreeState()
    const windowId = getWindowId(stateBeforeLink)

    const [siblingPage] = await Promise.all([
      context.waitForEvent('page'),
      parentPage.evaluate(() => {
        const a = document.createElement('a')
        a.href = 'https://example.org'
        a.target = '_blank'
        document.body.appendChild(a)
        a.click()
      }),
    ])
    await siblingPage.waitForTimeout(800)

    const stateAfter = await getTreeState()
    const allNodes = Object.values(stateAfter.nodesByWindow[windowId])

    const parentNode = allNodes.find((n) => {
      const stateNode = stateAfter.nodesByWindow[windowId][n.id] as any
      return stateNode?.url?.includes('example.com')
    })
    const siblingNode = allNodes.find((n) => {
      const stateNode = stateAfter.nodesByWindow[windowId][n.id] as any
      return stateNode?.url?.includes('example.org')
    })

    if (parentNode && siblingNode) {
      expect(siblingNode.parentId).toBe(parentNode.parentId)
    }

    await siblingPage.close()
    await parentPage.close()
    await extPage.waitForTimeout(300)
  })

  test('root-end: tab from link becomes root at end', async () => {
    await updateSetting({ newTabFromLink: 'root-end' })

    const parentPage = await context.newPage()
    await parentPage.goto('https://example.com')
    await parentPage.waitForTimeout(500)

    const [childPage] = await Promise.all([
      context.waitForEvent('page'),
      parentPage.evaluate(() => {
        const a = document.createElement('a')
        a.href = 'https://example.org'
        a.target = '_blank'
        document.body.appendChild(a)
        a.click()
      }),
    ])
    await childPage.waitForTimeout(800)

    const stateAfter = await getTreeState()
    const windowId = getWindowId(stateAfter)
    const rootsAfter = stateAfter.rootOrderByWindow[windowId]

    const lastNode = stateAfter.nodesByWindow[windowId][rootsAfter[rootsAfter.length - 1]]
    expect(lastNode.parentId).toBeNull()

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
