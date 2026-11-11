<script lang="ts">
  import type { Snippet } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { t } from '../lib/i18n.svelte';

  interface Props {
    abierto: boolean;
    titulo: string;
    subtitulo?: string;
    ancho?: 'normal' | 'ancho';
    children: Snippet;
    acciones?: Snippet;
    /** Si se omite, el pie muestra solo "Close". */
    alCerrar?: () => void;
  }
  let { abierto = $bindable(), titulo, subtitulo, ancho = 'normal', children, acciones, alCerrar }: Props = $props();

  let caja = $state<HTMLDivElement>();
  const cerrar = () => { abierto = false; alCerrar?.(); };

  // Foco inicial dentro del modal: sin esto Escape no llega al diálogo.
  $effect(() => {
    if (!abierto || !caja) return;
    const primero = caja.querySelector<HTMLElement>('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea, button');
    requestAnimationFrame(() => (primero ?? caja)?.focus());
  });
</script>

{#if abierto}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="modal-overlay modal-overlay--visible" transition:fade={{ duration: 140 }} onclick={(e) => e.target === e.currentTarget && cerrar()} onkeydown={(e) => e.key === 'Escape' && cerrar()}>
    <div bind:this={caja} class="modal" class:modal--formulario={ancho === 'ancho'} role="dialog" aria-modal="true" aria-label={titulo} tabindex="-1" transition:fly={{ y: 6, duration: 160 }}>
      <h3 class="modal__titulo">{titulo}</h3>
      {#if subtitulo}<p class="modal__subtitulo">{subtitulo}</p>{/if}
      {@render children()}
      {#if acciones}
        {@render acciones()}
      {:else}
        <div class="modal__acciones"><button type="button" class="btn btn--fantasma" onclick={cerrar}>{t('Close')}</button></div>
      {/if}
    </div>
  </div>
{/if}
