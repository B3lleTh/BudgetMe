<script lang="ts">
  import Modal from '../Modal.svelte';
  import Campo from '../Campo.svelte';
  import CampoMoneda from '../CampoMoneda.svelte';
  import { ejecutar } from '../../lib/datos/db';
  import { etiquetaDeCuentaConBanco, MESES } from '../../lib/etiquetas';
  import { mostrarToast } from '../../lib/avisos.svelte';
  import { t } from '../../lib/i18n.svelte';
  import type { CuentaDebito, Recurrente } from '../../lib/datos/tipos';

  let { abierto = $bindable(), registro = null, cuentas, alGuardar }: { abierto: boolean; registro?: Recurrente | null; cuentas: CuentaDebito[]; alGuardar: () => void } = $props();

  const mesesGuardados = (() => { try { const m = JSON.parse(registro?.meses_activos || '[]'); return Array.isArray(m) ? m : []; } catch { return []; } })();
  let nombre = $state(registro?.nombre ?? ''), monto = $state(registro?.monto ?? 0), categoria = $state(registro?.categoria ?? '');
  let periodicidad = $state(registro?.periodicidad ?? 'mensual'), cuentaId = $state(registro?.cuenta_destino_id ?? cuentas[0]?.id);
  let meses = $state<number[]>(mesesGuardados);
  let errores = $state<Record<string, string>>({}), guardando = $state(false);

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    errores = {};
    if (!nombre.trim()) errores.nombre = 'Enter a name';
    if (!(monto > 0)) errores.monto = 'Enter a valid amount';
    if (Object.keys(errores).length || guardando) return;
    const valores = [nombre.trim(), categoria.trim() || null, monto, periodicidad, cuentaId, JSON.stringify([...meses].sort((a, b) => a - b))];
    guardando = true;
    try {
      if (registro) {
        await ejecutar(`UPDATE recurrentes SET nombre=$1, categoria=$2, monto=$3, periodicidad=$4, cuenta_destino_id=$5, meses_activos=$6 WHERE id=$7`, [...valores, registro.id]);
        mostrarToast('Recurring expense updated', 'exito');
      } else {
        await ejecutar(`INSERT INTO recurrentes (tipo, nombre, categoria, monto, periodicidad, cuenta_destino_id, meses_activos, estado) VALUES ('gasto',$1,$2,$3,$4,$5,$6,'pendiente')`, valores);
        mostrarToast('Recurring expense created', 'exito');
      }
      abierto = false;
      alGuardar();
    } catch (err) {
      console.error(err);
      mostrarToast('Could not save', 'error');
    } finally {
      guardando = false;
    }
  }
</script>

<Modal bind:abierto titulo={t(registro ? 'Edit recurring expense' : 'New recurring expense')} ancho="ancho">
  <form id="form-recurrente" onsubmit={guardar}>
    <Campo etiqueta="Name" error={errores.nombre}><input class="campo__control" name="nombre" placeholder={t('Netflix, gym, insurance…')} bind:value={nombre} /></Campo>
    <div class="campo__fila">
      <CampoMoneda etiqueta="Amount" bind:valor={monto} error={errores.monto} />
      <Campo etiqueta="Frequency">
        <select class="campo__control" bind:value={periodicidad}>
          <option value="mensual">{t('Monthly')}</option><option value="semanal">{t('Weekly')}</option>
          <option value="quincenal">{t('Biweekly')}</option><option value="personalizada">{t('Custom')}</option>
        </select>
      </Campo>
    </div>
    <div class="campo__fila">
      <Campo etiqueta="Category"><input class="campo__control" placeholder={t('Subscription')} bind:value={categoria} /></Campo>
      <Campo etiqueta="Charge account">
        <select class="campo__control" bind:value={cuentaId}>{#each cuentas as c (c.id)}<option value={c.id}>{etiquetaDeCuentaConBanco(c)}</option>{/each}</select>
      </Campo>
    </div>
    <fieldset class="campo">
      <legend class="campo__etiqueta">{t('Which months does it apply to? (leave empty for all)')}</legend>
      <div class="chips">
        {#each MESES as m, i}<label class="chip"><input type="checkbox" value={i + 1} bind:group={meses} />{t(m)}</label>{/each}
      </div>
    </fieldset>
  </form>
  {#snippet acciones()}
    <div class="modal__acciones">
      <button type="button" class="btn btn--fantasma" onclick={() => (abierto = false)}>{t('Cancel')}</button>
      <button type="submit" form="form-recurrente" class="btn btn--primario" disabled={guardando}>{t(registro ? 'Save changes' : 'Save')}</button>
    </div>
  {/snippet}
</Modal>

<style>
  fieldset { border: none; padding: 0; margin: 0 0 14px; }
</style>
