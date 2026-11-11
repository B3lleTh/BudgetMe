import { icono } from './iconos.js';
import { traducirNodo } from './i18n.js';

/** Abre un modal con contenido HTML libre. Devuelve { overlay, cerrar }. */
export function abrirModal(contenidoHTML, { clase = '' } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal modal--formulario ${clase}" role="dialog" aria-modal="true" tabindex="-1">${contenidoHTML}</div>`;
  traducirNodo(overlay);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('modal-overlay--visible'));

  const cerrar = () => {
    // Inerte desde ya: durante el desvanecido nada debe poder volver a
    // enviarse (un doble clic guardaba el mismo movimiento dos veces).
    overlay.inert = true;
    overlay.classList.remove('modal-overlay--visible');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
    setTimeout(() => overlay.remove(), 400); // por si no hay transición (movimiento reducido)
  };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(); });
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrar(); });
  overlay.querySelectorAll('[data-cerrar-modal]').forEach(b => b.addEventListener('click', cerrar));
  // Foco inicial dentro del modal: sin esto Escape no cerraba nada.
  requestAnimationFrame(() => {
    const primero = overlay.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea, button');
    (primero || overlay.querySelector('.modal')).focus?.();
  });

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

/** Deshabilita el botón de envío mientras corre `tarea` (evita registrar el
 * mismo movimiento dos veces con doble clic). Si la tarea lanza, el botón se
 * reactiva y el error sigue su curso. */
export async function conBotonOcupado(boton, tarea) {
  if (!boton || boton.disabled) return;
  boton.disabled = true;
  boton.classList.add('btn--carga');
  try {
    return await tarea();
  } finally {
    if (boton.isConnected) {
      boton.disabled = false;
      boton.classList.remove('btn--carga');
    }
  }
}

/** 'claro' | 'oscuro' | 'sistema' (sigue al sistema operativo). */
export function aplicarTema(tema) {
  const raiz = document.documentElement;
  if (tema === 'claro') raiz.dataset.theme = 'light';
  else if (tema === 'oscuro') raiz.dataset.theme = 'dark';
  else delete raiz.dataset.theme;
}
