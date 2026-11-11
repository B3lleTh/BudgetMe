<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { open, save } from '@tauri-apps/plugin-dialog';
  import Encabezado from '../componentes/Encabezado.svelte';
  import Fila from '../componentes/Fila.svelte';
  import Icono from '../componentes/Icono.svelte';
  import Modal from '../componentes/Modal.svelte';
  import Campo from '../componentes/Campo.svelte';
  import EstadoVacio from '../componentes/EstadoVacio.svelte';
  import { reiniciarTodo, prepararArchivoParaRespaldo, cerrarConexion } from '../lib/datos/db';
  import { confirmar, mostrarToast } from '../lib/avisos.svelte';
  import { t } from '../lib/i18n.svelte';

  interface Respaldo { nombre: string; ruta: string; fecha: string; tamano_bytes: number }
  let respaldos = $state<Respaldo[]>([]);
  let reinicio = $state(false), frase = $state(''), errorFrase = $state('');

  async function cargar() {
    try { respaldos = await invoke<Respaldo[]>('listar_respaldos'); } catch (err) { console.error(err); respaldos = []; }
  }
  cargar();

  /** Copia la base con los cambios recientes incluidos (vuelca el WAL antes). */
  async function crearRespaldoCompleto() {
    await prepararArchivoParaRespaldo();
    return invoke('crear_respaldo');
  }

  /** Reemplaza la base y recarga. Cerrar la conexión antes evita que SQLite
   * escriba páginas viejas encima del respaldo. */
  async function reemplazarBaseYRecargar(comando: string, args: Record<string, unknown>, exito: string) {
    await cerrarConexion();
    try {
      await invoke(comando, args);
    } catch (err) {
      location.reload(); // reabre la base original intacta
      throw err;
    }
    mostrarToast(exito, 'exito');
    setTimeout(() => { location.hash = 'bienvenida'; location.reload(); }, 900);
  }

  async function crear() {
    try { await crearRespaldoCompleto(); mostrarToast('Backup created', 'exito'); await cargar(); }
    catch (err) { console.error(err); mostrarToast('Could not create the backup', 'error'); }
  }
  async function importar() {
    try {
      const ruta = await open({ multiple: false, filters: [{ name: 'Database', extensions: ['db'] }] });
      if (!ruta) return;
      if (!(await confirmar({ titulo: 'Import backup', mensaje: 'This will replace your current information (a safety backup will be created first). Continue?', textoConfirmar: 'Import' }))) return;
      await reemplazarBaseYRecargar('importar_respaldo', { rutaOrigen: ruta }, 'Backup imported');
    } catch (err) { console.error(err); mostrarToast('Could not import', 'error'); }
  }
  async function restaurar(r: Respaldo) {
    if (!(await confirmar({ titulo: 'Restore backup', mensaje: 'Your current information will be replaced with this backup. This action cannot be undone.', textoConfirmar: 'Restore' }))) return;
    try { await reemplazarBaseYRecargar('restaurar_respaldo', { ruta: r.ruta }, 'Backup restored'); }
    catch (err) { console.error(err); mostrarToast('Could not restore', 'error'); }
  }
  async function exportar(r: Respaldo) {
    try {
      const destino = await save({ defaultPath: r.nombre, filters: [{ name: 'Database', extensions: ['db'] }] });
      if (!destino) return;
      await invoke('exportar_respaldo', { rutaDestino: destino, rutaOrigen: r.ruta });
      mostrarToast('Backup exported', 'exito');
    } catch (err) { console.error(err); mostrarToast('Could not export', 'error'); }
  }
  async function eliminar(r: Respaldo) {
    if (!(await confirmar({ titulo: 'Delete backup', mensaje: t('Delete backup "{nombre}"? This cannot be undone.', { nombre: r.nombre }) }))) return;
    try { await invoke('eliminar_respaldo', { ruta: r.ruta }); mostrarToast('Backup deleted', 'exito'); await cargar(); }
    catch (err) { console.error(err); mostrarToast('Could not delete the backup', 'error'); }
  }

  /** Reinicio total en dos pasos obligatorios: respaldo y frase exacta. */
  async function empezarReinicio() {
    if (!(await confirmar({ titulo: 'Reset everything?', mensaje: 'An automatic safety backup will be created first. Then you will be asked to confirm in writing to continue.', textoConfirmar: 'Continue' }))) return;
    try { await crearRespaldoCompleto(); mostrarToast('Safety backup created', 'exito'); }
    catch (err) { console.error(err); mostrarToast('Could not create the safety backup. The reset was canceled for your own protection.', 'error'); return; }
    frase = ''; errorFrase = ''; reinicio = true;
  }
  async function reiniciar(e: SubmitEvent) {
    e.preventDefault();
    if (frase.trim().toUpperCase() !== 'RESET') { errorFrase = 'Type exactly RESET'; return; }
    try {
      await reiniciarTodo();
      mostrarToast('Everything was reset. Your backup is still available in this section.', 'exito');
      reinicio = false;
      location.hash = 'bienvenida';
      location.reload();
    } catch (err) { console.error(err); mostrarToast('Could not reset. Nothing was lost.', 'error'); }
  }
