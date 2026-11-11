<script lang="ts">
  import { fade } from 'svelte/transition';
  import { confirmacion } from '../lib/avisos.svelte';
  import { t } from '../lib/i18n.svelte';

  let cancelar = $state<HTMLButtonElement>();
  // El foco va a "Cancelar" (no a la acción destructiva).
  $effect(() => { if (confirmacion.actual) requestAnimationFrame(() => cancelar?.focus()); });
  const responder = (si: boolean) => confirmacion.actual?.responder(si);
</script>

{#if confirmacion.actual}
  {@const p = confirmacion.actual}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="modal-overlay modal-overlay--visible" transition:fade={{ duration: 140 }} onclick={(e) => e.target === e.currentTarget && responder(false)} onkeydown={(e) => e.key === 'Escape' && responder(false)}>
    <div class="modal modal--confirmacion" role="alertdialog" aria-modal="true" aria-label={t(p.titulo)}>
      <h3 class="modal__titulo">{t(p.titulo)}</h3>
      <p class="modal__mensaje">{t(p.mensaje)}</p>
      <div class="modal__acciones">
        <button bind:this={cancelar} type="button" class="btn btn--fantasma" onclick={() => responder(false)}>{t('Cancel')}</button>
        <button type="button" class="btn btn--peligro" onclick={() => responder(true)}>{t(p.textoConfirmar)}</button>
      </div>
    </div>
  </div>
{/if}
