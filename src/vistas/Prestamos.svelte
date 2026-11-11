<script module lang="ts">
  // A nivel de módulo: el filtro sobrevive al volver a la vista en la misma sesión.
  let mostrarLiquidados = $state(true);
</script>

<script lang="ts">
  import Encabezado from '../componentes/Encabezado.svelte';
  import Fila from '../componentes/Fila.svelte';
  import Icono from '../componentes/Icono.svelte';
  import Kpi from '../componentes/Kpi.svelte';
  import Barra from '../componentes/Barra.svelte';
  import EstadoVacio from '../componentes/EstadoVacio.svelte';
  import NuevoPrestamo from '../componentes/prestamos/NuevoPrestamo.svelte';
  import EditarPrestamo from '../componentes/prestamos/EditarPrestamo.svelte';
  import AbonoCapital from '../componentes/prestamos/AbonoCapital.svelte';
  import Amortizacion from '../componentes/prestamos/Amortizacion.svelte';
  import { consultar, ejecutar } from '../lib/datos/db';
  import { sincronizarPrestamos } from '../lib/datos/sincronizarPrestamos';
  import { formatoMoneda } from '../lib/formato';
  import { confirmarYEliminar, mostrarToast } from '../lib/avisos.svelte';
  import { t } from '../lib/i18n.svelte';
  import type { CuentaDebito, Prestamo } from '../lib/datos/tipos';

  let prestamos = $state<Prestamo[]>([]), cuentas = $state<CuentaDebito[]>([]);
  let nuevo = $state(false);
  let dialogo = $state<{ tipo: 'editar' | 'abono' | 'tabla'; prestamo: Prestamo } | null>(null);

  const activos = $derived(prestamos.filter((p) => p.estado === 'activo'));
  const visibles = $derived(mostrarLiquidados ? prestamos : prestamos.filter((p) => p.estado !== 'liquidado'));

  async function cargar() {
    cuentas = await consultar(`SELECT id, nombre, banco, saldo FROM cuentas_debito`);
    await sincronizarPrestamos();
    prestamos = await consultar(`SELECT * FROM prestamos ORDER BY estado ASC, activo DESC, creado_en DESC`);
  }
  cargar();

  async function pausar(p: Prestamo) {
    try {
      await ejecutar(`UPDATE prestamos SET activo = $1 WHERE id = $2`, [p.activo ? 0 : 1, p.id]);
      mostrarToast(p.activo ? 'Loan paused — no monthly charge while paused' : 'Loan resumed', 'exito');
      cargar();
    } catch (err) { console.error(err); mostrarToast('Could not update the loan', 'error'); }
  }
  const eliminar = (p: Prestamo) => confirmarYEliminar({
    mensaje: 'This loan will be deleted. This does not revert past payments already applied.',
    accion: async () => { await ejecutar(`DELETE FROM recurrentes WHERE prestamo_id = $1`, [p.id]); await ejecutar(`DELETE FROM prestamos WHERE id = $1`, [p.id]); },
    alExito: cargar,
  });
</script>

