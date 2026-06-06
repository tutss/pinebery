/**
 * Returns the favicon image sources to try, in priority order.
 *
 * The page-declared `favIconUrl` is preferred, but it can fail to load in the
 * side panel: it is fetched cross-origin from a `chrome-extension://` page, so a
 * favicon served with `Cross-Origin-Resource-Policy: same-origin` is blocked.
 * Chrome's own favicon database (`/_favicon/`, enabled by the `favicon`
 * permission) is the same source the tab strip reads from and is never
 * CORP-blocked, so it is used as a fallback when the direct load fails.
 */
export function getFaviconSources(
  favIconUrl: string | undefined,
  pageUrl: string,
): string[] {
  const sources: string[] = []

  if (favIconUrl && !favIconUrl.startsWith('chrome://') && !favIconUrl.startsWith('chrome-extension://')) {
    sources.push(favIconUrl)
  }

  if (pageUrl && (pageUrl.startsWith('http://') || pageUrl.startsWith('https://'))) {
    sources.push(`/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`)
  }

  return sources
}
