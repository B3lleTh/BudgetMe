import { consultar } from '../db.js';
import { formatoMoneda, formatoFecha, fechaLocalISO, prefijoMes, ultimosMeses, etiquetaMesCorta, diaValidoEnMes, diasEnMes, escaparHTML } from '../formato.js';
import { icono } from '../iconos.js';
import { navegar } from '../app.js';
import { idioma } from '../i18n.js';
import { abrirModal } from '../ui.js';
import { sincronizarMensualidadesTC } from '../sincronizartc.js';
import { sincronizarPrestamos } from '../sincronizarPrestamos.js';
import { etiquetaDeCuentaConBanco, etiquetaCategoriaGasto } from '../etiquetas.js';
import { SQL_ES_INGRESO, SQL_ES_GASTO_FIJO } from '../consultas.js';
import { coloresTema, conAlfa, opcionesBase } from '../graficas.js';

let graficaMensual, graficaAnual;

async function sumaDebito() {
  const r = await consultar(`SELECT COALESCE(SUM(saldo),0) AS total FROM cuentas_debito`);
  return r[0]?.total || 0;
}

/** Ingresos y gastos de un mes. Los gastos suman la tabla gastos MÁS los
 * gastos fijos que pasan por el libro mayor (recurrentes pagados, abonos y
 * mensualidades de préstamo). Antes solo se contaba la tabla gastos, así que
 * la renta o Netflix pagados nunca restaban del "ahorro del mes". */
async function totalesMes(prefijo) {
  const [gastos] = await consultar(
    `SELECT COALESCE(SUM(monto),0) AS total FROM gastos WHERE fecha LIKE $1`, [`${prefijo}%`]
  );
  const [fijos] = await consultar(
    `SELECT COALESCE(SUM(monto),0) AS total FROM transacciones WHERE fecha LIKE $1 AND ${SQL_ES_GASTO_FIJO}`, [`${prefijo}%`]
  );
  const [ingresos] = await consultar(
    `SELECT COALESCE(SUM(monto),0) AS total FROM transacciones WHERE fecha LIKE $1 AND ${SQL_ES_INGRESO}`, [`${prefijo}%`]
  );
  return {
    gastos: (gastos?.total || 0) + (fijos?.total || 0),
    gastosVariables: gastos?.total || 0,
    gastosFijos: fijos?.total || 0,
    ingresos: ingresos?.total || 0,
  };
}

/** "Due this month": every active recurring expense still pending for this
 * period, including the auto-generated card and loan installments. Uses
 * what is LEFT to pay (monto − abonado), so a partial payment already made
 * is not counted twice. Never add the cards'/loans' full balance on top:
 * that is debt due in future months. */
async function pendientePorPagar() {
  const filas = await consultar(
    `SELECT id, nombre, monto, abonado, activo, meses_activos FROM recurrentes WHERE tipo = 'gasto' AND estado = 'pendiente'`
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
    const restante = Math.max(0, r.monto - (r.abonado || 0));
    total += restante;
    detalle.push({ ...r, restante });
  }
  detalle.sort((a, b) => b.restante - a.restante);
  return { total, detalle };
}

