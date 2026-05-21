export function getFaviconDisplayUrl(
  favIconUrl: string | undefined,
  pageUrl: string,
): string | null {
  if (favIconUrl && !favIconUrl.startsWith('chrome://') && !favIconUrl.startsWith('chrome-extension://')) {
    return favIconUrl
  }

  if (pageUrl && (pageUrl.startsWith('http://') || pageUrl.startsWith('https://'))) {
    return `chrome://favicon2/?size=32&scale_factor=1x&show_fallback_monogram&page_url=${encodeURIComponent(pageUrl)}`
  }

  return null
}
