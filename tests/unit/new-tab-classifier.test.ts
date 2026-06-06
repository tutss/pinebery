import { describe, it, expect } from 'vitest'
import { isLinkOpenedTab, isNewTabPageUrl } from '../../src/background/new-tab-classifier'

describe('isNewTabPageUrl', () => {
  it('recognises the New Tab Page', () => {
    expect(isNewTabPageUrl('chrome://newtab/')).toBe(true)
    expect(isNewTabPageUrl('chrome://new-tab-page/')).toBe(true)
    expect(isNewTabPageUrl('chrome-search://local-ntp/local-ntp.html')).toBe(true)
    expect(isNewTabPageUrl('about:newtab')).toBe(true)
  })

  it('does not treat empty, undefined, about:blank or http as the New Tab Page', () => {
    expect(isNewTabPageUrl('')).toBe(false)
    expect(isNewTabPageUrl(undefined)).toBe(false)
    expect(isNewTabPageUrl('about:blank')).toBe(false)
    expect(isNewTabPageUrl('https://example.com/')).toBe(false)
  })
})

describe('isLinkOpenedTab', () => {
  it('treats a tab with no opener as not link-opened', () => {
    expect(isLinkOpenedTab({ hasOpener: false, url: '', pendingUrl: 'https://example.com/' })).toBe(
      false,
    )
  })

  it('treats a plain target=_blank anchor as link-opened (url empty, no pendingUrl at onCreated)', () => {
    expect(isLinkOpenedTab({ hasOpener: true, url: '', pendingUrl: undefined })).toBe(true)
  })

  it('treats a window.open("about:blank") button as link-opened', () => {
    expect(isLinkOpenedTab({ hasOpener: true, url: 'about:blank', pendingUrl: undefined })).toBe(
      true,
    )
    expect(isLinkOpenedTab({ hasOpener: true, url: '', pendingUrl: 'about:blank' })).toBe(true)
  })

  it('treats a link with an already-known http target as link-opened', () => {
    expect(
      isLinkOpenedTab({ hasOpener: true, url: '', pendingUrl: 'https://example.org/' }),
    ).toBe(true)
  })

  it('treats a blank Cmd+T tab (opener set, heading to NTP) as not link-opened', () => {
    expect(isLinkOpenedTab({ hasOpener: true, url: '', pendingUrl: 'chrome://newtab/' })).toBe(
      false,
    )
    expect(
      isLinkOpenedTab({ hasOpener: true, url: 'chrome://newtab/', pendingUrl: undefined }),
    ).toBe(false)
  })
})
