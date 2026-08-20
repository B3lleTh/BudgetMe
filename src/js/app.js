import { obtenerDB } from './db.js';
import { icono } from './iconos.js';
import { mostrarToast } from './toasts.js';
import { abrirModalGastoRapido } from './modulos/gastos.js';
import { t, cargarIdioma, traducirNodo } from './i18n.js';

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
  inversiones: { claveEtiqueta: 'nav.inversiones', icono: 'rayo', render: inversiones.render },
  respaldos: { claveEtiqueta: 'nav.respaldos', icono: 'respaldo', render: respaldos.render },
  configuracion: { claveEtiqueta: 'nav.configuracion', icono: 'configuracion', render: configuracion.render },
  // Ícono dedicado 'prestamo' (v3.4) — antes compartía 'rayo' con Investments
  // y con el FAB de gasto rápido, lo que causaba confusión visual en el nav.
  prestamos: { claveEtiqueta: 'nav.prestamos', icono: 'prestamo', render: prestamos.render },
};

const scrollGuardado = {};
let vistaActual = 'dashboard';

function pintarNav() {
  for (const boton of document.querySelectorAll('.nav__item')) {
    const clave = boton.dataset.vista;
    const m = MODULOS[clave];
    boton.innerHTML = `${icono(m.icono)}<span>${t(m.claveEtiqueta)}</span>`;
    boton.classList.toggle('activo', clave === vistaActual);
  }
}

export async function navegar(clave) {
  const vistaEl = document.getElementById('vista');
  if (vistaActual) scrollGuardado[vistaActual] = vistaEl.scrollTop;
  vistaActual = clave;
  location.hash = clave;
  pintarNav();
  try {
    await MODULOS[clave].render(vistaEl);
  } catch (e) {
    console.error(e);
    vistaEl.innerHTML = `<div class="tarjeta">An error occurred while loading this section.</div>`;
    mostrarToast('An error occurred while loading the section', 'error');
  }
  traducirNodo(vistaEl);
  vistaEl.scrollTop = scrollGuardado[clave] || 0;
}

function montarFAB() {
  const fab = document.createElement('button');
  fab.className = 'fab';
  fab.title = 'Log a quick small expense';
  fab.innerHTML = icono('rayo');
  fab.addEventListener('click', () => abrirModalGastoRapido(() => {
    if (vistaActual === 'gastos' || vistaActual === 'dashboard') navegar(vistaActual);
  }));
  document.body.appendChild(fab);
}

async function iniciar() {
  document.getElementById('nav').addEventListener('click', (e) => {
    const boton = e.target.closest('.nav__item');
    if (boton) navegar(boton.dataset.vista);
  });

  try {
    await obtenerDB();
    await cargarIdioma();
  } catch (e) {
    console.error('Could not open the database:', e);
  }

  document.addEventListener('idioma-cambiado', () => navegar(vistaActual));

  montarFAB();
  const inicial = location.hash.replace('#', '') || 'dashboard';
  await navegar(MODULOS[inicial] ? inicial : 'dashboard');
}

iniciar();