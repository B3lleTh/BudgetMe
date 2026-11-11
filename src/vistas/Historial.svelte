<script lang="ts">
  import Encabezado from '../componentes/Encabezado.svelte';
  import Fila from '../componentes/Fila.svelte';
  import Icono from '../componentes/Icono.svelte';
  import EstadoVacio from '../componentes/EstadoVacio.svelte';
  import { consultar } from '../lib/datos/db';
  import { revertirTransferencia } from '../lib/datos/ledger';
  import { formatoMoneda, formatoFecha } from '../lib/formato';
  import { etiquetaDeCuentaConBanco, ETIQUETAS_TIPO, signoDeMovimiento } from '../lib/etiquetas';
  import { confirmarYEliminar } from '../lib/avisos.svelte';
  import { t } from '../lib/i18n.svelte';
  import type { Transaccion } from '../lib/datos/tipos';

  let filtro = $state('');
  let filas = $state<Transaccion[]>([]);
  let nombres = $state<Record<string, string>>({});

  async function cargar() {
    filas = await consultar(
      filtro ? `SELECT * FROM transacciones WHERE tipo = $1 ORDER BY fecha DESC, id DESC LIMIT 150` : `SELECT * FROM transacciones ORDER BY fecha DESC, id DESC LIMIT 150`,
      filtro ? [filtro] : []
    );
    const mapa: Record<string, string> = {};
    for (const c of await consultar(`SELECT id, nombre, banco FROM cuentas_debito`)) mapa[`debito:${c.id}`] = etiquetaDeCuentaConBanco(c);
    for (const c of await consultar(`SELECT id, nombre, banco FROM tarjetas`)) mapa[`tarjeta:${c.id}`] = etiquetaDeCuentaConBanco(c);
    for (const c of await consultar(`SELECT id, nombre FROM cajas`)) mapa[`caja:${c.id}`] = c.nombre;
    nombres = mapa;
  }
  cargar();

  /** 'debito:3' → nombre real; nunca se muestran prefijos internos. */
  function legible(ref: string | null) {
    if (!ref) return '—';
    if (ref === 'externo') return t('External');
    if (nombres[ref]) return nombres[ref];
    if (ref.startsWith('debito')) return t('Deleted account');
    if (ref.startsWith('tarjeta')) return t('Deleted card');
    if (ref.startsWith('caja')) return t('Deleted box');
    return ref;
  }
  const signo = (tx: Transaccion) => signoDeMovimiento(tx) || 'neutro';

  const eliminarTransferencia = (tx: Transaccion) => confirmarYEliminar({
    mensaje: 'This transfer will be deleted and the money will return to the original account.',
    accion: () => revertirTransferencia(tx),
    alExito: cargar,
  });
</script>

<Encabezado titulo={t('Transaction History')}>{t('The general ledger: every movement of money is recorded here. Showing the latest 150.')}</Encabezado>

<section class="tarjeta">
  <div class="panel__encabezado">
    <h3>{t('Movements')}</h3>
    <div class="filtros" style="margin:0;">
      <Icono nombre="filtro" />
      <select class="campo__control" aria-label={t('Filter by type')} bind:value={filtro} onchange={cargar}>
        <option value="">{t('All types')}</option>
        {#each Object.entries(ETIQUETAS_TIPO) as [v, e]}<option value={v}>{t(e)}</option>{/each}
      </select>
    </div>
  </div>
  <div class="lista">
    {#each filas as tx (tx.id)}
      {@const s = signo(tx)}
      <Fila icono={s === 'neutro' ? 'transferir' : s === 'positivo' ? 'ingreso' : 'gasto'} tonoIcono={s === 'neutro' ? '' : s === 'positivo' ? 'ingreso' : 'gasto'}
        titulo={tx.notas || t(ETIQUETAS_TIPO[tx.tipo] || tx.tipo)}
        meta={`${formatoFecha(tx.fecha)} · ${t(ETIQUETAS_TIPO[tx.tipo] || tx.tipo)} · ${legible(tx.origen)} → ${legible(tx.destino)}`}>
        {#snippet monto()}<div class="numero {s === 'neutro' ? '' : s}">{s === 'positivo' ? '+ ' : s === 'negativo' ? '− ' : ''}{formatoMoneda(tx.monto)}</div>{/snippet}
        {#snippet acciones()}
          {#if tx.tipo === 'transferencia'}
            <button class="btn-icono peligro" title={t('Delete transfer')} aria-label={t('Delete transfer')} onclick={() => eliminarTransferencia(tx)}><Icono nombre="eliminar" /></button>
          {:else}<span style="width:30px"></span>{/if}
        {/snippet}
      </Fila>
    {:else}
      <EstadoVacio icono="historial" titulo={t('No transactions')} texto={t('Every financial action you register will automatically appear here.')} />
    {/each}
  </div>
</section>
