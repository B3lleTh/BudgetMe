<script lang="ts">
  import Encabezado from '../componentes/Encabezado.svelte';
  import Fila from '../componentes/Fila.svelte';
  import Icono from '../componentes/Icono.svelte';
  import Kpi from '../componentes/Kpi.svelte';
  import EstadoVacio from '../componentes/EstadoVacio.svelte';
  import IngresoFijo from '../componentes/ingresos/IngresoFijo.svelte';
  import IngresoExtraForm from '../componentes/ingresos/IngresoExtra.svelte';
  import { consultar, ejecutar } from '../lib/datos/db';
  import { aplicarRecurrente, revertirTransaccion } from '../lib/datos/ledger';
  import { montoMensualEstimado, proximasFechasDelMes } from '../lib/datos/proyecciones';
  import { SQL_ES_INGRESO, transaccionesDelPeriodoDeRecurrente } from '../lib/datos/consultas';
  import { formatoMoneda, formatoFecha, hoyISO, prefijoMes, ultimosMeses, etiquetaMesCorta } from '../lib/formato';
  import { confirmarYEliminar, mostrarToast } from '../lib/avisos.svelte';
  import { t, idioma } from '../lib/i18n.svelte';
  import { grafica, barrasPorMes, coloresTema } from '../lib/graficas';
  import type { CuentaDebito, IngresoExtra, Recurrente, Transaccion } from '../lib/datos/tipos';

  const ESTADO: Record<string, string> = { pendiente: 'Pending', pagado: 'Received', omitido: 'Skipped' };
  const PERIODO: Record<string, string> = { semanal: 'Weekly', quincenal: 'Biweekly', mensual: 'Monthly' };

  type Pago = { fecha: string; tx?: Transaccion };
  let cuentas = $state<CuentaDebito[]>([]), recurrentes = $state<(Recurrente & { pagos: Pago[]; proxima: string })[]>([]);
  let extras = $state<IngresoExtra[]>([]);
  let totales = $state({ mes: 0, anio: 0, esperado: 0 });
  let serie = $state<{ etiquetas: string[]; valores: number[] } | null>(null);
  let ocupado = $state<string | null>(null);
  let formFijo = $state<{ registro: Recurrente | null } | null>(null);
  let formExtra = $state<{ extra: IngresoExtra | null } | null>(null);

  async function cargar() {
    const prefijo = prefijoMes(0);
    const [anio, mes] = prefijo.split('-').map(Number);
    cuentas = await consultar(`SELECT id, nombre, banco, saldo FROM cuentas_debito`);
    const filas = await consultar<Recurrente>(`SELECT * FROM recurrentes WHERE tipo = 'ingreso' ORDER BY creado_en DESC`);
    const lista: (Recurrente & { pagos: Pago[]; proxima: string })[] = [];
    for (const r of filas) {
      const dias = proximasFechasDelMes(r, anio, mes);
      const fechas = dias.map((d) => `${prefijo}-${String(d).padStart(2, '0')}`);
      // Quincenal = dos pagos en el mes, cada uno se confirma/deshace por separado.
      const txs = r.periodicidad === 'quincenal'
        ? await consultar<Transaccion>(`SELECT * FROM transacciones WHERE ref_tabla='recurrentes' AND ref_id=$1 AND tipo='recurrente' AND fecha LIKE $2`, [r.id, `${prefijo}%`])
        : [];
      lista.push({ ...r, proxima: fechas[fechas.length - 1], pagos: fechas.map((fecha) => ({ fecha, tx: txs.find((x) => x.fecha === fecha) })) });
    }
    recurrentes = lista;
    extras = await consultar(`SELECT * FROM ingresos_extra ORDER BY fecha DESC, id DESC LIMIT 30`);
    const suma = async (patron: string) => (await consultar(`SELECT COALESCE(SUM(monto),0) AS t FROM transacciones WHERE fecha LIKE $1 AND ${SQL_ES_INGRESO}`, [patron]))[0].t;
    totales = { mes: await suma(`${prefijo}%`), anio: await suma(`${prefijo.slice(0, 4)}%`), esperado: filas.reduce((a, r) => a + montoMensualEstimado(r), 0) };
    const meses = ultimosMeses(6);
    const valores: number[] = [];
    for (const m of meses) valores.push(await suma(`${m}%`));
    serie = { etiquetas: meses.map((m) => etiquetaMesCorta(m, idioma.actual)), valores };
  }
  cargar();

  /** Ejecuta una acción con su botón ocupado (evita dobles envíos) y recarga. */
  async function accion(clave: string, fn: () => Promise<unknown>, exito: string, error: string, tipo: 'exito' | 'info' = 'exito') {
    if (ocupado) return;
    ocupado = clave;
    try { await fn(); mostrarToast(exito, tipo); await cargar(); }
    catch (err) { console.error(err); mostrarToast(error, 'error'); }
    finally { ocupado = null; }
  }
  const cuentaDe = (r: Recurrente) => r.cuenta_destino_id || cuentas[0]?.id;
  const confirmarPago = (r: Recurrente, fecha = hoyISO()) => accion(`p${r.id}${fecha}`, () => aplicarRecurrente({ recurrente: r, cuentaDebitoId: cuentaDe(r), monto: r.monto, fecha }), fecha === hoyISO() ? 'Payment confirmed' : 'Paycheck confirmed', 'Could not confirm the payment');
  const deshacerQuincena = (tx: Transaccion) => accion(`d${tx.id}`, () => revertirTransaccion(tx), 'Payment undone', 'Could not undo the payment', 'info');
  const deshacerMes = (r: Recurrente) => accion(`u${r.id}`, async () => {
    for (const tx of await transaccionesDelPeriodoDeRecurrente(r, ['recurrente'])) await revertirTransaccion(tx);
    await ejecutar(`UPDATE recurrentes SET estado='pendiente' WHERE id=$1`, [r.id]);
  }, 'Payment undone — back to pending', 'Could not undo the payment', 'info');
  const recibidoSinDeposito = (r: Recurrente) => accion(`s${r.id}`, () => ejecutar(`UPDATE recurrentes SET estado = 'pagado', ultima_aplicacion = $1 WHERE id = $2`, [hoyISO(), r.id]), 'Marked as received (no deposit added)', 'Could not save');

  const eliminarFijo = (r: Recurrente) => confirmarYEliminar({ mensaje: 'This recurring income will be deleted. Payments you already received stay in your history.', accion: () => ejecutar(`DELETE FROM recurrentes WHERE id = $1`, [r.id]), alExito: cargar });
  const eliminarExtra = (e: IngresoExtra) => confirmarYEliminar({
    mensaje: 'This extra income entry will be deleted and the amount will be removed from your account balance.',
    accion: async () => {
      for (const tx of await consultar(`SELECT * FROM transacciones WHERE ref_tabla='ingresos_extra' AND ref_id=$1 ORDER BY id DESC`, [e.id])) await revertirTransaccion(tx);
      await ejecutar(`DELETE FROM ingresos_extra WHERE id = $1`, [e.id]);
    },
    alExito: cargar,
  });
  const abrir = (fn: () => void) => (cuentas.length ? fn() : mostrarToast('Register a debit account first', 'error'));
  const periodo = (r: Recurrente) => (r.periodicidad === 'personalizada' ? t('Every {n} days', { n: r.intervalo_dias ?? 0 }) : t(PERIODO[r.periodicidad]));
