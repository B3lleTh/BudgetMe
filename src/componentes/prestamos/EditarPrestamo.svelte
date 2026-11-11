<script lang="ts">
  import Modal from '../Modal.svelte';
  import Campo from '../Campo.svelte';
  import { ejecutar } from '../../lib/datos/db';
  import { calcularPagoMensual } from '../../lib/datos/sincronizarPrestamos';
  import { formatoMoneda } from '../../lib/formato';
  import { etiquetaDeCuentaConBanco } from '../../lib/etiquetas';
  import { mostrarToast } from '../../lib/avisos.svelte';
  import { t } from '../../lib/i18n.svelte';
  import type { CuentaDebito, Prestamo } from '../../lib/datos/tipos';

  /** Saldo y pagos hechos NO se editan aquí: solo cambian con pagos reales o abonos. */
  let { abierto = $bindable(), prestamo: p, cuentas, alGuardar }: { abierto: boolean; prestamo: Prestamo; cuentas: CuentaDebito[]; alGuardar: () => void } = $props();

  let nombre = $state(p.nombre), tasa = $state(p.tasa_interes), plazo = $state(p.plazo_meses), corte = $state(p.fecha_corte);
  let cuentaPago = $state(p.cuenta_pago_id), notas = $state(p.notas ?? '');
  let errores = $state<Record<string, string>>({}), guardando = $state(false);
  const restantes = $derived((Number(plazo) || 0) - p.meses_pagados);
  const pago = $derived(restantes > 0 ? calcularPagoMensual(p.saldo_actual, Number(tasa) || 0, restantes) : 0);

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    errores = {};
    if (!nombre.trim()) errores.nombre = 'Enter a name';
    if (restantes <= 0) errores.plazo = 'Term must be greater than payments already made';
    if (Object.keys(errores).length || guardando) return;
    guardando = true;
    try {
      await ejecutar(`UPDATE prestamos SET nombre = $1, tasa_interes = $2, plazo_meses = $3, pago_mensual = $4, fecha_corte = $5, cuenta_pago_id = $6, notas = $7 WHERE id = $8`,
        [nombre.trim(), Number(tasa) || 0, Number(plazo), pago, Number(corte) || null, cuentaPago || null, notas.trim() || null, p.id]);
      mostrarToast('Loan updated', 'exito');
      abierto = false;
      alGuardar();
    } catch (err) {
      console.error(err);
      mostrarToast('Could not update the loan', 'error');
    } finally {
      guardando = false;
    }
  }
</script>

<Modal bind:abierto titulo={t('Edit loan')} subtitulo={t('Remaining balance and payments made can\'t be edited here — they only change through real payments or an extra principal payment.')} ancho="ancho">
  <form id="form-editar-prestamo" onsubmit={guardar}>
    <Campo etiqueta="Name" error={errores.nombre}><input class="campo__control" bind:value={nombre} /></Campo>
    <div class="campo__fila">
      <Campo etiqueta="Annual interest rate (%)"><input class="campo__control" type="number" step="0.01" min="0" bind:value={tasa} /></Campo>
      <Campo etiqueta="Total term (months)" error={errores.plazo}><input class="campo__control" type="number" min={p.meses_pagados + 1} bind:value={plazo} /></Campo>
    </div>
    <div class="campo__fila">
      <Campo etiqueta="Statement/payment day"><input class="campo__control" type="number" min="1" max="31" bind:value={corte} /></Campo>
      <Campo etiqueta="Pay from account">
        <select class="campo__control" bind:value={cuentaPago}>{#each cuentas as c (c.id)}<option value={c.id}>{etiquetaDeCuentaConBanco(c)}</option>{/each}</select>
      </Campo>
    </div>
    <Campo etiqueta="Notes"><textarea class="campo__control" rows="2" bind:value={notas}></textarea></Campo>
    {#if pago}<p class="campo__vista-previa">{t('New monthly payment: {pago} for {n} remaining months (recalculated on current balance {saldo}).', { pago: formatoMoneda(pago), n: restantes, saldo: formatoMoneda(p.saldo_actual) })}</p>{/if}
  </form>
  {#snippet acciones()}
    <div class="modal__acciones">
      <button type="button" class="btn btn--fantasma" onclick={() => (abierto = false)}>{t('Cancel')}</button>
      <button type="submit" form="form-editar-prestamo" class="btn btn--primario" disabled={guardando}>{t('Save changes')}</button>
    </div>
  {/snippet}
</Modal>
