<script lang="ts">
  import Modal from '../Modal.svelte';
  import Campo from '../Campo.svelte';
  import CampoMoneda from '../CampoMoneda.svelte';
  import { transferirEntreCuentas } from '../../lib/datos/ledger';
  import { formatoMoneda, hoyISO } from '../../lib/formato';
  import { etiquetaDeCuentaConBanco } from '../../lib/etiquetas';
  import { mostrarToast } from '../../lib/avisos.svelte';
  import { t } from '../../lib/i18n.svelte';
  import type { Caja, CuentaDebito } from '../../lib/datos/tipos';

  /** Débito↔débito, débito↔caja, caja↔caja. No es ingreso ni gasto. */
  let { abierto = $bindable(), cuentas, cajas, alGuardar }: { abierto: boolean; cuentas: CuentaDebito[]; cajas: Caja[]; alGuardar: () => void } = $props();

  const lugares = [
    ...cuentas.map((c) => ({ ref: `debito:${c.id}`, nombre: etiquetaDeCuentaConBanco(c), saldo: c.saldo, tipo: 'Debit' })),
    ...cajas.map((c) => ({ ref: `caja:${c.id}`, nombre: c.nombre, saldo: c.saldo, tipo: 'Savings box' })),
  ];
  let origen = $state(lugares[0]?.ref), destino = $state(lugares[1]?.ref);
  let monto = $state(0), notas = $state(''), fecha = $state(hoyISO());
  let error = $state(''), guardando = $state(false);
  const disponible = $derived(lugares.find((l) => l.ref === origen)?.saldo ?? 0);

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    if (!(monto > 0)) { error = 'Enter a valid amount'; return; }
    if (origen === destino) return mostrarToast('Origin and destination must be different', 'error');
    if (guardando) return;
    guardando = true;
    try {
      await transferirEntreCuentas({ origen, destino, monto, notas: notas.trim() || null, fecha: fecha || hoyISO() });
      mostrarToast('Money moved', 'exito');
      abierto = false;
      alGuardar();
    } catch (err) {
      console.error(err);
      const msg = String(err);
      mostrarToast(msg.includes('INSUFFICIENT_DEBIT_BALANCE') ? 'Not enough balance in the origin' : msg.includes('SAME_ACCOUNT') ? 'Origin and destination must be different' : 'Could not move the money', 'error');
    } finally {
      guardando = false;
    }
  }
</script>

<Modal bind:abierto titulo={t('Move money')} subtitulo={t('Transfers are not counted as income or expenses — it\'s the same money, just moved.')}>
  <form id="form-mover" onsubmit={guardar}>
    <Campo etiqueta="Move from">
      <select class="campo__control" name="origen" bind:value={origen}>{#each lugares as l}<option value={l.ref}>{l.nombre} ({t(l.tipo)})</option>{/each}</select>
    </Campo>
    <p class="ayuda" style="margin:-8px 0 14px;">{t('Available in this account')}: {formatoMoneda(disponible)}</p>
    <Campo etiqueta="Move to">
      <select class="campo__control" name="destino" bind:value={destino}>{#each lugares as l}<option value={l.ref}>{l.nombre} ({t(l.tipo)})</option>{/each}</select>
    </Campo>
    <div class="campo__fila">
      <CampoMoneda etiqueta="Amount" bind:valor={monto} {error} />
      <Campo etiqueta="Date"><input class="campo__control" type="date" bind:value={fecha} /></Campo>
    </div>
    <Campo etiqueta="Notes (optional)"><input class="campo__control" bind:value={notas} /></Campo>
  </form>
  {#snippet acciones()}
    <div class="modal__acciones">
      <button type="button" class="btn btn--fantasma" onclick={() => (abierto = false)}>{t('Cancel')}</button>
      <button type="submit" form="form-mover" class="btn btn--primario" class:btn--carga={guardando} disabled={guardando}>{t('Move money')}</button>
    </div>
  {/snippet}
</Modal>
