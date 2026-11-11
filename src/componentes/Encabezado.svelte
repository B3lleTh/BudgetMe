<script lang="ts">
  import type { Snippet } from 'svelte';

  let { titulo, children, acciones }: { titulo: string; children?: Snippet; acciones?: Snippet } = $props();
</script>

<header class="vista__encabezado">
  <div>
    <h1>{titulo}</h1>
    {#if children}<p>{@render children()}</p>{/if}
  </div>
  {#if acciones}<div class="vista__acciones">{@render acciones()}</div>{/if}
</header>
