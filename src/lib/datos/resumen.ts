// Cálculos de resumen compartidos por Panel e Inicio: una sola definición de
// "ingresos del mes", "pendiente", "patrimonio", etc.
import { consultar } from './db';
import { SQL_ES_INGRESO, SQL_ES_GASTO_FIJO } from './consultas';
import { sincronizarMensualidadesTC } from './sincronizarTC';
import { sincronizarPrestamos } from './sincronizarPrestamos';
import { diaValidoEnMes, fechaLocalISO } from '../formato';
import type { Prestamo, Recurrente, Tarjeta } from './tipos';

/** Ingresos y gastos de un mes (YYYY-MM). Los gastos suman la tabla gastos
 * MÁS los gastos fijos del libro mayor (recurrentes pagados, abonos y
 * mensualidades de préstamo). */
export async function totalesMes(prefijo: string) {
  const [gastos] = await consultar(`SELECT COALESCE(SUM(monto),0) AS total FROM gastos WHERE fecha LIKE $1`, [`${prefijo}%`]);
  const [fijos] = await consultar(`SELECT COALESCE(SUM(monto),0) AS total FROM transacciones WHERE fecha LIKE $1 AND ${SQL_ES_GASTO_FIJO}`, [`${prefijo}%`]);
  const [ingresos] = await consultar(`SELECT COALESCE(SUM(monto),0) AS total FROM transacciones WHERE fecha LIKE $1 AND ${SQL_ES_INGRESO}`, [`${prefijo}%`]);
  return {
    gastos: (gastos?.total || 0) + (fijos?.total || 0),
    gastosVariables: gastos?.total || 0,
    gastosFijos: fijos?.total || 0,
    ingresos: ingresos?.total || 0,
  };
}

export type Pendiente = Recurrente & { restante: number };

/** Recurrentes de gasto activos y pendientes este mes (incluye mensualidades
 * de tarjeta y préstamo). Usa lo que FALTA (monto − abonado). Nunca sumar
 * además la deuda total de tarjetas/préstamos: eso vence en meses futuros. */
export async function pendientePorPagar(): Promise<{ total: number; detalle: Pendiente[] }> {
  const filas = await consultar<Recurrente>(`SELECT * FROM recurrentes WHERE tipo = 'gasto' AND estado = 'pendiente'`);
  const mesActual = new Date().getMonth() + 1;
  const detalle: Pendiente[] = [];
  for (const r of filas) {
    if (r.activo === 0) continue;
    let meses: number[] = [];
    try { meses = JSON.parse(r.meses_activos || '[]'); } catch { meses = []; }
    if (Array.isArray(meses) && meses.length > 0 && !meses.includes(mesActual)) continue;
    detalle.push({ ...r, restante: Math.max(0, r.monto - (r.abonado || 0)) });
  }
  detalle.sort((a, b) => b.restante - a.restante);
  return { total: detalle.reduce((a, r) => a + r.restante, 0), detalle };
}

/** Próxima fecha (hoy incluido) en que cae el día `diaMes`. */
export function proximaFechaDia(diaMes: number | null | undefined): string | null {
  if (!diaMes) return null;
  const hoy = new Date();
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  let anio = hoy.getFullYear(), mes = hoy.getMonth() + 1;
  let fecha = new Date(anio, mes - 1, diaValidoEnMes(diaMes, anio, mes));
  if (fecha < inicioHoy) {
    mes += 1; if (mes > 12) { mes = 1; anio += 1; }
    fecha = new Date(anio, mes - 1, diaValidoEnMes(diaMes, anio, mes));
  }
  return fechaLocalISO(fecha);
}

export function diasHasta(fechaISO: string): number {
  const [a, m, d] = fechaISO.split('-').map(Number);
  const hoy = new Date();
  return Math.round((new Date(a, m - 1, d).getTime() - new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime()) / 86400000);
}

/** Saldos de todo lo que tienes y debes, más el patrimonio neto. Las
 * inversiones cuentan como tuyas. */
export async function balance() {
  const suma = async (sql: string) => (await consultar(sql))[0]?.t || 0;
  const debito = await suma(`SELECT COALESCE(SUM(saldo),0) t FROM cuentas_debito`);
  const ahorrado = await suma(`SELECT COALESCE(SUM(saldo),0) t FROM cajas WHERE es_sistema = 0`);
  const reservadoTC = await suma(`SELECT COALESCE(SUM(saldo),0) t FROM cajas WHERE es_sistema = 1`);
  const invertido = await suma(`SELECT COALESCE(SUM(saldo),0) t FROM inversiones`);
  const tarjetas = await consultar<Tarjeta>(`SELECT * FROM tarjetas WHERE tipo = 'credito'`);
  const prestamos = await consultar<Prestamo>(`SELECT * FROM prestamos WHERE estado = 'activo'`);
  const creditoUtilizado = tarjetas.reduce((a, x) => a + x.saldo, 0);
  const creditoLimite = tarjetas.reduce((a, x) => a + (x.limite || 0), 0);
  const deudaPrestamos = prestamos.reduce((a, p) => a + p.saldo_actual, 0);
  return {
    debito, ahorrado, reservadoTC, invertido, tarjetas, prestamos, creditoUtilizado, creditoLimite,
    creditoDisponible: creditoLimite - creditoUtilizado, deudaPrestamos,
    netWorth: debito + ahorrado + reservadoTC + invertido - creditoUtilizado - deudaPrestamos,
  };
}
export type Balance = Awaited<ReturnType<typeof balance>>;

/** Mantiene al día las mensualidades automáticas antes de calcular. */
export async function sincronizarTodo() {
  await sincronizarMensualidadesTC();
  await sincronizarPrestamos();
}
