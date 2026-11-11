<script lang="ts">
  import Modal from '../Modal.svelte';
  import Campo from '../Campo.svelte';
  import CampoMoneda from '../CampoMoneda.svelte';
  import { ejecutar } from '../../lib/datos/db';
  import { mostrarToast } from '../../lib/avisos.svelte';
  import { t } from '../../lib/i18n.svelte';
  import type { Caja } from '../../lib/datos/tipos';

  /** Nombre, objetivo y meta. El saldo solo cambia con depósitos/retiros (libro mayor). */
  let { abierto = $bindable(), registro = null, alGuardar }: { abierto: boolean; registro?: Caja | null; alGuardar: () => void } = $props();

  let nombre = $state(registro?.nombre ?? ''), objetivo = $state(registro?.objetivo ?? ''), meta = $state(registro?.meta ?? 0);
  let error = $state(''), guardando = $state(false);

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    if (!nombre.trim()) { error = 'Enter a name'; return; }
    if (guardando) return;
    guardando = true;
    try {
      const valores = [nombre.trim(), objetivo.trim() || null, meta || null];
      if (registro) await ejecutar(`UPDATE cajas SET nombre=$1, objetivo=$2, meta=$3 WHERE id=$4`, [...valores, registro.id]);
      else await ejecutar(`INSERT INTO cajas (nombre, objetivo, meta) VALUES ($1,$2,$3)`, valores);
      mostrarToast(registro ? 'Box updated' : 'Box created', 'exito');
      abierto = false;
      alGuardar();
    } catch (err) {
      console.error(err);
      mostrarToast(registro ? 'Could not update the box' : 'Could not create the box', 'error');
    } finally {
      guardando = false;
    }
  }
</script>

<Modal bind:abierto titulo={t(registro ? 'Edit savings box' : 'New savings box')}>
  <form id="form-caja" onsubmit={guardar}>
    <Campo etiqueta="Name" {error}><input class="campo__control" name="nombre" placeholder={t('Emergencies, Trips…')} bind:value={nombre} /></Campo>
    <Campo etiqueta="Goal description (optional)"><input class="campo__control" bind:value={objetivo} /></Campo>
    <CampoMoneda etiqueta="Target amount (optional)" bind:valor={meta} />
  </form>
  {#snippet acciones()}
    <div class="modal__acciones">
      <button type="button" class="btn btn--fantasma" onclick={() => (abierto = false)}>{t('Cancel')}</button>
      <button type="submit" form="form-caja" class="btn btn--primario" disabled={guardando}>{t(registro ? 'Save changes' : 'Create')}</button>
    </div>
  {/snippet}
</Modal>
