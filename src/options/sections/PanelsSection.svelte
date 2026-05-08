<script lang="ts">
  import type { StoredState, Panel, GroupColor } from '../../shared/types'
  import { GROUP_COLOR_MAP } from '../../sidepanel/group-colors'
  import {
    MSG_CREATE_PANEL,
    MSG_UPDATE_PANEL,
    MSG_DELETE_PANEL,
  } from '../../shared/messages'

  interface Props {
    state: StoredState
  }

  const { state }: Props = $props()

  const colorEntries = Object.entries(GROUP_COLOR_MAP) as [GroupColor, string][]

  const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac')
  const emojiHint = isMac ? 'Cmd+Ctrl+Space for emoji' : 'Win+. for emoji'

  const panelsByWindow = $derived.by(() => {
    const result: { windowId: number; panels: Panel[] }[] = []
    for (const windowIdKey of Object.keys(state.panelOrderByWindow)) {
      const windowId = Number(windowIdKey)
      const order = state.panelOrderByWindow[windowId] ?? []
      const panels = state.panelsByWindow[windowId] ?? []
      const panelMap = new Map(panels.map((p) => [p.id, p]))
      const ordered = order.map((id) => panelMap.get(id)).filter((p): p is Panel => p !== undefined)
      result.push({ windowId, panels: ordered })
    }
    return result
  })

  function handleCreate(windowId: number) {
    chrome.runtime
      .sendMessage({ type: MSG_CREATE_PANEL, windowId })
      .catch((error: unknown) => {
        console.warn('pinebery: failed to create panel', error)
      })
  }

  function handleUpdateName(panelId: string, windowId: number, name: string) {
    chrome.runtime
      .sendMessage({ type: MSG_UPDATE_PANEL, panelId, windowId, patch: { name } })
      .catch((error: unknown) => {
        console.warn('pinebery: failed to update panel', error)
      })
  }

  function handleUpdateIcon(panelId: string, windowId: number, icon: string) {
    const trimmed = icon.trim()
    if (!trimmed) return
    chrome.runtime
      .sendMessage({ type: MSG_UPDATE_PANEL, panelId, windowId, patch: { icon: trimmed } })
      .catch((error: unknown) => {
        console.warn('pinebery: failed to update panel', error)
      })
  }

  function handleUpdateColor(panelId: string, windowId: number, color: GroupColor) {
    chrome.runtime
      .sendMessage({ type: MSG_UPDATE_PANEL, panelId, windowId, patch: { color } })
      .catch((error: unknown) => {
        console.warn('pinebery: failed to update panel', error)
      })
  }

  function handleDelete(panelId: string, windowId: number) {
    chrome.runtime
      .sendMessage({ type: MSG_DELETE_PANEL, panelId, windowId })
      .catch((error: unknown) => {
        console.warn('pinebery: failed to delete panel', error)
      })
  }
</script>

{#each panelsByWindow as { windowId, panels }}
  {#if panelsByWindow.length > 1}
    <h3>Window {windowId}</h3>
  {/if}

  <div class="panel-list">
    {#each panels as panel (panel.id)}
      <div class="panel-card">
        <div class="panel-header">
          <span class="panel-icon">{panel.icon}</span>
          <input
            type="text"
            class="panel-name"
            value={panel.name}
            onblur={(e) => handleUpdateName(panel.id, windowId, (e.target as HTMLInputElement).value)}
          />
          {#if panels.length > 1}
            <button
              type="button"
              class="delete-btn"
              onclick={() => handleDelete(panel.id, windowId)}
            >
              Delete
            </button>
          {/if}
        </div>

        <div class="panel-fields">
          <label class="field-row">
            <span class="field-label">Icon</span>
            <input
              type="text"
              class="icon-input"
              value={panel.icon}
              onblur={(e) => handleUpdateIcon(panel.id, windowId, (e.target as HTMLInputElement).value)}
            />
            <span class="hint">{emojiHint}</span>
          </label>

          <div class="field-row">
            <span class="field-label">Color</span>
            <div class="swatches">
              {#each colorEntries as [color, hex]}
                <button
                  type="button"
                  class="swatch"
                  class:active={panel.color === color}
                  style="background: {hex}"
                  onclick={() => handleUpdateColor(panel.id, windowId, color)}
                  aria-label={color}
                ></button>
              {/each}
            </div>
          </div>
        </div>
      </div>
    {/each}
  </div>

  <button type="button" class="add-btn" onclick={() => handleCreate(windowId)}>
    + Add panel
  </button>
{/each}

<style>
  h3 {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 12px 0;
  }

  .panel-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 16px;
  }

  .panel-card {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }

  .panel-icon {
    font-size: 18px;
  }

  .panel-name {
    flex: 1;
    font: inherit;
    font-size: 14px;
    font-weight: 500;
    padding: 2px 6px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: var(--fg);
  }

  .panel-name:focus {
    border-color: var(--accent);
    outline: none;
  }

  .delete-btn {
    font: inherit;
    font-size: 11px;
    padding: 2px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: transparent;
    color: #ea4335;
    cursor: pointer;
  }

  .delete-btn:hover {
    background: rgba(234, 67, 53, 0.08);
  }

  .panel-fields {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .field-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .field-label {
    font-size: 12px;
    color: var(--fg-muted);
    width: 36px;
    flex-shrink: 0;
  }

  .icon-input {
    width: 36px;
    text-align: center;
    font-size: 16px;
    padding: 2px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    color: var(--fg);
  }

  .icon-input:focus {
    border-color: var(--accent);
    outline: none;
  }

  .hint {
    font-size: 10px;
    color: var(--fg-muted);
  }

  .swatches {
    display: flex;
    gap: 4px;
  }

  .swatch {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
  }

  .swatch.active {
    border-color: var(--fg);
  }

  .swatch:hover {
    opacity: 0.8;
  }

  .swatch:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .add-btn {
    font: inherit;
    font-size: 13px;
    padding: 8px 16px;
    border: 1px dashed var(--border);
    border-radius: 6px;
    background: transparent;
    color: var(--fg-muted);
    cursor: pointer;
    width: 100%;
  }

  .add-btn:hover {
    border-color: var(--fg-muted);
    color: var(--fg);
    background: color-mix(in srgb, var(--fg) 4%, transparent);
  }
</style>
