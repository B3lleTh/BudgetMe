<script lang="ts">
  import { fly } from 'svelte/transition';
  import { toasts, cerrarToast } from '../lib/avisos.svelte';
  import Icono from './Icono.svelte';
</script>

<div class="toasts-contenedor" role="status" aria-live="polite">
  {#each toasts as toast (toast.id)}
    <button type="button" class="toast toast--visible toast--{toast.tipo}" transition:fly={{ y: -6, duration: 180 }} onclick={() => cerrarToast(toast.id)}>
      <Icono nombre={toast.tipo === 'exito' ? 'check' : toast.tipo === 'error' ? 'alerta' : 'info'} clase="toast__icono" />
      <span>{toast.mensaje}</span>
    </button>
  {/each}
</div>