</script>

<Encabezado titulo={t('Backups')}>
  {t('Your information lives only on this device. Create a backup before big changes, and export one to another place now and then.')}
  {#snippet acciones()}
    <button class="btn btn--fantasma" onclick={importar}><Icono nombre="respaldo" /> {t('Import')}</button>
    <button class="btn btn--primario" onclick={crear}><Icono nombre="respaldo" /> {t('Create backup now')}</button>
  {/snippet}
</Encabezado>

<section class="tarjeta seccion">
  <div class="panel__encabezado"><h3>{t('Saved backups')}</h3></div>
  <div class="lista">
    {#each respaldos as r (r.ruta)}
      <Fila icono="respaldo" titulo={r.fecha} meta={`${r.nombre} · ${(r.tamano_bytes / 1024).toFixed(1)} KB`}>
        {#snippet acciones()}
          <button class="btn btn--fantasma btn--sm" onclick={() => exportar(r)}>{t('Export')}</button>
          <button class="btn btn--fantasma btn--sm" onclick={() => restaurar(r)}>{t('Restore')}</button>
          <button class="btn-icono peligro" title={t('Delete backup')} aria-label={t('Delete backup')} onclick={() => eliminar(r)}><Icono nombre="eliminar" /></button>
        {/snippet}
      </Fila>
    {:else}
      <EstadoVacio icono="respaldo" titulo={t('No backups yet')} texto={t('Create your first backup to protect your information.')} />
    {/each}
  </div>
</section>

<section class="tarjeta">
  <div class="aviso">
    <Icono nombre="alerta" />
    <div>
      <strong>{t('Danger zone — Reset everything')}</strong>
      <p>{t('This permanently deletes all your accounts, cards, boxes, expenses, income, recurring items and history, leaving the app as if freshly installed. Useful if you were testing the app and want to start fresh with real data. You will be required to create a backup right before, in case you need to recover something afterward.')}</p>
    </div>
  </div>
  <button class="btn btn--peligro" onclick={empezarReinicio}><Icono nombre="eliminar" /> {t('Reset everything')}</button>
</section>

<Modal bind:abierto={reinicio} titulo={t('Final confirmation')} subtitulo={t('Your safety backup has been created. This action cannot be undone from within the app. To continue, type exactly: RESET')}>
  <form id="form-reset" onsubmit={reiniciar}>
    <Campo error={errorFrase}><input class="campo__control" autocomplete="off" placeholder={t('Type RESET')} bind:value={frase} /></Campo>
  </form>
  {#snippet acciones()}
    <div class="modal__acciones">
      <button type="button" class="btn btn--fantasma" onclick={() => (reinicio = false)}>{t('Cancel')}</button>
      <button type="submit" form="form-reset" class="btn btn--peligro">{t('Reset everything')}</button>
    </div>
  {/snippet}
</Modal>
