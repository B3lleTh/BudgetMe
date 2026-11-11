<script lang="ts">
  import Modal from '../Modal.svelte';
  import Campo from '../Campo.svelte';
  import CampoMoneda from '../CampoMoneda.svelte';
  import { movimientoCaja } from '../../lib/datos/ledger';
  import { formatoMoneda, hoyISO } from '../../lib/formato';
  import { etiquetaDeCuentaConBanco } from '../../lib/etiquetas';
  import { mostrarToast } from '../../lib/avisos.svelte';
  import { t } from '../../lib/i18n.svelte';
  import type { Caja, CuentaDebito } from '../../lib/datos/tipos';

  /** Depósito (débito → caja) o retiro (caja → débito). Un depósito nunca
   * supera el saldo real de la cuenta; el libro mayor lo vuelve a validar. */
  let { abierto = $bindable(), caja, direccion, cuentas, alGuardar }: { abierto: boolean; caja: Caja; direccion: 'deposito' | 'retiro'; cuentas: CuentaDebito[]; alGuardar: () => void } = $props();

  const esDeposito = direccion === 'deposito';
  const nombreCaja = caja.es_sistema ? t('Reserved for Card Payments') : caja.nombre;
  let cuentaId = $state(cuentas[0]?.id), monto = $state(0), error = $state(''), guardando = $state(false);
  const saldoCuenta = $derived(cuentas.find((c) => c.id === cuentaId)?.saldo ?? 0);

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    if (!(monto > 0)) { error = 'Enter a valid amount'; return; }
    if (!esDeposito && monto > caja.saldo) { error = 'Not enough balance in the box'; return; }
    if (esDeposito && monto > saldoCuenta) { error = `${t('Not enough balance in that debit account')} (${t('available:')} ${formatoMoneda(saldoCuenta)})`; return; }
    if (guardando) return;
    guardando = true;
    try {
      await movimientoCaja({ cajaId: caja.id, cuentaDebitoId: cuentaId, monto, direccion, fecha: hoyISO() });
      mostrarToast('Movement registered', 'exito');
      abierto = false;
      alGuardar();
    } catch (err) {
      console.error(err);
      mostrarToast(String(err).includes('INSUFFICIENT_DEBIT_BALANCE') ? 'You can\'t deposit more than what you actually have available in that debit account' : 'Could not register the movement', 'error');
    } finally {
      guardando = false;
    }
  }
</script>

<Modal bind:abierto titulo={`${t(esDeposito ? 'Deposit to' : 'Withdraw from')} ${nombreCaja}`} subtitulo={`${t('Balance in this box')}: ${formatoMoneda(caja.saldo)}`}>
  <form id="form-mov" onsubmit={guardar}>
    <Campo etiqueta={esDeposito ? 'From account' : 'To account'}>
      <select class="campo__control" bind:value={cuentaId}>{#each cuentas as c (c.id)}<option value={c.id}>{etiquetaDeCuentaConBanco(c)}</option>{/each}</select>
    </Campo>
    {#if esDeposito}<p class="ayuda" style="margin:-8px 0 14px;">{t('Available in this account')}: {formatoMoneda(saldoCuenta)}</p>{/if}
    <CampoMoneda etiqueta="Amount" bind:valor={monto} {error} />
  </form>
  {#snippet acciones()}
    <div class="modal__acciones">
      <button type="button" class="btn btn--fantasma" onclick={() => (abierto = false)}>{t('Cancel')}</button>
      <button type="submit" form="form-mov" class="btn btn--primario" disabled={guardando}>{t('Confirm')}</button>
    </div>
  {/snippet}
</Modal>
