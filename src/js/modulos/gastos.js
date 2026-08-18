import { consultar, ejecutar } from '../db.js';
import { registrarGasto, revertirTransaccion } from '../ledger.js';
import { formatoMoneda, formatoFecha, hoyISO, activarInputMoneda, valorNumericoDeInputMoneda } from '../formato.js';
import { icono } from '../iconos.js';
import { abrirModal, marcarError, limpiarError } from '../ui.js';
import { mostrarToast } from '../toasts.js';
import { confirmarYEliminar, delegarClicEliminar } from '../eliminar.js';
import { idioma } from '../i18n.js';

const CATEGORIAS = [
  { valor: 'hormiga', etiqueta: 'Small daily spend' },
  { valor: 'variable', etiqueta: 'Variable' },
  { valor: 'importante', etiqueta: 'Important' },
  { valor: 'compras', etiqueta: 'Shopping' },
];

let expensesChart; // Chart.js instance for the last-6-months expenses chart

export async function render(vistaEl) {
  const cuentas = await consultar(`SELECT id, nombre FROM cuentas_debito`);
  const tarjetas = await consultar(`SELECT id, nombre FROM tarjetas WHERE tipo = 'credito'`);
  const filtro = vistaEl.dataset.filtroCategoria || '';
  const gastosLista = await consultar(
    filtro ? `SELECT * FROM gastos WHERE categoria = $1 ORDER BY fecha DESC LIMIT 60` : `SELECT * FROM gastos ORDER BY fecha DESC LIMIT 60`,
    filtro ? [filtro] : []
  );
  const prefijoMes = hoyISO().slice(0, 7);
  const totalMes = await consultar(`SELECT COALESCE(SUM(monto),0) AS t FROM gastos WHERE fecha LIKE $1`, [`${prefijoMes}%`]);
  const porCategoria = await consultar(
    `SELECT categoria, COALESCE(SUM(monto),0) AS total, COUNT(*) AS n FROM gastos WHERE fecha LIKE $1 GROUP BY categoria ORDER BY total DESC`,
    [`${prefijoMes}%`]
  );

  vistaEl.innerHTML = `
    <div class="vista__encabezado">
      <div><h1>Expenses</h1><p>Total this month: <span class="numero negativo">${formatoMoneda(totalMes[0].t)}</span></p></div>
      <button class="btn btn--primario" id="btn-nuevo-gasto">${icono('masa')} New expense</button>
    </div>
    <div class="tarjeta" style="margin-bottom:14px; display:flex; gap:8px; align-items:center;">
      ${icono('filtro')}
      <select class="campo__control" id="filtro-categoria" style="max-width:220px;">
        <option value="">All categories</option>
        ${CATEGORIAS.map(c => `<option value="${c.valor}" ${filtro===c.valor?'selected':''}>${c.etiqueta}</option>`).join('')}
      </select>
    </div>
    ${porCategoria.length ? `
    <div class="tarjeta" style="margin-bottom:14px;">
      <h3>Total spent this month by category</h3>
      <table class="tabla-mini">
        <thead><tr><th>Category</th><th># entries</th><th style="text-align:right;">Total</th></tr></thead>
        <tbody>
          ${porCategoria.map(c => `<tr><td>${c.categoria || 'no category'}</td><td>${c.n}</td><td style="text-align:right;" class="numero negativo">${formatoMoneda(c.total)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>` : ''}
    <div class="tarjeta"><div class="lista" id="lista-gastos"></div></div>
    <div class="tarjeta" style="margin-top:14px;">
      <h3>Last 6 months</h3>
      <canvas id="grafica-gastos-6m" height="160"></canvas>
    </div>
  `;

  vistaEl.querySelector('#lista-gastos').innerHTML = gastosLista.length
    ? gastosLista.map(g => filaGasto(g)).join('')
    : `<div class="estado-vacio">${icono('vacio')}<h3>No expenses yet</h3><p>Register your first expense to start seeing your monthly behavior.</p></div>`;

  vistaEl.querySelector('#btn-nuevo-gasto').addEventListener('click', () => abrirModalGasto({ cuentas, tarjetas }, () => render(vistaEl)));
  vistaEl.querySelector('#filtro-categoria').addEventListener('change', (e) => { vistaEl.dataset.filtroCategoria = e.target.value; render(vistaEl); });

  const lista = vistaEl.querySelector('#lista-gastos');
  delegarClicEliminar(lista, '.btn-eliminar', (id) => confirmarYEliminar({
    mensaje: 'This expense will be deleted and the balance of the affected account/card will be reverted.',
    accion: async () => {
      const tx = await consultar(`SELECT * FROM transacciones WHERE ref_tabla='gastos' AND ref_id=$1 ORDER BY id DESC`, [id]);
      for (const t of tx) await revertirTransaccion(t);
      // Delete the auto-generated recurring row that sincronizarMensualidadesTC
      // created for this MSI purchase (if any) BEFORE deleting the expense —
      // otherwise it becomes orphaned (its gasto_id points to nothing) and
      // keeps counting toward "pending to pay" forever, which is what was
      // causing the duplicated/ghost totals after deleting an expense.
      await ejecutar(`DELETE FROM recurrentes WHERE gasto_id = $1`, [id]);
      await ejecutar(`DELETE FROM gastos WHERE id = $1`, [id]);
    },
    alExito: () => render(vistaEl),
  }));

  lista.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-editar');
    if (!btn) return;
    const g = gastosLista.find(x => String(x.id) === String(btn.dataset.id));
    abrirModalEditarGasto(g, () => render(vistaEl));
  });

  await pintarGraficaGastos6Meses();
}

/** Renders a bar chart with total expenses for each of the last 6 months,
 * reusing the same Chart.js pattern as dashboard.js (pintarGraficaAnual). */
async function pintarGraficaGastos6Meses() {
  const meses = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - (5 - i));
    return d.toISOString().slice(0, 7);
  });
  const totales = [];
  for (const m of meses) {
    const fila = await consultar(`SELECT COALESCE(SUM(monto),0) AS t FROM gastos WHERE fecha LIKE $1`, [`${m}%`]);
    totales.push(fila[0]?.t || 0);
  }
  const canvas = document.getElementById('grafica-gastos-6m');
  if (!canvas) return;
  expensesChart?.destroy();
  expensesChart = new Chart(canvas, {
    type: 'bar',
    data: { labels: meses.map(m => m.slice(5)), datasets: [{ label: idioma() === 'es' ? 'Gastos' : 'Expenses', data: totales, backgroundColor: '#f87171' }] },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#9aa7b3' } } },
      scales: {
        x: { ticks: { color: '#6b7684' }, grid: { color: '#1b232c' } },
        y: { ticks: { color: '#6b7684' }, grid: { color: '#1b232c' } },
      },
    },
  });
}

/** Lightweight edit: name/category/date/notes only. The amount is not editable
 * here because it already generated a transaction in the ledger — to fix an
 * amount, delete the expense (reverts the balance) and create it again with
 * the correct amount. */
function abrirModalEditarGasto(g, alGuardar) {
  const { overlay, cerrar } = abrirModal(`
    <h3 class="modal__titulo">Edit expense</h3>
    <p style="margin-bottom:16px; font-size:12.5px;">The amount isn't editable here to avoid throwing off your history: if the amount is wrong, delete the expense (reverts the balance) and register it again.</p>
    <form id="form-editar-gasto">
      <div class="campo"><label class="campo__etiqueta">Name</label><input class="campo__control" name="nombre" required value="${g.nombre}" /><div class="campo__error"></div></div>
      <div class="campo__fila">
        <div class="campo"><label class="campo__etiqueta">Category</label>
          <select class="campo__control" name="categoria">${CATEGORIAS.map(c => `<option value="${c.valor}" ${g.categoria===c.valor?'selected':''}>${c.etiqueta}</option>`).join('')}</select>
        </div>
        <div class="campo"><label class="campo__etiqueta">Date</label><input class="campo__control" type="date" name="fecha" value="${g.fecha}" /></div>
      </div>
      <div class="campo"><label class="campo__etiqueta">Notes</label><input class="campo__control" name="notas" value="${g.notas || ''}" /></div>
      <div class="modal__acciones">
        <button type="button" class="btn btn--fantasma" data-cerrar-modal>Cancel</button>
        <button type="submit" class="btn btn--primario">Save changes</button>
      </div>
    </form>`);
  const form = overlay.querySelector('#form-editar-gasto');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.nombre.value.trim()) return;
    try {
      await ejecutar(`UPDATE gastos SET nombre=$1, categoria=$2, fecha=$3, notas=$4 WHERE id=$5`,
        [form.nombre.value.trim(), form.categoria.value, form.fecha.value, form.notas.value.trim() || null, g.id]);
      mostrarToast('Expense updated', 'exito'); cerrar(); alGuardar();
    } catch (err) { console.error(err); mostrarToast('Could not update', 'error'); }
  });
}

function filaGasto(g) {
  const detalleInteres = !g.es_msi && g.tasa_interes > 0
    ? ` · +${g.tasa_interes}% interest (base ${formatoMoneda(g.monto_base ?? g.monto)})`
    : '';
  return `
    <div class="fila" data-id="${g.id}">
      <div class="fila__icono">${icono('gasto')}</div>
      <div class="fila__cuerpo">
        <div class="fila__titulo">${g.nombre}</div>
        <div class="fila__meta">${formatoFecha(g.fecha)} · ${g.categoria} · ${g.metodo_pago === 'tarjeta' ? 'Card' : 'Debit'}${g.es_msi ? ` · Installments ${g.msi_meses}m (${formatoMoneda(g.msi_monto_por_corte || 0)} each, ${g.msi_periodicidad === 'quincenal' ? 'biweekly' : 'monthly'})` : detalleInteres}</div>
      </div>
      <div class="numero negativo">${formatoMoneda(g.monto)}</div>
      <div class="fila__acciones">
        <button class="btn-icono btn-editar" data-id="${g.id}">${icono('editar')}</button>
        <button class="btn-icono peligro btn-eliminar" data-id="${g.id}">${icono('eliminar')}</button>
      </div>
    </div>`;
}

export function abrirModalGasto({ cuentas, tarjetas }, alGuardar) {
  const { overlay, cerrar } = abrirModal(`
    <h3 class="modal__titulo">New expense</h3>
    <form id="form-gasto">
      <div class="campo"><label class="campo__etiqueta">Name</label><input class="campo__control" name="nombre" required /><div class="campo__error"></div></div>
      <div class="campo__fila">
        <div class="campo"><label class="campo__etiqueta">Category</label>
          <select class="campo__control" name="categoria">${CATEGORIAS.map(c => `<option value="${c.valor}">${c.etiqueta}</option>`).join('')}</select>
        </div>
        <div class="campo"><label class="campo__etiqueta">Date</label><input class="campo__control" type="date" name="fecha" value="${hoyISO()}" /></div>
      </div>
      <div class="campo"><label class="campo__etiqueta">Amount</label><input class="campo__control" name="monto" inputmode="decimal" placeholder="0.00" required /><div class="campo__error"></div></div>
      <div class="campo"><label class="campo__etiqueta">How was it paid?</label>
        <select class="campo__control" name="metodo_pago"><option value="debito">Debit</option><option value="tarjeta">Credit card</option></select>
      </div>
      <div class="campo" id="campo-debito"><label class="campo__etiqueta">Account</label>
        <select class="campo__control" name="cuenta_debito_id">${cuentas.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')}</select>
      </div>
      <div class="campo" id="campo-tarjeta" style="display:none;"><label class="campo__etiqueta">Card</label>
        <select class="campo__control" name="tarjeta_id">${tarjetas.map(t => `<option value="${t.id}">${t.nombre}</option>`).join('')}</select>
      </div>
      <div class="campo" id="campo-msi" style="display:none;">
        <label class="campo__etiqueta"><input type="checkbox" name="es_msi" /> Interest-free installment purchase</label>
        <div class="campo__fila" style="margin-top:8px;">
          <input class="campo__control" name="msi_meses" type="number" min="2" placeholder="Number of months" />
          <select class="campo__control" name="msi_periodicidad">
            <option value="mensual">Charge monthly</option>
            <option value="quincenal">Split biweekly</option>
          </select>
        </div>
        <p id="msi-preview" style="font-size:12px; margin-top:6px;"></p>
      </div>
      <div class="campo" id="campo-interes" style="display:none;">
        <label class="campo__etiqueta">Interest rate charged on this purchase (%) — leave 0 if none</label>
        <input class="campo__control" name="tasa_interes" type="number" step="0.01" min="0" placeholder="0" />
        <p id="interes-preview" style="font-size:12px; margin-top:6px;"></p>
      </div>
      <div class="campo"><label class="campo__etiqueta">Notes (optional)</label><input class="campo__control" name="notas" /></div>
      <div class="modal__acciones">
        <button type="button" class="btn btn--fantasma" data-cerrar-modal>Cancel</button>
        <button type="submit" class="btn btn--primario">Save</button>
      </div>
    </form>
  `);

  const form = overlay.querySelector('#form-gasto');
  activarInputMoneda(form.monto);
  const selMetodo = form.metodo_pago;

  // MSI (interest-free installments) and a flat interest rate are mutually
  // exclusive on the same purchase — MSI means "no interest" by definition.
  const actualizar = () => {
    const esTarjeta = selMetodo.value === 'tarjeta';
    form.querySelector('#campo-debito').style.display = esTarjeta ? 'none' : 'block';
    form.querySelector('#campo-tarjeta').style.display = esTarjeta ? 'block' : 'none';
    form.querySelector('#campo-msi').style.display = esTarjeta ? 'block' : 'none';
    form.querySelector('#campo-interes').style.display = esTarjeta && !form.es_msi.checked ? 'block' : 'none';
    if (!esTarjeta) { form.es_msi.checked = false; form.tasa_interes.value = ''; }
  };
  selMetodo.addEventListener('change', actualizar);
  form.es_msi.addEventListener('change', actualizar);
  actualizar();

  // Preview of how much is charged per statement based on the chosen term
  // and frequency. E.g. $6,000 in 3 interest-free installments split
  // biweekly = 6 statements of $1,000 each every two weeks.
  const actualizarPreviewMSI = () => {
    const preview = overlay.querySelector('#msi-preview');
    const montoTotal = valorNumericoDeInputMoneda(form.monto);
    const meses = Number(form.msi_meses.value) || 0;
    if (!form.es_msi.checked || !montoTotal || !meses) { preview.textContent = ''; return; }
    const cortesPorMes = form.msi_periodicidad.value === 'quincenal' ? 2 : 1;
    const totalCortes = meses * cortesPorMes;
    const montoPorCorte = Math.round((montoTotal / totalCortes) * 100) / 100;
    preview.textContent = `${totalCortes} payments of ${formatoMoneda(montoPorCorte)} every ${form.msi_periodicidad.value === 'quincenal' ? 'two weeks' : 'month'}.`;
  };
  // Preview of the final amount posted to the card once interest is added.
  const actualizarPreviewInteres = () => {
    const preview = overlay.querySelector('#interes-preview');
    const montoTotal = valorNumericoDeInputMoneda(form.monto);
    const tasa = Number(form.tasa_interes.value) || 0;
    if (form.es_msi.checked || !montoTotal || !tasa) { preview.textContent = ''; return; }
    const montoFinal = Math.round(montoTotal * (1 + tasa / 100) * 100) / 100;
    preview.textContent = `With ${tasa}% interest, ${formatoMoneda(montoFinal)} will be charged to the card (base ${formatoMoneda(montoTotal)}).`;
  };
  ['input', 'change'].forEach(ev => {
    form.monto.addEventListener(ev, actualizarPreviewMSI);
    form.msi_meses.addEventListener(ev, actualizarPreviewMSI);
    form.msi_periodicidad.addEventListener(ev, actualizarPreviewMSI);
    form.es_msi.addEventListener(ev, actualizarPreviewMSI);
    form.monto.addEventListener(ev, actualizarPreviewInteres);
    form.tasa_interes.addEventListener(ev, actualizarPreviewInteres);
    form.es_msi.addEventListener(ev, actualizarPreviewInteres);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const campoNombre = form.nombre.closest('.campo');
    const campoMonto = form.monto.closest('.campo');
    limpiarError(campoNombre); limpiarError(campoMonto);
    const montoBase = valorNumericoDeInputMoneda(form.monto);
    let valido = true;
    if (!form.nombre.value.trim()) { marcarError(campoNombre, 'Enter a name'); valido = false; }
    if (!montoBase || montoBase <= 0) { marcarError(campoMonto, 'Enter a valid amount'); valido = false; }
    if (!valido) return;

    const esTarjeta = selMetodo.value === 'tarjeta';
    if (esTarjeta && tarjetas.length === 0) { mostrarToast('Register a credit card first', 'error'); return; }
    if (!esTarjeta && cuentas.length === 0) { mostrarToast('Register a debit account first', 'error'); return; }

    const esMSI = esTarjeta && form.es_msi.checked;
    const meses = esMSI ? Number(form.msi_meses.value) || 1 : null;
    const periodicidadMSI = esMSI ? form.msi_periodicidad.value : null;
    const cortesPorMes = periodicidadMSI === 'quincenal' ? 2 : 1;
    const totalCortes = esMSI ? meses * cortesPorMes : null;

    // Interest only applies to non-MSI card purchases. The amount actually
    // posted to the card (montoFinal) includes it; montoBase is kept
    // separately so history/edit screens can still show what was bought
    // for vs. what it ended up costing.
    const tasaInteres = esTarjeta && !esMSI ? (Number(form.tasa_interes.value) || 0) : 0;
    const montoFinal = tasaInteres > 0 ? Math.round(montoBase * (1 + tasaInteres / 100) * 100) / 100 : montoBase;
    const montoPorCorte = esMSI ? Math.round((montoFinal / totalCortes) * 100) / 100 : null;

    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.classList.add('btn--carga');
    try {
      const res = await ejecutar(
        `INSERT INTO gastos (nombre, categoria, fecha, monto, notas, metodo_pago, tarjeta_id, cuenta_debito_id, es_msi, msi_meses, reservado_tc, msi_periodicidad, msi_monto_por_corte, tasa_interes, monto_base)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [form.nombre.value.trim(), form.categoria.value, form.fecha.value || hoyISO(), montoFinal, form.notas.value.trim() || null,
         selMetodo.value, esTarjeta ? Number(form.tarjeta_id.value) : null, !esTarjeta ? Number(form.cuenta_debito_id.value) : null,
         esMSI ? 1 : 0, meses, 0, periodicidadMSI, montoPorCorte, tasaInteres, montoBase]
      );
      // Note: the full debt ($montoFinal, already including interest if any)
      // is posted to the card all at once (that's how a real installment
      // plan works: the store charges the bank the full amount from day 1).
      // msi_monto_por_corte is kept as a reference for how much to set aside
      // each statement to cover it, but it doesn't generate future automatic
      // charges by itself.
      await registrarGasto({
        gastoId: res.lastInsertId,
        cuentaDebitoId: !esTarjeta ? Number(form.cuenta_debito_id.value) : (cuentas[0]?.id ?? null),
        tarjetaId: esTarjeta ? Number(form.tarjeta_id.value) : null,
        metodoPago: selMetodo.value,
        monto: montoFinal,
        categoria: form.categoria.value,
        notas: form.nombre.value.trim(),
        fecha: form.fecha.value || hoyISO(),
      });
      mostrarToast('Expense registered', 'exito');
      cerrar();
      alGuardar();
    } catch (err) {
      console.error(err);
      mostrarToast('Could not save the expense', 'error');
      btn.disabled = false; btn.classList.remove('btn--carga');
    }
  });
}

