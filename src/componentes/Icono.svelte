<script lang="ts">
  import { ICONOS, type NombreIcono } from '../lib/iconos';

  let { nombre, clase = '' }: { nombre: NombreIcono | string; clase?: string } = $props();
  const trazos = $derived(ICONOS[nombre as NombreIcono] ?? ICONOS.vacio);
</script>

<!-- Los trazos son constantes del código (no datos del usuario), por eso {@html} es seguro aquí. -->
<span class="icono {clase}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{@html trazos}</svg></span>
