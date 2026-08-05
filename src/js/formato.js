const MONEDA = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'MXN' });
const NUMERO = new Intl.NumberFormat('en-US');

export function formatoMoneda(valor) {
  return MONEDA.format(Number(valor || 0));
}

export function formatoFecha(iso) {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

export function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export function diasEnMes(anio, mes) {
  return new Date(anio, mes, 0).getDate(); // mes 1-12
}

/** Ajusta un día objetivo (ej. 30) a un mes que puede tener menos días (ej. febrero). */
export function diaValidoEnMes(diaObjetivo, anio, mes) {
  return Math.min(diaObjetivo, diasEnMes(anio, mes));
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