/** "Small daily expense in under 3 clicks" flow triggered from the floating FAB. */
export async function abrirModalGastoRapido(alGuardar) {
  const cuentas = await consultar(`SELECT id, nombre FROM cuentas_debito`);
  if (cuentas.length === 0) { mostrarToast('Register a debit account first', 'error'); return; }
  const cuentaId = cuentas[0].id;

  const { overlay, cerrar } = abrirModal(`
    <h3 class="modal__titulo">Quick small expense</h3>
    <form id="form-rapido">
      <div class="campo"><label class="campo__etiqueta">What for?</label><input class="campo__control" name="nombre" autofocus required /><div class="campo__error"></div></div>
      <div class="campo"><label class="campo__etiqueta">Amount</label><input class="campo__control" name="monto" inputmode="decimal" placeholder="0.00" required /><div class="campo__error"></div></div>
      <div class="modal__acciones">
        <button type="button" class="btn btn--fantasma" data-cerrar-modal>Cancel</button>
        <button type="submit" class="btn btn--primario">Register</button>
      </div>
    </form>
  `);
  const form = overlay.querySelector('#form-rapido');
  activarInputMoneda(form.monto);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const campoMonto = form.monto.closest('.campo');
    limpiarError(campoMonto);
    const monto = valorNumericoDeInputMoneda(form.monto);
    if (!monto || monto <= 0) { marcarError(campoMonto, 'Enter a valid amount'); return; }
    try {
      const res = await ejecutar(
        `INSERT INTO gastos (nombre, categoria, fecha, monto, metodo_pago, cuenta_debito_id) VALUES ($1,'hormiga',$2,$3,'debito',$4)`,
        [form.nombre.value.trim(), hoyISO(), monto, cuentaId]
      );
      await registrarGasto({ gastoId: res.lastInsertId, cuentaDebitoId: cuentaId, metodoPago: 'debito', monto, categoria: 'hormiga', notas: form.nombre.value.trim(), fecha: hoyISO() });
      mostrarToast('Small expense registered', 'exito');
      cerrar();
      alGuardar?.();
    } catch (err) {
      console.error(err);
      mostrarToast('Could not register', 'error');
    }
  });
}