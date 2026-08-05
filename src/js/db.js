import Database from '@tauri-apps/plugin-sql';
import { ESQUEMA_SQL, MIGRACIONES_SQL } from './esquema.js';

let _db = null;
let _cola = Promise.resolve();

// Serializa TODO acceso a la base (selects y execute) para evitar
// colisiones de "database is locked" por el pool de conexiones de SQLite.
function encolar(tarea) {
  const resultado = _cola.then(tarea, tarea);
  _cola = resultado.then(() => {}, () => {});
  return resultado;
}

export async function obtenerDB() {
  if (_db) return _db;
  _db = await Database.load('sqlite:finanzas.db');
  await _db.execute('PRAGMA journal_mode=WAL;');
  await _db.execute('PRAGMA busy_timeout=5000;');
  for (const stmt of ESQUEMA_SQL.split(';').map(s => s.trim()).filter(Boolean)) {
    await _db.execute(stmt);
  }
  await migrarEsquema(_db);
  await asegurarCajaReservaTC(_db);
  return _db;
}

// Aplica columnas nuevas sin tronar si ya existen (ALTER TABLE no soporta
// "IF NOT EXISTS" para columnas en SQLite).
async function migrarEsquema(db) {
  for (const stmt of MIGRACIONES_SQL) {
    try {
      await db.execute(stmt);
    } catch (e) {
      const msg = String(e).toLowerCase();
      if (!msg.includes('duplicate column')) console.warn('Migration skipped:', stmt, e);
    }
  }
}

async function asegurarCajaReservaTC(db) {
  const existe = await db.select(`SELECT id FROM cajas WHERE es_sistema = 1 LIMIT 1`);
  if (existe.length === 0) {
    await db.execute(
      `INSERT INTO cajas (nombre, objetivo, saldo, color, icono, es_sistema)
       VALUES ('Reserved for Card Payments', 'Money you manually set aside to pay off credit cards', 0, '#f59e0b', 'candado', 1)`
    );
  }
}

export async function ejecutar(sql, params = []) {
  return encolar(async () => {
    const db = await obtenerDB();
    return db.execute(sql, params);
  });
}

export async function consultar(sql, params = []) {
  return encolar(async () => {
    const db = await obtenerDB();
    return db.select(sql, params);
  });
}

// Para uso interno de ledger.js: ejecuta un bloque completo (BEGIN...COMMIT)
// como una sola tarea en la cola, sin que nada más se cuele en medio.
export async function transaccion(fn) {
  return encolar(async () => {
    const db = await obtenerDB();
    await db.execute('BEGIN');
    try {
      const resultado = await fn(db);
      await db.execute('COMMIT');
      return resultado;
    } catch (e) {
      await db.execute('ROLLBACK');
      throw e;
    }
  });
}

// Lista de tablas que se vacían en un reinicio total. El orden no importa
// porque no hay foreign keys declaradas, pero se deja explícito.
const TABLAS_REINICIABLES = [
  'transacciones', 'gastos', 'ingresos_extra', 'recurrentes',
  'cajas', 'tarjetas', 'cuentas_debito',
];

/**
 * Borra TODA la información capturada por el usuario y vuelve a dejar la
 * app como recién instalada (incluida la caja de sistema "Reservado para TC").
 * No borra respaldos ya creados en disco.
 */
export async function reiniciarTodo() {
  return encolar(async () => {
    const db = await obtenerDB();
    await db.execute('BEGIN');
    try {
      for (const tabla of TABLAS_REINICIABLES) {
        await db.execute(`DELETE FROM ${tabla}`);
        await db.execute(`DELETE FROM sqlite_sequence WHERE name = $1`, [tabla]);
      }
      await db.execute('COMMIT');
    } catch (e) {
      await db.execute('ROLLBACK');
      throw e;
    }
    await asegurarCajaReservaTC(db);
  });
}
