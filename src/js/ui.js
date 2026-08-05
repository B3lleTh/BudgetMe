import { icono } from './iconos.js';
import { traducirNodo } from './i18n.js';

/** Abre un modal con contenido HTML libre. Devuelve { overlay, cerrar }. */
export function abrirModal(contenidoHTML, { clase = '' } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal modal--formulario ${clase}">${contenidoHTML}</div>`;
  traducirNodo(overlay);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('modal-overlay--visible'));

  const cerrar = () => {
    overlay.classList.remove('modal-overlay--visible');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
  };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(); });
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrar(); });
  const btnCerrar = overlay.querySelector('[data-cerrar-modal]');
  if (btnCerrar) btnCerrar.addEventListener('click', cerrar);

  return { overlay, cerrar };
}

/**
 * Selector custom accesible por teclado: muestra ícono + nombre por opción
 * en vez de un <select> nativo con solo texto.
 * opciones: [{ valor, etiqueta, iconoNombre, color }]
 */
export function construirSelector({ contenedor, opciones, valorInicial, alSeleccionar, placeholder = 'Select…' }) {
  const seleccionInicial = opciones.find(o => o.valor === valorInicial) || null;
  contenedor.classList.add('selector');
  contenedor.tabIndex = 0;
  contenedor.innerHTML = `
    <button type="button" class="selector__disparador">
      <span class="selector__actual">${seleccionInicial ? etiquetaOpcion(seleccionInicial) : placeholder}</span>
      ${icono('flecha_abajo')}
    </button>
    <div class="selector__opciones" role="listbox">
      ${opciones.map(o => `<div class="selector__opcion" role="option" data-valor="${o.valor}">${etiquetaOpcion(o)}</div>`).join('')}
    </div>`;

  let valorActual = valorInicial ?? null;
  const disparador = contenedor.querySelector('.selector__disparador');
  disparador.addEventListener('click', () => contenedor.classList.toggle('selector--abierto'));
  contenedor.querySelectorAll('.selector__opcion').forEach(op => {
    op.addEventListener('click', () => {
      valorActual = op.dataset.valor;
      contenedor.querySelector('.selector__actual').innerHTML = etiquetaOpcion(opciones.find(o => String(o.valor) === valorActual));
      contenedor.classList.remove('selector--abierto');
      alSeleccionar?.(valorActual);
    });
  });
  document.addEventListener('click', (e) => { if (!contenedor.contains(e.target)) contenedor.classList.remove('selector--abierto'); });

  return { obtenerValor: () => valorActual };
}

function etiquetaOpcion(o) {
  if (!o) return '';
  return `${icono(o.iconoNombre || 'categoria')} <span>${o.etiqueta}</span>`;
}

export function marcarError(campoEl, mensaje) {
  campoEl.classList.add('campo--invalido');
  const err = campoEl.querySelector('.campo__error');
  if (err) err.textContent = mensaje;
}
export function limpiarError(campoEl) {
  campoEl.classList.remove('campo--invalido');
}
