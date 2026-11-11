const MONEDA = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const NUMERO = new Intl.NumberFormat('en-US');

export function formatoMoneda(valor) {
  return MONEDA.format(Number(valor || 0));
}

export function formatoFecha(iso) {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

/** YYYY-MM-DD en la zona horaria LOCAL. Antes usaba toISOString() (UTC):
 * en México, después de las 6 pm cada movimiento quedaba con la fecha de
 * mañana, y el último día del mes caía en el mes siguiente. */
export function fechaLocalISO(fecha) {
  const a = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

export function hoyISO() {
  return fechaLocalISO(new Date());
}

/** YYYY-MM del mes actual desplazado `offset` meses (local, sin el salto de
 * setMonth() en días 29-31: siempre parte del día 1). */
export function prefijoMes(offset = 0) {
  const hoy = new Date();
  return fechaLocalISO(new Date(hoy.getFullYear(), hoy.getMonth() + offset, 1)).slice(0, 7);
}

/** Los últimos `cantidad` meses (el actual al final), como YYYY-MM. */
export function ultimosMeses(cantidad) {
  return Array.from({ length: cantidad }, (_, i) => prefijoMes(i - (cantidad - 1)));
}

/** "2026-11" → "Nov" / "nov" según el idioma. */
export function etiquetaMesCorta(prefijo, idioma = 'en') {
  const [a, m] = prefijo.split('-').map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString(idioma === 'es' ? 'es-MX' : 'en-US', { month: 'short' });
}

export function diasEnMes(anio, mes) {
  return new Date(anio, mes, 0).getDate(); // mes 1-12
}

/** Ajusta un día objetivo (ej. 30) a un mes que puede tener menos días (ej. febrero). */
export function diaValidoEnMes(diaObjetivo, anio, mes) {
  return Math.min(diaObjetivo, diasEnMes(anio, mes));
}

/** Escapa texto escrito por el usuario antes de meterlo en innerHTML o en
 * un atributo value="…": un nombre con comillas o "<" rompía el formulario. */
export function escaparHTML(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Formatea un <input> de dinero en vivo con separador de miles, sin estorbar la edición. */
export function activarInputMoneda(input) {
  const limpiar = (v) => v.replace(/[^\d.]/g, '');
  input.addEventListener('input', () => {
    const cursorAlFinal = input.selectionStart === input.value.length;
    const crudo = limpiar(input.value);
    const partes = crudo.split('.');
    const entero = partes[0].replace(/^0+(?=\d)/, '');
    const decimales = partes.length > 1 ? '.' + partes[1].slice(0, 2) : '';
    const formateado = entero ? NUMERO.format(Number(entero)) + decimales : '';
    input.value = formateado;
    if (cursorAlFinal) input.setSelectionRange(input.value.length, input.value.length);
  });
}

export function valorNumericoDeInputMoneda(input) {
  return Number((input.value || '0').replace(/,/g, '')) || 0;
}
