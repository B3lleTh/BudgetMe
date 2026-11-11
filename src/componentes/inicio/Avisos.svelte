<script lang="ts">
  import Icono from '../Icono.svelte';
  import { navegar } from '../../lib/navegacion.svelte';
  import { t } from '../../lib/i18n.svelte';
  import type { Aviso } from './avisos';

  let { avisos }: { avisos: Aviso[] } = $props();
  const ICONO = { alerta: 'alerta', info: 'info', exito: 'check' } as const;
</script>

<section class="tarjeta">
  <div class="panel__encabezado"><h3>{t('Heads up')}</h3>{#if avisos.length}<span class="badge">{avisos.length}</span>{/if}</div>
  <ul class="avisos">
    {#each avisos.slice(0, 5) as a}
      <li class="aviso-item aviso-item--{a.tono}">
        <Icono nombre={ICONO[a.tono]} />
        <span>{a.texto}</span>
        {#if a.destino}{@const destino = a.destino}<button class="btn-icono" title={t('Open')} aria-label={t('Open')} onclick={() => navegar(destino)}><Icono nombre="flecha_abajo" clase="girado" /></button>{/if}
      </li>
    {:else}
      <li class="aviso-item aviso-item--exito"><Icono nombre="check" /><span>{t('All clear — nothing needs your attention.')}</span></li>
    {/each}
  </ul>
</section>

<style>
  .avisos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .aviso-item { display: flex; align-items: flex-start; gap: 10px; padding: 10px 10px 10px 12px; border-radius: var(--radio-sm); font-size: 13px; line-height: 1.45; background: var(--superficie-2); border-left: 3px solid var(--info); }
  .aviso-item span { flex: 1; }
  .aviso-item :global(.icono) { width: 16px; height: 16px; margin-top: 1px; color: var(--info); }
  .aviso-item--alerta { border-left-color: var(--perdida); }
  .aviso-item--alerta > :global(.icono) { color: var(--perdida); }
  .aviso-item--exito { border-left-color: var(--ganancia); }
  .aviso-item--exito > :global(.icono) { color: var(--ganancia); }
  .aviso-item .btn-icono { width: 24px; height: 24px; margin: -3px -4px 0 0; }
  .aviso-item :global(.girado) { transform: rotate(-90deg); color: var(--tinta-3) !important; }
</style>
