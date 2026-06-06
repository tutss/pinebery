<script lang="ts">
  import { getFaviconSources } from '../../shared/favicon'

  interface Props {
    favIconUrl?: string | undefined
    pageUrl: string
  }

  let { favIconUrl, pageUrl }: Props = $props()

  const sources = $derived(getFaviconSources(favIconUrl, pageUrl))
  let attemptIndex = $state(0)

  $effect(() => {
    sources
    attemptIndex = 0
  })

  const currentSrc = $derived(sources[attemptIndex] ?? null)

  function handleError() {
    attemptIndex += 1
  }
</script>

{#if currentSrc}
  <img class="favicon" src={currentSrc} alt="" onerror={handleError} />
{:else}
  <span class="favicon placeholder" aria-hidden="true"></span>
{/if}

<style>
  .favicon {
    width: var(--favicon-size, 16px);
    height: var(--favicon-size, 16px);
    flex-shrink: 0;
    border-radius: 2px;
  }

  .favicon.placeholder {
    background: color-mix(in srgb, var(--fg) 15%, transparent);
  }
</style>
