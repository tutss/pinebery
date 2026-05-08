<script lang="ts">
  interface Props {
    value: string
    onChange: (next: string) => void
  }

  let { value, onChange }: Props = $props()

  function handleInput(event: Event) {
    const target = event.currentTarget as HTMLInputElement
    onChange(target.value)
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && value.length > 0) {
      event.preventDefault()
      onChange('')
    }
  }
</script>

<div class="filter">
  <input
    type="text"
    placeholder="Filter tabs..."
    {value}
    oninput={handleInput}
    onkeydown={handleKeydown}
    autocomplete="off"
    spellcheck="false"
  />
</div>

<style>
  .filter {
    padding: 6px 8px;
  }

  .filter input {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    font-size: 12px;
    box-sizing: border-box;
  }

  .filter input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .filter input::placeholder {
    color: var(--fg-muted);
  }
</style>
