import { consultar, ejecutar } from './db.js';

/** Mantiene sincronizado un recurrente por cada préstamo activo, igual que
 * sincronizarTC.js hace con las tarjetas. Se llama desde dashboard.js y
 * recurrentes.js para que la mensualidad esté siempre al día sin importar
 * qué vista abra el usuario primero. */
export async function sincronizarPrestamos() {
  // Barrido de seguridad: si un préstamo se borró sin pasar por prestamos.js,
  // su recurrente ligado no debe quedar huérfano sumando para siempre.
  await ejecutar(
    `DELETE FROM recurrentes WHERE prestamo_id IS NOT NULL AND prestamo_id NOT IN (SELECT id FROM prestamos)`
  );

  const prestamos = await consultar(`SELECT * FROM prestamos WHERE estado = 'activo'`);
  for (const p of prestamos) {
    const [recExistente] = await consultar(`SELECT * FROM recurrentes WHERE prestamo_id = $1 LIMIT 1`, [p.id]);
    // Un préstamo pausado (activo = 0) no debe generar/mantener su
    // recurrente mensual mientras dure la pausa — igual que un mes de
    // gracia negociado con el banco: no se cobra, pero el saldo sigue ahí.
    if (!p.activo || p.saldo_actual <= 0 || p.meses_pagados >= p.plazo_meses) {
      if (recExistente) await ejecutar(`DELETE FROM recurrentes WHERE id = $1`, [recExistente.id]);
      continue;
    }
    const nombre = `${p.nombre} (payment ${p.meses_pagados + 1}/${p.plazo_meses})`;
    if (!recExistente) {
      await ejecutar(
        `INSERT INTO recurrentes (tipo, nombre, categoria, monto, periodicidad, cuenta_destino_id, prestamo_id, estado) VALUES ('gasto', $1, 'prestamo', $2, 'mensual', $3, $4, 'pendiente')`,
        [nombre, p.pago_mensual, p.cuenta_pago_id, p.id]
      );
    } else if (recExistente.estado === 'pendiente') {
      await ejecutar(`UPDATE recurrentes SET monto = $1, nombre = $2 WHERE id = $3`, [p.pago_mensual, nombre, recExistente.id]);
    }
  }
}

/** Amortización estándar sobre el saldo y los meses restantes.
 * tasaAnual en %, saldo y mesesRestantes ya excluyen lo pagado.
 * Si tasaAnual = 0, es una división simple (sin interés). */
export function calcularPagoMensual(saldo, tasaAnual, mesesRestantes) {
  if (!mesesRestantes || mesesRestantes <= 0) return 0;
  const r = tasaAnual / 100 / 12;
  if (!r) return Math.round((saldo / mesesRestantes) * 100) / 100;
  const pago = (saldo * r) / (1 - Math.pow(1 + r, -mesesRestantes));
  return Math.round(pago * 100) / 100;
}