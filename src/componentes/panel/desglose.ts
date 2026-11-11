// Filas del desglose de cada cifra del Panel ("de dónde sale este número").
import { consultar } from '../../lib/datos/db';
import { SQL_ES_INGRESO, SQL_ES_GASTO_FIJO } from '../../lib/datos/consultas';
import { proximaFechaDia, type Balance, type Pendiente } from '../../lib/datos/resumen';
import { formatoMoneda, formatoFecha } from '../../lib/formato';
import { etiquetaCategoriaGasto, etiquetaDeCuentaConBanco, nombreDeRecurrente } from '../../lib/etiquetas';
import { t } from '../../lib/i18n.svelte';

export type TipoDesglose = 'ingresosMes' | 'gastosMes' | 'ahorroMes' | 'pendiente' | 'creditoUsado' | 'creditoDisponible' | 'proximoCorte' | 'proximoLimite' | 'prestamos' | 'patrimonio';
export interface FilaDesglose { etiqueta: string; valor: string; clase?: string; total?: boolean }

export interface Contexto { b: Balance; mes: string; tot: { ingresos: number; gastos: number }; pendiente: { total: number; detalle: Pendiente[] }; textoDias: (iso: string) => string }

export const TITULOS: Record<TipoDesglose, string> = {
  ingresosMes: 'This month\'s income', gastosMes: 'This month\'s expenses', ahorroMes: 'Left over this month', pendiente: 'Still due this month',
  creditoUsado: 'Credit used', creditoDisponible: 'Credit available', proximoCorte: 'Next statement date', proximoLimite: 'Next payment due date',
  prestamos: 'Total owed on loans', patrimonio: 'Net worth',
};

export async function filasDesglose(tipo: TipoDesglose, ctx: Contexto): Promise<FilaDesglose[]> {
  const { b } = ctx;
  const patron = `${ctx.mes}%`;
  switch (tipo) {
    case 'ingresosMes': {
      const filas = await consultar(`SELECT COALESCE(categoria,'income') categoria, COALESCE(SUM(monto),0) t, COUNT(*) n FROM transacciones WHERE fecha LIKE $1 AND ${SQL_ES_INGRESO} GROUP BY categoria ORDER BY t DESC`, [patron]);
      const nombre = (c: string) => (c === 'salario' ? t('Salary') : c === 'ingreso_extra' ? t('Extra income') : c);
      return filas.map((f) => ({ etiqueta: `${nombre(f.categoria)} (${f.n})`, valor: formatoMoneda(f.t), clase: 'positivo' }));
    }
    case 'gastosMes': {
      const cats = await consultar(`SELECT categoria, COALESCE(SUM(monto),0) t, COUNT(*) n FROM gastos WHERE fecha LIKE $1 GROUP BY categoria ORDER BY t DESC`, [patron]);
      const fijos = await consultar(`SELECT CASE WHEN tipo = 'pago_prestamo' THEN 'loans' ELSE 'bills' END grupo, COALESCE(SUM(monto),0) t, COUNT(*) n FROM transacciones WHERE fecha LIKE $1 AND ${SQL_ES_GASTO_FIJO} GROUP BY grupo ORDER BY t DESC`, [patron]);
      const filas: FilaDesglose[] = [
        ...cats.map((c) => ({ etiqueta: `${t(etiquetaCategoriaGasto(c.categoria))} (${c.n})`, valor: formatoMoneda(c.t), clase: 'negativo' })),
        ...fijos.map((f) => ({ etiqueta: `${t(f.grupo === 'loans' ? 'Loan payments' : 'Recurring bills paid')} (${f.n})`, valor: formatoMoneda(f.t), clase: 'negativo' })),
      ];
      return filas.length ? [...filas, { etiqueta: t('Total'), valor: formatoMoneda(ctx.tot.gastos), clase: 'negativo', total: true }] : [];
    }
    case 'ahorroMes': {
      const sobra = ctx.tot.ingresos - ctx.tot.gastos;
      return [
        { etiqueta: t('Income'), valor: formatoMoneda(ctx.tot.ingresos), clase: 'positivo' },
        { etiqueta: t('Expenses'), valor: `− ${formatoMoneda(ctx.tot.gastos)}`, clase: 'negativo' },
        { etiqueta: t('Left over'), valor: formatoMoneda(sobra), clase: sobra >= 0 ? 'positivo' : 'negativo', total: true },
      ];
    }
    case 'pendiente':
      return ctx.pendiente.detalle.length
        ? [...ctx.pendiente.detalle.map((r) => ({ etiqueta: nombreDeRecurrente(r.nombre, t), valor: formatoMoneda(r.restante), clase: 'negativo' })), { etiqueta: t('Total'), valor: formatoMoneda(ctx.pendiente.total), clase: 'negativo', total: true }]
        : [{ etiqueta: t('Nothing pending — every recurring payment is covered.'), valor: '—' }];
    case 'creditoUsado':
    case 'creditoDisponible':
      return b.tarjetas.map((x) => tipo === 'creditoUsado'
        ? { etiqueta: x.nombre, valor: formatoMoneda(x.saldo), clase: 'negativo' }
        : { etiqueta: x.nombre, valor: formatoMoneda((x.limite || 0) - x.saldo), clase: 'positivo' });
    case 'proximoCorte':
    case 'proximoLimite':
      return b.tarjetas.map((x) => {
        const f = proximaFechaDia(tipo === 'proximoCorte' ? x.fecha_corte : x.fecha_limite_pago);
        return { etiqueta: x.nombre, valor: f ? `${formatoFecha(f)} · ${ctx.textoDias(f)}` : '—' };
      });
    case 'prestamos':
      return b.prestamos.map((p) => ({ etiqueta: `${p.nombre} — ${t('{a}/{b} payments', { a: p.meses_pagados, b: p.plazo_meses })}`, valor: formatoMoneda(p.saldo_actual), clase: 'negativo' }));
    case 'patrimonio': {
      const cuentas = await consultar(`SELECT nombre, banco, saldo FROM cuentas_debito ORDER BY saldo DESC`);
      const filas: FilaDesglose[] = cuentas.map((c) => ({ etiqueta: etiquetaDeCuentaConBanco(c), valor: formatoMoneda(c.saldo), clase: c.saldo >= 0 ? 'positivo' : 'negativo' }));
      filas.push({ etiqueta: t('Savings boxes'), valor: formatoMoneda(b.ahorrado), clase: 'positivo' });
      if (b.reservadoTC) filas.push({ etiqueta: t('Reserved for card payments'), valor: formatoMoneda(b.reservadoTC), clase: 'positivo' });
      if (b.invertido) filas.push({ etiqueta: t('Investments'), valor: formatoMoneda(b.invertido), clase: 'positivo' });
      if (b.creditoUtilizado) filas.push({ etiqueta: t('Credit card debt'), valor: `− ${formatoMoneda(b.creditoUtilizado)}`, clase: 'negativo' });
      if (b.deudaPrestamos) filas.push({ etiqueta: t('Loans owed'), valor: `− ${formatoMoneda(b.deudaPrestamos)}`, clase: 'negativo' });
      filas.push({ etiqueta: t('Net worth'), valor: formatoMoneda(b.netWorth), clase: b.netWorth >= 0 ? 'positivo' : 'negativo', total: true });
      return filas;
    }
  }
}
