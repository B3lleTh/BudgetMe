<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icono from './Icono.svelte';

  interface Props {
    icono?: string; tonoIcono?: '' | 'ingreso' | 'gasto'; titulo: Snippet | string; meta?: Snippet | string;
    monto?: Snippet; acciones?: Snippet; pausada?: boolean; children?: Snippet;
  }
  let { icono, tonoIcono = '', titulo, meta, monto, acciones, pausada = false, children }: Props = $props();
</script>

<div class="fila" class:fila--pausada={pausada}>
  {#if icono}<div class="fila__icono {tonoIcono ? `fila__icono--${tonoIcono}` : ''}"><Icono nombre={icono} /></div>{/if}
  <div class="fila__cuerpo">
    <div class="fila__titulo">{#if typeof titulo === 'string'}{titulo}{:else}{@render titulo()}{/if}</div>
    {#if meta}<div class="fila__meta">{#if typeof meta === 'string'}{meta}{:else}{@render meta()}{/if}</div>{/if}
    {@render children?.()}
  </div>
  {@render monto?.()}
  {#if acciones}<div class="fila__acciones">{@render acciones()}</div>{/if}
</div>
