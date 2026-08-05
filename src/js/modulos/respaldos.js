import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { icono } from '../iconos.js';
import { mostrarToast, confirmarModal } from '../toasts.js';
import { abrirModal } from '../ui.js';
import { reiniciarTodo } from '../db.js';

export async function render(vistaEl) {
  vistaEl.innerHTML = `
    <div class="vista__encabezado">
      <div><h1>Backups</h1><p>Your information lives only on this device</p></div>
      <div style="display:flex; gap:10px;">
        <button class="btn btn--fantasma" id="btn-importar">${icono('respaldo')} Import</button>
        <button class="btn btn--primario" id="btn-crear">${icono('respaldo')} Create backup now</button>
      </div>
    </div>
    <div class="tarjeta" style="margin-bottom:14px;"><div class="lista" id="lista-respaldos"></div></div>

    <div class="tarjeta">
      <div class="aviso">
        ${icono('alerta')}
        <div>
          <strong>Danger zone — Reset everything</strong>
          <p style="color:var(--texto-principal); margin-top:4px;">
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
      await invoke('crear_respaldo');
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
      await invoke('importar_respaldo', { rutaOrigen: ruta });
      mostrarToast('Backup imported. Restart the app to see the changes.', 'exito');
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
    await invoke('crear_respaldo');
    mostrarToast('Safety backup created', 'exito');
  } catch (err) {
    console.error(err);
    mostrarToast('Could not create the safety backup. The reset was canceled for your own protection.', 'error');
    return;
  }

  const { overlay, cerrar } = abrirModal(`
    <h3 class="modal__titulo">Final confirmation</h3>
    <p style="margin-bottom:14px;">Your safety backup has been created. This action <strong>cannot be undone</strong> from within the app.
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
      campo.querySelector('.campo__error').style.display = 'block';
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
      <div class="fila" data-ruta="${r.ruta}">
        <div class="fila__icono">${icono('respaldo')}</div>
        <div class="fila__cuerpo"><div class="fila__titulo">${r.nombre}</div><div class="fila__meta">${r.fecha} · ${(r.tamano_bytes / 1024).toFixed(1)} KB</div></div>
        <div class="fila__acciones">
          <button class="btn btn--fantasma btn-exportar" data-ruta="${r.ruta}" style="padding:7px 12px;">Export</button>
          <button class="btn btn--primario btn-restaurar" data-ruta="${r.ruta}" style="padding:7px 12px;">Restore</button>
          <button class="btn btn--peligro btn-eliminar-respaldo" data-ruta="${r.ruta}" data-nombre="${r.nombre}" style="padding:7px 12px;">${icono('eliminar')}</button>
        </div>
      </div>`).join('')
    : `<div class="estado-vacio">${icono('respaldo')}<h3>No backups yet</h3><p>Create your first backup to protect your information.</p></div>`;

  vistaEl.querySelectorAll('.btn-restaurar').forEach(btn => btn.addEventListener('click', async () => {
    const ok = await confirmarModal({ titulo: 'Restore backup', mensaje: 'Your current information will be replaced with this backup. This action cannot be undone.', textoConfirmar: 'Restore' });
    if (!ok) return;
    try {
      await invoke('restaurar_respaldo', { ruta: btn.dataset.ruta });
      mostrarToast('Backup restored. Restart the app to see the changes.', 'exito');
    } catch (err) { console.error(err); mostrarToast('Could not restore', 'error'); }
  }));

  vistaEl.querySelectorAll('.btn-exportar').forEach(btn => btn.addEventListener('click', async () => {
    try {
      const destino = await save({ filters: [{ name: 'Database', extensions: ['db'] }] });
      if (!destino) return;
      await invoke('exportar_respaldo', { rutaDestino: destino });
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