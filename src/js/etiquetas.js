import { escaparHTML } from './formato.js';

/** Shows an account as "Name · Bank" (or just the name if it has no bank),
 * so two accounts with similar names are easy to tell apart. */
export function etiquetaDeCuentaConBanco(cuenta) {
  return escaparHTML(cuenta.banco ? `${cuenta.nombre} · ${cuenta.banco}` : cuenta.nombre);
}

/** Categorías de gasto: valor guardado en la base → texto en pantalla. */
export const CATEGORIAS_GASTO = [
  { valor: 'hormiga', etiqueta: 'Small daily spend' },
  { valor: 'variable', etiqueta: 'Variable' },
  { valor: 'importante', etiqueta: 'Important' },
  { valor: 'compras', etiqueta: 'Shopping' },
];

export function etiquetaCategoriaGasto(valor) {
  return CATEGORIAS_GASTO.find(c => c.valor === valor)?.etiqueta || escaparHTML(valor) || 'No category';
}