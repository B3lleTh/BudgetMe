import { consultar, ejecutar } from './db.js';

/** Keeps the credit-card auto-recurring expenses in sync:
 * - Each active interest-free installment (MSI) purchase gets its OWN
 *   recurring row for exactly msi_meses cycles (amount = msi_monto_por_corte).
 *   Once msi_pagados reaches msi_meses it's fully settled and the row is
 *   removed — it does NOT keep charging forever.
 * - Everything else on the card (regular, non-MSI charges) is combined into
 *   one aggregate "card payment" recurring row for the current balance.
 *
 * Shared between dashboard.js and recurrentes.js so both read consistent,
 * up-to-date numbers regardless of which view the user opens first. */
export async function sincronizarMensualidadesTC() {
  // Safety net: if a gasto was ever deleted without going through the
  // gastos.js delete flow (or by an older app version), its linked
  // recurrente would otherwise stay orphaned forever, silently inflating
  // "pending to pay" every month.
  await ejecutar(
    `DELETE FROM recurrentes WHERE gasto_id IS NOT NULL AND gasto_id NOT IN (SELECT id FROM gastos)`
  );

  const tarjetas = await consultar(`SELECT * FROM tarjetas WHERE tipo = 'credito'`);
  for (const tj of tarjetas) {
    const gastosMSI = await consultar(`SELECT * FROM gastos WHERE tarjeta_id = $1 AND es_msi = 1`, [tj.id]);
    let deudaMSIRestante = 0;

    for (const g of gastosMSI) {
      const restanteDeuda = Math.max(0, g.monto - (g.msi_monto_por_corte || 0) * g.msi_pagados);
      deudaMSIRestante += restanteDeuda;
      const [recExistente] = await consultar(`SELECT * FROM recurrentes WHERE gasto_id = $1 LIMIT 1`, [g.id]);
      if (g.msi_pagados >= g.msi_meses || restanteDeuda <= 0) {
        if (recExistente) await ejecutar(`DELETE FROM recurrentes WHERE id = $1`, [recExistente.id]);
        continue;
      }
      const nombre = `${tj.nombre} — ${g.nombre || g.categoria} (installment ${g.msi_pagados + 1}/${g.msi_meses})`;
      if (!recExistente) {
        await ejecutar(
          `INSERT INTO recurrentes (tipo, nombre, categoria, monto, periodicidad, tarjeta_id, gasto_id, estado) VALUES ('gasto', $1, 'tarjeta_credito', $2, 'mensual', $3, $4, 'pendiente')`,
          [nombre, g.msi_monto_por_corte, tj.id, g.id]
        );
      } else if (recExistente.estado === 'pendiente') {
        await ejecutar(`UPDATE recurrentes SET monto = $1, nombre = $2 WHERE id = $3`, [g.msi_monto_por_corte, nombre, recExistente.id]);
      }
    }

    const montoNoMSI = Math.max(0, tj.saldo - deudaMSIRestante);
    const [agregadoExistente] = await consultar(`SELECT * FROM recurrentes WHERE tarjeta_id = $1 AND gasto_id IS NULL LIMIT 1`, [tj.id]);
    if (!agregadoExistente) {
      if (montoNoMSI > 0) {
        await ejecutar(
          `INSERT INTO recurrentes (tipo, nombre, categoria, monto, periodicidad, tarjeta_id, estado) VALUES ('gasto', $1, 'tarjeta_credito', $2, 'mensual', $3, 'pendiente')`,
          [`${tj.nombre} — card payment`, montoNoMSI, tj.id]
        );
      }
    } else if (agregadoExistente.estado === 'pendiente') {
      if (montoNoMSI <= 0) await ejecutar(`DELETE FROM recurrentes WHERE id = $1`, [agregadoExistente.id]);
      else if (agregadoExistente.monto !== montoNoMSI) await ejecutar(`UPDATE recurrentes SET monto = $1 WHERE id = $2`, [montoNoMSI, agregadoExistente.id]);
    }
  }
}