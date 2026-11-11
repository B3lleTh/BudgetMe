<script lang="ts">
  import Modal from '../Modal.svelte';
  import Campo from '../Campo.svelte';
  import CampoMoneda from '../CampoMoneda.svelte';
  import { ajustarSaldoCaja } from '../../lib/datos/ledger';
  import { formatoMoneda, hoyISO } from '../../lib/formato';
  import { mostrarToast } from '../../lib/avisos.svelte';
  import { t } from '../../lib/i18n.svelte';
  import type { Caja } from '../../lib/datos/tipos';

  /** Fija el saldo de una caja sin mover dinero de ninguna cuenta; deja un
   * movimiento 'ajuste_caja' con la diferencia para que sea rastreable. */
  let { abierto = $bindable(), caja, alGuardar }: { abierto: boolean; caja: Caja; alGuardar: () => void } = $props();

  let nuevoSaldo = $state(caja.saldo), notas = $state(''), guardando = $state(false);

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    if (guardando) return;
    guardando = true;
    try {
      await ajustarSaldoCaja({ cajaId: caja.id, nuevoSaldo, notas: notas.trim() || null, fecha: hoyISO() });
      mostrarToast('Balance adjusted', 'exito');
      abierto = false;
      alGuardar();
    } catch (err) {
      console.error(err);
      mostrarToast('Could not adjust the balance', 'error');
    } finally {
      guardando = false;
    }
  }
</script>

<Modal bind:abierto titulo={`${t('Adjust balance of')} ${caja.es_sistema ? t('Reserved for Card Payments') : caja.nombre}`}
  subtitulo={`${t('Current balance')}: ${formatoMoneda(caja.saldo)}. ${t('Set the new balance directly — this does not move money to or from any debit account, it only corrects what this box shows.')}`}>
  <form id="form-ajuste" onsubmit={guardar}>
    <CampoMoneda etiqueta="New balance" bind:valor={nuevoSaldo} />
    <Campo etiqueta="Reason (optional)"><input class="campo__control" placeholder={t('e.g. correction, manual set aside…')} bind:value={notas} /></Campo>
  </form>
  {#snippet acciones()}
    <div class="modal__acciones">
      <button type="button" class="btn btn--fantasma" onclick={() => (abierto = false)}>{t('Cancel')}</button>
      <button type="submit" form="form-ajuste" class="btn btn--primario" disabled={guardando}>{t('Apply adjustment')}</button>
    </div>
  {/snippet}
</Modal>
