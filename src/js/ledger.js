// Libro Mayor — única puerta de entrada para modificar saldos.
// Ningún módulo actualiza saldos directamente: todos llaman a estas
// funciones, que actualizan la entidad correspondiente Y registran la
// transacción, usando la cola serializada de db.js para evitar
// bloqueos de SQLite ("database is locked").
import { transaccion } from './db.js';
// Se reutiliza la misma fórmula de amortización que ya usa el preview de
// "crear préstamo" y sincronizarPrestamos.js, para no mantener dos copias
// de la misma matemática. sincronizarPrestamos.js solo importa de db.js,
// así que esta importación no genera ciclo.
import { calcularPagoMensual } from './sincronizarPrestamos.js';

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

async function registrarTx(db, { fecha, tipo, origen, destino, categoria, monto, notas, ref_tabla, ref_id, prestamo_capital }) {
  await db.execute(
    `INSERT INTO transacciones (fecha, tipo, origen, destino, categoria, monto, notas, ref_tabla, ref_id, prestamo_capital)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [fecha || hoyISO(), tipo, origen ?? null, destino ?? null, categoria ?? null, monto, notas ?? null, ref_tabla ?? null, ref_id ?? null, prestamo_capital ?? null]
  );
}

/** Ingreso (recurrente confirmado o extraordinario) → entra a una cuenta de débito. */
export async function registrarIngreso({ cuentaDebitoId, monto, categoria, notas, fecha, refTabla, refId }) {
  return transaccion(async (db) => {
    await db.execute(`UPDATE cuentas_debito SET saldo = saldo + $1 WHERE id = $2`, [monto, cuentaDebitoId]);
    await registrarTx(db, {
      fecha, tipo: 'ingreso', origen: 'externo', destino: `debito:${cuentaDebitoId}`,
      categoria, monto, notas, ref_tabla: refTabla, ref_id: refId,
    });
  });
}

/** Expense paid with debit (discounts immediately) or with a credit card (only raises the debt).
 * NOTE: card expenses no longer auto-reserve money into the "Reserved for Card Payments" box.
 * The user must consciously deposit into that box themselves (see movimientoCaja), because only
 * they know which money from their debit account is actually meant for that purpose. */
export async function registrarGasto({ gastoId, cuentaDebitoId, tarjetaId, metodoPago, monto, categoria, notas, fecha }) {
  return transaccion(async (db) => {
    if (metodoPago === 'debito') {
      await db.execute(`UPDATE cuentas_debito SET saldo = saldo - $1 WHERE id = $2`, [monto, cuentaDebitoId]);
      await registrarTx(db, {
        fecha, tipo: 'gasto', origen: `debito:${cuentaDebitoId}`, destino: 'externo',
        categoria, monto, notas, ref_tabla: 'gastos', ref_id: gastoId,
      });
    } else {
      await db.execute(`UPDATE tarjetas SET saldo = saldo + $1 WHERE id = $2`, [monto, tarjetaId]);
      await registrarTx(db, {
        fecha, tipo: 'gasto', origen: `tarjeta:${tarjetaId}`, destino: 'externo',
        categoria, monto, notas, ref_tabla: 'gastos', ref_id: gastoId,
      });
    }
  });
}

async function idCajaReservaTC(db) {
  const filas = await db.select(`SELECT id FROM cajas WHERE es_sistema = 1 LIMIT 1`);
  return filas[0]?.id;
}

/** Pago de tarjeta: sale de débito (o de la caja "Reservado para TC" si hay fondos ahí) y baja la deuda. */
export async function pagarTarjeta({ tarjetaId, cuentaDebitoId, monto, fecha, usarReservaTC, refTabla, refId }) {
  return transaccion(async (db) => {
    if (usarReservaTC) {
      const cajaId = await idCajaReservaTC(db);
      await db.execute(`UPDATE cajas SET saldo = saldo - $1 WHERE id = $2`, [monto, cajaId]);
      await registrarTx(db, {
        fecha, tipo: 'pago_tc', origen: `caja:${cajaId}`, destino: `tarjeta:${tarjetaId}`,
        categoria: 'pago_tarjeta', monto, notas: 'Pagado con dinero reservado', ref_tabla: refTabla, ref_id: refId,
      });
    } else {
      await db.execute(`UPDATE cuentas_debito SET saldo = saldo - $1 WHERE id = $2`, [monto, cuentaDebitoId]);
      await registrarTx(db, {
        fecha, tipo: 'pago_tc', origen: `debito:${cuentaDebitoId}`, destino: `tarjeta:${tarjetaId}`,
        categoria: 'pago_tarjeta', monto, notas: null, ref_tabla: refTabla, ref_id: refId,
      });
    }
    await db.execute(`UPDATE tarjetas SET saldo = saldo - $1 WHERE id = $2`, [monto, tarjetaId]);
  });
}

/** Directly sets a box's balance to any amount (including 0), without a
 * debit account involved. Registers a traceable 'ajuste_caja' entry whose
 * monto is the signed delta, so the ledger/history stays consistent. */
export async function ajustarSaldoCaja({ cajaId, nuevoSaldo, notas, fecha }) {
  return transaccion(async (db) => {
    const filas = await db.select(`SELECT saldo FROM cajas WHERE id = $1`, [cajaId]);
    const saldoActual = filas[0]?.saldo ?? 0;
    const delta = nuevoSaldo - saldoActual;
    await db.execute(`UPDATE cajas SET saldo = $1 WHERE id = $2`, [nuevoSaldo, cajaId]);
    if (delta !== 0) {
      await registrarTx(db, {
        fecha, tipo: 'ajuste_caja',
        origen: delta > 0 ? 'externo' : `caja:${cajaId}`,
        destino: delta > 0 ? `caja:${cajaId}` : 'externo',
        categoria: 'ajuste', monto: Math.abs(delta), notas: notas || 'Manual balance adjustment',
        ref_tabla: 'cajas', ref_id: cajaId,
      });
    }
  });
}

/** Movimiento entre cajas, o depósito/retiro caja <-> débito.
 * Un depósito nunca puede exceder el saldo REAL disponible en la cuenta de
 * débito: el usuario debe ser consciente de que ese dinero, dentro de su
 * cuenta de débito, ya está destinado a esta caja. Si no alcanza, se lanza
 * un error que la UI muestra como toast (ver cajas.js). */
export async function movimientoCaja({ cajaId, cuentaDebitoId, monto, direccion, fecha, notas }) {
  // direccion: 'deposito' (debito -> caja) | 'retiro' (caja -> debito)
  return transaccion(async (db) => {
    if (direccion === 'deposito') {
      const cuenta = await db.select(`SELECT saldo FROM cuentas_debito WHERE id = $1`, [cuentaDebitoId]);
      const saldoDisponible = cuenta[0]?.saldo ?? 0;
      if (monto > saldoDisponible) {
        throw new Error('INSUFFICIENT_DEBIT_BALANCE');
      }
      await db.execute(`UPDATE cuentas_debito SET saldo = saldo - $1 WHERE id = $2`, [monto, cuentaDebitoId]);
      await db.execute(`UPDATE cajas SET saldo = saldo + $1 WHERE id = $2`, [monto, cajaId]);
      await registrarTx(db, { fecha, tipo: 'deposito', origen: `debito:${cuentaDebitoId}`, destino: `caja:${cajaId}`, categoria: 'ahorro', monto, notas });
    } else {
      await db.execute(`UPDATE cajas SET saldo = saldo - $1 WHERE id = $2`, [monto, cajaId]);
      await db.execute(`UPDATE cuentas_debito SET saldo = saldo + $1 WHERE id = $2`, [monto, cuentaDebitoId]);
      await registrarTx(db, { fecha, tipo: 'retiro', origen: `caja:${cajaId}`, destino: `debito:${cuentaDebitoId}`, categoria: 'ahorro', monto, notas });
    }
  });
}

/** Confirmar pago de un recurrente (ingreso o gasto fijo) → genera transacción y marca 'pagado'. */
export async function aplicarRecurrente({ recurrente, cuentaDebitoId, monto, fecha }) {
  return transaccion(async (db) => {
    if (recurrente.tipo === 'ingreso') {
      await db.execute(`UPDATE cuentas_debito SET saldo = saldo + $1 WHERE id = $2`, [monto, cuentaDebitoId]);
      await registrarTx(db, {
        fecha, tipo: 'recurrente', origen: 'externo', destino: `debito:${cuentaDebitoId}`,
        categoria: recurrente.categoria || 'salario', monto, notas: recurrente.nombre,
        ref_tabla: 'recurrentes', ref_id: recurrente.id,
      });
    } else {
      await db.execute(`UPDATE cuentas_debito SET saldo = saldo - $1 WHERE id = $2`, [monto, cuentaDebitoId]);
      await registrarTx(db, {
        fecha, tipo: 'recurrente', origen: `debito:${cuentaDebitoId}`, destino: 'externo',
        categoria: recurrente.categoria || 'gasto_fijo', monto, notas: recurrente.nombre,
        ref_tabla: 'recurrentes', ref_id: recurrente.id,
      });
    }
    await db.execute(
      `UPDATE recurrentes SET estado = 'pagado', ultima_aplicacion = $1, abonado = 0 WHERE id = $2`,
      [fecha || hoyISO(), recurrente.id]
    );
  });
}

/** Registers a partial payment (abono) toward a pending recurring expense.
 * Deducts the partial amount from the debit account right away and adds it
 * to the recurrente's running `abonado` total. Once abonado reaches the
 * full monto, the recurrente is marked as 'pagado' automatically. */
export async function abonarRecurrente({ recurrente, cuentaDebitoId, monto, fecha }) {
  return transaccion(async (db) => {
    await db.execute(`UPDATE cuentas_debito SET saldo = saldo - $1 WHERE id = $2`, [monto, cuentaDebitoId]);
    await registrarTx(db, {
      fecha, tipo: 'abono_recurrente', origen: `debito:${cuentaDebitoId}`, destino: 'externo',
      categoria: recurrente.categoria || 'gasto_fijo', monto, notas: `Partial payment — ${recurrente.nombre}`,
      ref_tabla: 'recurrentes', ref_id: recurrente.id,
    });
    const nuevoAbonado = (recurrente.abonado || 0) + monto;
    if (nuevoAbonado >= recurrente.monto) {
      await db.execute(`UPDATE recurrentes SET abonado = 0, estado = 'pagado', ultima_aplicacion = $1 WHERE id = $2`, [fecha || hoyISO(), recurrente.id]);
    } else {
      await db.execute(`UPDATE recurrentes SET abonado = $1 WHERE id = $2`, [nuevoAbonado, recurrente.id]);
    }
  });
}

/** Crea una inversión: retira el aporte inicial de la cuenta débito y abre
 * el registro con saldo = aporte. El interés generado se reinvierte, no
 * genera movimientos de cuenta hasta que se retira. */
export async function crearInversion({ nombre, cuentaOrigenId, aporte, tasaAnual, fecha }) {
  return transaccion(async (db) => {
    if (cuentaOrigenId) {
      const cuenta = await db.select(`SELECT saldo FROM cuentas_debito WHERE id = $1`, [cuentaOrigenId]);
      if ((cuenta[0]?.saldo ?? 0) < aporte) throw new Error('INSUFFICIENT_DEBIT_BALANCE');
      await db.execute(`UPDATE cuentas_debito SET saldo = saldo - $1 WHERE id = $2`, [aporte, cuentaOrigenId]);
      await registrarTx(db, { fecha, tipo: 'aporte_inversion', origen: `debito:${cuentaOrigenId}`, destino: 'externo', categoria: 'inversion', monto: aporte, notas: nombre });
    }
    await db.execute(
      `INSERT INTO inversiones (nombre, cuenta_origen_id, aporte_inicial, saldo, tasa_anual, fecha_inicio) VALUES ($1,$2,$3,$3,$4,$5)`,
      [nombre, cuentaOrigenId || null, aporte, tasaAnual, fecha]
    );
  });
}

/** Capitaliza un mes de interés: saldo *= (1 + tasa_anual/100/12). El interés
 * se reinvierte automáticamente (no toca ninguna cuenta). */
export async function capitalizarInversion(inversion, fecha) {
  return transaccion(async (db) => {
    const interes = inversion.saldo * (inversion.tasa_anual / 100 / 12);
    await db.execute(
      `UPDATE inversiones SET saldo = saldo + $1, meses_capitalizados = meses_capitalizados + 1, ultima_capitalizacion = $2 WHERE id = $3`,
      [interes, fecha, inversion.id]
    );
    await registrarTx(db, { fecha, tipo: 'interes_inversion', origen: 'externo', destino: 'externo', categoria: 'inversion', monto: interes, notas: `${inversion.nombre} — reinvested interest`, ref_tabla: 'inversiones', ref_id: inversion.id });
  });
}

/** Retira (total o parcial) de una inversión hacia una cuenta débito. */
export async function retirarInversion({ inversion, cuentaDestinoId, monto, fecha }) {
  return transaccion(async (db) => {
    await db.execute(`UPDATE inversiones SET saldo = saldo - $1 WHERE id = $2`, [monto, inversion.id]);
    await db.execute(`UPDATE cuentas_debito SET saldo = saldo + $1 WHERE id = $2`, [monto, cuentaDestinoId]);
    await registrarTx(db, { fecha, tipo: 'retiro_inversion', origen: 'externo', destino: `debito:${cuentaDestinoId}`, categoria: 'inversion', monto, notas: inversion.nombre, ref_tabla: 'inversiones', ref_id: inversion.id });
  });
}

/** Eliminar un movimiento revirtiendo su efecto en saldos (usado por confirmarYEliminar). */
export async function revertirTransaccion(tx) {
  return transaccion(async (db) => {
    const aplicar = async (ref, signo) => {
      if (!ref) return;
      const [entidad, id] = ref.split(':');
      if (entidad === 'debito') await db.execute(`UPDATE cuentas_debito SET saldo = saldo + $1 WHERE id = $2`, [signo * tx.monto, id]);
      if (entidad === 'tarjeta') await db.execute(`UPDATE tarjetas SET saldo = saldo + $1 WHERE id = $2`, [signo * tx.monto, id]);
      if (entidad === 'caja') await db.execute(`UPDATE cajas SET saldo = saldo + $1 WHERE id = $2`, [signo * tx.monto, id]);
    };
    // Revertir: lo que salió de "origen" regresa (+), lo que entró a "destino" se resta (-)
    await aplicar(tx.origen, +1);
    await aplicar(tx.destino, -1);
    await db.execute(`DELETE FROM transacciones WHERE id = $1`, [tx.id]);
  });
}
/** Crea un préstamo. Si cuentaDestinoId viene definida, el monto (saldoInicial)
 * se deposita ahí — cubre "estoy tomando un préstamo nuevo y el dinero cae en
 * mi cuenta". Si se omite, no se mueve dinero: cubre "ya traigo este préstamo
 * corriendo y solo lo voy a llevar registrado desde aquí" (saldoInicial puede
 * ser menor a montoOriginal para reflejar lo que ya se pagó fuera de la app). */
export async function crearPrestamo({ nombre, montoOriginal, saldoInicial, tasaInteres, plazoMeses, mesesPagados, pagoMensual, fechaInicio, fechaCorte, cuentaDestinoId, cuentaPagoId, notas }) {
  return transaccion(async (db) => {
    if (cuentaDestinoId) {
      await db.execute(`UPDATE cuentas_debito SET saldo = saldo + $1 WHERE id = $2`, [saldoInicial, cuentaDestinoId]);
      await registrarTx(db, {
        fecha: fechaInicio, tipo: 'ingreso', origen: 'externo', destino: `debito:${cuentaDestinoId}`,
        categoria: 'prestamo', monto: saldoInicial, notas: `Loan disbursed — ${nombre}`,
      });
    }
    const res = await db.execute(
      `INSERT INTO prestamos (nombre, monto_original, saldo_actual, tasa_interes, plazo_meses, meses_pagados, pago_mensual, fecha_inicio, fecha_corte, cuenta_destino_id, cuenta_pago_id, estado, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'activo',$12)`,
      [nombre, montoOriginal, saldoInicial, tasaInteres, plazoMeses, mesesPagados || 0, pagoMensual, fechaInicio, fechaCorte || null, cuentaDestinoId || null, cuentaPagoId || null, notas || null]
    );
    return res.lastInsertId;
  });
}

/** Pago mensual de un préstamo: se descuenta de la cuenta de débito y se
 * separa en interés (no reduce saldo) y capital (sí reduce saldo), igual
 * que una tabla de amortización real. Guarda el capital aplicado en la
 * transacción para poder deshacer el pago exactamente después. Si el
 * saldo llega a 0 o se cubre el plazo, el préstamo se marca 'liquidado'. */
export async function pagarPrestamo({ prestamo, cuentaDebitoId, monto, fecha, refTabla, refId }) {
  return transaccion(async (db) => {
    const interes = Math.round(prestamo.saldo_actual * (prestamo.tasa_interes / 100 / 12) * 100) / 100;
    const capital = Math.min(prestamo.saldo_actual, Math.max(0, monto - interes));
    await db.execute(`UPDATE cuentas_debito SET saldo = saldo - $1 WHERE id = $2`, [monto, cuentaDebitoId]);
    await registrarTx(db, {
      fecha, tipo: 'pago_prestamo', origen: `debito:${cuentaDebitoId}`, destino: 'externo',
      categoria: 'prestamo', monto, notas: `${prestamo.nombre} — interest ${interes.toFixed(2)}, principal ${capital.toFixed(2)}`,
      ref_tabla: refTabla, ref_id: refId, prestamo_capital: capital,
    });
    const nuevoSaldo = Math.max(0, prestamo.saldo_actual - capital);
    const nuevosMesesPagados = prestamo.meses_pagados + 1;
    const liquidado = nuevoSaldo <= 0 || nuevosMesesPagados >= prestamo.plazo_meses;
    await db.execute(
      `UPDATE prestamos SET saldo_actual = $1, meses_pagados = $2, estado = $3 WHERE id = $4`,
      [nuevoSaldo, nuevosMesesPagados, liquidado ? 'liquidado' : 'activo', prestamo.id]
    );
  });
}

/** Deshace un pago de préstamo: regresa el dinero a la cuenta, restaura el
 * saldo exactamente en el capital que se le aplicó (guardado en la
 * transacción), retrocede meses_pagados y reactiva el préstamo si se había
 * marcado 'liquidado'. */
export async function revertirPagoPrestamo(tx, prestamo) {
  return transaccion(async (db) => {
    const [, idCuenta] = tx.origen.split(':');
    await db.execute(`UPDATE cuentas_debito SET saldo = saldo + $1 WHERE id = $2`, [tx.monto, idCuenta]);
    const capital = tx.prestamo_capital || 0;
    await db.execute(
      `UPDATE prestamos SET saldo_actual = saldo_actual + $1, meses_pagados = MAX(0, meses_pagados - 1), estado = 'activo' WHERE id = $2`,
      [capital, prestamo.id]
    );
    await db.execute(`DELETE FROM transacciones WHERE id = $1`, [tx.id]);
  });
}

/** Abono a capital extra ("adelantar pago"): a diferencia de pagarPrestamo(),
 * el 100% del monto reduce saldo_actual directamente — no hay separación de
 * interés porque no sustituye la mensualidad del calendario normal, es
 * dinero de más para acelerar el préstamo. NO incrementa meses_pagados (no
 * es "un pago más", es capital adelantado fuera del calendario). Al bajar
 * el saldo, se recalcula pago_mensual sobre los mismos meses restantes —
 * misma fórmula que usa el preview al crear el préstamo — para que la
 * mensualidad futura ya refleje el abono. */
export async function abonarCapitalPrestamo({ prestamo, cuentaDebitoId, monto, fecha }) {
  return transaccion(async (db) => {
    await db.execute(`UPDATE cuentas_debito SET saldo = saldo - $1 WHERE id = $2`, [monto, cuentaDebitoId]);
    await registrarTx(db, {
      fecha, tipo: 'abono_capital_prestamo', origen: `debito:${cuentaDebitoId}`, destino: 'externo',
      categoria: 'prestamo', monto, notas: `Extra principal payment — ${prestamo.nombre}`,
      ref_tabla: 'prestamos', ref_id: prestamo.id, prestamo_capital: monto,
    });
    const nuevoSaldo = Math.max(0, prestamo.saldo_actual - monto);
    const liquidado = nuevoSaldo <= 0;
    const mesesRestantes = Math.max(1, prestamo.plazo_meses - prestamo.meses_pagados);
    const nuevoPagoMensual = liquidado ? 0 : calcularPagoMensual(nuevoSaldo, prestamo.tasa_interes, mesesRestantes);
    await db.execute(
      `UPDATE prestamos SET saldo_actual = $1, pago_mensual = $2, estado = $3 WHERE id = $4`,
      [nuevoSaldo, nuevoPagoMensual, liquidado ? 'liquidado' : 'activo', prestamo.id]
    );
  });
}

/** Deshace un abono a capital: regresa el dinero, restaura saldo_actual y
 * recalcula pago_mensual hacia atrás con la misma fórmula (NO toca
 * meses_pagados, a diferencia de revertirPagoPrestamo, porque el abono
 * nunca lo incrementó). */
export async function revertirAbonoCapitalPrestamo(tx, prestamo) {
  return transaccion(async (db) => {
    const [, idCuenta] = tx.origen.split(':');
    await db.execute(`UPDATE cuentas_debito SET saldo = saldo + $1 WHERE id = $2`, [tx.monto, idCuenta]);
    const capital = tx.prestamo_capital || 0;
    const nuevoSaldo = prestamo.saldo_actual + capital;
    const mesesRestantes = Math.max(1, prestamo.plazo_meses - prestamo.meses_pagados);
    const pagoMensual = calcularPagoMensual(nuevoSaldo, prestamo.tasa_interes, mesesRestantes);
    await db.execute(
      `UPDATE prestamos SET saldo_actual = $1, pago_mensual = $2, estado = 'activo' WHERE id = $3`,
      [nuevoSaldo, pagoMensual, prestamo.id]
    );
    await db.execute(`DELETE FROM transacciones WHERE id = $1`, [tx.id]);
  });
}