<Encabezado titulo={t('Loans')}>
  {t('Track personal loans, their interest, and their payoff progress. Each month\'s payment appears in Recurring.')}
  {#snippet acciones()}<button class="btn btn--primario" onclick={() => (nuevo = true)}><Icono nombre="masa" /> {t('New loan')}</button>{/snippet}
</Encabezado>

<div class="grid-kpis">
  <Kpi etiqueta={t('Total owed')} icono="alerta" valor={formatoMoneda(activos.reduce((a, p) => a + p.saldo_actual, 0))} clase="negativo" />
  <Kpi etiqueta={t('Monthly payments committed')} icono="recurrente" valor={formatoMoneda(activos.filter((p) => p.activo).reduce((a, p) => a + p.pago_mensual, 0))} clase="negativo" />
</div>

<section class="tarjeta">
  <div class="panel__encabezado">
    <h3>{t('Your loans')}</h3>
    <label class="switch">
      <input type="checkbox" bind:checked={mostrarLiquidados} />
      <span class="switch__pista"></span><span class="switch__etiqueta ayuda">{t('Show paid-off loans')}</span>
    </label>
  </div>
  <div class="lista">
    {#each visibles as p (p.id)}
      {@const liquidado = p.estado === 'liquidado'}
      {@const progreso = p.plazo_meses ? Math.min(100, Math.round((p.meses_pagados / p.plazo_meses) * 100)) : 0}
      <Fila icono="prestamo" pausada={liquidado} meta={`${p.tasa_interes}% ${t('annual')} · ${t('Monthly payment')} ${formatoMoneda(p.pago_mensual)} · ${t('Payment day')} ${p.fecha_corte || '—'}`}>
        {#snippet titulo()}
          {p.nombre}
          {#if liquidado}<span class="badge badge--pagado">{t('Paid off')}</span>{:else if !p.activo}<span class="badge">{t('Paused')}</span>{/if}
        {/snippet}
        <div class="avance">
          <Barra porcentaje={progreso} variante={liquidado ? 'listo' : ''} />
          <span class="fila__meta">{t('{a}/{b} payments', { a: p.meses_pagados, b: p.plazo_meses })}</span>
        </div>
        {#snippet monto()}<div class="fila__monto"><span class="numero" class:negativo={!liquidado}>{formatoMoneda(p.saldo_actual)}</span><small>{t('left to pay')}</small></div>{/snippet}
        {#snippet acciones()}
          {#if !liquidado}
            <button class="btn-icono" title={t('View amortization schedule')} aria-label={t('View amortization schedule')} onclick={() => (dialogo = { tipo: 'tabla', prestamo: p })}><Icono nombre="historial" /></button>
            <button class="btn-icono" title={t('Extra principal payment')} aria-label={t('Extra principal payment')} onclick={() => (dialogo = { tipo: 'abono', prestamo: p })}><Icono nombre="masa" /></button>
            <button class="btn-icono" title={t(p.activo ? 'Pause loan' : 'Resume loan')} aria-label={t(p.activo ? 'Pause loan' : 'Resume loan')} onclick={() => pausar(p)}><Icono nombre={p.activo ? 'reloj' : 'check'} /></button>
            <button class="btn-icono" title={t('Edit loan')} aria-label={t('Edit loan')} onclick={() => (dialogo = { tipo: 'editar', prestamo: p })}><Icono nombre="editar" /></button>
          {/if}
          <button class="btn-icono peligro" title={t('Delete')} aria-label={t('Delete')} onclick={() => eliminar(p)}><Icono nombre="eliminar" /></button>
        {/snippet}
      </Fila>
    {:else}
      <EstadoVacio icono="prestamo" titulo={t('No loans registered yet')} texto={t('Register a loan you\'re paying off — new or one you already had running.')} />
    {/each}
  </div>
</section>

{#if nuevo}<NuevoPrestamo bind:abierto={nuevo} {cuentas} alGuardar={cargar} />{/if}
{#if dialogo}
  {@const cerrar = (v: boolean) => !v && (dialogo = null)}
  {#if dialogo.tipo === 'editar'}<EditarPrestamo prestamo={dialogo.prestamo} {cuentas} alGuardar={cargar} bind:abierto={() => true, cerrar} />
  {:else if dialogo.tipo === 'abono'}<AbonoCapital prestamo={dialogo.prestamo} {cuentas} alGuardar={cargar} bind:abierto={() => true, cerrar} />
  {:else}<Amortizacion prestamo={dialogo.prestamo} bind:abierto={() => true, cerrar} />{/if}
{/if}

<style>
  .avance { display: flex; align-items: center; gap: 10px; margin-top: 8px; max-width: 420px; }
  .avance :global(.barra) { flex: 1; }
  .avance .fila__meta { margin: 0; white-space: nowrap; }
</style>