</script>

<Encabezado titulo={t('Salary and Income')}>
  {t('Your fixed and variable income, plus one-off money like bonuses or refunds.')}
  {#snippet acciones()}
    <button class="btn btn--fantasma" onclick={() => abrir(() => (formExtra = { extra: null }))}><Icono nombre="masa" /> {t('Extra income')}</button>
    <button class="btn btn--primario" onclick={() => abrir(() => (formFijo = { registro: null }))}><Icono nombre="masa" /> {t('New fixed income')}</button>
  {/snippet}
</Encabezado>

<div class="grid-kpis">
  <Kpi etiqueta={t('Received this month')} icono="ingreso" valor={formatoMoneda(totales.mes)} clase="positivo" />
  <Kpi etiqueta={t('Expected per month')} icono="calendario" valor={formatoMoneda(totales.esperado)}>
    {#snippet nota()}<div class="kpi__nota">{t('From your fixed and variable income')}</div>{/snippet}
  </Kpi>
  <Kpi etiqueta={t('Received this year')} icono="grafica" valor={formatoMoneda(totales.anio)} />
</div>

<section class="tarjeta seccion">
  <div class="panel__encabezado"><div><h3>{t('My income (fixed and variable)')}</h3><p>{t('Confirm each payment when it reaches your account.')}</p></div></div>
  <div class="lista">
    {#if !cuentas.length}
      <EstadoVacio icono="banco" texto={t('You need at least one debit account. Create one first under Cards & Accounts.')} />
    {:else}
      {#each recurrentes as r (r.id)}
        {#snippet editarYBorrar()}
          <button class="btn-icono" title={t('Edit')} aria-label={t('Edit')} onclick={() => (formFijo = { registro: r })}><Icono nombre="editar" /></button>
          <button class="btn-icono peligro" title={t('Delete')} aria-label={t('Delete')} onclick={() => eliminarFijo(r)}><Icono nombre="eliminar" /></button>
        {/snippet}
        {#if r.periodicidad === 'quincenal'}
          <div class="fila-grupo">
            <Fila icono="ingreso" tonoIcono="ingreso" meta={t('{n} paychecks this month · {monto} each', { n: r.pagos.length, monto: formatoMoneda(r.monto) })} acciones={editarYBorrar}>
              {#snippet titulo()}{r.nombre} <span class="badge">{t('Biweekly')}</span>{/snippet}
              {#snippet monto()}<div class="numero positivo">{formatoMoneda(r.monto * r.pagos.length)}</div>{/snippet}
            </Fila>
            <div class="fila__sub">
              {#each r.pagos as pago, i}
                <div class="pago-quincena">
                  <div><div class="quincena__titulo">{t('Paycheck')} {i + 1}</div><div class="fila__meta">{formatoFecha(pago.fecha)}</div></div>
                  {#if pago.tx}
                    {@const tx = pago.tx}
                    <div class="quincena__estado"><span class="badge badge--pagado">{t('Received')}</span>
                      <button class="btn-icono" title={t('Undo')} aria-label={t('Undo')} disabled={!!ocupado} onclick={() => deshacerQuincena(tx)}><Icono nombre="deshacer" /></button></div>
                  {:else}
                    <button class="btn btn--primario btn--sm" class:btn--carga={ocupado === `p${r.id}${pago.fecha}`} disabled={!!ocupado} onclick={() => confirmarPago(r, pago.fecha)}>{t('Confirm')}</button>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {:else}
          <Fila icono="ingreso" tonoIcono="ingreso"
            meta={`${periodo(r)} · ${t('estimated monthly')} ${formatoMoneda(montoMensualEstimado(r))} · ${t('next payment')} ${formatoFecha(r.proxima)}`}>
            {#snippet titulo()}{r.nombre} {#if r.es_variable}<span class="badge">{t('Variable')}</span>{/if}{/snippet}
            {#snippet monto()}<div class="numero positivo">{formatoMoneda(r.monto)}</div><span class="badge badge--{r.estado}">{t(ESTADO[r.estado])}</span>{/snippet}
            {#snippet acciones()}
              {#if r.estado !== 'pagado'}
                <button class="btn btn--primario btn--sm" title={t('Adds the amount to your debit account')} class:btn--carga={ocupado === `p${r.id}${hoyISO()}`} disabled={!!ocupado} onclick={() => confirmarPago(r)}>{t('Confirm payment')}</button>
                <button class="btn btn--fantasma btn--sm" title={t('Only changes the status, doesn\'t move money')} disabled={!!ocupado} onclick={() => recibidoSinDeposito(r)}>{t('Already received (no deposit)')}</button>
              {:else}
                <button class="btn btn--fantasma btn--sm" title={t('Undo this month\'s payment')} disabled={!!ocupado} onclick={() => deshacerMes(r)}><Icono nombre="deshacer" /> {t('Undo')}</button>
              {/if}
              {@render editarYBorrar()}
            {/snippet}
          </Fila>
        {/if}
      {:else}
        <EstadoVacio icono="ingreso" texto={t('You haven\'t registered your salary or main income yet.')} />
      {/each}
    {/if}
  </div>
</section>

<section class="tarjeta seccion">
  <div class="panel__encabezado"><h3>{t('Extra income')}</h3></div>
  <div class="lista">
    {#each extras as e (e.id)}
      <Fila icono="masa" tonoIcono="ingreso" titulo={e.nombre} meta={`${formatoFecha(e.fecha)} · ${e.categoria || t('no category')}`}>
        {#snippet monto()}<div class="numero positivo">{formatoMoneda(e.monto)}</div>{/snippet}
        {#snippet acciones()}
          <button class="btn-icono" title={t('Edit')} aria-label={t('Edit')} onclick={() => (formExtra = { extra: e })}><Icono nombre="editar" /></button>
          <button class="btn-icono peligro" title={t('Delete')} aria-label={t('Delete')} onclick={() => eliminarExtra(e)}><Icono nombre="eliminar" /></button>
        {/snippet}
      </Fila>
    {:else}
      <EstadoVacio icono="masa" texto={t('No extra income registered yet.')} />
    {/each}
  </div>
</section>

<section class="tarjeta">
  <div class="panel__encabezado"><div><h3>{t('Last 6 months')}</h3><p>{t('Income received per month')}</p></div></div>
  <div class="grafica-envoltura grafica-envoltura--baja">
    {#if serie}{@const s = serie}<canvas use:grafica={() => barrasPorMes({ ...s, nombreSerie: t('Income'), color: coloresTema().ganancia })}></canvas>{/if}
  </div>
</section>

{#if formFijo}<IngresoFijo registro={formFijo.registro} {cuentas} alGuardar={cargar} bind:abierto={() => !!formFijo, (v) => !v && (formFijo = null)} />{/if}
{#if formExtra}<IngresoExtraForm extra={formExtra.extra} {cuentas} alGuardar={cargar} bind:abierto={() => !!formExtra, (v) => !v && (formExtra = null)} />{/if}

<style>
  .quincena__titulo { font-weight: 600; font-size: 13px; }
  .quincena__estado { display: flex; align-items: center; gap: 6px; }
</style>
