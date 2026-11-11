import Database from '@tauri-apps/plugin-sql';
import { ESQUEMA_SQL, MIGRACIONES_SQL } from './esquema';


let _cola: Promise<unknown> = Promise.resolve();

// Serializa TODO acceso a la base (selects y execute) para evitar
// colisiones de "database is locked" por el pool de conexiones de SQLite.
function encolar<T>(tarea: () => Promise<T>): Promise<T> {
  const resultado = _cola.then(tarea, tarea);
  _cola = resultado.then(() => {}, () => {});
  return resultado;
}


let _dbPromesa: Promise<Database> | null = null;

export function obtenerDB(): Promise<Database> {
  if (!_dbPromesa) {
    _dbPromesa = (async () => {
      const db = await Database.load('sqlite:finanzas.db');
      await db.execute('PRAGMA journal_mode=WAL;');
      await db.execute('PRAGMA busy_timeout=5000;');
      for (const stmt of ESQUEMA_SQL.split(';').map(s => s.trim()).filter(Boolean)) {
        await db.execute(stmt);
      }
      await migrarEsquema(db);
      await asegurarCajaReservaTC(db);
      return db;
    })().catch((e) => {
      _dbPromesa = null; // permite reintentar
      throw e;
    });
  }
  return _dbPromesa;
}

// Aplica columnas nuevas sin tronar si ya existen (ALTER TABLE no soporta
// "IF NOT EXISTS" para columnas en SQLite).
async function migrarEsquema(db: Database) {
  for (const stmt of MIGRACIONES_SQL) {
    try {
      await db.execute(stmt);
    } catch (e) {
      const msg = String(e).toLowerCase();
      if (!msg.includes('duplicate column')) console.warn('Migration skipped:', stmt, e);
    }
  }
}

async function asegurarCajaReservaTC(db: Database) {
  const existe = await db.select<{ id: number }[]>(`SELECT id FROM cajas WHERE es_sistema = 1 LIMIT 1`);
  if (existe.length === 0) {
    await db.execute(
      `INSERT INTO cajas (nombre, objetivo, saldo, color, icono, es_sistema)
       VALUES ('Reserved for Card Payments', 'Money you manually set aside to pay off credit cards', 0, '#f59e0b', 'candado', 1)`
    );
  }
}

export async function ejecutar(sql: string, params: unknown[] = []) {
  return encolar(async () => {
    const db = await obtenerDB();
    return db.execute(sql, params);
  });
}

export async function consultar<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  return encolar(async () => {
    const db = await obtenerDB();
    return db.select<T[]>(sql, params);
  });
}

// Para uso interno de ledger.js: ejecuta un bloque completo (BEGIN...COMMIT)
// como una sola tarea en la cola, sin que nada más se cuele en medio.
export async function transaccion<T>(fn: (db: Database) => Promise<T>): Promise<T> {
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


/** Vuelca el WAL al archivo principal. Con journal_mode=WAL los cambios
 * recientes viven en finanzas.db-wal, y el respaldo (que copia solo
 * finanzas.db) podía salir sin los últimos movimientos. */
export async function prepararArchivoParaRespaldo() {
  return encolar(async () => {
    const db = await obtenerDB();
    await db.execute('PRAGMA wal_checkpoint(TRUNCATE);');
  });
}

/** Cierra la conexión antes de reemplazar el archivo (restaurar/importar),
 * para que SQLite no escriba páginas viejas encima del respaldo. */
export async function cerrarConexion() {
  return encolar(async () => {
    if (!_dbPromesa) return;
    const db = await _dbPromesa;
    await db.execute('PRAGMA wal_checkpoint(TRUNCATE);');
    await db.close();
    _dbPromesa = null;
  });
}

// Se conservan idioma y nombre de usuario. Quita 'configuracion' de aquí si quieres borrarlos también.
const TABLAS_CONSERVADAS = new Set(['configuracion']);

export async function reiniciarTodo() {
  return encolar(async () => {
    const db = await obtenerDB();
    const tablas = (await db.select<{ name: string }[]>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`
    )).map(t => t.name).filter(n => !TABLAS_CONSERVADAS.has(n));

    await db.execute('BEGIN');
    try {
      for (const tabla of tablas) {
        await db.execute(`DELETE FROM "${tabla}"`);
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