<script lang="ts">
  import { onMount } from 'svelte'
  import TabsSection from './sections/TabsSection.svelte'
  import PanelsSection from './sections/PanelsSection.svelte'
  import AppearanceSection from './sections/AppearanceSection.svelte'
  import AboutSection from './sections/AboutSection.svelte'
  import {
    MSG_REQUEST_TREE,
    MSG_TREE_UPDATED,
    MSG_UPDATE_SETTINGS,
    type TreeUpdatedMessage,
    type PineberyMessage,
  } from '../shared/messages'
  import { DEFAULT_SETTINGS, createEmptyState, type Settings, type StoredState } from '../shared/types'

  type Section = 'tabs' | 'panels' | 'appearance' | 'about'

  let currentSection: Section = $state('tabs')
  let settings: Settings = $state({ ...DEFAULT_SETTINGS })
  let fullState: StoredState = $state(createEmptyState())
  let isReady = $state(false)

  const navItems: { id: Section; label: string }[] = [
    { id: 'tabs', label: 'Tabs' },
    { id: 'panels', label: 'Panels' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'about', label: 'About' },
  ]

  function handleSettingsUpdate(patch: Partial<Settings>) {
    settings = { ...settings, ...patch }
    chrome.runtime
      .sendMessage({ type: MSG_UPDATE_SETTINGS, patch })
      .catch((error: unknown) => {
        console.warn('pinebery: failed to send update settings message', error)
      })
  }

  onMount(() => {
    chrome.runtime.onMessage.addListener(
      (message: PineberyMessage) => {
        if (message.type === MSG_TREE_UPDATED) {
          settings = message.state.settings
          fullState = message.state
        }
      },
    )

    chrome.runtime
      .sendMessage({ type: MSG_REQUEST_TREE })
      .then((response: TreeUpdatedMessage | undefined) => {
        if (response?.state) {
          settings = response.state.settings
          fullState = response.state
          isReady = true
        }
      })
      .catch((error: unknown) => {
        console.warn('pinebery: failed to request tree', error)
      })
  })

  $effect(() => {
    const root = document.documentElement
    root.classList.remove('theme-light', 'theme-dark')
    if (settings.theme === 'light') {
      root.classList.add('theme-light')
    } else if (settings.theme === 'dark') {
      root.classList.add('theme-dark')
    }
    root.classList.toggle('density-compact', settings.density === 'compact')
  })
</script>

<div class="layout">
  <nav class="sidebar">
    <h1 class="logo">Pinebery</h1>
    {#each navItems as item}
      <button
        type="button"
        class="nav-item"
        class:active={currentSection === item.id}
        onclick={() => (currentSection = item.id)}
      >
        {item.label}
      </button>
    {/each}
  </nav>

  <main class="content">
    {#if !isReady}
      <p class="status">Loading settings...</p>
    {:else}
      <h2 class="section-title">
        {navItems.find((n) => n.id === currentSection)?.label}
      </h2>

      {#if currentSection === 'tabs'}
        <TabsSection {settings} onUpdate={handleSettingsUpdate} />
      {:else if currentSection === 'panels'}
        <PanelsSection state={fullState} />
      {:else if currentSection === 'appearance'}
        <AppearanceSection {settings} onUpdate={handleSettingsUpdate} />
      {:else if currentSection === 'about'}
        <AboutSection onUpdate={handleSettingsUpdate} />
      {/if}
    {/if}
  </main>
</div>

<style>
  .layout {
    display: flex;
    min-height: 100vh;
  }

  .sidebar {
    width: 180px;
    flex-shrink: 0;
    border-right: 1px solid var(--border);
    padding: 16px 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .logo {
    font-size: 14px;
    font-weight: 700;
    margin: 0 0 12px 0;
    padding: 0 16px;
    letter-spacing: 0.02em;
  }

  .nav-item {
    display: block;
    width: 100%;
    padding: 8px 16px;
    border: none;
    background: transparent;
    color: var(--fg);
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    border-radius: 0;
  }

  .nav-item:hover {
    background: color-mix(in srgb, var(--fg) 6%, transparent);
  }

  .nav-item.active {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--accent);
    font-weight: 500;
  }

  .nav-item:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .content {
    flex: 1;
    padding: 24px 32px;
    max-width: 600px;
  }

  .section-title {
    font-size: 18px;
    font-weight: 600;
    margin: 0 0 20px 0;
  }

  .status {
    font-size: 13px;
    color: var(--fg-muted);
  }
</style>
