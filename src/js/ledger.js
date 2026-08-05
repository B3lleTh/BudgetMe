// Libro Mayor — única puerta de entrada para modificar saldos.
// Ningún módulo actualiza saldos directamente: todos llaman a estas
// funciones, que actualizan la entidad correspondiente Y registran la
// transacción, usando la cola serializada de db.js para evitar
// bloqueos de SQLite ("database is locked").
import { transaccion } from './db.js';

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

async function registrarTx(db, { fecha, tipo, origen, destino, categoria, monto, notas, ref_tabla, ref_id }) {
  await db.execute(
    `INSERT INTO transacciones (fecha, tipo, origen, destino, categoria, monto, notas, ref_tabla, ref_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [fecha || hoyISO(), tipo, origen ?? null, destino ?? null, categoria ?? null, monto, notas ?? null, ref_tabla ?? null, ref_id ?? null]
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