/** Próxima fecha (hoy incluido) en que cae el día `diaMes`. */
function proximaFechaDia(diaMes) {
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

function diasHasta(fechaISO) {
  const [a, m, d] = fechaISO.split('-').map(Number);
  const hoy = new Date();
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((new Date(a, m - 1, d) - inicioHoy) / 86400000);
}

function textoDiasRestantes(fechaISO) {
  const n = diasHasta(fechaISO);
  const es = idioma() === 'es';
  if (n === 0) return es ? 'hoy' : 'today';
  if (n === 1) return es ? 'mañana' : 'tomorrow';
  return es ? `en ${n} días` : `in ${n} days`;
}

async function sumaCajas() {
  const [noSistema] = await consultar(`SELECT COALESCE(SUM(saldo),0) AS total FROM cajas WHERE es_sistema = 0`);
  const [sistema] = await consultar(`SELECT COALESCE(SUM(saldo),0) AS total FROM cajas WHERE es_sistema = 1`);
  return { ahorrado: noSistema?.total || 0, reservadoTC: sistema?.total || 0 };
}

function variacionPorcentual(actual, anterior) {
  if (!anterior) return null;
  return ((actual - anterior) / anterior) * 100;
}

/** `masEsMejor` decide el color: más ingresos es bueno, más gastos no. */
function htmlVariacion(variacion, masEsMejor = true) {
  if (variacion == null) return '';
  const sube = variacion >= 0;
  const bueno = sube === masEsMejor;
  return `<div class="kpi__variacion ${bueno ? 'positivo' : 'negativo'}">
    ${icono(sube ? 'tendencia_arriba' : 'tendencia_abajo')} ${Math.abs(variacion).toFixed(1)}% <span class="texto-tenue">vs previous month</span>
  </div>`;
}

function kpi({ etiqueta, valor, iconoNombre, extra = '', claseValor = '', tipo }) {
  return `
    <div class="tarjeta tarjeta--clicable" data-kpi="${tipo}" tabindex="0" role="button">
      <div class="kpi__etiqueta">${icono(iconoNombre)} ${etiqueta}</div>
      <div class="kpi__valor numero ${claseValor}">${valor}</div>
      ${extra}
    </div>`;
}

function seccion(titulo, contenidoHTML) {
  return `<section class="panel-seccion"><h2 class="panel-seccion__titulo">${titulo}</h2><div class="grid-kpis">${contenidoHTML}</div></section>`;
}

/** La pieza principal del Panel: el patrimonio neto y, debajo, de qué está
 * hecho — lo que tienes contra lo que debes, a la misma escala. */
function htmlBalance(ctx) {
  const c = coloresTema();
  const activos = [
    { etiqueta: 'Debit accounts', valor: ctx.debito, color: c.tinta },
    { etiqueta: 'Savings boxes', valor: ctx.ahorrado, color: c.tinta2 },
    { etiqueta: 'Card reserve', valor: ctx.reservadoTC, color: c.tinta3 },
    { etiqueta: 'Investments', valor: ctx.invertido, color: c.laton },
  ].filter(s => s.valor > 0);
  const deudas = [
    { etiqueta: 'Credit cards', valor: ctx.creditoUtilizado, color: c.perdida },
    { etiqueta: 'Loans', valor: ctx.deudaPrestamos, color: conAlfa(c.perdida, 0.55) },
  ].filter(s => s.valor > 0);
  const totalActivos = activos.reduce((a, s) => a + s.valor, 0);
  const totalDeudas = deudas.reduce((a, s) => a + s.valor, 0);
  const escala = Math.max(totalActivos, totalDeudas, 1);
  const barra = (segmentos, total) => `
    <div class="balance__barra" role="img" aria-label="${formatoMoneda(total)}">
      ${segmentos.map(s => `<div class="balance__segmento" style="width:${(s.valor / escala) * 100}%; background:${s.color};" title="${s.etiqueta}: ${formatoMoneda(s.valor)}"></div>`).join('')}
    </div>`;
  const leyenda = (segmentos) => segmentos.map(s => `<span><i style="background:${s.color}"></i>${s.etiqueta} <b>${formatoMoneda(s.valor)}</b></span>`).join('');

  return `
    <section class="balance" data-kpi="netWorth" tabindex="0" role="button">
      <div>
        <div class="balance__etiqueta">Net worth</div>
        <div class="balance__cifra ${ctx.netWorth < 0 ? 'negativo' : ''}">${formatoMoneda(ctx.netWorth)}</div>
        <div class="balance__nota">What you have minus what you owe, today.</div>
      </div>
      <div>
        <div class="balance__ejes"><span>What you have</span><span class="numero">${formatoMoneda(totalActivos)}</span></div>
        ${barra(activos, totalActivos)}
        <div class="balance__ejes" style="margin-top:14px;"><span>What you owe</span><span class="numero ${totalDeudas ? 'negativo' : ''}">${formatoMoneda(totalDeudas)}</span></div>
        ${barra(deudas, totalDeudas)}
        <div class="balance__leyenda">${leyenda([...activos, ...deudas]) || '<span>Add an account to see your balance here.</span>'}</div>
      </div>
    </section>`;
}

export async function render(vistaEl) {
  const filaUsuario = await consultar(`SELECT valor FROM configuracion WHERE clave = 'nombre_usuario'`);
  const nombreUsuario = filaUsuario[0]?.valor?.trim();
  const saludo = nombreUsuario
    ? escaparHTML(idioma() === 'es' ? `Hola, ${nombreUsuario}` : `Hi, ${nombreUsuario}`)
    : 'Dashboard';
  vistaEl.innerHTML = `<div class="cargando">Loading dashboard…</div>`;

  const [ingresosRegistrados] = await consultar(`SELECT COUNT(*) AS n FROM recurrentes WHERE tipo='ingreso'`);

  if (ingresosRegistrados.n === 0) {
    vistaEl.innerHTML = `
      <div class="vista__encabezado"><div><h1>${saludo}</h1><p>Let’s set up the basics.</p></div></div>
      <div class="estado-vacio tarjeta">
        ${icono('ingreso')}
        <h3>First, register your income</h3>
        <p>Without your salary or main income registered, the rest of the dashboard indicators have nothing to calculate from.</p>
        <button class="btn btn--primario" id="btn-ir-ingresos">Register my income</button>
      </div>`;
    vistaEl.querySelector('#btn-ir-ingresos').addEventListener('click', () => navegar('ingresos'));
    return;
  }

  // Keep the card-installment and loan-installment recurring rows fresh even
  // if the user opens Dashboard first and never visits Recurring.
  await sincronizarMensualidadesTC();
  await sincronizarPrestamos();

  const debito = await sumaDebito();
  const mesActual = prefijoMes(0);
  const mesAnterior = prefijoMes(-1);
  const [totMesActual, totMesAnterior] = await Promise.all([totalesMes(mesActual), totalesMes(mesAnterior)]);
  const { total: pendiente, detalle: pendienteDetalle } = await pendientePorPagar();
  const tarjetasCredito = await consultar(`SELECT * FROM tarjetas WHERE tipo = 'credito'`);
  const prestamosActivos = await consultar(`SELECT * FROM prestamos WHERE estado = 'activo'`);
  const { ahorrado, reservadoTC } = await sumaCajas();
  const [inv] = await consultar(`SELECT COALESCE(SUM(saldo),0) AS total FROM inversiones`);
  const invertido = inv?.total || 0;

  const creditoUtilizado = tarjetasCredito.reduce((a, t) => a + t.saldo, 0);
  const deudaPrestamos = prestamosActivos.reduce((a, p) => a + p.saldo_actual, 0);
  const creditoLimite = tarjetasCredito.reduce((a, t) => a + (t.limite || 0), 0);
  const creditoDisponible = creditoLimite - creditoUtilizado;

  const proximoCorte = tarjetasCredito.map(t => proximaFechaDia(t.fecha_corte)).filter(Boolean).sort()[0];
  const proximoLimite = tarjetasCredito.map(t => proximaFechaDia(t.fecha_limite_pago)).filter(Boolean).sort()[0];

  // Las inversiones también son tuyas: antes no sumaban y abrir una con
  // dinero de débito hacía "bajar" el patrimonio.
  const netWorth = debito + ahorrado + reservadoTC + invertido - creditoUtilizado - deudaPrestamos;
  const ahorroMes = totMesActual.ingresos - totMesActual.gastos;

  const fechaEncabezado = new Date().toLocaleDateString(idioma() === 'es' ? 'es-MX' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  const ctx = {
    debito, ahorrado, reservadoTC, invertido, creditoUtilizado, creditoLimite, creditoDisponible,
    pendiente, pendienteDetalle, totMesActual, tarjetasCredito, prestamosActivos, deudaPrestamos,
    netWorth, ahorroMes, mesActual,
  };

  vistaEl.innerHTML = `
    <div class="vista__encabezado">
      <div><h1>${saludo}</h1><p>${fechaEncabezado}. Select any figure to see where it comes from.</p></div>
    </div>

    ${htmlBalance(ctx)}

    ${seccion('This month', [
      kpi({ etiqueta: 'Income received', valor: formatoMoneda(totMesActual.ingresos), iconoNombre: 'ingreso', claseValor: 'positivo', extra: htmlVariacion(variacionPorcentual(totMesActual.ingresos, totMesAnterior.ingresos), true), tipo: 'ingresosMes' }),
      kpi({ etiqueta: 'Expenses', valor: formatoMoneda(totMesActual.gastos), iconoNombre: 'gasto', claseValor: 'negativo', extra: htmlVariacion(variacionPorcentual(totMesActual.gastos, totMesAnterior.gastos), false), tipo: 'gastosMes' }),
      kpi({ etiqueta: 'Left over', valor: formatoMoneda(ahorroMes), iconoNombre: 'caja', claseValor: ahorroMes >= 0 ? 'positivo' : 'negativo', extra: `<div class="kpi__nota">Income minus expenses</div>`, tipo: 'ahorroMes' }),
      kpi({ etiqueta: 'Still due this month', valor: formatoMoneda(pendiente), iconoNombre: 'calendario', extra: `<div class="kpi__nota">${pendienteDetalle.length} pending ${pendienteDetalle.length === 1 ? 'payment' : 'payments'}</div>`, tipo: 'pendienteRecurrente' }),
    ].join(''))}

    ${tarjetasCredito.length ? seccion('Credit cards', [
      kpi({ etiqueta: 'Credit used', valor: formatoMoneda(creditoUtilizado), iconoNombre: 'tarjeta', claseValor: creditoUtilizado > 0 ? 'negativo' : '', extra: creditoLimite ? `<div class="kpi__nota">${Math.round((creditoUtilizado / creditoLimite) * 100)}% ${idioma() === 'es' ? 'de' : 'of'} ${formatoMoneda(creditoLimite)}</div>` : '', tipo: 'creditoUsado' }),
      kpi({ etiqueta: 'Credit available', valor: formatoMoneda(creditoDisponible), iconoNombre: 'tarjeta', tipo: 'creditoDisponible' }),
      kpi({ etiqueta: 'Next statement date', valor: proximoCorte ? formatoFecha(proximoCorte) : '—', iconoNombre: 'calendario', extra: proximoCorte ? `<div class="kpi__nota">${textoDiasRestantes(proximoCorte)}</div>` : '', tipo: 'proximoCorte' }),
      kpi({ etiqueta: 'Next payment due date', valor: proximoLimite ? formatoFecha(proximoLimite) : '—', iconoNombre: 'alerta', extra: proximoLimite ? `<div class="kpi__nota">${textoDiasRestantes(proximoLimite)}</div>` : '', tipo: 'proximoLimite' }),
    ].join('')) : ''}

    ${prestamosActivos.length ? seccion('Loans', [
      kpi({ etiqueta: 'Total owed on loans', valor: formatoMoneda(deudaPrestamos), iconoNombre: 'prestamo', claseValor: 'negativo', tipo: 'deudaPrestamos' }),
      kpi({ etiqueta: 'Monthly payments committed', valor: formatoMoneda(prestamosActivos.filter(p => p.activo).reduce((a, p) => a + p.pago_mensual, 0)), iconoNombre: 'recurrente', tipo: 'deudaPrestamos' }),
    ].join('')) : ''}

    <div class="grid-graficas">
      <div class="tarjeta">
        <div class="panel__encabezado"><div><h3>Spending this month</h3><p>Daily expenses and the running total</p></div></div>
        <div class="grafica-envoltura"><canvas id="grafica-mensual"></canvas></div>
      </div>
      <div class="tarjeta">
        <div class="panel__encabezado"><div><h3>Last 12 months</h3><p>Income against expenses</p></div></div>
        <div class="grafica-envoltura"><canvas id="grafica-anual"></canvas></div>
      </div>
    </div>
  `;

  vistaEl.querySelectorAll('[data-kpi]').forEach(card => {
    const abrir = () => abrirDesglose(card.dataset.kpi, ctx);
    card.addEventListener('click', abrir);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } });
  });

  await pintarGraficaMensual(mesActual);
  await pintarGraficaAnual();
}

