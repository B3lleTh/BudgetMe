<script lang="ts">
  import Modal from '../Modal.svelte';
  import Campo from '../Campo.svelte';
  import CampoMoneda from '../CampoMoneda.svelte';
  import { crearPrestamo } from '../../lib/datos/ledger';
  import { calcularPagoMensual } from '../../lib/datos/sincronizarPrestamos';
  import { formatoMoneda, hoyISO } from '../../lib/formato';
  import { etiquetaDeCuentaConBanco } from '../../lib/etiquetas';
  import { mostrarToast } from '../../lib/avisos.svelte';
  import { t } from '../../lib/i18n.svelte';
  import type { CuentaDebito } from '../../lib/datos/tipos';

  let { abierto = $bindable(), cuentas, alGuardar }: { abierto: boolean; cuentas: CuentaDebito[]; alGuardar: () => void } = $props();

  let nombre = $state(''), montoOriginal = $state(0), tasa = $state<number | null>(null), plazo = $state<number | null>(null);
  let corte = $state<number | null>(null), inicio = $state(hoyISO()), yaIniciado = $state(false);
  let cuentaDestino = $state<number | ''>(''), saldoActual = $state(0), pagados = $state<number | null>(null);
  let notas = $state(''), cuentaPago = $state(cuentas[0]?.id);
  let errores = $state<Record<string, string>>({}), guardando = $state(false);

  const mesesPagados = $derived(yaIniciado ? Number(pagados) || 0 : 0);
  const saldo = $derived(yaIniciado ? saldoActual : montoOriginal);
  const restantes = $derived((Number(plazo) || 0) - mesesPagados);
  // Vista previa de la mensualidad amortizada antes de guardar.
  const pago = $derived(saldo && restantes > 0 ? calcularPagoMensual(saldo, Number(tasa) || 0, restantes) : 0);

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    errores = {};
    if (!nombre.trim()) errores.nombre = 'Enter a name';
    if (!(montoOriginal > 0)) errores.monto = 'Enter a valid amount';
    if (Object.keys(errores).length || guardando) return;
    if (!cuentas.length) return mostrarToast('Register a debit account first', 'error');
    if (restantes <= 0) return mostrarToast('Payments already made cannot reach or exceed the total term', 'error');
    guardando = true;
    try {
      await crearPrestamo({
        nombre: nombre.trim(), montoOriginal, saldoInicial: saldo, tasaInteres: Number(tasa) || 0, plazoMeses: Number(plazo) || 1,
        mesesPagados, pagoMensual: pago, fechaInicio: inicio || hoyISO(), fechaCorte: Number(corte) || null,
        // Un préstamo nuevo solo deposita si se eligió una cuenta.
        cuentaDestinoId: !yaIniciado && cuentaDestino ? Number(cuentaDestino) : null,
        cuentaPagoId: cuentaPago, notas: notas.trim() || null,
      });
      mostrarToast('Loan registered', 'exito');
      abierto = false;
      alGuardar();
    } catch (err) {
      console.error(err);
      mostrarToast('Could not save the loan', 'error');
    } finally {
      guardando = false;
    }
  }
</script>

<Modal bind:abierto titulo={t('New loan')} ancho="ancho">
  <form id="form-prestamo" onsubmit={guardar}>
    <Campo etiqueta="Name" error={errores.nombre}><input class="campo__control" name="nombre" placeholder={t('Car loan, personal loan…')} bind:value={nombre} /></Campo>
    <div class="campo__fila">
      <CampoMoneda etiqueta="Original amount" bind:valor={montoOriginal} error={errores.monto} />
      <Campo etiqueta="Annual interest rate (%)"><input class="campo__control" type="number" step="0.01" min="0" placeholder="0" bind:value={tasa} /></Campo>
    </div>
    <div class="campo__fila">
      <Campo etiqueta="Total term (months)"><input class="campo__control" type="number" min="1" bind:value={plazo} /></Campo>
      <Campo etiqueta="Statement/payment day"><input class="campo__control" type="number" min="1" max="31" bind:value={corte} /></Campo>
    </div>
    <Campo etiqueta="Start date"><input class="campo__control" type="date" bind:value={inicio} /></Campo>
    <label class="campo campo__etiqueta"><input type="checkbox" bind:checked={yaIniciado} /> {t('I already have this loan running (some payments already made outside the app)')}</label>
    {#if yaIniciado}
      <div class="campo__fila">
        <CampoMoneda etiqueta="Remaining balance owed today" bind:valor={saldoActual} />
        <Campo etiqueta="Payments already made"><input class="campo__control" type="number" min="0" bind:value={pagados} /></Campo>
      </div>
    {:else}
      <Campo etiqueta="Deposit the loan amount into an account?">
        <select class="campo__control" bind:value={cuentaDestino}>
          <option value="">{t('No — I already have the money / don\'t track this deposit')}</option>
          {#each cuentas as c (c.id)}<option value={c.id}>{etiquetaDeCuentaConBanco(c)}</option>{/each}
        </select>
      </Campo>
    {/if}
    <Campo etiqueta="Notes"><textarea class="campo__control" rows="2" placeholder="Optional" bind:value={notas}></textarea></Campo>
    <Campo etiqueta="Pay from account">
      <select class="campo__control" bind:value={cuentaPago}>{#each cuentas as c (c.id)}<option value={c.id}>{etiquetaDeCuentaConBanco(c)}</option>{/each}</select>
    </Campo>
    {#if pago}<p class="campo__vista-previa">{t('Estimated monthly payment: {pago} for {n} remaining months.', { pago: formatoMoneda(pago), n: restantes })}</p>{/if}
  </form>
  {#snippet acciones()}
    <div class="modal__acciones">
      <button type="button" class="btn btn--fantasma" onclick={() => (abierto = false)}>{t('Cancel')}</button>
      <button type="submit" form="form-prestamo" class="btn btn--primario" class:btn--carga={guardando} disabled={guardando}>{t('Save')}</button>
    </div>
  {/snippet}
</Modal>
