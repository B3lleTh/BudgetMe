<script lang="ts">
  import Modal from '../Modal.svelte';
  import Campo from '../Campo.svelte';
  import { ejecutar } from '../../lib/datos/db';
  import { CATEGORIAS_GASTO } from '../../lib/etiquetas';
  import { mostrarToast } from '../../lib/avisos.svelte';
  import { t } from '../../lib/i18n.svelte';
  import type { Gasto } from '../../lib/datos/tipos';

  /** Solo nombre, categoría, fecha y notas: el monto ya generó un movimiento;
   * para corregirlo se borra el gasto (revierte el saldo) y se registra de nuevo. */
  let { gasto = $bindable(), alGuardar }: { gasto: Gasto | null; alGuardar: () => void } = $props();

  let abierto = $state(false);
  let nombre = $state(''), categoria = $state(''), fecha = $state(''), notas = $state('');
  let error = $state(''), guardando = $state(false);

  $effect(() => {
    if (!gasto) return;
    ({ nombre, categoria, fecha } = gasto);
    notas = gasto.notas || '';
    error = '';
    abierto = true;
  });

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    if (!gasto || guardando) return;
    if (!nombre.trim()) { error = 'Enter a name'; return; }
    guardando = true;
    try {
      await ejecutar(`UPDATE gastos SET nombre=$1, categoria=$2, fecha=$3, notas=$4 WHERE id=$5`, [nombre.trim(), categoria, fecha, notas.trim() || null, gasto.id]);
      // El movimiento del historial sigue al gasto.
      await ejecutar(`UPDATE transacciones SET fecha=$1, categoria=$2, notas=$3 WHERE ref_tabla='gastos' AND ref_id=$4`, [fecha, categoria, nombre.trim(), gasto.id]);
      mostrarToast('Expense updated', 'exito');
      abierto = false;
      alGuardar();
    } catch (err) {
      console.error(err);
      mostrarToast('Could not update', 'error');
    } finally {
      guardando = false;
    }
  }
</script>

<Modal bind:abierto titulo={t('Edit expense')} subtitulo={t('The amount isn’t editable here to avoid throwing off your history: if the amount is wrong, delete the expense (reverts the balance) and register it again.')} alCerrar={() => (gasto = null)}>
  <form id="form-editar-gasto" onsubmit={guardar}>
    <Campo etiqueta="Name" {error}><input class="campo__control" bind:value={nombre} /></Campo>
    <div class="campo__fila">
      <Campo etiqueta="Category">
        <select class="campo__control" bind:value={categoria}>{#each CATEGORIAS_GASTO as c}<option value={c.valor}>{t(c.etiqueta)}</option>{/each}</select>
      </Campo>
      <Campo etiqueta="Date"><input class="campo__control" type="date" bind:value={fecha} /></Campo>
    </div>
    <Campo etiqueta="Notes"><input class="campo__control" bind:value={notas} /></Campo>
  </form>
  {#snippet acciones()}
    <div class="modal__acciones">
      <button type="button" class="btn btn--fantasma" onclick={() => { abierto = false; gasto = null; }}>{t('Cancel')}</button>
      <button type="submit" form="form-editar-gasto" class="btn btn--primario" disabled={guardando}>{t('Save changes')}</button>
    </div>
  {/snippet}
</Modal>
