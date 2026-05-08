<script lang="ts">
  import type { Settings } from '../../shared/types'
  import { DEFAULT_SETTINGS } from '../../shared/types'

  interface Props {
    onUpdate: (patch: Partial<Settings>) => void
  }

  let { onUpdate }: Props = $props()

  const version = chrome.runtime.getManifest().version
</script>

<div class="section-content">
  <div class="group">
    <h3>Version</h3>
    <p class="version-value">{version}</p>
  </div>

  <div class="group">
    <h3>Reset</h3>
    <p class="hint">Restore all settings to their default values.</p>
    <button
      type="button"
      class="reset-button"
      onclick={() => onUpdate(DEFAULT_SETTINGS)}
    >
      Reset to defaults
    </button>
  </div>
</div>

<style>
  .section-content {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  h3 {
    font-size: 14px;
    font-weight: 600;
    margin: 0;
    color: var(--fg);
  }

  .hint {
    font-size: 12px;
    color: var(--fg-muted);
    margin: 0;
  }

  .version-value {
    font-size: 13px;
    color: var(--fg-muted);
    margin: 0;
  }

  .reset-button {
    align-self: flex-start;
    padding: 6px 16px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: transparent;
    color: var(--fg);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }

  .reset-button:hover {
    background: color-mix(in srgb, var(--fg) 8%, transparent);
  }

  .reset-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
</style>
