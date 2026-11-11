<script lang="ts">
  import Icono from '../Icono.svelte';
  import { consultar } from '../../lib/datos/db';
  import { formatoMoneda, formatoFecha } from '../../lib/formato';
  import { navegar } from '../../lib/navegacion.svelte';
  import { ETIQUETAS_TIPO, signoDeMovimiento } from '../../lib/etiquetas';
  import { t } from '../../lib/i18n.svelte';
  import type { Transaccion } from '../../lib/datos/tipos';

  const signo = signoDeMovimiento;

  let movimientos = $state<Transaccion[]>([]);
  consultar<Transaccion>(`SELECT * FROM transacciones ORDER BY fecha DESC, id DESC LIMIT 6`).then((m) => (movimientos = m));
</script>

<section class="tarjeta">
  <div class="panel__encabezado"><h3>{t('Recent activity')}</h3><button class="btn btn--fantasma btn--sm" onclick={() => navegar('historial')}>{t('See history')}</button></div>
  <ul class="actividad">
    {#each movimientos as tx (tx.id)}
      {@const s = signo(tx)}
      <li>
        <span class="punto punto--{s || 'neutro'}"><Icono nombre={s === 'positivo' ? 'ingreso' : s === 'negativo' ? 'gasto' : 'transferir'} /></span>
        <span class="texto"><span class="nombre">{tx.notas || t(ETIQUETAS_TIPO[tx.tipo] ?? tx.tipo)}</span><span class="fecha">{formatoFecha(tx.fecha)}</span></span>
        <span class="numero {s}">{s === 'positivo' ? '+' : s === 'negativo' ? '−' : ''}{formatoMoneda(tx.monto)}</span>
      </li>
    {:else}
      <li class="vacio">{t('Every financial action you register will automatically appear here.')}</li>
    {/each}
  </ul>
</section>

<style>
  .actividad { list-style: none; margin: 0; padding: 0; }
  li { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--linea); font-size: 13px; }
  li:last-child { border-bottom: none; }
  .punto { width: 26px; height: 26px; border-radius: 7px; display: grid; place-items: center; flex-shrink: 0; background: var(--superficie-2); color: var(--tinta-2); }
  .punto :global(.icono) { width: 14px; height: 14px; }
  .punto--positivo { background: var(--ganancia-suave); color: var(--ganancia); }
  .punto--negativo { background: var(--perdida-suave); color: var(--perdida); }
  .texto { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .nombre { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .fecha { font-size: 11.5px; color: var(--tinta-3); }
  .vacio { color: var(--tinta-3); }
</style>
