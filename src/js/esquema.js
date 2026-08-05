// Esquema de base de datos — se ejecuta una sola vez al iniciar (IF NOT EXISTS).
// Cada tabla representa una única entidad. El historial (transacciones) es la
// fuente de verdad; los módulos nunca se modifican entre sí, solo generan
// transacciones que el Dashboard resume.
export const ESQUEMA_SQL = `
CREATE TABLE IF NOT EXISTS cuentas_debito (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  banco TEXT,
  saldo REAL NOT NULL DEFAULT 0,
  color TEXT DEFAULT '#34d399',
  icono TEXT DEFAULT 'banco',
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tarjetas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  banco TEXT,
  tipo TEXT NOT NULL DEFAULT 'credito', -- credito | debito
  limite REAL,
  saldo REAL NOT NULL DEFAULT 0,        -- deuda actual si es crédito
  fecha_corte INTEGER,                  -- día del mes (1-31)
  fecha_limite_pago INTEGER,            -- día del mes (1-31)
  color TEXT DEFAULT '#f59e0b',
  icono TEXT DEFAULT 'tarjeta',
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cajas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  objetivo TEXT,
  saldo REAL NOT NULL DEFAULT 0,
  meta REAL,
  color TEXT DEFAULT '#60a5fa',
  icono TEXT DEFAULT 'alcancia',
  es_sistema INTEGER NOT NULL DEFAULT 0, -- 1 = caja "Reservado para TC", no editable/borrable
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Ingresos y gastos fijos recurrentes (una sola tabla, diferenciada por 'tipo')
CREATE TABLE IF NOT EXISTS recurrentes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,                  -- ingreso | gasto
  nombre TEXT NOT NULL,
  categoria TEXT,
  monto REAL NOT NULL,                 -- monto fijo o estimado (si es_variable)
  periodicidad TEXT NOT NULL DEFAULT 'mensual', -- semanal|quincenal|mensual|personalizada
  dias_de_pago TEXT,                   -- JSON: [15,30] o [1,15] o día de semana
  intervalo_dias INTEGER,              -- para personalizada
  es_variable INTEGER NOT NULL DEFAULT 0, -- 1 = freelance/variable
  cuenta_destino_id INTEGER,           -- a qué cuenta débito entra/sale
  estado TEXT NOT NULL DEFAULT 'pendiente', -- pendiente|pagado|omitido (se resetea cada periodo)
  ultima_aplicacion TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Ingresos extraordinarios (freelance puntual, bonos, reembolsos, ventas...)
CREATE TABLE IF NOT EXISTS ingresos_extra (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  categoria TEXT,
  fecha TEXT NOT NULL,
  monto REAL NOT NULL,
  notas TEXT,
  recurrente_id INTEGER,              -- si viene de un "ingreso variable" ligado
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gastos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'variable', -- hormiga|variable|importante|compras
  fecha TEXT NOT NULL,
  monto REAL NOT NULL,
  notas TEXT,
  metodo_pago TEXT NOT NULL DEFAULT 'debito', -- debito | tarjeta
  tarjeta_id INTEGER,
  cuenta_debito_id INTEGER,
  es_msi INTEGER NOT NULL DEFAULT 0,
  msi_meses INTEGER,
  msi_pagados INTEGER NOT NULL DEFAULT 0,
  reservado_tc INTEGER NOT NULL DEFAULT 0, -- si aparta dinero en la caja "Reservado para TC"
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Libro Mayor: fuente única de verdad, todo resumen se deriva de aquí.
CREATE TABLE IF NOT EXISTS configuracion (
  clave TEXT PRIMARY KEY,
  valor TEXT
);

CREATE TABLE IF NOT EXISTS transacciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  tipo TEXT NOT NULL,      -- ingreso|gasto|transferencia|pago_tc|movimiento_caja|retiro|deposito|recurrente
  origen TEXT,             -- ej. 'debito:1', 'caja:2', 'externo'
  destino TEXT,            -- ej. 'tarjeta:1', 'caja:2', 'debito:1'
  categoria TEXT,
  monto REAL NOT NULL,
  notas TEXT,
  ref_tabla TEXT,          -- tabla de origen del registro (gastos, recurrentes, etc.)
  ref_id INTEGER,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inversiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  cuenta_origen_id INTEGER,
  aporte_inicial REAL NOT NULL DEFAULT 0,
  saldo REAL NOT NULL DEFAULT 0,
  tasa_anual REAL NOT NULL DEFAULT 0,
  meses_capitalizados INTEGER NOT NULL DEFAULT 0,
  fecha_inicio TEXT NOT NULL,
  ultima_capitalizacion TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_transacciones_fecha ON transacciones(fecha);
CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha);
CREATE INDEX IF NOT EXISTS idx_ingresos_extra_fecha ON ingresos_extra(fecha);
`;

// Columnas agregadas en versiones posteriores (v3.1). SQLite no soporta
// "ADD COLUMN IF NOT EXISTS", así que cada una se intenta por separado y
// db.js ignora el error si la columna ya existe (ver migrarEsquema()).
export const MIGRACIONES_SQL = [
  // Recurrentes "estacionales": activo = 0 los pausa sin borrarlos.
  // meses_activos = JSON con [1..12]; NULL o '[]' significa "todos los meses".
  `ALTER TABLE recurrentes ADD COLUMN activo INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE recurrentes ADD COLUMN meses_activos TEXT`,
  `ALTER TABLE recurrentes ADD COLUMN abonado REAL NOT NULL DEFAULT 0`,
  // MSI con periodicidad propia (ej. quincenal en vez de mensual).
  `ALTER TABLE gastos ADD COLUMN msi_periodicidad TEXT DEFAULT 'mensual'`,
  `ALTER TABLE gastos ADD COLUMN msi_monto_por_corte REAL`,
  // Vincula un recurrente de gasto a una tarjeta de crédito, para la
  // "mensualidad" automática de TC que se auto-sincroniza en Recurring.
  `ALTER TABLE recurrentes ADD COLUMN tarjeta_id INTEGER`,
  // Links an auto-generated recurring row to one specific MSI purchase, so
  // each interest-free installment purchase behaves as its own recurring
  // expense that only lasts msi_meses cycles (see sincronizarMensualidadesTC).
  `ALTER TABLE recurrentes ADD COLUMN gasto_id INTEGER`,
];
