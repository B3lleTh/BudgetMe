import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { icono } from '../iconos.js';
import { mostrarToast, confirmarModal } from '../toasts.js';
import { abrirModal } from '../ui.js';
import { reiniciarTodo, prepararArchivoParaRespaldo, cerrarConexion } from '../db.js';
import { escaparHTML } from '../formato.js';

/** Copia la base a la carpeta de respaldos con los cambios más recientes
 * incluidos (vuelca el WAL antes; ver prepararArchivoParaRespaldo). */
async function crearRespaldoCompleto() {
  await prepararArchivoParaRespaldo();
  return invoke('crear_respaldo');
}

/** Reemplaza la base con otro archivo y recarga la app. Cerrar la conexión
 * antes evita que SQLite escriba páginas viejas encima del respaldo. */
async function reemplazarBaseYRecargar(comando, args, mensajeExito) {
  await cerrarConexion();
  try {
    await invoke(comando, args);
  } catch (err) {
    location.reload(); // reabre la base original intacta
    throw err;
  }
  mostrarToast(mensajeExito, 'exito');
  setTimeout(() => { location.hash = 'dashboard'; location.reload(); }, 900);
}

export async function render(vistaEl) {
  vistaEl.innerHTML = `
    <div class="vista__encabezado">
      <div><h1>Backups</h1><p>Your information lives only on this device. Create a backup before big changes, and export one to another place now and then.</p></div>
      <div class="vista__acciones">
        <button class="btn btn--fantasma" id="btn-importar">${icono('respaldo')} Import</button>
        <button class="btn btn--primario" id="btn-crear">${icono('respaldo')} Create backup now</button>
      </div>
    </div>
    <div class="tarjeta seccion">
      <div class="panel__encabezado"><h3>Saved backups</h3></div>
      <div class="lista" id="lista-respaldos"></div>
    </div>

    <div class="tarjeta">
      <div class="aviso">
        ${icono('alerta')}
        <div>
          <strong>Danger zone — Reset everything</strong>
          <p>
            This permanently deletes all your accounts, cards, boxes, expenses, income, recurring items and
            history, leaving the app as if freshly installed. Useful if you were testing the app and want to
            start fresh with real data. You will be required to create a backup right before, in case you
            need to recover something afterward.
          </p>
        </div>
      </div>
      <button class="btn btn--peligro" id="btn-reset-total">${icono('eliminar')} Reset everything</button>
    </div>
  `;

  await pintarLista(vistaEl);

  vistaEl.querySelector('#btn-crear').addEventListener('click', async () => {
    try {
      await crearRespaldoCompleto();
      mostrarToast('Backup created', 'exito');
      await pintarLista(vistaEl);
    } catch (err) { console.error(err); mostrarToast('Could not create the backup', 'error'); }
  });

  vistaEl.querySelector('#btn-importar').addEventListener('click', async () => {
    try {
      const ruta = await open({ multiple: false, filters: [{ name: 'Database', extensions: ['db'] }] });
      if (!ruta) return;
      const ok = await confirmarModal({ titulo: 'Import backup', mensaje: 'This will replace your current information (a safety backup will be created first). Continue?', textoConfirmar: 'Import' });
      if (!ok) return;
      await reemplazarBaseYRecargar('importar_respaldo', { rutaOrigen: ruta }, 'Backup imported');
    } catch (err) { console.error(err); mostrarToast('Could not import', 'error'); }
  });

  vistaEl.querySelector('#btn-reset-total').addEventListener('click', () => abrirFlujoReset(vistaEl));
}

/**
 * Flujo de reinicio total, en 2 pasos obligatorios:
 *  1) Crear un respaldo (no se puede omitir: si falla, no se avanza).
 *  2) Escribir una frase exacta para confirmar (evita clics accidentales).
 */
