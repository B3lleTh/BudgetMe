<script lang="ts">
  import Encabezado from '../componentes/Encabezado.svelte';
  import Fila from '../componentes/Fila.svelte';
  import Icono from '../componentes/Icono.svelte';
  import Kpi from '../componentes/Kpi.svelte';
  import EstadoVacio from '../componentes/EstadoVacio.svelte';
  import NuevoGasto from '../componentes/gastos/NuevoGasto.svelte';
  import EditarGasto from '../componentes/gastos/EditarGasto.svelte';
  import { consultar, ejecutar } from '../lib/datos/db';
  import { revertirTransaccion } from '../lib/datos/ledger';
  import { formatoMoneda, formatoFecha, prefijoMes, ultimosMeses, etiquetaMesCorta } from '../lib/formato';
  import { CATEGORIAS_GASTO, etiquetaCategoriaGasto } from '../lib/etiquetas';
  import { confirmarYEliminar } from '../lib/avisos.svelte';
  import { t, idioma } from '../lib/i18n.svelte';
  import { grafica, barrasPorMes, coloresTema } from '../lib/graficas';
  import type { CuentaDebito, Gasto, Tarjeta } from '../lib/datos/tipos';

  let filtro = $state('');
  let cuentas = $state<CuentaDebito[]>([]), tarjetas = $state<Tarjeta[]>([]), gastos = $state<Gasto[]>([]);
  let totalMes = $state(0), porCategoria = $state<{ categoria: string; total: number; n: number }[]>([]);
  let serie = $state<{ etiquetas: string[]; valores: number[] } | null>(null);
  let nuevo = $state(false), editando = $state<Gasto | null>(null);

  async function cargar() {
    cuentas = await consultar(`SELECT id, nombre, banco, saldo FROM cuentas_debito`);
    tarjetas = await consultar(`SELECT * FROM tarjetas WHERE tipo = 'credito'`);
    gastos = await consultar(
      filtro ? `SELECT * FROM gastos WHERE categoria = $1 ORDER BY fecha DESC, id DESC LIMIT 60` : `SELECT * FROM gastos ORDER BY fecha DESC, id DESC LIMIT 60`,
      filtro ? [filtro] : []
    );
    const mes = `${prefijoMes(0)}%`;
    totalMes = (await consultar(`SELECT COALESCE(SUM(monto),0) AS t FROM gastos WHERE fecha LIKE $1`, [mes]))[0].t;
    porCategoria = await consultar(`SELECT categoria, COALESCE(SUM(monto),0) AS total, COUNT(*) AS n FROM gastos WHERE fecha LIKE $1 GROUP BY categoria ORDER BY total DESC`, [mes]);
    const meses = ultimosMeses(6);
    const valores: number[] = [];
    for (const m of meses) valores.push((await consultar(`SELECT COALESCE(SUM(monto),0) AS t FROM gastos WHERE fecha LIKE $1`, [`${m}%`]))[0].t);
    serie = { etiquetas: meses.map((m) => etiquetaMesCorta(m, idioma.actual)), valores };
  }
  cargar();

  const eliminar = (g: Gasto) => confirmarYEliminar({
    mensaje: 'This expense will be deleted and the balance of the affected account/card will be reverted.',
    accion: async () => {
      for (const tx of await consultar(`SELECT * FROM transacciones WHERE ref_tabla='gastos' AND ref_id=$1 ORDER BY id DESC`, [g.id])) await revertirTransaccion(tx);
      // El recurrente de una compra a MSI se borra ANTES que el gasto (si no, queda huérfano).
      await ejecutar(`DELETE FROM recurrentes WHERE gasto_id = $1`, [g.id]);
      await ejecutar(`DELETE FROM gastos WHERE id = $1`, [g.id]);
    },
    alExito: cargar,
  });

  function detalle(g: Gasto) {
    if (g.es_msi) return t('{n} interest-free installments of {monto} ({cada})', { n: g.msi_meses ?? 0, monto: formatoMoneda(g.msi_monto_por_corte), cada: t(g.msi_periodicidad === 'quincenal' ? 'biweekly' : 'monthly') });
    if (g.tasa_interes > 0) return t('+{tasa}% interest on {base}', { tasa: g.tasa_interes, base: formatoMoneda(g.monto_base ?? g.monto) });
    return '';
  }
</script>

<Encabezado titulo={t('Expenses')}>
  {t('Everything you buy, paid with debit or a credit card. This month:')} <span class="numero negativo">{formatoMoneda(totalMes)}</span>
  {#snippet acciones()}<button class="btn btn--primario" onclick={() => (nuevo = true)}><Icono nombre="masa" /> {t('New expense')}</button>{/snippet}
</Encabezado>

{#if porCategoria.length}
  <div class="grid-kpis">
    {#each porCategoria as c}
      <Kpi etiqueta={t(etiquetaCategoriaGasto(c.categoria))} valor={formatoMoneda(c.total)}>
        {#snippet nota()}<div class="kpi__nota">{t(c.n === 1 ? '{n} entry' : '{n} entries', { n: c.n })} · {t('{p}% of the month', { p: Math.round((c.total / (totalMes || 1)) * 100) })}</div>{/snippet}
      </Kpi>
    {/each}
  </div>
{/if}

<section class="tarjeta seccion">
  <div class="panel__encabezado">
    <h3>{t('Recent expenses')}</h3>
    <div class="filtros" style="margin:0;">
      <Icono nombre="filtro" />
      <select class="campo__control" aria-label={t('Filter by category')} bind:value={filtro} onchange={cargar}>
        <option value="">{t('All categories')}</option>
        {#each CATEGORIAS_GASTO as c}<option value={c.valor}>{t(c.etiqueta)}</option>{/each}
      </select>
    </div>
  </div>
  <div class="lista">
    {#each gastos as g (g.id)}
      {@const extra = detalle(g)}
      <Fila icono={g.metodo_pago === 'tarjeta' ? 'tarjeta' : 'banco'} titulo={g.nombre}
        meta={`${formatoFecha(g.fecha)} · ${t(etiquetaCategoriaGasto(g.categoria))} · ${t(g.metodo_pago === 'tarjeta' ? 'Credit card' : 'Debit')}${extra ? ` · ${extra}` : ''}`}>
        {#snippet monto()}<div class="numero negativo">{formatoMoneda(g.monto)}</div>{/snippet}
        {#snippet acciones()}
          <button class="btn-icono" title={t('Edit')} aria-label={t('Edit')} onclick={() => (editando = g)}><Icono nombre="editar" /></button>
          <button class="btn-icono peligro" title={t('Delete')} aria-label={t('Delete')} onclick={() => eliminar(g)}><Icono nombre="eliminar" /></button>
        {/snippet}
      </Fila>
    {:else}
      <EstadoVacio titulo={t('No expenses yet')} texto={t('Register your first expense to start seeing your monthly behavior.')} />
    {/each}
  </div>
</section>

<section class="tarjeta">
  <div class="panel__encabezado"><div><h3>{t('Last 6 months')}</h3><p>{t('Total expenses registered per month')}</p></div></div>
  <div class="grafica-envoltura grafica-envoltura--baja">
    {#if serie}
      {@const s = serie}
      <canvas use:grafica={() => barrasPorMes({ ...s, nombreSerie: t('Expenses'), color: coloresTema().perdida })}></canvas>
    {/if}
  </div>
</section>

{#if nuevo}<NuevoGasto bind:abierto={nuevo} {cuentas} {tarjetas} alGuardar={cargar} />{/if}
<EditarGasto bind:gasto={editando} alGuardar={cargar} />
