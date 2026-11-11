import { traducirTexto } from './i18n.js';
import { icono } from './iconos.js';

let contenedor;

function obtenerContenedor() {
  if (!contenedor) {
    contenedor = document.createElement('div');
    contenedor.className = 'toasts-contenedor';
    contenedor.setAttribute('role', 'status');
    contenedor.setAttribute('aria-live', 'polite');
    document.body.appendChild(contenedor);
  }
  return contenedor;
}

/** tipo: 'exito' | 'error' | 'info' */
export function mostrarToast(mensaje, tipo = 'info', duracionMs = 3500) {
  const cont = obtenerContenedor();
  const toast = document.createElement('div');
  toast.className = `toast toast--${tipo}`;
  toast.innerHTML = `${icono(tipo === 'exito' ? 'check' : tipo === 'error' ? 'alerta' : 'info', 'toast__icono')}<span class="toast__texto"></span>`;
  toast.querySelector('.toast__texto').textContent = traducirTexto(mensaje);
  cont.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast--visible'));

  const cerrar = () => {
    toast.classList.remove('toast--visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 400);
  };
  const temporizador = setTimeout(cerrar, duracionMs);
  toast.addEventListener('click', () => { clearTimeout(temporizador); cerrar(); });
}

/** Modal de confirmación propio (para eliminaciones u otras acciones destructivas). */
export function confirmarModal({ titulo, mensaje, textoConfirmar = 'Delete', textoCancelar = 'Cancel' }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal modal--confirmacion" role="alertdialog" aria-modal="true">
        <h3 class="modal__titulo"></h3>
        <p class="modal__mensaje"></p>
        <div class="modal__acciones">
          <button type="button" class="btn btn--fantasma" data-accion="cancelar"></button>
          <button type="button" class="btn btn--peligro" data-accion="confirmar"></button>
        </div>
      </div>`;
    overlay.querySelector('.modal__titulo').textContent = traducirTexto(titulo);
    overlay.querySelector('.modal__mensaje').textContent = traducirTexto(mensaje);
    overlay.querySelector('[data-accion="cancelar"]').textContent = traducirTexto(textoCancelar);
    overlay.querySelector('[data-accion="confirmar"]').textContent = traducirTexto(textoConfirmar);

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('modal-overlay--visible'));
    // El foco va a "Cancelar" (no a la acción destructiva) y así Escape funciona.
    overlay.querySelector('[data-accion="cancelar"]').focus();

    const cerrar = (resultado) => {
      if (overlay.inert) return; // ya se respondió
      overlay.inert = true;
      overlay.classList.remove('modal-overlay--visible');
      overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
      setTimeout(() => overlay.remove(), 400);
      resolve(resultado);
    };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cerrar(false);
      const btn = e.target.closest('button[data-accion]');
      if (btn) cerrar(btn.dataset.accion === 'confirmar');
    });
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrar(false); });
  });
}
