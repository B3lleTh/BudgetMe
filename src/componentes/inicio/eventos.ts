// Fechas del mes para el calendario de Inicio: quincenas e ingresos, cortes y
// fechas límite de tarjeta, y pagos de préstamo.
import { consultar } from '../../lib/datos/db';
import { proximasFechasDelMes } from '../../lib/datos/proyecciones';
import { diaValidoEnMes } from '../../lib/formato';
import type { Prestamo, Recurrente, Tarjeta } from '../../lib/datos/tipos';

export type TipoEvento = 'ingreso' | 'corte' | 'limite' | 'prestamo';
export interface Evento { dia: number; tipo: TipoEvento; texto: string }

export async function eventosDelMes(anio: number, mes: number): Promise<Evento[]> {
  const eventos: Evento[] = [];
  for (const r of await consultar<Recurrente>(`SELECT * FROM recurrentes WHERE tipo = 'ingreso'`)) {
    for (const dia of proximasFechasDelMes(r, anio, mes)) eventos.push({ dia, tipo: 'ingreso', texto: r.nombre });
  }
  for (const x of await consultar<Tarjeta>(`SELECT * FROM tarjetas WHERE tipo = 'credito'`)) {
    if (x.fecha_corte) eventos.push({ dia: diaValidoEnMes(x.fecha_corte, anio, mes), tipo: 'corte', texto: x.nombre });
    if (x.fecha_limite_pago) eventos.push({ dia: diaValidoEnMes(x.fecha_limite_pago, anio, mes), tipo: 'limite', texto: x.nombre });
  }
  for (const p of await consultar<Prestamo>(`SELECT * FROM prestamos WHERE estado = 'activo' AND activo = 1`)) {
    if (p.fecha_corte) eventos.push({ dia: diaValidoEnMes(p.fecha_corte, anio, mes), tipo: 'prestamo', texto: p.nombre });
  }
  return eventos;
}
