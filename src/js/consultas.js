// Criterios compartidos de "qué cuenta como ingreso / gasto" sobre la tabla
// transacciones, para que Dashboard e Ingresos sumen exactamente lo mismo.
import { ejecutar, consultar } from './db.js';
import { prefijoMes } from './formato.js';

/** Dinero que de verdad entra: ingresos extra y recurrentes confirmados.
 * El desembolso de un préstamo NO es ingreso (es deuda nueva): antes
 * inflaba "Ingresos del mes" y el ahorro del mes. */
export const SQL_ES_INGRESO = `((tipo = 'ingreso' AND COALESCE(categoria, '') <> 'prestamo')
  OR (tipo = 'recurrente' AND destino LIKE 'debito:%'))`;

/** Gastos que pasan por el libro mayor y no por la tabla gastos: recurrentes
 * pagados (renta, Netflix…), sus abonos parciales y las mensualidades de
 * préstamo. Los pagos de tarjeta NO entran: esas compras ya se contaron en
 * gastos el día que se hicieron. */
export const SQL_ES_GASTO_FIJO = `((tipo IN ('recurrente', 'abono_recurrente') AND origen LIKE 'debito:%')
  OR tipo = 'pago_prestamo')`;

/** Devuelve a "pendiente" los recurrentes pagados u omitidos en un mes
 * anterior. Sin esto, un recurrente marcado como pagado se quedaba pagado
 * para siempre y "Pendiente por pagar" nunca volvía a incluirlo. */
export async function reiniciarRecurrentesDeMesesAnteriores() {
  const mesActual = prefijoMes(0);
  // Filas pagadas antes de que se guardara la fecha en todos los flujos:
  // se toma la fecha de su último movimiento; si no hay, se asume hoy.
  await ejecutar(
    `UPDATE recurrentes SET ultima_aplicacion = (
       SELECT MAX(fecha) FROM transacciones t WHERE t.ref_tabla = 'recurrentes' AND t.ref_id = recurrentes.id)
     WHERE estado IN ('pagado', 'omitido') AND ultima_aplicacion IS NULL`
  );
  await ejecutar(
    `UPDATE recurrentes SET ultima_aplicacion = date('now', 'localtime')
     WHERE estado IN ('pagado', 'omitido') AND ultima_aplicacion IS NULL`
  );
  await ejecutar(
    `UPDATE recurrentes SET estado = 'pendiente', abonado = 0
     WHERE estado IN ('pagado', 'omitido') AND substr(ultima_aplicacion, 1, 7) < $1`,
    [mesActual]
  );
  // Abonos parciales de un mes anterior que nunca se completaron.
  await ejecutar(
    `UPDATE recurrentes SET abonado = 0
     WHERE estado = 'pendiente' AND abonado > 0 AND ultima_aplicacion IS NOT NULL
       AND substr(ultima_aplicacion, 1, 7) < $1`,
    [mesActual]
  );
}

/** Movimientos del periodo que se está deshaciendo de un recurrente: solo
 * los del mes de su último pago. Antes "Undo" revertía TODOS los pagos que
 * ese recurrente había tenido en su historia (y meses anteriores perdían su
 * dinero). Si se marcó "ya pagado sin descuento", ese mes no tiene
 * movimientos y no se revierte nada. */
export async function transaccionesDelPeriodoDeRecurrente(recurrente, tipos) {
  const marcadores = tipos.map((_, i) => `$${i + 2}`).join(', ');
  const todas = await consultar(
    `SELECT * FROM transacciones WHERE ref_tabla = 'recurrentes' AND ref_id = $1 AND tipo IN (${marcadores}) ORDER BY id DESC`,
    [recurrente.id, ...tipos]
  );
  if (!todas.length) return [];
  const mes = (recurrente.ultima_aplicacion || todas[0].fecha).slice(0, 7);
  return todas.filter(t => t.fecha.slice(0, 7) === mes);
}