/** Opens a small breakdown modal for the clicked figure, so the dashboard
 * is not just numbers — every figure explains itself on demand. */
async function abrirDesglose(tipo, ctx) {
  const filaSimple = (etiqueta, valor, clase = '') => `<div class="fila"><div class="fila__cuerpo"><div class="fila__titulo" style="font-weight:500;">${etiqueta}</div></div><div class="numero ${clase}">${valor}</div></div>`;
  const filaTotal = (etiqueta, valor, clase = '') => `<div class="fila" style="border-top:1px solid var(--linea-fuerte);"><div class="fila__cuerpo"><div class="fila__titulo">${etiqueta}</div></div><div class="numero ${clase}">${valor}</div></div>`;
  const sinDetalle = filaSimple('No details available', '—');
  let titulo = 'Breakdown', filas = '';

  if (tipo === 'ingresosMes') {
    titulo = 'This month’s income';
    const porCategoria = await consultar(
      `SELECT COALESCE(categoria,'income') categoria, COALESCE(SUM(monto),0) t, COUNT(*) n FROM transacciones WHERE fecha LIKE $1 AND ${SQL_ES_INGRESO} GROUP BY categoria ORDER BY t DESC`,
      [`${ctx.mesActual}%`]
    );
    filas = porCategoria.length
      ? porCategoria.map(c => filaSimple(`${escaparHTML(c.categoria === 'salario' ? 'Salary' : c.categoria === 'ingreso_extra' ? 'Extra income' : c.categoria)} (${c.n})`, formatoMoneda(c.t), 'positivo')).join('')
      : sinDetalle;
  } else if (tipo === 'gastosMes') {
    titulo = 'This month’s expenses';
    const porCategoria = await consultar(
      `SELECT categoria, COALESCE(SUM(monto),0) t, COUNT(*) n FROM gastos WHERE fecha LIKE $1 GROUP BY categoria ORDER BY t DESC`, [`${ctx.mesActual}%`]
    );
    const fijos = await consultar(
      `SELECT CASE WHEN tipo = 'pago_prestamo' THEN 'loans' ELSE 'bills' END grupo, COALESCE(SUM(monto),0) t, COUNT(*) n
       FROM transacciones WHERE fecha LIKE $1 AND ${SQL_ES_GASTO_FIJO} GROUP BY grupo ORDER BY t DESC`, [`${ctx.mesActual}%`]
    );
    filas = [
      ...porCategoria.map(c => filaSimple(`${etiquetaCategoriaGasto(c.categoria)} (${c.n})`, formatoMoneda(c.t), 'negativo')),
      ...fijos.map(f => filaSimple(`${f.grupo === 'loans' ? 'Loan payments' : 'Recurring bills paid'} (${f.n})`, formatoMoneda(f.t), 'negativo')),
    ].join('') || sinDetalle;
    if (porCategoria.length || fijos.length) filas += filaTotal('Total', formatoMoneda(ctx.totMesActual.gastos), 'negativo');
  } else if (tipo === 'ahorroMes') {
    titulo = 'Left over this month';
    filas = filaSimple('Income', formatoMoneda(ctx.totMesActual.ingresos), 'positivo')
      + filaSimple('Expenses', `− ${formatoMoneda(ctx.totMesActual.gastos)}`, 'negativo')
      + filaTotal('Left over', formatoMoneda(ctx.ahorroMes), ctx.ahorroMes >= 0 ? 'positivo' : 'negativo');
  } else if (tipo === 'pendienteRecurrente') {
    // Debt that isn't due yet (future card/loan installments) is
    // intentionally NOT listed here; see "Credit used" / loans for that.
    titulo = 'Still due this month';
    filas = ctx.pendienteDetalle.length
      ? ctx.pendienteDetalle.map(r => filaSimple(escaparHTML(r.nombre), formatoMoneda(r.restante), 'negativo')).join('') + filaTotal('Total', formatoMoneda(ctx.pendiente), 'negativo')
      : filaSimple('Nothing pending — every recurring payment is covered.', '—');
  } else if (tipo === 'creditoUsado' || tipo === 'creditoDisponible') {
    titulo = tipo === 'creditoUsado' ? 'Credit used' : 'Credit available';
    filas = ctx.tarjetasCredito.length
      ? ctx.tarjetasCredito.map(t => filaSimple(escaparHTML(t.nombre), formatoMoneda(tipo === 'creditoUsado' ? t.saldo : (t.limite || 0) - t.saldo), tipo === 'creditoUsado' ? 'negativo' : 'positivo')).join('')
      : sinDetalle;
  } else if (tipo === 'deudaPrestamos') {
    titulo = 'Total owed on loans';
    filas = ctx.prestamosActivos.length
      ? ctx.prestamosActivos.map(p => {
          const restantes = Math.max(0, p.plazo_meses - p.meses_pagados);
          return filaSimple(`${escaparHTML(p.nombre)} — ${p.meses_pagados}/${p.plazo_meses} payments (${restantes} left)`, formatoMoneda(p.saldo_actual), 'negativo');
        }).join('')
      : sinDetalle;
  } else if (tipo === 'proximoCorte' || tipo === 'proximoLimite') {
    titulo = tipo === 'proximoCorte' ? 'Next statement date' : 'Next payment due date';
    filas = ctx.tarjetasCredito.length
      ? ctx.tarjetasCredito.map(t => {
          const dia = tipo === 'proximoCorte' ? t.fecha_corte : t.fecha_limite_pago;
          const fecha = dia ? proximaFechaDia(dia) : null;
          return filaSimple(escaparHTML(t.nombre), fecha ? `${formatoFecha(fecha)} · ${textoDiasRestantes(fecha)}` : '—');
        }).join('')
      : sinDetalle;
  } else if (tipo === 'netWorth') {
    titulo = 'Net worth';
    const cuentas = await consultar(`SELECT nombre, banco, saldo FROM cuentas_debito ORDER BY saldo DESC`);
    filas = cuentas.map(c => filaSimple(etiquetaDeCuentaConBanco(c), formatoMoneda(c.saldo), c.saldo >= 0 ? 'positivo' : 'negativo')).join('')
      + filaSimple('Savings boxes', formatoMoneda(ctx.ahorrado), 'positivo')
      + (ctx.reservadoTC ? filaSimple('Reserved for card payments', formatoMoneda(ctx.reservadoTC), 'positivo') : '')
      + (ctx.invertido ? filaSimple('Investments', formatoMoneda(ctx.invertido), 'positivo') : '')
      + (ctx.creditoUtilizado ? filaSimple('Credit card debt', `− ${formatoMoneda(ctx.creditoUtilizado)}`, 'negativo') : '')
      + (ctx.deudaPrestamos ? filaSimple('Loans owed', `− ${formatoMoneda(ctx.deudaPrestamos)}`, 'negativo') : '')
      + filaTotal('Net worth', formatoMoneda(ctx.netWorth), ctx.netWorth >= 0 ? 'positivo' : 'negativo');
  }

  abrirModal(`<h3 class="modal__titulo">${titulo}</h3><div class="lista" style="margin-top:6px;">${filas}</div>
    <div class="modal__acciones"><button type="button" class="btn btn--fantasma" data-cerrar-modal>Close</button></div>`);
}

