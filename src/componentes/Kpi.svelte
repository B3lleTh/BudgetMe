<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icono from './Icono.svelte';

  interface Props { etiqueta: string; valor: string; icono?: string; clase?: string; nota?: Snippet; alAbrir?: () => void }
  let { etiqueta, valor, icono, clase = '', nota, alAbrir }: Props = $props();
</script>

{#if alAbrir}
  <button type="button" class="tarjeta tarjeta--clicable kpi" onclick={alAbrir}>
    <div class="kpi__etiqueta">{#if icono}<Icono nombre={icono} />{/if} {etiqueta}</div>
    <div class="kpi__valor numero {clase}">{valor}</div>
    {@render nota?.()}
  </button>
{:else}
  <div class="tarjeta kpi">
    <div class="kpi__etiqueta">{#if icono}<Icono nombre={icono} />{/if} {etiqueta}</div>
    <div class="kpi__valor numero {clase}">{valor}</div>
    {@render nota?.()}
  </div>
{/if}

<style>
  .kpi { text-align: left; font: inherit; color: inherit; width: 100%; }
</style>