async function abrirFlujoReset(vistaEl) {
  const primeraConfirmacion = await confirmarModal({
    titulo: 'Reset everything?',
    mensaje: 'An automatic safety backup will be created first. Then you will be asked to confirm in writing to continue.',
    textoConfirmar: 'Continue',
  });
  if (!primeraConfirmacion) return;

  try {
    await crearRespaldoCompleto();
    mostrarToast('Safety backup created', 'exito');
  } catch (err) {
    console.error(err);
    mostrarToast('Could not create the safety backup. The reset was canceled for your own protection.', 'error');
    return;
  }

  const { overlay, cerrar } = abrirModal(`
    <h3 class="modal__titulo">Final confirmation</h3>
    <p class="modal__subtitulo">Your safety backup has been created. This action <strong>cannot be undone</strong> from within the app.
    To continue, type exactly: <strong>RESET</strong></p>
    <form id="form-reset">
      <div class="campo"><input class="campo__control" name="frase" autocomplete="off" placeholder="Type RESET" required /><div class="campo__error"></div></div>
      <div class="modal__acciones">
        <button type="button" class="btn btn--fantasma" data-cerrar-modal>Cancel</button>
        <button type="submit" class="btn btn--peligro">Reset everything</button>
      </div>
    </form>`);
  const form = overlay.querySelector('#form-reset');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.frase.value.trim().toUpperCase() !== 'RESET') {
      const campo = form.frase.closest('.campo');
      campo.classList.add('campo--invalido');
      campo.querySelector('.campo__error').textContent = 'Type exactly RESET';
      return;
    }
    try {
      await reiniciarTodo();
      mostrarToast('Everything was reset. Your backup is still available in this section.', 'exito');
      cerrar();
      location.hash = 'dashboard';
      location.reload();
    } catch (err) {
      console.error(err);
      mostrarToast('Could not reset. Nothing was lost.', 'error');
    }
  });
}

async function pintarLista(vistaEl) {
  let respaldos = [];
  try { respaldos = await invoke('listar_respaldos'); } catch (err) { console.error(err); }

  vistaEl.querySelector('#lista-respaldos').innerHTML = respaldos.length
    ? respaldos.map(r => `
      <div class="fila">
        <div class="fila__icono">${icono('respaldo')}</div>
        <div class="fila__cuerpo"><div class="fila__titulo">${escaparHTML(r.fecha)}</div><div class="fila__meta">${escaparHTML(r.nombre)} · ${(r.tamano_bytes / 1024).toFixed(1)} KB</div></div>
        <div class="fila__acciones">
          <button class="btn btn--fantasma btn--sm btn-exportar" data-ruta="${escaparHTML(r.ruta)}">Export</button>
          <button class="btn btn--fantasma btn--sm btn-restaurar" data-ruta="${escaparHTML(r.ruta)}">Restore</button>
          <button class="btn-icono peligro btn-eliminar-respaldo" data-ruta="${escaparHTML(r.ruta)}" data-nombre="${escaparHTML(r.nombre)}" title="Delete backup" aria-label="Delete backup">${icono('eliminar')}</button>
        </div>
      </div>`).join('')
    : `<div class="estado-vacio">${icono('respaldo')}<h3>No backups yet</h3><p>Create your first backup to protect your information.</p></div>`;

  vistaEl.querySelectorAll('.btn-restaurar').forEach(btn => btn.addEventListener('click', async () => {
    const ok = await confirmarModal({ titulo: 'Restore backup', mensaje: 'Your current information will be replaced with this backup. This action cannot be undone.', textoConfirmar: 'Restore' });
    if (!ok) return;
    try {
      await reemplazarBaseYRecargar('restaurar_respaldo', { ruta: btn.dataset.ruta }, 'Backup restored');
    } catch (err) { console.error(err); mostrarToast('Could not restore', 'error'); }
  }));

  vistaEl.querySelectorAll('.btn-exportar').forEach(btn => btn.addEventListener('click', async () => {
    try {
      const destino = await save({ defaultPath: btn.closest('.fila').querySelector('.fila__meta').textContent.split(' · ')[0], filters: [{ name: 'Database', extensions: ['db'] }] });
      if (!destino) return;
      await invoke('exportar_respaldo', { rutaDestino: destino, rutaOrigen: btn.dataset.ruta });
      mostrarToast('Backup exported', 'exito');
    } catch (err) { console.error(err); mostrarToast('Could not export', 'error'); }
  }));

  vistaEl.querySelectorAll('.btn-eliminar-respaldo').forEach(btn => btn.addEventListener('click', async () => {
    const ok = await confirmarModal({
      titulo: 'Delete backup',
      mensaje: `Delete backup "${btn.dataset.nombre}"? This cannot be undone.`,
      textoConfirmar: 'Delete',
    });
    if (!ok) return;
    try {
      await invoke('eliminar_respaldo', { ruta: btn.dataset.ruta });
      mostrarToast('Backup deleted', 'exito');
      await pintarLista(vistaEl);
    } catch (err) { console.error(err); mostrarToast('Could not delete the backup', 'error'); }
  }));
}