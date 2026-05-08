<script lang="ts">
  import type { Settings, TabPlacement, CloseParentBehavior } from '../../shared/types'

  interface Props {
    settings: Settings
    onUpdate: (patch: Partial<Settings>) => void
  }

  let { settings, onUpdate }: Props = $props()

  const placementOptions: { value: TabPlacement; label: string }[] = [
    { value: 'child', label: 'Child of active tab (last child)' },
    { value: 'first-child', label: 'First child of active tab' },
    { value: 'sibling', label: 'Sibling after active tab' },
    { value: 'root-end', label: 'End of root list' },
    { value: 'root-top', label: 'Top of root list' },
  ]
</script>

<div class="section-content">
  <div class="group">
    <h3>Tabs opened from links</h3>
    <p class="hint">Where to place tabs that have an opener (e.g. clicking a link).</p>
    <div class="options">
      {#each placementOptions as opt}
        <label class="option">
          <input
            type="radio"
            name="newTabFromLink"
            value={opt.value}
            checked={settings.newTabFromLink === opt.value}
            onchange={() => onUpdate({ newTabFromLink: opt.value })}
          />
          <span>{opt.label}</span>
        </label>
      {/each}
    </div>
  </div>

  <div class="group">
    <h3>Blank new tabs</h3>
    <p class="hint">Where to place tabs opened via Ctrl+T or the new tab button.</p>
    <div class="options">
      {#each placementOptions as opt}
        <label class="option">
          <input
            type="radio"
            name="newTabBlank"
            value={opt.value}
            checked={settings.newTabBlank === opt.value}
            onchange={() => onUpdate({ newTabBlank: opt.value })}
          />
          <span>{opt.label}</span>
        </label>
      {/each}
    </div>
  </div>

  <div class="group">
    <h3>Pinned tabs section</h3>
    <p class="hint">
      Where to display pinned tabs in the sidebar. The Chrome tab itself stays pinned in the
      native strip either way.
    </p>
    <div class="options">
      <label class="option">
        <input
          type="radio"
          name="pinnedScope"
          value="panel"
          checked={settings.pinnedScope === 'panel'}
          onchange={() => onUpdate({ pinnedScope: 'panel' })}
        />
        <span>Per panel — show only pinned tabs from the active panel</span>
      </label>
      <label class="option">
        <input
          type="radio"
          name="pinnedScope"
          value="window"
          checked={settings.pinnedScope === 'window'}
          onchange={() => onUpdate({ pinnedScope: 'window' })}
        />
        <span>Window-wide — show all pinned tabs across panels</span>
      </label>
    </div>
  </div>

  <div class="group">
    <h3>Default close behavior</h3>
    <p class="hint">Shift+click inverts this choice.</p>
    <div class="options">
      <label class="option">
        <input
          type="radio"
          name="closeBehavior"
          value="promote"
          checked={settings.defaultCloseBehavior === 'promote'}
          onchange={() => onUpdate({ defaultCloseBehavior: 'promote' as CloseParentBehavior })}
        />
        <span>Promote children one level</span>
      </label>
      <label class="option">
        <input
          type="radio"
          name="closeBehavior"
          value="subtree"
          checked={settings.defaultCloseBehavior === 'subtree'}
          onchange={() => onUpdate({ defaultCloseBehavior: 'subtree' as CloseParentBehavior })}
        />
        <span>Close entire subtree</span>
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
