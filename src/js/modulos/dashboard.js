import { consultar } from '../db.js';
import { formatoMoneda, formatoFecha, hoyISO, diaValidoEnMes, diasEnMes } from '../formato.js';
import { icono } from '../iconos.js';
import { navegar } from '../app.js';
import { idioma } from '../i18n.js';
import { abrirModal } from '../ui.js';
import { sincronizarMensualidadesTC } from '../sincronizartc.js';
import { sincronizarPrestamos } from '../sincronizarPrestamos.js';

let graficaMensual, graficaAnual;

function mesActualPrefijo(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return d.toISOString().slice(0, 7); // YYYY-MM
}

async function sumaDebito() {
  const r = await consultar(`SELECT COALESCE(SUM(saldo),0) AS total FROM cuentas_debito`);
  return r[0]?.total || 0;
}

async function totalesMes(prefijoMes) {
  const gastos = await consultar(
    `SELECT COALESCE(SUM(monto),0) AS total FROM gastos WHERE fecha LIKE $1`, [`${prefijoMes}%`]
  );
  const ingresos = await consultar(
    `SELECT COALESCE(SUM(monto),0) AS total FROM transacciones
     WHERE fecha LIKE $1 AND (tipo = 'ingreso' OR (tipo = 'recurrente' AND destino LIKE 'debito:%'))`,
    [`${prefijoMes}%`]
  );
  return { gastos: gastos[0]?.total || 0, ingresos: ingresos[0]?.total || 0 };
}

/** "Pending to pay" for the current period: every active recurring expense
 * (fixed bills AND the auto-generated card-installment/card-balance rows
 * from sincronizarMensualidadesTC, AND loan installment rows from
 * sincronizarPrestamos) that is still 'pendiente'. This is already the
 * correct "what you owe THIS month" figure — it must never be added to a
 * card's or loan's full outstanding balance, or debt still due in future
 * months gets counted twice (see totalAPagarMes below). */
async function pendientePorPagar() {
  const filas = await consultar(
    `SELECT id, nombre, monto, activo, meses_activos FROM recurrentes WHERE tipo = 'gasto' AND estado = 'pendiente'`
  );
  const mesActual = new Date().getMonth() + 1;
  let total = 0;
  const detalle = [];
  for (const r of filas) {
    const activo = r.activo === undefined || r.activo === null ? 1 : r.activo;
    if (!activo) continue;
    let meses = [];
    try { meses = JSON.parse(r.meses_activos || '[]'); } catch { meses = []; }
    if (Array.isArray(meses) && meses.length > 0 && !meses.includes(mesActual)) continue;
    total += r.monto;
    detalle.push(r);
  }
  return { total, detalle };
}

async function datosTarjetas() {
  return consultar(`SELECT * FROM tarjetas WHERE tipo = 'credito'`);
}

async function datosPrestamos() {
  return consultar(`SELECT * FROM prestamos WHERE estado = 'activo'`);
}

function proximaFechaDia(diaMes) {
  if (!diaMes) return null;
  const hoy = new Date();
  let anio = hoy.getFullYear(), mes = hoy.getMonth() + 1;
  let dia = diaValidoEnMes(diaMes, anio, mes);
  let fecha = new Date(anio, mes - 1, dia);
  if (fecha < hoy) {
    mes += 1; if (mes > 12) { mes = 1; anio += 1; }
    dia = diaValidoEnMes(diaMes, anio, mes);
    fecha = new Date(anio, mes - 1, dia);
  }
  return fecha.toISOString().slice(0, 10);
}

async function sumaCajas() {
  const noSistema = await consultar(`SELECT COALESCE(SUM(saldo),0) AS total FROM cajas WHERE es_sistema = 0`);
  const sistema = await consultar(`SELECT COALESCE(SUM(saldo),0) AS total FROM cajas WHERE es_sistema = 1`);
  return { ahorrado: noSistema[0]?.total || 0, reservadoTC: sistema[0]?.total || 0 };
}

