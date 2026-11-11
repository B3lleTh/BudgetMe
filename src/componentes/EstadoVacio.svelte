<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icono from './Icono.svelte';

  let { icono = 'vacio', titulo = '', texto = '', children }: { icono?: string; titulo?: string; texto?: string; children?: Snippet } = $props();
</script>

<div class="estado-vacio">
  <Icono nombre={icono} />
  {#if titulo}<h3>{titulo}</h3>{/if}
  {#if texto}<p>{texto}</p>{/if}
  {@render children?.()}
</div>
