import { obtenerDB } from './db.js';
import { icono } from './iconos.js';
import { mostrarToast } from './toasts.js';
import { aplicarTema } from './ui.js';
import { consultar } from './db.js';
import { abrirModalGastoRapido } from './modulos/gastos.js';
import { t, cargarIdioma, traducirNodo, traducirTexto } from './i18n.js';
import { reiniciarRecurrentesDeMesesAnteriores } from './consultas.js';

import * as dashboard from './modulos/dashboard.js';
import * as ingresos from './modulos/ingresos.js';
import * as gastos from './modulos/gastos.js';
import * as historial from './modulos/historial.js';
import * as tarjetas from './modulos/tarjetas.js';
import * as cajas from './modulos/cajas.js';
import * as recurrentes from './modulos/recurrentes.js';
import * as inversiones from './modulos/inversiones.js';
import * as respaldos from './modulos/respaldos.js';
import * as configuracion from './modulos/configuracion.js';
import * as prestamos from './modulos/prestamos.js';

const MODULOS = {
  dashboard: { claveEtiqueta: 'nav.dashboard', icono: 'dashboard', render: dashboard.render },
  ingresos: { claveEtiqueta: 'nav.ingresos', icono: 'ingreso', render: ingresos.render },
  gastos: { claveEtiqueta: 'nav.gastos', icono: 'gasto', render: gastos.render },
  historial: { claveEtiqueta: 'nav.historial', icono: 'historial', render: historial.render },
  tarjetas: { claveEtiqueta: 'nav.tarjetas', icono: 'tarjeta', render: tarjetas.render },
  cajas: { claveEtiqueta: 'nav.cajas', icono: 'caja', render: cajas.render },
  recurrentes: { claveEtiqueta: 'nav.recurrentes', icono: 'recurrente', render: recurrentes.render },
  inversiones: { claveEtiqueta: 'nav.inversiones', icono: 'grafica', render: inversiones.render },
  respaldos: { claveEtiqueta: 'nav.respaldos', icono: 'respaldo', render: respaldos.render },
  configuracion: { claveEtiqueta: 'nav.configuracion', icono: 'configuracion', render: configuracion.render },
  // Ícono dedicado 'prestamo' (v3.4) — antes compartía 'rayo' con Investments
  // y con el FAB de gasto rápido, lo que causaba confusión visual en el nav.
  prestamos: { claveEtiqueta: 'nav.prestamos', icono: 'prestamo', render: prestamos.render },
};

const scrollGuardado = {};
let vistaActual = 'dashboard';

function pintarNav() {
  for (const grupo of document.querySelectorAll('.nav__grupo[data-grupo]')) {
    grupo.querySelector('.nav__titulo-grupo').textContent = t(grupo.dataset.grupo);
  }
  for (const boton of document.querySelectorAll('.nav__item')) {
    const clave = boton.dataset.vista;
    const m = MODULOS[clave];
    boton.innerHTML = `${icono(m.icono)}<span>${t(m.claveEtiqueta)}</span>`;
    boton.classList.toggle('activo', clave === vistaActual);
    if (clave === vistaActual) boton.setAttribute('aria-current', 'page'); else boton.removeAttribute('aria-current');
  }
}

export async function navegar(clave) {
  const vistaEl = document.getElementById('vista');
  if (vistaActual) scrollGuardado[vistaActual] = vistaEl.scrollTop;
  vistaActual = clave;
  location.hash = clave;
  pintarNav();
  try {
    // Al cambiar de mes, los recurrentes pagados vuelven a "pendiente".
    await reiniciarRecurrentesDeMesesAnteriores();
    await MODULOS[clave].render(vistaEl);
  } catch (e) {
    console.error(e);
    vistaEl.innerHTML = `<div class="tarjeta estado-vacio"><h3>This section could not load</h3><p>Try opening it again. If it keeps failing, create a backup and restart the app.</p></div>`;
    mostrarToast('An error occurred while loading the section', 'error');
  }
  traducirNodo(vistaEl);
  vistaEl.scrollTop = scrollGuardado[clave] || 0;
}

function montarFAB() {
  const fab = document.createElement('button');
  fab.className = 'fab';
  fab.title = traducirTexto('Log a quick small expense');
  fab.innerHTML = `${icono('masa')}<span>${traducirTexto('Quick expense')}</span>`;
  fab.addEventListener('click', () => abrirModalGastoRapido(() => {
    if (vistaActual === 'gastos' || vistaActual === 'dashboard') navegar(vistaActual);
  }));
  document.body.appendChild(fab);
}

function pintarErrorDeArranque(error, vistaEl) {
  console.error('Could not start:', error);
  vistaEl.innerHTML = `
    <div class="tarjeta">
      <h3>The database could not be opened</h3>
      <pre id="detalle-error" style="font-size:12px; opacity:.7; white-space:pre-wrap; margin:10px 0 14px;"></pre>
      <button class="btn btn--primario" id="btn-reintentar">Retry</button>
    </div>`;
  vistaEl.querySelector('#detalle-error').textContent = String(error?.message || error);
  vistaEl.querySelector('#btn-reintentar').addEventListener('click', () => iniciar());
}

let _arranqueCompletado = false;

async function iniciar() {
  const vistaEl = document.getElementById('vista');
  vistaEl.innerHTML = `<div class="cargando">Loading…</div>`;

  try {
    await Promise.race([
      (async () => {
        await obtenerDB();
        await cargarIdioma();
        const [tema] = await consultar(`SELECT valor FROM configuracion WHERE clave = 'tema'`);
        aplicarTema(tema?.valor);
      })(),
      new Promise((_, rechazar) => setTimeout(
        () => rechazar(new Error('The database took too long to open')), 15000)),
    ]);
  } catch (e) {
    pintarErrorDeArranque(e, vistaEl);
    return;
  }

  if (!_arranqueCompletado) {
    _arranqueCompletado = true;
    document.getElementById('nav').addEventListener('click', (e) => {
      const boton = e.target.closest('.nav__item');
      if (boton) navegar(boton.dataset.vista);
    });
    document.addEventListener('idioma-cambiado', () => {
      document.querySelector('.fab')?.remove();
      montarFAB();
      navegar(vistaActual);
    });
    montarFAB();
  }

  pintarNav();
  const inicial = location.hash.replace('#', '') || 'dashboard';
  await navegar(MODULOS[inicial] ? inicial : 'dashboard');
}

iniciar();