function kpi({ etiqueta, valor, iconoNombre, variacion, claseValor = '', tipo }) {
  const variacionHTML = variacion == null ? '' : `
    <div class="kpi__variacion ${variacion >= 0 ? 'positivo' : 'negativo'}">
      ${variacion >= 0 ? '▲' : '▼'} ${Math.abs(variacion).toFixed(1)}% vs previous month
    </div>`;
  return `
    <div class="tarjeta tarjeta--clicable" data-kpi="${tipo}" tabindex="0" role="button">
      <div class="kpi__etiqueta">${icono(iconoNombre)} ${etiqueta}</div>
      <div class="kpi__valor numero ${claseValor}">${valor}</div>
      ${variacionHTML}
    </div>`;
}

function variacionPorcentual(actual, anterior) {
  if (!anterior) return null;
  return ((actual - anterior) / anterior) * 100;
}

function seccion(titulo, contenidoHTML) {
  return `<div class="panel-seccion"><h2 class="panel-seccion__titulo">${titulo}</h2><div class="grid-kpis">${contenidoHTML}</div></div>`;
}

export async function render(vistaEl) {
  const filaUsuario = await consultar(`SELECT valor FROM configuracion WHERE clave = 'nombre_usuario'`);
  const nombreUsuario = filaUsuario[0]?.valor?.trim();
  const saludo = nombreUsuario ? (idioma() === 'es' ? `Hola, ${nombreUsuario}` : `Hi, ${nombreUsuario}`) : 'Dashboard';
  vistaEl.innerHTML = `<div class="tarjeta">Loading dashboard…</div>`;

  const [ingresosPendientes] = await Promise.all([
    consultar(`SELECT COUNT(*) AS n FROM recurrentes WHERE tipo='ingreso'`),
  ]);

  if (ingresosPendientes[0].n === 0) {
    vistaEl.innerHTML = `
      <div class="estado-vacio tarjeta">
        ${icono('rayo')}
        <h3>First, register your income</h3>
        <p>Without your salary or main income registered, the rest of the dashboard indicators have nothing to calculate from.</p>
        <button class="btn btn--primario" id="btn-ir-ingresos">Register my income</button>
      </div>`;
    vistaEl.querySelector('#btn-ir-ingresos').addEventListener('click', () => navegar('ingresos'));
    return;
  }

  // Keep the card-installment/card-balance and loan-installment recurring
  // rows fresh even if the user opens Dashboard first and never visits
  // Recurring in this session.
  await sincronizarMensualidadesTC();
  await sincronizarPrestamos();

  const debito = await sumaDebito();
  const mesActual = mesActualPrefijo(0);
  const mesAnterior = mesActualPrefijo(-1);
  const [totMesActual, totMesAnterior] = await Promise.all([totalesMes(mesActual), totalesMes(mesAnterior)]);
  const { total: pendiente, detalle: pendienteDetalle } = await pendientePorPagar();
  const tarjetasCredito = await datosTarjetas();
  const prestamosActivos = await datosPrestamos();
  const { ahorrado, reservadoTC } = await sumaCajas();

  const creditoUtilizado = tarjetasCredito.reduce((a, t) => a + t.saldo, 0);
  const deudaPrestamos = prestamosActivos.reduce((a, p) => a + p.saldo_actual, 0);
  // "Total to pay this month" = every pending recurring item, which ALREADY
  // includes each card's correct monthly installment/aggregate balance and
  // each loan's monthly installment (see sincronizarMensualidadesTC and
  // sincronizarPrestamos). It must NOT also add creditoUtilizado or
  // deudaPrestamos (the FULL remaining debt across all future months) —
  // doing so would double-count debt that isn't due yet this month.
  const totalAPagarMes = pendiente;
  const creditoLimite = tarjetasCredito.reduce((a, t) => a + (t.limite || 0), 0);
  const creditoDisponible = creditoLimite - creditoUtilizado;

  const proximoCorte = tarjetasCredito.map(t => proximaFechaDia(t.fecha_corte)).filter(Boolean).sort()[0];
  const proximoLimite = tarjetasCredito.map(t => proximaFechaDia(t.fecha_limite_pago)).filter(Boolean).sort()[0];

  const netWorth = debito + ahorrado + reservadoTC - creditoUtilizado - deudaPrestamos;
  const ahorroMes = totMesActual.ingresos - totMesActual.gastos;

  const encabezado = idioma() === 'es' ? 'Panorama general' : 'General overview';
  const fechaEncabezado = new Date().toLocaleDateString(idioma() === 'es' ? 'es-MX' : 'en-US', { month: 'long', year: 'numeric' });

  vistaEl.innerHTML = `
    <div class="vista__encabezado">
      <div><h1>${saludo}</h1><p>${encabezado} — ${fechaEncabezado} · <span style="opacity:.7;">Click a card for the breakdown</span></p></div>
    </div>

    ${seccion('This month', [
      kpi({ etiqueta: 'This month\u2019s income', valor: formatoMoneda(totMesActual.ingresos), iconoNombre: 'ingreso', claseValor: 'positivo', variacion: variacionPorcentual(totMesActual.ingresos, totMesAnterior.ingresos), tipo: 'ingresosMes' }),
      kpi({ etiqueta: 'This month\u2019s expenses', valor: formatoMoneda(totMesActual.gastos), iconoNombre: 'gasto', claseValor: 'negativo', variacion: variacionPorcentual(totMesActual.gastos, totMesAnterior.gastos), tipo: 'gastosMes' }),
      kpi({ etiqueta: 'This month\u2019s savings', valor: formatoMoneda(ahorroMes), iconoNombre: 'caja', claseValor: ahorroMes >= 0 ? 'positivo' : 'negativo', tipo: 'ahorroMes' }),
      kpi({ etiqueta: 'Pending to pay (recurring)', valor: formatoMoneda(pendiente), iconoNombre: 'alerta', tipo: 'pendienteRecurrente' }),
    ].join(''))}

    ${seccion('Cards', [
      kpi({ etiqueta: 'Total to pay this month (recurring + cards)', valor: formatoMoneda(totalAPagarMes), iconoNombre: 'alerta', claseValor: 'negativo', tipo: 'totalAPagar' }),
      kpi({ etiqueta: 'Credit used (total outstanding debt)', valor: formatoMoneda(creditoUtilizado), iconoNombre: 'tarjeta', claseValor: 'negativo', tipo: 'creditoUsado' }),
      kpi({ etiqueta: 'Credit available', valor: formatoMoneda(creditoDisponible), iconoNombre: 'tarjeta', claseValor: 'positivo', tipo: 'creditoDisponible' }),
      kpi({ etiqueta: 'Next statement date', valor: proximoCorte ? formatoFecha(proximoCorte) : '—', iconoNombre: 'reloj', tipo: 'proximoCorte' }),
      kpi({ etiqueta: 'Next payment due date', valor: proximoLimite ? formatoFecha(proximoLimite) : '—', iconoNombre: 'alerta', tipo: 'proximoLimite' }),
    ].join(''))}

    ${prestamosActivos.length ? seccion('Loans', [
      kpi({ etiqueta: 'Total owed on loans (outstanding balance)', valor: formatoMoneda(deudaPrestamos), iconoNombre: 'alerta', claseValor: 'negativo', tipo: 'deudaPrestamos' }),
    ].join('')) : ''}

    ${seccion('Net worth', [
      kpi({ etiqueta: 'Net Worth', valor: formatoMoneda(netWorth), iconoNombre: 'dashboard', tipo: 'netWorth' }),
      kpi({ etiqueta: 'Available balance (debit)', valor: formatoMoneda(debito), iconoNombre: 'banco', tipo: 'saldoDebito' }),
      kpi({ etiqueta: 'Total saved', valor: formatoMoneda(ahorrado), iconoNombre: 'caja', claseValor: 'positivo', tipo: 'totalAhorrado' }),
      kpi({ etiqueta: 'Reserved for card payments', valor: formatoMoneda(reservadoTC), iconoNombre: 'candado', tipo: 'reservadoTC' }),
    ].join(''))}

    <div class="grid-graficas">
      <div class="tarjeta"><h3>Monthly Behavior</h3><div class="grafica-envoltura"><canvas id="grafica-mensual"></canvas></div></div>
      <div class="tarjeta"><h3>Annual Behavior</h3><div class="grafica-envoltura"><canvas id="grafica-anual"></canvas></div></div>
    </div>
  `;

  vistaEl.querySelectorAll('[data-kpi]').forEach(card => {
    const abrir = () => abrirDesglose(card.dataset.kpi, {
      debito, ahorrado, reservadoTC, creditoUtilizado, creditoLimite, creditoDisponible,
      pendiente, pendienteDetalle, totMesActual, tarjetasCredito, prestamosActivos, deudaPrestamos,
      netWorth, ahorroMes, mesActual,
    });
    card.addEventListener('click', abrir);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } });
  });

  await pintarGraficaMensual(mesActual);
  await pintarGraficaAnual();
}

