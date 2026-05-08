<script lang="ts">
  import type { Settings, Density } from '../../shared/types'

  interface Props {
    settings: Settings
    onUpdate: (patch: Partial<Settings>) => void
  }

  let { settings, onUpdate }: Props = $props()
</script>

<div class="section-content">
  <div class="group">
    <h3>Theme</h3>
    <div class="options">
      <label class="option">
        <input
          type="radio"
          name="theme"
          value="system"
          checked={settings.theme === 'system'}
          onchange={() => onUpdate({ theme: 'system' })}
        />
        <span>System</span>
      </label>
      <label class="option">
        <input
          type="radio"
          name="theme"
          value="light"
          checked={settings.theme === 'light'}
          onchange={() => onUpdate({ theme: 'light' })}
        />
        <span>Light</span>
      </label>
      <label class="option">
        <input
          type="radio"
          name="theme"
          value="dark"
          checked={settings.theme === 'dark'}
          onchange={() => onUpdate({ theme: 'dark' })}
        />
        <span>Dark</span>
      </label>
    </div>
  </div>

  <div class="group">
    <h3>Density</h3>
    <p class="hint">Controls row height, font size, and icon size in the side panel.</p>
    <div class="options">
      <label class="option">
        <input
          type="radio"
          name="density"
          value="comfortable"
          checked={settings.density === 'comfortable'}
          onchange={() => onUpdate({ density: 'comfortable' as Density })}
        />
        <span>Comfortable</span>
      </label>
      <label class="option">
        <input
          type="radio"
          name="density"
          value="compact"
          checked={settings.density === 'compact'}
          onchange={() => onUpdate({ density: 'compact' as Density })}
        />
        <span>Compact</span>
      </label>
    </div>
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

  .options {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .option {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    cursor: pointer;
  }

  .option input[type='radio'] {
    margin: 0;
    accent-color: var(--accent);
  }
</style>
