<script lang="ts">
  import Modal from '../Modal.svelte';
  import Campo from '../Campo.svelte';
  import CampoMoneda from '../CampoMoneda.svelte';
  import { ejecutar } from '../../lib/datos/db';
  import { mostrarToast } from '../../lib/avisos.svelte';
  import { t } from '../../lib/i18n.svelte';
  import type { Tarjeta } from '../../lib/datos/tipos';

  let { abierto = $bindable(), registro = null, alGuardar }: { abierto: boolean; registro?: Tarjeta | null; alGuardar: () => void } = $props();

  let nombre = $state(registro?.nombre ?? ''), banco = $state(registro?.banco ?? ''), tipo = $state(registro?.tipo ?? 'credito');
  let limite = $state(registro?.limite ?? 0), saldo = $state(registro?.saldo ?? 0);
  let corte = $state<number | null>(registro?.fecha_corte ?? null), limitePago = $state<number | null>(registro?.fecha_limite_pago ?? null);
  let error = $state(''), guardando = $state(false);

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    if (!nombre.trim()) { error = 'Enter a name'; return; }
    if (guardando) return;
    const credito = tipo === 'credito';
    const valores = [nombre.trim(), banco.trim() || null, tipo, credito ? limite : null, Number(corte) || null, Number(limitePago) || null];
    guardando = true;
    try {
      if (registro) {
        await ejecutar(`UPDATE tarjetas SET nombre=$1, banco=$2, tipo=$3, limite=$4, fecha_corte=$5, fecha_limite_pago=$6, saldo=$7 WHERE id=$8`, [...valores, credito ? saldo : registro.saldo, registro.id]);
        mostrarToast('Card updated', 'exito');
      } else {
        await ejecutar(`INSERT INTO tarjetas (nombre, banco, tipo, limite, fecha_corte, fecha_limite_pago) VALUES ($1,$2,$3,$4,$5,$6)`, valores);
        mostrarToast('Card created', 'exito');
      }
      abierto = false;
      alGuardar();
    } catch (err) {
      console.error(err);
      mostrarToast('Could not save the card', 'error');
    } finally {
      guardando = false;
    }
  }
</script>

<Modal bind:abierto titulo={t(registro ? 'Edit card' : 'New card')}>
  <form id="form-tarjeta" onsubmit={guardar}>
    <Campo etiqueta="Name" {error}><input class="campo__control" name="nombre" bind:value={nombre} /></Campo>
    <div class="campo__fila">
      <Campo etiqueta="Bank"><input class="campo__control" bind:value={banco} /></Campo>
      <Campo etiqueta="Type">
        <select class="campo__control" bind:value={tipo}><option value="credito">{t('Credit')}</option><option value="debito">{t('Debit')}</option></select>
      </Campo>
    </div>
    {#if tipo === 'credito'}
      {#if registro}<CampoMoneda etiqueta="Current debt" bind:valor={saldo} />{/if}
      <CampoMoneda etiqueta="Credit limit" bind:valor={limite} />
      <div class="campo__fila">
        <Campo etiqueta="Statement day"><input class="campo__control" type="number" min="1" max="31" bind:value={corte} /></Campo>
        <Campo etiqueta="Payment due day"><input class="campo__control" type="number" min="1" max="31" bind:value={limitePago} /></Campo>
      </div>
    {/if}
  </form>
  {#snippet acciones()}
    <div class="modal__acciones">
      <button type="button" class="btn btn--fantasma" onclick={() => (abierto = false)}>{t('Cancel')}</button>
      <button type="submit" form="form-tarjeta" class="btn btn--primario" disabled={guardando}>{t(registro ? 'Save changes' : 'Save')}</button>
    </div>
  {/snippet}
</Modal>
