// Íconos SVG lineales, trazo consistente (stroke-width 1.75). Sin emojis.
const base = (paths, viewBox = '0 0 24 24') =>
  `<svg viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const ICONOS = {
  dashboard: base('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  ingreso: base('<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>'),
  gasto: base('<path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/>'),
  historial: base('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 3"/>'),
  tarjeta: base('<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/>'),
  caja: base('<path d="M4 8l8-4 8 4v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M4 8l8 4 8-4"/><path d="M12 12v9"/>'),
  recurrente: base('<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>'),
  respaldo: base('<path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 3v6h6"/>'),
  eliminar: base('<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/><path d="M10 11v6"/><path d="M14 11v6"/>'),
  editar: base('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  cerrar: base('<path d="M18 6L6 18"/><path d="M6 6l12 12"/>'),
  masa: base('<path d="M12 5v14"/><path d="M5 12h14"/>'),
  alerta: base('<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9L2.8 17a1.7 1.7 0 0 0 1.5 2.6h15.4a1.7 1.7 0 0 0 1.5-2.6L13.7 3.9a1.7 1.7 0 0 0-3.4 0z"/>'),
  check: base('<path d="M20 6L9 17l-5-5"/>'),
  banco: base('<path d="M3 21h18"/><path d="M4 21V9l8-5 8 5v12"/><path d="M9 21v-6h6v6"/>'),
  candado: base('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  reloj: base('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>'),
  categoria: base('<path d="M3 7l7-4 7 4-7 4-7-4z"/><path d="M3 7v10l7 4 7-4V7"/>'),
  flecha_abajo: base('<path d="M6 9l6 6 6-6"/>'),
  usuario: base('<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>'),
  rayo: base('<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>'),
  buscar: base('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
  filtro: base('<path d="M4 5h16"/><path d="M7 12h10"/><path d="M10 19h4"/>'),
  vacio: base('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M8 4h8"/>'),
  deshacer: base('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-2"/>'),
  configuracion: base('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  // Documento con esquina doblada + signo de porcentaje: comunica "documento
  // financiero con interés", distinto de tarjeta (rectángulo con banda) y
  // banco (columnas). Nuevo en v3.3 — dedicado exclusivamente a Préstamos.
  prestamo: base('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><circle cx="9.5" cy="15" r="1.4"/><circle cx="14.5" cy="18.5" r="1.4"/><path d="M9.5 19l5-5"/>'),
};

export function icono(nombre, clase = '') {
  const svg = ICONOS[nombre] || ICONOS.vacio;
  return `<span class="icono ${clase}">${svg}</span>`;
}