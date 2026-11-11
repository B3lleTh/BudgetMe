// Filas de la base (ver esquema.ts). Los IDs y montos llegan como number desde SQLite.
export interface CuentaDebito { id: number; nombre: string; banco: string | null; saldo: number; creado_en?: string }
export interface Tarjeta {
  id: number; nombre: string; banco: string | null; tipo: 'credito' | 'debito'; limite: number | null; saldo: number;
  fecha_corte: number | null; fecha_limite_pago: number | null;
}
export interface Caja { id: number; nombre: string; objetivo: string | null; saldo: number; meta: number | null; es_sistema: number }
export interface Recurrente {
  id: number; tipo: 'ingreso' | 'gasto'; nombre: string; categoria: string | null; monto: number;
  periodicidad: 'semanal' | 'quincenal' | 'mensual' | 'personalizada'; dias_de_pago: string | null; intervalo_dias: number | null;
  es_variable: number; cuenta_destino_id: number | null; estado: 'pendiente' | 'pagado' | 'omitido'; ultima_aplicacion: string | null;
  activo: number; meses_activos: string | null; abonado: number; tarjeta_id: number | null; gasto_id: number | null; prestamo_id: number | null;
  creado_en: string;
}
export interface Gasto {
  id: number; nombre: string; categoria: string; fecha: string; monto: number; notas: string | null;
  metodo_pago: 'debito' | 'tarjeta'; tarjeta_id: number | null; cuenta_debito_id: number | null;
  es_msi: number; msi_meses: number | null; msi_pagados: number; msi_periodicidad: string | null; msi_monto_por_corte: number | null;
  tasa_interes: number; monto_base: number | null;
}
export interface IngresoExtra { id: number; nombre: string; categoria: string | null; fecha: string; monto: number; notas: string | null }
export interface Prestamo {
  id: number; nombre: string; monto_original: number; saldo_actual: number; tasa_interes: number; plazo_meses: number;
  meses_pagados: number; pago_mensual: number; fecha_inicio: string; fecha_corte: number | null;
  cuenta_destino_id: number | null; cuenta_pago_id: number | null; estado: 'activo' | 'liquidado'; notas: string | null; activo: number;
}
export interface Inversion {
  id: number; nombre: string; cuenta_origen_id: number | null; aporte_inicial: number; saldo: number; tasa_anual: number;
  meses_capitalizados: number; fecha_inicio: string; ultima_capitalizacion: string | null;
}
export interface Transaccion {
  id: number; fecha: string; tipo: string; origen: string | null; destino: string | null; categoria: string | null;
  monto: number; notas: string | null; ref_tabla: string | null; ref_id: number | null; prestamo_capital: number | null;
}
