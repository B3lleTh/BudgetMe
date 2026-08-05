import { traducirTexto } from './i18n.js';

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
  toast.innerHTML = `<span class="toast__icono">${tipo === 'exito' ? '✓' : tipo === 'error' ? '✕' : 'ℹ'}</span><span class="toast__texto"></span>`;
  toast.querySelector('.toast__texto').textContent = traducirTexto(mensaje);
  cont.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast--visible'));

  const cerrar = () => {
    toast.classList.remove('toast--visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
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

    const cerrar = (resultado) => {
      overlay.classList.remove('modal-overlay--visible');
      overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
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
