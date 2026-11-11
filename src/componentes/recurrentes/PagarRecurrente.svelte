<script lang="ts">
  import Modal from '../Modal.svelte';
  import { consultar, ejecutar } from '../../lib/datos/db';
  import { pagarTarjeta, pagarPrestamo } from '../../lib/datos/ledger';
  import { formatoMoneda, hoyISO } from '../../lib/formato';
  import { etiquetaDeCuentaConBanco, nombreDeRecurrente } from '../../lib/etiquetas';
  import { mostrarToast } from '../../lib/avisos.svelte';
  import { t } from '../../lib/i18n.svelte';
  import type { Caja, CuentaDebito, Recurrente } from '../../lib/datos/tipos';

  /** Mensualidad de tarjeta o préstamo: pregunta de dónde sale el dinero
   * (cuenta de débito o la caja "Reservado para tarjetas"). */
  let { abierto = $bindable(), recurrente: r, cuentas, alGuardar }: { abierto: boolean; recurrente: Recurrente; cuentas: CuentaDebito[]; alGuardar: () => void } = $props();

  const monto = Math.max(0, r.monto - (r.abonado || 0));
  const esTarjeta = !!r.tarjeta_id;
  let reserva = $state<Caja | null>(null);
  if (esTarjeta) consultar<Caja>(`SELECT * FROM cajas WHERE es_sistema = 1 LIMIT 1`).then(([c]) => (reserva = c ?? null));

  const sugerida = cuentas.find((c) => c.id === r.cuenta_destino_id && c.saldo >= monto) ?? cuentas.find((c) => c.saldo >= monto);
  let origen = $state<string | null>(sugerida ? `debito:${sugerida.id}` : null);
  let error = $state(''), guardando = $state(false);

  async function pagar(e: SubmitEvent) {
    e.preventDefault();
    if (!origen) { error = 'None of your accounts has enough balance for this payment.'; return; }
    if (guardando) return;
    const usarReservaTC = origen === 'reserva';
    const cuentaDebitoId = usarReservaTC ? null : Number(origen.split(':')[1]);
    guardando = true;
    try {
      if (esTarjeta) {
        await pagarTarjeta({ tarjetaId: r.tarjeta_id, cuentaDebitoId, usarReservaTC, monto, fecha: hoyISO(), refTabla: 'recurrentes', refId: r.id });
        if (r.gasto_id) await ejecutar(`UPDATE gastos SET msi_pagados = msi_pagados + 1 WHERE id = $1`, [r.gasto_id]);
      } else {
        const [prestamo] = await consultar(`SELECT * FROM prestamos WHERE id = $1`, [r.prestamo_id]);
        await pagarPrestamo({ prestamo, cuentaDebitoId, monto, fecha: hoyISO(), refTabla: 'recurrentes', refId: r.id });
      }
      await ejecutar(`UPDATE recurrentes SET estado='pagado', abonado=0, ultima_aplicacion=$1 WHERE id=$2`, [hoyISO(), r.id]);
      mostrarToast('Payment registered', 'exito');
      abierto = false;
      alGuardar();
    } catch (err) {
      console.error(err);
      mostrarToast(String(err).includes('INSUFFICIENT_RESERVE_BALANCE') ? 'Not enough money reserved for card payments' : 'Could not mark as paid', 'error');
    } finally {
      guardando = false;
    }
  }
</script>

{#snippet opcion(valor: string, titulo: string, saldo: number)}
  {@const alcanza = saldo >= monto}
  <label class="opcion-pago" class:opcion-pago--deshabilitada={!alcanza}>
    <input type="radio" name="origen" value={valor} bind:group={origen} disabled={!alcanza} />
    <div class="fila__cuerpo"><div class="fila__titulo">{titulo}</div><div class="fila__meta">{t('Available')} {formatoMoneda(saldo)}{alcanza ? '' : ` ${t('— not enough')}`}</div></div>
  </label>
{/snippet}

<Modal bind:abierto titulo={`${t('Pay')} ${nombreDeRecurrente(r.nombre, t)}`} subtitulo={`${formatoMoneda(monto)} ${t('will come out of the account you choose')} ${t(esTarjeta ? 'and lower the card\'s debt' : 'and lower the loan\'s balance')}.`}>
  <form id="form-pagar" onsubmit={pagar}>
    <div class="opciones-pago">
      {#each cuentas as c (c.id)}{@render opcion(`debito:${c.id}`, etiquetaDeCuentaConBanco(c), c.saldo)}{/each}
      {#if reserva}{@render opcion('reserva', t('Reserved for Card Payments'), reserva.saldo)}{/if}
    </div>
    {#if error}<p class="campo__error" style="display:block; margin-top:8px;">{t(error)}</p>{/if}
  </form>
  {#snippet acciones()}
    <div class="modal__acciones">
      <button type="button" class="btn btn--fantasma" onclick={() => (abierto = false)}>{t('Cancel')}</button>
      <button type="submit" form="form-pagar" class="btn btn--primario" class:btn--carga={guardando} disabled={guardando}>{t('Pay')} {formatoMoneda(monto)}</button>
    </div>
  {/snippet}
</Modal>
