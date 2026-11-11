<script lang="ts">
  import Modal from '../Modal.svelte';
  import Campo from '../Campo.svelte';
  import CampoMoneda from '../CampoMoneda.svelte';
  import { abonarCapitalPrestamo } from '../../lib/datos/ledger';
  import { formatoMoneda, hoyISO } from '../../lib/formato';
  import { etiquetaDeCuentaConBanco } from '../../lib/etiquetas';
  import { mostrarToast } from '../../lib/avisos.svelte';
  import { t } from '../../lib/i18n.svelte';
  import type { CuentaDebito, Prestamo } from '../../lib/datos/tipos';

  /** Dinero extra que baja el saldo directamente; la mensualidad se recalcula. */
  let { abierto = $bindable(), prestamo: p, cuentas, alGuardar }: { abierto: boolean; prestamo: Prestamo; cuentas: CuentaDebito[]; alGuardar: () => void } = $props();

  let monto = $state(0), cuentaId = $state(cuentas[0]?.id), fecha = $state(hoyISO()), error = $state(''), guardando = $state(false);

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    if (!(monto > 0)) { error = 'Enter a valid amount'; return; }
    if (monto > p.saldo_actual) { error = `${t('Cannot exceed the current balance')} (${formatoMoneda(p.saldo_actual)})`; return; }
    if (guardando) return;
    guardando = true;
    try {
      await abonarCapitalPrestamo({ prestamo: p, cuentaDebitoId: cuentaId, monto, fecha: fecha || hoyISO() });
      mostrarToast('Extra payment applied — balance and monthly payment updated', 'exito');
      abierto = false;
      alGuardar();
    } catch (err) {
      console.error(err);
      mostrarToast('Could not apply the payment', 'error');
    } finally {
      guardando = false;
    }
  }
</script>

<Modal bind:abierto titulo={t('Extra principal payment')} subtitulo={t('Pays down {nombre}\'s balance directly, on top of the regular monthly payment. The monthly payment will be recalculated afterward.', { nombre: p.nombre })}>
  <form id="form-abono-prestamo" onsubmit={guardar}>
    <CampoMoneda etiqueta="Amount" bind:valor={monto} {error} />
    <div class="campo__fila">
      <Campo etiqueta="From account">
        <select class="campo__control" bind:value={cuentaId}>{#each cuentas as c (c.id)}<option value={c.id}>{etiquetaDeCuentaConBanco(c)}</option>{/each}</select>
      </Campo>
      <Campo etiqueta="Date"><input class="campo__control" type="date" bind:value={fecha} /></Campo>
    </div>
    <p class="ayuda">{t('Current balance')}: {formatoMoneda(p.saldo_actual)}</p>
  </form>
  {#snippet acciones()}
    <div class="modal__acciones">
      <button type="button" class="btn btn--fantasma" onclick={() => (abierto = false)}>{t('Cancel')}</button>
      <button type="submit" form="form-abono-prestamo" class="btn btn--primario" class:btn--carga={guardando} disabled={guardando}>{t('Apply payment')}</button>
    </div>
  {/snippet}
</Modal>
