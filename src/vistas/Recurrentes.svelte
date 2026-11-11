<script lang="ts">
  import Encabezado from '../componentes/Encabezado.svelte';
  import Fila from '../componentes/Fila.svelte';
  import Icono from '../componentes/Icono.svelte';
  import Kpi from '../componentes/Kpi.svelte';
  import Modal from '../componentes/Modal.svelte';
  import EstadoVacio from '../componentes/EstadoVacio.svelte';
  import PagarRecurrente from '../componentes/recurrentes/PagarRecurrente.svelte';
  import AbonoRecurrente from '../componentes/recurrentes/AbonoRecurrente.svelte';
  import FormularioRecurrente from '../componentes/recurrentes/FormularioRecurrente.svelte';
  import { consultar, ejecutar } from '../lib/datos/db';
  import { aplicarRecurrente, revertirTransaccion, revertirPagoPrestamo } from '../lib/datos/ledger';
  import { sincronizarMensualidadesTC } from '../lib/datos/sincronizarTC';
  import { sincronizarPrestamos } from '../lib/datos/sincronizarPrestamos';
  import { transaccionesDelPeriodoDeRecurrente } from '../lib/datos/consultas';
  import { formatoMoneda, hoyISO, ultimosMeses, etiquetaMesCorta } from '../lib/formato';
  import { MESES, nombreDeRecurrente } from '../lib/etiquetas';
  import { confirmarYEliminar, mostrarToast } from '../lib/avisos.svelte';
  import { t, idioma } from '../lib/i18n.svelte';
  import { grafica, barrasPorMes, coloresTema } from '../lib/graficas';
  import type { CuentaDebito, Recurrente } from '../lib/datos/tipos';

  const ESTADO: Record<string, string> = { pendiente: 'Pending', pagado: 'Paid', omitido: 'Skipped' };
  const ORDEN: Record<string, number> = { pendiente: 0, omitido: 1, pagado: 2 };
  const PERIODO: Record<string, string> = { semanal: 'Weekly', quincenal: 'Biweekly', mensual: 'Monthly' };

  let cuentas = $state<CuentaDebito[]>([]), recurrentes = $state<Recurrente[]>([]);
  let serie = $state<{ etiquetas: string[]; valores: number[] } | null>(null);
  let ocupado = $state<string | null>(null);
  let pagando = $state<Recurrente | null>(null), abonando = $state<Recurrente | null>(null), menu = $state<Recurrente | null>(null);
  let formulario = $state<{ registro: Recurrente | null } | null>(null);

  const mesesDe = (r: Recurrente): number[] => { try { const m = JSON.parse(r.meses_activos || '[]'); return Array.isArray(m) ? m : []; } catch { return []; } };
  const aplicaEsteMes = (r: Recurrente) => !!r.activo && (mesesDe(r).length === 0 || mesesDe(r).includes(new Date().getMonth() + 1));
  const restante = (r: Recurrente) => Math.max(0, r.monto - (r.abonado || 0));
  const ligado = (r: Recurrente) => !!r.tarjeta_id || !!r.prestamo_id;

  const activos = $derived(recurrentes.filter(aplicaEsteMes));
  const pendiente = $derived(activos.filter((r) => r.estado === 'pendiente').reduce((a, r) => a + restante(r), 0));
  const pagado = $derived(activos.reduce((a, r) => a + (r.estado === 'pagado' ? r.monto : r.estado === 'pendiente' ? r.abonado || 0 : 0), 0));
  // Pendientes de este mes arriba; luego pagados/omitidos; al final lo pausado.
  const ordenados = $derived([...recurrentes].sort((a, b) => (Number(aplicaEsteMes(b)) - Number(aplicaEsteMes(a))) || (ORDEN[a.estado] - ORDEN[b.estado]) || (b.monto - a.monto)));

  async function cargar() {
    cuentas = await consultar(`SELECT id, nombre, banco, saldo FROM cuentas_debito`);
    await sincronizarMensualidadesTC();
    await sincronizarPrestamos();
    recurrentes = await consultar(`SELECT * FROM recurrentes WHERE tipo = 'gasto' ORDER BY creado_en DESC`);
    const meses = ultimosMeses(6);
    const valores: number[] = [];
    for (const m of meses) valores.push((await consultar(
      `SELECT COALESCE(SUM(monto),0) AS t FROM transacciones WHERE fecha LIKE $1 AND ref_tabla = 'recurrentes' AND origen <> 'externo' AND tipo IN ('recurrente', 'abono_recurrente', 'pago_tc', 'pago_prestamo')`, [`${m}%`]))[0].t);
    serie = { etiquetas: meses.map((m) => etiquetaMesCorta(m, idioma.actual)), valores };
  }
  cargar();

  async function accion(clave: string, fn: () => Promise<unknown>, exito: string, error: string, tipo: 'exito' | 'info' = 'exito') {
    if (ocupado) return;
    ocupado = clave;
    try { await fn(); mostrarToast(exito, tipo); await cargar(); }
    catch (err) { console.error(err); mostrarToast(error, 'error'); }
    finally { ocupado = null; }
  }

  function pagar(r: Recurrente) {
    if (!cuentas.length) return mostrarToast('Register a debit account first', 'error');
    if (ligado(r)) { pagando = r; return; }
    accion(`p${r.id}`, () => aplicarRecurrente({ recurrente: r, cuentaDebitoId: r.cuenta_destino_id || cuentas[0].id, monto: restante(r), fecha: hoyISO() }), 'Marked as paid and deducted', 'Could not mark as paid');
  }

  /** Revierte solo los pagos de ESTE periodo. Cada pago de tarjeta devuelve
   * además una mensualidad MSI; los de préstamo restauran el capital exacto. */
  const deshacerPago = (r: Recurrente) => accion(`d${r.id}`, async () => {
    for (const tx of await transaccionesDelPeriodoDeRecurrente(r, ['recurrente', 'abono_recurrente', 'pago_tc', 'pago_prestamo'])) {
      if (tx.tipo === 'pago_prestamo') {
        const [pr] = await consultar(`SELECT * FROM prestamos WHERE id = $1`, [r.prestamo_id]);
        await (pr ? revertirPagoPrestamo(tx, pr) : revertirTransaccion(tx));
      } else {
        await revertirTransaccion(tx);
        if (tx.tipo === 'pago_tc' && r.gasto_id) await ejecutar(`UPDATE gastos SET msi_pagados = MAX(0, msi_pagados - 1) WHERE id = $1`, [r.gasto_id]);
      }
    }
    await ejecutar(`UPDATE recurrentes SET estado='pendiente', abonado=0 WHERE id=$1`, [r.id]);
  }, 'Payment undone — back to pending', 'Could not undo the payment', 'info');

  // La fecha permite que el reinicio mensual lo regrese a pendiente.
  const omitir = (r: Recurrente) => accion(`o${r.id}`, () => ejecutar(`UPDATE recurrentes SET estado = 'omitido', ultima_aplicacion = $1 WHERE id = $2`, [hoyISO(), r.id]), 'Recurring expense skipped this period', 'Could not save', 'info');
  const deshacerOmitir = (r: Recurrente) => accion(`o${r.id}`, () => ejecutar(`UPDATE recurrentes SET estado = 'pendiente' WHERE id = $1`, [r.id]), 'Skip undone — back to pending', 'Could not save', 'info');
  const pagadoSinDescuento = (r: Recurrente) => accion(`s${r.id}`, () => ejecutar(`UPDATE recurrentes SET estado = 'pagado', ultima_aplicacion = $1 WHERE id = $2`, [hoyISO(), r.id]), 'Marked as paid (no deduction)', 'Could not save');
  const alternarActivo = (r: Recurrente, activo: boolean) => accion(`a${r.id}`, () => ejecutar(`UPDATE recurrentes SET activo = $1 WHERE id = $2`, [activo ? 1 : 0, r.id]), activo ? 'Recurring expense reactivated' : 'Recurring expense paused', 'Could not save', 'info');
  const eliminar = (r: Recurrente) => confirmarYEliminar({ mensaje: 'This recurring expense will be deleted.', accion: () => ejecutar(`DELETE FROM recurrentes WHERE id = $1`, [r.id]), alExito: cargar });

  function meta(r: Recurrente) {
    const periodo = r.periodicidad === 'personalizada' ? t('Every {n} days', { n: r.intervalo_dias ?? 0 }) : t(PERIODO[r.periodicidad]);
    const origen = r.tarjeta_id ? t('Credit card') : r.prestamo_id ? t('Loan') : r.categoria || t('no category');
    const meses = mesesDe(r);
    return `${periodo} · ${origen} · ${t('applies')}: ${meses.length ? meses.map((m) => t(MESES[m - 1])).join(', ') : t('Every month')}`;
  }
  const opcionMenu = (fn: () => void) => () => { menu = null; fn(); };
  const nuevo = () => (cuentas.length ? (formulario = { registro: null }) : mostrarToast('Register a debit account first', 'error'));
