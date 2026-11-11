/** Shows an account as "Name · Bank" (or just the name if it has no bank),
 * so two accounts with similar names are easy to tell apart. */
export function etiquetaDeCuentaConBanco(cuenta: { nombre: string; banco?: string | null }): string {
  return cuenta.banco ? `${cuenta.nombre} · ${cuenta.banco}` : cuenta.nombre;
}

/** Categorías de gasto: valor guardado en la base → texto en pantalla (sin traducir). */
export const CATEGORIAS_GASTO = [
  { valor: 'hormiga', etiqueta: 'Small daily spend' },
  { valor: 'variable', etiqueta: 'Variable' },
  { valor: 'importante', etiqueta: 'Important' },
  { valor: 'compras', etiqueta: 'Shopping' },
] as const;

export function etiquetaCategoriaGasto(valor: string | null | undefined): string {
  return CATEGORIAS_GASTO.find(c => c.valor === valor)?.etiqueta || valor || 'No category';
}

export const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** Tipo de movimiento del libro mayor → texto en pantalla (sin traducir). */
export const ETIQUETAS_TIPO: Record<string, string> = {
  ingreso: 'Income', gasto: 'Expense', recurrente: 'Recurring', abono_recurrente: 'Partial Payment',
  pago_tc: 'Card Payment', transferencia: 'Transfer', deposito: 'Box deposit', retiro: 'Box withdrawal',
  movimiento_caja: 'Box Movement', ajuste_caja: 'Balance Adjustment',
  pago_prestamo: 'Loan payment', abono_capital_prestamo: 'Extra loan payment',
  aporte_inversion: 'Investment contribution', interes_inversion: 'Investment interest', retiro_inversion: 'Investment withdrawal',
};

/** Dinero que cambia de lugar entre lo tuyo: ni ingreso ni gasto. */
const NEUTROS = new Set(['transferencia', 'deposito', 'retiro', 'movimiento_caja', 'ajuste_caja', 'pago_tc', 'aporte_inversion', 'retiro_inversion']);

/** 'positivo' (entra), 'negativo' (sale) o '' (se mueve entre lo tuyo). */
export function signoDeMovimiento(tx: { tipo: string; destino: string | null }): '' | 'positivo' | 'negativo' {
  if (NEUTROS.has(tx.tipo)) return '';
  if (tx.tipo === 'ingreso' || tx.tipo === 'interes_inversion' || (tx.tipo === 'recurrente' && (tx.destino || '').startsWith('debito'))) return 'positivo';
  return 'negativo';
}

/** Los recurrentes automáticos de tarjeta y préstamo guardan su nombre en
 * inglés ("Oro — card payment", "Auto (payment 3/36)", "(installment 1/6)").
 * Se traducen al mostrarlos; el nombre en la base no cambia. */
export function nombreDeRecurrente(nombre: string, t: (texto: string) => string): string {
  return nombre
    .replace(/— card payment$/, `— ${t('card payment')}`)
    .replace(/\(payment (\d+\/\d+)\)/, (_, n) => `(${t('payment')} ${n})`)
    .replace(/\(installment (\d+\/\d+)\)/, (_, n) => `(${t('installment')} ${n})`);
}