/** Current month: bars for each day's expenses (every day of the month is on
 * the axis, even at $0, so it reads like a calendar) plus a running total. */
async function pintarGraficaMensual(prefijo) {
  const filas = await consultar(
    `SELECT fecha, monto FROM gastos WHERE fecha LIKE $1
     UNION ALL
     SELECT fecha, monto FROM transacciones WHERE fecha LIKE $1 AND ${SQL_ES_GASTO_FIJO}`,
    [`${prefijo}%`]
  );
  const porDia = {};
  for (const f of filas) porDia[f.fecha] = (porDia[f.fecha] || 0) + f.monto;

  const [anio, mes] = prefijo.split('-').map(Number);
  const totalDias = diasEnMes(anio, mes);
  const diasDelMes = Array.from({ length: totalDias }, (_, i) => `${prefijo}-${String(i + 1).padStart(2, '0')}`);
  const diario = diasDelMes.map(d => porDia[d] || 0);
  let acumulado = 0;
  const acumuladoSerie = diario.map(v => (acumulado += v));
  const es = idioma() === 'es';
  const c = coloresTema();
  const opciones = opcionesBase();
  opciones.scales.y1 = { position: 'right', ticks: { ...opciones.scales.y.ticks }, grid: { display: false }, border: { display: false } };
  opciones.scales.x.ticks.maxTicksLimit = 10;

  graficaMensual?.destroy();
  graficaMensual = new Chart(document.getElementById('grafica-mensual'), {
    data: {
      labels: diasDelMes.map(d => Number(d.slice(8))),
      datasets: [
        { type: 'bar', label: es ? 'Gasto del día' : 'Spent that day', data: diario, backgroundColor: conAlfa(c.tinta2, 0.75), hoverBackgroundColor: c.tinta, order: 2, borderRadius: 2, maxBarThickness: 14 },
        { type: 'line', label: es ? 'Acumulado del mes' : 'Running total', data: acumuladoSerie, borderColor: c.perdida, borderWidth: 2, backgroundColor: conAlfa(c.perdida, 0.08), tension: .3, fill: true, yAxisID: 'y1', order: 1, pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: c.perdida },
      ],
    },
    options: opciones,
  });
}

async function pintarGraficaAnual() {
  const meses = ultimosMeses(12);
  const gastos = [], ingresos = [];
  for (const m of meses) {
    const t = await totalesMes(m);
    gastos.push(t.gastos); ingresos.push(t.ingresos);
  }
  const es = idioma() === 'es';
  const c = coloresTema();
  graficaAnual?.destroy();
  graficaAnual = new Chart(document.getElementById('grafica-anual'), {
    type: 'bar',
    data: {
      labels: meses.map(m => etiquetaMesCorta(m, idioma())),
      datasets: [
        { label: es ? 'Ingresos' : 'Income', data: ingresos, backgroundColor: conAlfa(c.ganancia, 0.85), borderRadius: 2, maxBarThickness: 12 },
        { label: es ? 'Gastos' : 'Expenses', data: gastos, backgroundColor: conAlfa(c.perdida, 0.8), borderRadius: 2, maxBarThickness: 12 },
      ],
    },
    options: opcionesBase(),
  });
}
