<script lang="ts">
  import { getFaviconDisplayUrl } from '../../shared/favicon'

  interface Props {
    favIconUrl?: string | undefined
    pageUrl: string
  }

  let { favIconUrl, pageUrl }: Props = $props()

  const displayUrl = $derived(getFaviconDisplayUrl(favIconUrl, pageUrl))
  let imgFailed = $state(false)

  $effect(() => {
    displayUrl
    imgFailed = false
  })

  function handleError() {
    imgFailed = true
  }
</script>

{#if displayUrl && !imgFailed}
  <img class="favicon" src={displayUrl} alt="" onerror={handleError} />
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