/** Opens a small breakdown modal for the clicked KPI card, so the dashboard
 * is not just numbers — every box explains itself on demand. */
async function abrirDesglose(tipo, ctx) {
  const filaSimple = (etiqueta, valor, clase = '') => `<div class="fila" style="padding:10px 12px;"><div class="fila__cuerpo"><div class="fila__titulo">${etiqueta}</div></div><div class="numero ${clase}">${valor}</div></div>`;
  let titulo = 'Breakdown', filas = '';

  if (tipo === 'ingresosMes' || tipo === 'gastosMes') {
    const esGasto = tipo === 'gastosMes';
    titulo = esGasto ? 'This month\u2019s expenses' : 'This month\u2019s income';
    const porCategoria = esGasto
      ? await consultar(`SELECT categoria, COALESCE(SUM(monto),0) t, COUNT(*) n FROM gastos WHERE fecha LIKE $1 GROUP BY categoria ORDER BY t DESC`, [`${ctx.mesActual}%`])
      : await consultar(`SELECT COALESCE(categoria,'income') categoria, COALESCE(SUM(monto),0) t, COUNT(*) n FROM transacciones WHERE fecha LIKE $1 AND (tipo='ingreso' OR (tipo='recurrente' AND destino LIKE 'debito:%')) GROUP BY categoria ORDER BY t DESC`, [`${ctx.mesActual}%`]);
    filas = porCategoria.length
      ? porCategoria.map(c => filaSimple(`${c.categoria || 'no category'} (${c.n})`, formatoMoneda(c.t), esGasto ? 'negativo' : 'positivo')).join('')
      : filaSimple('No details available', '—');
  } else if (tipo === 'ahorroMes') {
    titulo = 'This month\u2019s savings';
    filas = filaSimple('Income', formatoMoneda(ctx.totMesActual.ingresos), 'positivo')
      + filaSimple('Expenses', formatoMoneda(ctx.totMesActual.gastos), 'negativo')
      + filaSimple('This month\u2019s savings', formatoMoneda(ctx.ahorroMes), ctx.ahorroMes >= 0 ? 'positivo' : 'negativo');
  } else if (tipo === 'pendienteRecurrente' || tipo === 'totalAPagar') {
    // Both KPIs now represent the exact same figure — every active,
    // still-pending recurring item for this period, including the
    // auto-generated card installment/aggregate rows AND loan installment
    // rows. Debt that isn't due yet (future card/loan installments) is
    // intentionally NOT listed here; see "Credit used" / "Total owed on
    // loans" for the full outstanding balance instead.
    titulo = tipo === 'totalAPagar' ? 'Total to pay this month (recurring + cards)' : 'Pending to pay (recurring)';
    filas = ctx.pendienteDetalle.length
      ? ctx.pendienteDetalle.map(r => filaSimple(r.nombre, formatoMoneda(r.monto), 'negativo')).join('')
      : filaSimple('No details available', '—');
  } else if (tipo === 'creditoUsado' || tipo === 'creditoDisponible') {
    titulo = tipo === 'creditoUsado' ? 'Credit used (total outstanding debt)' : 'Credit available';
    filas = ctx.tarjetasCredito.length
      ? ctx.tarjetasCredito.map(t => filaSimple(t.nombre, formatoMoneda(tipo === 'creditoUsado' ? t.saldo : (t.limite || 0) - t.saldo), tipo === 'creditoUsado' ? 'negativo' : 'positivo')).join('')
      : filaSimple('No details available', '—');
  } else if (tipo === 'deudaPrestamos') {
    // Per-loan breakdown: original amount, what's left, and how many
    // installments remain — same spirit as the card breakdown above, but
    // loans also show progress since they have a fixed payoff date.
    titulo = 'Total owed on loans (outstanding balance)';
    filas = ctx.prestamosActivos.length
      ? ctx.prestamosActivos.map(p => {
          const restantes = Math.max(0, p.plazo_meses - p.meses_pagados);
          return filaSimple(
            `${p.nombre} — ${p.meses_pagados}/${p.plazo_meses} payments (${restantes} left)`,
            formatoMoneda(p.saldo_actual),
            'negativo'
          );
        }).join('')
      : filaSimple('No details available', '—');
  } else if (tipo === 'proximoCorte' || tipo === 'proximoLimite') {
    titulo = tipo === 'proximoCorte' ? 'Next statement date' : 'Next payment due date';
    filas = ctx.tarjetasCredito.length
      ? ctx.tarjetasCredito.map(t => {
          const dia = tipo === 'proximoCorte' ? t.fecha_corte : t.fecha_limite_pago;
          const fecha = dia ? proximaFechaDia(dia) : null;
          return filaSimple(t.nombre, fecha ? formatoFecha(fecha) : '—');
        }).join('')
      : filaSimple('No details available', '—');
  } else if (tipo === 'netWorth') {
    titulo = 'Net Worth';
    filas = filaSimple('Available balance (debit)', formatoMoneda(ctx.debito), 'positivo')
      + filaSimple('Total saved', formatoMoneda(ctx.ahorrado), 'positivo')
      + filaSimple('Reserved for card payments', formatoMoneda(ctx.reservadoTC), 'positivo')
      + filaSimple('Credit used', `− ${formatoMoneda(ctx.creditoUtilizado)}`, 'negativo')
      + (ctx.deudaPrestamos > 0 ? filaSimple('Loans owed', `− ${formatoMoneda(ctx.deudaPrestamos)}`, 'negativo') : '')
      + filaSimple('Net Worth', formatoMoneda(ctx.netWorth), ctx.netWorth >= 0 ? 'positivo' : 'negativo');
  } else if (tipo === 'saldoDebito') {
    titulo = 'Available balance (debit)';
    const cuentas = await consultar(`SELECT nombre, saldo FROM cuentas_debito ORDER BY saldo DESC`);
    filas = cuentas.length ? cuentas.map(c => filaSimple(c.nombre, formatoMoneda(c.saldo), 'positivo')).join('') : filaSimple('No details available', '—');
  } else if (tipo === 'totalAhorrado') {
    titulo = 'Total saved';
    const cajas = await consultar(`SELECT nombre, saldo FROM cajas WHERE es_sistema = 0 ORDER BY saldo DESC`);
    filas = cajas.length ? cajas.map(c => filaSimple(c.nombre, formatoMoneda(c.saldo), 'positivo')).join('') : filaSimple('No details available', '—');
  } else if (tipo === 'reservadoTC') {
    titulo = 'Reserved for card payments';
    filas = filaSimple('Reserved for card payments', formatoMoneda(ctx.reservadoTC), 'positivo');
  }

  abrirModal(`<h3 class="modal__titulo">${titulo}</h3><div class="lista" style="margin-top:10px;">${filas}</div>
    <div class="modal__acciones"><button type="button" class="btn btn--fantasma" data-cerrar-modal>Cancel</button></div>`);
}

