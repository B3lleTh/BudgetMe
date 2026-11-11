<script lang="ts">
  import Modal from '../Modal.svelte';
  import Campo from '../Campo.svelte';
  import CampoMoneda from '../CampoMoneda.svelte';
  import { ejecutar } from '../../lib/datos/db';
  import { mostrarToast } from '../../lib/avisos.svelte';
  import { t } from '../../lib/i18n.svelte';
  import type { CuentaDebito } from '../../lib/datos/tipos';

  let { abierto = $bindable(), registro = null, alGuardar }: { abierto: boolean; registro?: CuentaDebito | null; alGuardar: () => void } = $props();

  let nombre = $state(registro?.nombre ?? ''), banco = $state(registro?.banco ?? ''), saldo = $state(registro?.saldo ?? 0);
  let error = $state(''), guardando = $state(false);

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    if (!nombre.trim()) { error = 'Enter a name'; return; }
    if (guardando) return;
    guardando = true;
    try {
      if (registro) {
        // Corrección manual de saldo (excepción histórica documentada: no pasa por el libro mayor).
        await ejecutar(`UPDATE cuentas_debito SET nombre=$1, banco=$2, saldo=$3 WHERE id=$4`, [nombre.trim(), banco.trim() || null, saldo, registro.id]);
        mostrarToast('Account updated', 'exito');
      } else {
        await ejecutar(`INSERT INTO cuentas_debito (nombre, banco, saldo) VALUES ($1,$2,$3)`, [nombre.trim(), banco.trim() || null, saldo]);
        mostrarToast('Account created', 'exito');
      }
      abierto = false;
      alGuardar();
    } catch (err) {
      console.error(err);
      mostrarToast('Could not save the account', 'error');
    } finally {
      guardando = false;
    }
  }
</script>

<Modal bind:abierto titulo={t(registro ? 'Edit debit account' : 'New debit account')}>
  <form id="form-cuenta" onsubmit={guardar}>
    <Campo etiqueta="Name" {error}><input class="campo__control" name="nombre" bind:value={nombre} /></Campo>
    <Campo etiqueta="Bank"><input class="campo__control" name="banco" bind:value={banco} /></Campo>
    <CampoMoneda etiqueta={registro ? 'Current balance' : 'Starting balance'} bind:valor={saldo} />
  </form>
  {#snippet acciones()}
    <div class="modal__acciones">
      <button type="button" class="btn btn--fantasma" onclick={() => (abierto = false)}>{t('Cancel')}</button>
      <button type="submit" form="form-cuenta" class="btn btn--primario" disabled={guardando}>{t(registro ? 'Save changes' : 'Save')}</button>
    </div>
  {/snippet}
</Modal>