</script>

<Encabezado titulo={t('Recurring expenses')}>
  {t('Rent, subscriptions, insurance, plus your card and loan installments. Everything goes back to pending at the start of each month.')}
  {#snippet acciones()}<button class="btn btn--primario" onclick={nuevo}><Icono nombre="masa" /> {t('New recurring expense')}</button>{/snippet}
</Encabezado>

<div class="grid-kpis">
  <Kpi etiqueta={t('Pending this month')} icono="calendario" valor={formatoMoneda(pendiente)} clase="negativo" />
  <Kpi etiqueta={t('Already paid this month')} icono="check" valor={formatoMoneda(pagado)} clase="positivo" />
  <Kpi etiqueta={t('Total committed')} icono="recurrente" valor={formatoMoneda(pendiente + pagado)} />
</div>

<section class="tarjeta seccion">
  <div class="lista">
    {#each ordenados as r (r.id)}
      {@const activo = r.activo === null || r.activo === undefined ? true : !!r.activo}
      <Fila icono={r.tarjeta_id ? 'tarjeta' : r.prestamo_id ? 'prestamo' : 'recurrente'} titulo={nombreDeRecurrente(r.nombre, t)} meta={meta(r)} pausada={!aplicaEsteMes(r)}>
        {#snippet monto()}
          <div class="fila__monto"><span class="numero negativo">{formatoMoneda(r.monto)}</span>{#if r.abonado > 0}<small>{t('Paid so far')}: {formatoMoneda(r.abonado)}</small>{/if}</div>
          <span class="badge badge--{r.estado}">{t(ESTADO[r.estado])}</span>
          <label class="switch" title={t('Active this period')}>
            <input type="checkbox" checked={activo} aria-label={t('Active this period')} onchange={(e) => alternarActivo(r, e.currentTarget.checked)} />
            <span class="switch__pista"></span>
          </label>
        {/snippet}
        {#snippet acciones()}
          {#if r.estado === 'pendiente' && activo}
            <button class="btn btn--primario btn--sm" title={t('Deducts the amount from your debit account')} class:btn--carga={ocupado === `p${r.id}`} disabled={!!ocupado} onclick={() => pagar(r)}>{t(ligado(r) ? 'Pay' : 'Mark as paid')}</button>
            <button class="btn btn--fantasma btn--sm" disabled={!!ocupado} onclick={() => omitir(r)}>{t('Skip')}</button>
          {:else if r.estado === 'omitido'}
            <button class="btn btn--fantasma btn--sm" disabled={!!ocupado} onclick={() => deshacerOmitir(r)}>{t('Undo skip')}</button>
          {:else if r.estado === 'pagado'}
            <button class="btn btn--fantasma btn--sm" title={t('Undo this month\'s payment')} disabled={!!ocupado} onclick={() => deshacerPago(r)}><Icono nombre="deshacer" /> {t('Undo payment')}</button>
          {/if}
          <button class="btn-icono" title={t('More options')} aria-label={t('More options')} onclick={() => (menu = r)}><Icono nombre="mas_opciones" /></button>
        {/snippet}
      </Fila>
    {:else}
      <EstadoVacio icono="recurrente" titulo={t('No recurring expenses yet')} texto={t('Register Netflix, gym, insurance, or any fixed monthly payment.')} />
    {/each}
  </div>
</section>

<section class="tarjeta">
  <div class="panel__encabezado"><div><h3>{t('Last 6 months')}</h3><p>{t('Recurring payments made per month')}</p></div></div>
  <div class="grafica-envoltura grafica-envoltura--baja">
    {#if serie}{@const s = serie}<canvas use:grafica={() => barrasPorMes({ ...s, nombreSerie: t('Recurring payments'), color: coloresTema().tinta2 })}></canvas>{/if}
  </div>
</section>

<!-- Menú "⋮" como diálogo: sin problemas de z-index ni de recorte. -->
{#if menu}
  {@const r = menu}
  <Modal abierto={true} titulo={nombreDeRecurrente(r.nombre, t)} alCerrar={() => (menu = null)}>
    <div class="lista">
      {#if r.estado === 'pendiente' && !!r.activo && !ligado(r)}
        <button class="menu-acciones__item" onclick={opcionMenu(() => pagadoSinDescuento(r))}><Icono nombre="check" /> {t('Already paid (no deduction)')}</button>
        <button class="menu-acciones__item" onclick={opcionMenu(() => (abonando = r))}><Icono nombre="ingreso" /> {t('Add partial payment')}</button>
      {/if}
      {#if !ligado(r)}<button class="menu-acciones__item" onclick={opcionMenu(() => (formulario = { registro: r }))}><Icono nombre="editar" /> {t('Edit')}</button>{/if}
      <button class="menu-acciones__item peligro" onclick={opcionMenu(() => eliminar(r))}><Icono nombre="eliminar" /> {t('Delete')}</button>
    </div>
  </Modal>
{/if}
{#if pagando}<PagarRecurrente recurrente={pagando} {cuentas} alGuardar={cargar} bind:abierto={() => !!pagando, (v) => !v && (pagando = null)} />{/if}
{#if abonando}<AbonoRecurrente recurrente={abonando} {cuentas} alGuardar={cargar} bind:abierto={() => !!abonando, (v) => !v && (abonando = null)} />{/if}
{#if formulario}<FormularioRecurrente registro={formulario.registro} {cuentas} alGuardar={cargar} bind:abierto={() => !!formulario, (v) => !v && (formulario = null)} />{/if}
