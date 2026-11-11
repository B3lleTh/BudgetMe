<script lang="ts">
  import Modal from '../Modal.svelte';
  import Campo from '../Campo.svelte';
  import CampoMoneda from '../CampoMoneda.svelte';
  import { ejecutar } from '../../lib/datos/db';
  import { registrarGasto } from '../../lib/datos/ledger';
  import { formatoMoneda, hoyISO } from '../../lib/formato';
  import { CATEGORIAS_GASTO, etiquetaDeCuentaConBanco } from '../../lib/etiquetas';
  import { mostrarToast } from '../../lib/avisos.svelte';
  import { t } from '../../lib/i18n.svelte';
  import type { CuentaDebito, Tarjeta } from '../../lib/datos/tipos';

  let { abierto = $bindable(), cuentas, tarjetas, alGuardar }: { abierto: boolean; cuentas: CuentaDebito[]; tarjetas: Tarjeta[]; alGuardar: () => void } = $props();

  let nombre = $state(''), monto = $state(0), fecha = $state(hoyISO()), categoria = $state('variable');
  let metodo = $state<'debito' | 'tarjeta'>('debito');
  let cuentaId = $state(cuentas[0]?.id), tarjetaId = $state(tarjetas[0]?.id);
  let esMSI = $state(false), meses = $state<number | null>(null), periodicidadMSI = $state<'mensual' | 'quincenal'>('mensual');
  let tasa = $state<number | null>(null), notas = $state('');
  let errores = $state<Record<string, string>>({});
  let guardando = $state(false);

  const esTarjeta = $derived(metodo === 'tarjeta');
  // MSI y tasa de interés son excluyentes: MSI significa "sin intereses".
  const tasaAplicada = $derived(esTarjeta && !esMSI ? Number(tasa) || 0 : 0);
  const montoFinal = $derived(tasaAplicada > 0 ? Math.round(monto * (1 + tasaAplicada / 100) * 100) / 100 : monto);
  const totalCortes = $derived(esMSI && meses ? meses * (periodicidadMSI === 'quincenal' ? 2 : 1) : 0);
  const porCorte = $derived(totalCortes ? Math.round((montoFinal / totalCortes) * 100) / 100 : 0);

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    errores = {};
    if (!nombre.trim()) errores.nombre = 'Enter a name';
    if (!(monto > 0)) errores.monto = 'Enter a valid amount';
    // Antes, dejar vacío el número de meses guardaba un plan "a 1 mes".
    if (esTarjeta && esMSI && !(Number(meses) >= 2)) errores.meses = 'Enter at least 2 months';
    if (Object.keys(errores).length || guardando) return;
    if (esTarjeta && !tarjetas.length) return mostrarToast('Register a credit card first', 'error');
    if (!esTarjeta && !cuentas.length) return mostrarToast('Register a debit account first', 'error');
    const msi = esTarjeta && esMSI;
    guardando = true;
    try {
      const res = await ejecutar(
        `INSERT INTO gastos (nombre, categoria, fecha, monto, notas, metodo_pago, tarjeta_id, cuenta_debito_id, es_msi, msi_meses, reservado_tc, msi_periodicidad, msi_monto_por_corte, tasa_interes, monto_base)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [nombre.trim(), categoria, fecha || hoyISO(), montoFinal, notas.trim() || null, metodo, esTarjeta ? tarjetaId : null, esTarjeta ? null : cuentaId,
         msi ? 1 : 0, msi ? meses : null, 0, msi ? periodicidadMSI : null, msi ? porCorte : null, tasaAplicada, monto]
      );
      // La deuda completa se carga a la tarjeta de una vez (así funciona un
      // plan a meses real); las mensualidades se generan en Recurrentes.
      await registrarGasto({ gastoId: res.lastInsertId, cuentaDebitoId: esTarjeta ? null : cuentaId, tarjetaId: esTarjeta ? tarjetaId : null, metodoPago: metodo, monto: montoFinal, categoria, notas: nombre.trim(), fecha: fecha || hoyISO() });
      mostrarToast('Expense registered', 'exito');
      abierto = false;
      alGuardar();
    } catch (err) {
      console.error(err);
      mostrarToast('Could not save the expense', 'error');
    } finally {
      guardando = false;
    }
  }
</script>

<Modal bind:abierto titulo={t('New expense')} subtitulo={t('It’s taken from the account or added to the card right away.')} ancho="ancho">
  <form id="form-gasto" onsubmit={guardar}>
    <Campo etiqueta="Name" error={errores.nombre}><input class="campo__control" name="nombre" bind:value={nombre} /></Campo>
    <div class="campo__fila">
      <CampoMoneda etiqueta="Amount" bind:valor={monto} error={errores.monto} />
      <Campo etiqueta="Date"><input class="campo__control" type="date" name="fecha" bind:value={fecha} /></Campo>
    </div>
    <div class="campo__fila">
      <Campo etiqueta="Category">
        <select class="campo__control" name="categoria" bind:value={categoria}>
          {#each CATEGORIAS_GASTO as c}<option value={c.valor}>{t(c.etiqueta)}</option>{/each}
        </select>
      </Campo>
      <Campo etiqueta="How was it paid?">
        <select class="campo__control" name="metodo_pago" bind:value={metodo}>
          <option value="debito">{t('Debit')}</option><option value="tarjeta">{t('Credit card')}</option>
        </select>
      </Campo>
    </div>
    {#if esTarjeta}
      <Campo etiqueta="Card">
        <select class="campo__control" name="tarjeta_id" bind:value={tarjetaId}>
          {#each tarjetas as tj (tj.id)}<option value={tj.id}>{etiquetaDeCuentaConBanco(tj)}</option>{/each}
        </select>
      </Campo>
      <div class="campo">
        <label class="campo__etiqueta"><input type="checkbox" name="es_msi" bind:checked={esMSI} /> {t('Interest-free installment purchase')}</label>
        {#if esMSI}
          <div class="campo__fila">
            <Campo error={errores.meses}><input class="campo__control" name="msi_meses" type="number" min="2" placeholder={t('Number of months')} aria-label={t('Number of months')} bind:value={meses} /></Campo>
            <Campo>
              <select class="campo__control" name="msi_periodicidad" aria-label={t('Frequency')} bind:value={periodicidadMSI}>
                <option value="mensual">{t('Charge monthly')}</option><option value="quincenal">{t('Split biweekly')}</option>
              </select>
            </Campo>
          </div>
          {#if porCorte}<p class="campo__vista-previa">{t('{n} payments of {monto} every {cada}.', { n: totalCortes, monto: formatoMoneda(porCorte), cada: t(periodicidadMSI === 'quincenal' ? 'two weeks' : 'month') })}</p>{/if}
        {/if}
      </div>
      {#if !esMSI}
        <Campo etiqueta="Interest rate charged on this purchase (%) — leave 0 if none">
          <input class="campo__control" name="tasa_interes" type="number" step="0.01" min="0" placeholder="0" bind:value={tasa} />
        </Campo>
        {#if tasaAplicada && monto}<p class="campo__vista-previa">{t('With {tasa}% interest, {final} will be charged to the card (base {base}).', { tasa: tasaAplicada, final: formatoMoneda(montoFinal), base: formatoMoneda(monto) })}</p>{/if}
      {/if}
    {:else}
      <Campo etiqueta="Account">
        <select class="campo__control" name="cuenta_debito_id" bind:value={cuentaId}>
          {#each cuentas as c (c.id)}<option value={c.id}>{etiquetaDeCuentaConBanco(c)}</option>{/each}
        </select>
      </Campo>
    {/if}
    <Campo etiqueta="Notes (optional)"><input class="campo__control" name="notas" bind:value={notas} /></Campo>
  </form>
  {#snippet acciones()}
    <div class="modal__acciones">
      <button type="button" class="btn btn--fantasma" onclick={() => (abierto = false)}>{t('Cancel')}</button>
      <button type="submit" form="form-gasto" class="btn btn--primario" class:btn--carga={guardando} disabled={guardando}>{t('Save expense')}</button>
    </div>
  {/snippet}
</Modal>
