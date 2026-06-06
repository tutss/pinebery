import { describe, it, expect } from 'vitest'
import { getFaviconSources } from '../../src/shared/favicon'

describe('getFaviconSources', () => {
  it('prefers the page-declared favicon, then the chrome favicon service', () => {
    const sources = getFaviconSources('https://claude.ai/favicon.ico', 'https://claude.ai/new')
    expect(sources).toEqual([
      'https://claude.ai/favicon.ico',
      '/_favicon/?pageUrl=https%3A%2F%2Fclaude.ai%2Fnew&size=32',
    ])
  })

  it('falls back to the favicon service when no favIconUrl is set', () => {
    const sources = getFaviconSources(undefined, 'https://example.com/')
    expect(sources).toEqual(['/_favicon/?pageUrl=https%3A%2F%2Fexample.com%2F&size=32'])
  })

  it('skips chrome:// and chrome-extension:// favicons but still offers the service', () => {
    expect(getFaviconSources('chrome://favicon/x', 'https://example.com/')).toEqual([
      '/_favicon/?pageUrl=https%3A%2F%2Fexample.com%2F&size=32',
    ])
    expect(getFaviconSources('chrome-extension://abc/icon.png', 'https://example.com/')).toEqual([
      '/_favicon/?pageUrl=https%3A%2F%2Fexample.com%2F&size=32',
    ])
  })

  it('returns no sources for non-http pages without a usable favicon', () => {
    expect(getFaviconSources(undefined, 'chrome://newtab/')).toEqual([])
    expect(getFaviconSources('chrome://favicon/x', 'about:blank')).toEqual([])
  })
})
