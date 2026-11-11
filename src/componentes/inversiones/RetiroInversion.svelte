<script lang="ts">
  import Modal from '../Modal.svelte';
  import Campo from '../Campo.svelte';
  import CampoMoneda from '../CampoMoneda.svelte';
  import { retirarInversion } from '../../lib/datos/ledger';
  import { formatoMoneda, hoyISO } from '../../lib/formato';
  import { etiquetaDeCuentaConBanco } from '../../lib/etiquetas';
  import { mostrarToast } from '../../lib/avisos.svelte';
  import { t } from '../../lib/i18n.svelte';
  import type { CuentaDebito, Inversion } from '../../lib/datos/tipos';

  let { abierto = $bindable(), inversion: inv, cuentas, alGuardar }: { abierto: boolean; inversion: Inversion; cuentas: CuentaDebito[]; alGuardar: () => void } = $props();

  let monto = $state(0), cuentaId = $state(cuentas[0]?.id), error = $state(''), guardando = $state(false);

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    if (!(monto > 0) || monto > inv.saldo) { error = 'Enter a valid amount'; return; }
    if (guardando) return;
    guardando = true;
    try {
      await retirarInversion({ inversion: inv, cuentaDestinoId: cuentaId, monto, fecha: hoyISO() });
      mostrarToast('Withdrawal registered', 'exito');
      abierto = false;
      alGuardar();
    } catch (err) {
      console.error(err);
      mostrarToast('Could not withdraw', 'error');
    } finally {
      guardando = false;
    }
  }
</script>

<Modal bind:abierto titulo={`${t('Withdraw from')} ${inv.nombre}`}>
  <form id="form-retiro" onsubmit={guardar}>
    <CampoMoneda etiqueta={`${t('Amount')} (max ${formatoMoneda(inv.saldo)})`} bind:valor={monto} {error} />
    <Campo etiqueta="Destination account">
      <select class="campo__control" bind:value={cuentaId}>{#each cuentas as c (c.id)}<option value={c.id}>{etiquetaDeCuentaConBanco(c)}</option>{/each}</select>
    </Campo>
  </form>
  {#snippet acciones()}
    <div class="modal__acciones">
      <button type="button" class="btn btn--fantasma" onclick={() => (abierto = false)}>{t('Cancel')}</button>
      <button type="submit" form="form-retiro" class="btn btn--primario" disabled={guardando}>{t('Withdraw')}</button>
    </div>
  {/snippet}
</Modal>
