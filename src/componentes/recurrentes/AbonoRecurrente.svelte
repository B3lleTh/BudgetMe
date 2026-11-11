<script lang="ts">
  import Modal from '../Modal.svelte';
  import Campo from '../Campo.svelte';
  import CampoMoneda from '../CampoMoneda.svelte';
  import { abonarRecurrente } from '../../lib/datos/ledger';
  import { formatoMoneda, hoyISO } from '../../lib/formato';
  import { etiquetaDeCuentaConBanco } from '../../lib/etiquetas';
  import { mostrarToast } from '../../lib/avisos.svelte';
  import { t } from '../../lib/i18n.svelte';
  import type { CuentaDebito, Recurrente } from '../../lib/datos/tipos';

  let { abierto = $bindable(), recurrente: r, cuentas, alGuardar }: { abierto: boolean; recurrente: Recurrente; cuentas: CuentaDebito[]; alGuardar: () => void } = $props();

  const pendiente = Math.max(0, r.monto - (r.abonado || 0));
  let monto = $state(0), cuentaId = $state(r.cuenta_destino_id ?? cuentas[0]?.id);
  let error = $state(''), guardando = $state(false);

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    if (!(monto > 0)) { error = 'Enter a valid amount'; return; }
    if (monto > pendiente) { error = t('Cannot exceed the remaining amount') + ` (${formatoMoneda(pendiente)})`; return; }
    if (guardando) return;
    guardando = true;
    try {
      await abonarRecurrente({ recurrente: r, cuentaDebitoId: cuentaId, monto, fecha: hoyISO() });
      mostrarToast(monto >= pendiente ? 'Fully paid off' : 'Partial payment registered', 'exito');
      abierto = false;
      alGuardar();
    } catch (err) {
      console.error(err);
      mostrarToast('Could not register the payment', 'error');
    } finally {
      guardando = false;
    }
  }
</script>

<Modal bind:abierto titulo={`${t('Add payment')} — ${r.nombre}`} subtitulo={`${t('Remaining to fully pay this period')}: ${formatoMoneda(pendiente)}`}>
  <form id="form-abono" onsubmit={guardar}>
    <div class="campo__fila">
      <CampoMoneda etiqueta="Amount to pay now" bind:valor={monto} {error} />
      <Campo etiqueta="From account">
        <select class="campo__control" bind:value={cuentaId}>{#each cuentas as c (c.id)}<option value={c.id}>{etiquetaDeCuentaConBanco(c)}</option>{/each}</select>
      </Campo>
    </div>
  </form>
  {#snippet acciones()}
    <div class="modal__acciones">
      <button type="button" class="btn btn--fantasma" onclick={() => (abierto = false)}>{t('Cancel')}</button>
      <button type="submit" form="form-abono" class="btn btn--primario" disabled={guardando}>{t('Register payment')}</button>
    </div>
  {/snippet}
</Modal>
