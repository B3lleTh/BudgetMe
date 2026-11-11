// Avisos inteligentes de Inicio: solo lo que pide atención ahora.
import { consultar } from '../../lib/datos/db';
import { diasHasta, proximaFechaDia, type Balance, type Pendiente } from '../../lib/datos/resumen';
import { formatoMoneda } from '../../lib/formato';
import { t } from '../../lib/i18n.svelte';
import type { Vista } from '../../lib/navegacion.svelte';
import type { Caja, CuentaDebito } from '../../lib/datos/tipos';

export interface Aviso { tono: 'alerta' | 'info' | 'exito'; texto: string; destino?: Vista }

const DIAS_AVISO = 5;

export async function calcularAvisos(b: Balance, pendientes: Pendiente[], gastoMes: number, gastoMesAnterior: number): Promise<Aviso[]> {
  const avisos: Aviso[] = [];
  const dias = (n: number) => (n === 0 ? t('today') : n === 1 ? t('tomorrow') : t('in {n} days', { n }));

  for (const c of await consultar<CuentaDebito>(`SELECT * FROM cuentas_debito WHERE saldo < 0`)) {
    avisos.push({ tono: 'alerta', texto: t('{cuenta} is overdrawn by {monto}.', { cuenta: c.nombre, monto: formatoMoneda(-c.saldo) }), destino: 'tarjetas' });
  }
  for (const x of b.tarjetas) {
    const pendienteTarjeta = pendientes.filter((r) => r.tarjeta_id === x.id).reduce((a, r) => a + r.restante, 0);
    const limite = proximaFechaDia(x.fecha_limite_pago);
    if (limite && pendienteTarjeta > 0 && diasHasta(limite) <= DIAS_AVISO) {
      avisos.push({ tono: 'alerta', texto: t('{tarjeta} payment is due {cuando}: {monto} pending.', { tarjeta: x.nombre, cuando: dias(diasHasta(limite)), monto: formatoMoneda(pendienteTarjeta) }), destino: 'recurrentes' });
    }
    if (x.limite && x.saldo / x.limite >= 0.8) {
      avisos.push({ tono: 'alerta', texto: t('{tarjeta} is at {p}% of its credit limit.', { tarjeta: x.nombre, p: Math.round((x.saldo / x.limite) * 100) }), destino: 'tarjetas' });
    }
  }
  for (const p of b.prestamos) {
    const dia = proximaFechaDia(p.fecha_corte);
    const pendiente = pendientes.find((r) => r.prestamo_id === p.id);
    if (dia && pendiente && diasHasta(dia) <= DIAS_AVISO) {
      avisos.push({ tono: 'info', texto: t('{prestamo} payment of {monto} is due {cuando}.', { prestamo: p.nombre, monto: formatoMoneda(pendiente.restante), cuando: dias(diasHasta(dia)) }), destino: 'recurrentes' });
    }
  }
  const totalPendiente = pendientes.reduce((a, r) => a + r.restante, 0);
  if (totalPendiente > b.debito) {
    avisos.push({ tono: 'alerta', texto: t('Pending payments ({pendiente}) are more than what you have in debit ({debito}).', { pendiente: formatoMoneda(totalPendiente), debito: formatoMoneda(b.debito) }), destino: 'recurrentes' });
  }
  if (gastoMesAnterior > 0 && gastoMes > gastoMesAnterior * 1.2) {
    avisos.push({ tono: 'info', texto: t('You\'ve already spent {p}% more than all of last month.', { p: Math.round((gastoMes / gastoMesAnterior - 1) * 100) }), destino: 'gastos' });
  }
  for (const c of await consultar<Caja>(`SELECT * FROM cajas WHERE es_sistema = 0 AND meta > 0 AND saldo >= meta`)) {
    avisos.push({ tono: 'exito', texto: t('{caja} reached its goal of {meta}.', { caja: c.nombre, meta: formatoMoneda(c.meta) }), destino: 'cajas' });
  }
  const orden = { alerta: 0, info: 1, exito: 2 };
  return avisos.sort((a, b) => orden[a.tono] - orden[b.tono]);
}
