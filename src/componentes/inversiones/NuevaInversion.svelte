<script lang="ts">
  import Modal from '../Modal.svelte';
  import Campo from '../Campo.svelte';
  import CampoMoneda from '../CampoMoneda.svelte';
  import { crearInversion } from '../../lib/datos/ledger';
  import { hoyISO } from '../../lib/formato';
  import { etiquetaDeCuentaConBanco } from '../../lib/etiquetas';
  import { mostrarToast } from '../../lib/avisos.svelte';
  import { t } from '../../lib/i18n.svelte';
  import type { CuentaDebito } from '../../lib/datos/tipos';

  let { abierto = $bindable(), cuentas, alGuardar }: { abierto: boolean; cuentas: CuentaDebito[]; alGuardar: () => void } = $props();

  let nombre = $state(''), aporte = $state(0), tasa = $state<number | null>(null), cuentaId = $state<number | ''>('');
  let errores = $state<Record<string, string>>({}), guardando = $state(false);

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    errores = {};
    if (!nombre.trim()) errores.nombre = 'Enter a name';
    if (!(aporte > 0)) errores.aporte = 'Enter a valid amount';
    if (Object.keys(errores).length || guardando) return;
    guardando = true;
    try {
      await crearInversion({ nombre: nombre.trim(), cuentaOrigenId: cuentaId ? Number(cuentaId) : null, aporte, tasaAnual: Number(tasa) || 0, fecha: hoyISO() });
      mostrarToast('Investment created', 'exito');
      abierto = false;
      alGuardar();
    } catch (err) {
      if (String(err).includes('INSUFFICIENT_DEBIT_BALANCE')) errores.aporte = 'Not enough balance in that account';
      else { console.error(err); mostrarToast('Could not create the investment', 'error'); }
    } finally {
      guardando = false;
    }
  }
</script>

<Modal bind:abierto titulo={t('New investment')}>
  <form id="form-inversion" onsubmit={guardar}>
    <Campo etiqueta="Name" error={errores.nombre}><input class="campo__control" placeholder={t('Retirement fund, CETES…')} bind:value={nombre} /></Campo>
    <div class="campo__fila">
      <CampoMoneda etiqueta="Initial amount" bind:valor={aporte} error={errores.aporte} />
      <Campo etiqueta="Annual interest rate (%)"><input class="campo__control" type="number" step="0.01" min="0" placeholder="10.9" bind:value={tasa} /></Campo>
    </div>
    <Campo etiqueta="Funding account (optional)">
      <select class="campo__control" bind:value={cuentaId}>
        <option value="">{t('— None (just track it) —')}</option>
        {#each cuentas as c (c.id)}<option value={c.id}>{etiquetaDeCuentaConBanco(c)}</option>{/each}
      </select>
    </Campo>
  </form>
  {#snippet acciones()}
    <div class="modal__acciones">
      <button type="button" class="btn btn--fantasma" onclick={() => (abierto = false)}>{t('Cancel')}</button>
      <button type="submit" form="form-inversion" class="btn btn--primario" disabled={guardando}>{t('Save')}</button>
    </div>
  {/snippet}
</Modal>
