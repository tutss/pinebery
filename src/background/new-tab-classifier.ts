const NEW_TAB_PAGE_PREFIXES = [
  'chrome://newtab',
  'chrome://new-tab-page',
  'chrome-search://',
  'about:newtab',
]

/**
 * Whether a URL points at the browser's New Tab Page. Used to recognise a blank
 * Cmd+T / Ctrl+T tab, which navigates to the NTP. An empty or undefined URL is
 * not treated as the NTP: link-opened tabs report an empty `url` and no
 * `pendingUrl` at `onCreated` time, so empty must not be read as "blank tab".
 */
export function isNewTabPageUrl(rawUrl: string | undefined): boolean {
  if (!rawUrl) return false
  const url = rawUrl.toLowerCase()
  return NEW_TAB_PAGE_PREFIXES.some((prefix) => url.startsWith(prefix))
}

export interface NewTabSignals {
  hasOpener: boolean
  url: string | undefined
  pendingUrl: string | undefined
}

/**
 * Classify a freshly created tab as link-opened or a blank new tab.
 *
 * At `chrome.tabs.onCreated` the destination URL is not yet populated for
 * link-opened tabs (`url` is `''` and `pendingUrl` is absent), so we cannot
 * positively match an http(s) target. We instead distinguish the two cases that
 * both carry an `openerTabId` in current Chrome: a blank Cmd+T tab navigates to
 * the New Tab Page (visible in `pendingUrl`), whereas a link-opened tab does
 * not. Anything with an opener that is not heading to the NTP is link-opened —
 * this covers plain `target="_blank"` anchors and `window.open('about:blank')`
 * buttons that navigate afterwards.
 */
export function isLinkOpenedTab(signals: NewTabSignals): boolean {
  if (!signals.hasOpener) return false
  const headingToNewTabPage =
    isNewTabPageUrl(signals.pendingUrl) || isNewTabPageUrl(signals.url)
  return !headingToNewTabPage
}