/** Combo chart for the current month: bars show each day's expense total
 * (every day of the month is included, even with $0, so the x-axis reads
 * like a real calendar instead of skipping straight from day 3 to day 17),
 * plus a cumulative-spend line so it's obvious how the month is trending. */
async function pintarGraficaMensual(prefijoMes) {
  const filas = await consultar(
    `SELECT fecha, monto FROM gastos WHERE fecha LIKE $1 ORDER BY fecha`, [`${prefijoMes}%`]
  );
  const porDia = {};
  for (const f of filas) porDia[f.fecha] = (porDia[f.fecha] || 0) + f.monto;

  const [anio, mes] = prefijoMes.split('-').map(Number);
  const totalDias = diasEnMes(anio, mes);
  const diasDelMes = Array.from({ length: totalDias }, (_, i) => `${prefijoMes}-${String(i + 1).padStart(2, '0')}`);
  const diario = diasDelMes.map(d => porDia[d] || 0);
  let acumulado = 0;
  const acumuladoSerie = diario.map(v => (acumulado += v));
  const es = idioma() === 'es';

  graficaMensual?.destroy();
  graficaMensual = new Chart(document.getElementById('grafica-mensual'), {
    data: {
      labels: diasDelMes.map(d => Number(d.slice(8))),
      datasets: [
        { type: 'bar', label: es ? 'Gasto diario' : 'Daily expense', data: diario, backgroundColor: 'rgba(245,158,11,.85)', hoverBackgroundColor: '#f59e0b', order: 2, borderRadius: 6, maxBarThickness: 18 },
        { type: 'line', label: es ? 'Gasto acumulado' : 'Cumulative spend', data: acumuladoSerie, borderColor: '#f87171', borderWidth: 2.5, backgroundColor: 'rgba(248,113,113,.12)', tension: .35, fill: true, yAxisID: 'y1', order: 1, pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: '#f87171' },
      ],
    },
    options: {
      ...opcionesGraficaBase(),
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#9aa7b3', usePointStyle: true, pointStyle: 'circle', padding: 16, boxWidth: 8 } },
        tooltip: {
          backgroundColor: 'rgba(20,24,30,.95)', borderColor: '#2a333d', borderWidth: 1, padding: 10, cornerRadius: 8,
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatoMoneda(ctx.parsed.y)}` },
        },
      },
      scales: {
        x: { ticks: { color: '#6b7684', maxTicksLimit: 10 }, grid: { color: '#1b232c' }, title: { display: true, text: es ? 'Día del mes' : 'Day of month', color: '#6b7684' } },
        y: { ticks: { color: '#6b7684', callback: (v) => formatoMoneda(v) }, grid: { color: '#1b232c' } },
        y1: { position: 'right', ticks: { color: '#6b7684', callback: (v) => formatoMoneda(v) }, grid: { display: false } },
      },
    },
  });
}

async function pintarGraficaAnual() {
  const meses = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - (11 - i));
    return d.toISOString().slice(0, 7);
  });
  const gastos = [], ingresos = [];
  for (const m of meses) {
    const t = await totalesMes(m);
    gastos.push(t.gastos); ingresos.push(t.ingresos);
  }
  const es = idioma() === 'es';
  graficaAnual?.destroy();
  graficaAnual = new Chart(document.getElementById('grafica-anual'), {
    type: 'line',
    data: {
      labels: meses.map(m => m.slice(5)),
      datasets: [
        { label: es ? 'Ingresos' : 'Income', data: ingresos, borderColor: '#34d399', borderWidth: 2.5, backgroundColor: 'rgba(52,211,153,.15)', tension: .35, fill: true, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: '#34d399' },
        { label: es ? 'Gastos' : 'Expenses', data: gastos, borderColor: '#f87171', borderWidth: 2.5, backgroundColor: 'rgba(248,113,113,.12)', tension: .35, fill: true, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: '#f87171' },
      ],
    },
    options: { ...opcionesGraficaBase(), maintainAspectRatio: false },
  });
}

function opcionesGraficaBase() {
  return {
    responsive: true,
    plugins: {
      legend: { labels: { color: '#9aa7b3', usePointStyle: true, pointStyle: 'circle', padding: 16, boxWidth: 8 } },
      tooltip: {
        backgroundColor: 'rgba(20,24,30,.95)', borderColor: '#2a333d', borderWidth: 1, padding: 10, cornerRadius: 8,
        callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatoMoneda(ctx.parsed.y)}` },
      },
    },
    scales: {
      x: { ticks: { color: '#6b7684' }, grid: { color: '#1b232c' } },
      y: { ticks: { color: '#6b7684', callback: (v) => formatoMoneda(v) }, grid: { color: '#1b232c' } },
    },
  };
}