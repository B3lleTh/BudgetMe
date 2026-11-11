import { etiquetaDeCuentaConBanco, CATEGORIAS_GASTO, etiquetaCategoriaGasto } from '../etiquetas.js';
import { consultar, ejecutar } from '../db.js';
import { registrarGasto, revertirTransaccion } from '../ledger.js';
import { formatoMoneda, formatoFecha, hoyISO, prefijoMes, ultimosMeses, etiquetaMesCorta, activarInputMoneda, valorNumericoDeInputMoneda, escaparHTML } from '../formato.js';
import { icono } from '../iconos.js';
import { abrirModal, marcarError, limpiarError, conBotonOcupado } from '../ui.js';
import { mostrarToast } from '../toasts.js';
import { confirmarYEliminar, delegarClicEliminar } from '../eliminar.js';
import { idioma } from '../i18n.js';
import { coloresTema, graficaBarrasPorMes } from '../graficas.js';

let expensesChart; // Chart.js instance for the last-6-months expenses chart
// Vive en el módulo (no en vistaEl.dataset, que comparten todas las vistas).
let filtroCategoria = '';

export async function render(vistaEl) {
  const cuentas = await consultar(`SELECT id, nombre, banco FROM cuentas_debito`);
  const tarjetas = await consultar(`SELECT id, nombre, banco FROM tarjetas WHERE tipo = 'credito'`);
  const gastosLista = await consultar(
    filtroCategoria ? `SELECT * FROM gastos WHERE categoria = $1 ORDER BY fecha DESC, id DESC LIMIT 60` : `SELECT * FROM gastos ORDER BY fecha DESC, id DESC LIMIT 60`,
    filtroCategoria ? [filtroCategoria] : []
  );
  const prefijo = prefijoMes(0);
  const [totalMes] = await consultar(`SELECT COALESCE(SUM(monto),0) AS t FROM gastos WHERE fecha LIKE $1`, [`${prefijo}%`]);
  const porCategoria = await consultar(
    `SELECT categoria, COALESCE(SUM(monto),0) AS total, COUNT(*) AS n FROM gastos WHERE fecha LIKE $1 GROUP BY categoria ORDER BY total DESC`,
    [`${prefijo}%`]
  );

  vistaEl.innerHTML = `
    <div class="vista__encabezado">
      <div><h1>Expenses</h1><p>Everything you buy, paid with debit or a credit card. This month: <span class="numero negativo">${formatoMoneda(totalMes.t)}</span></p></div>
      <div class="vista__acciones"><button class="btn btn--primario" id="btn-nuevo-gasto">${icono('masa')} New expense</button></div>
    </div>

    ${porCategoria.length ? `
    <div class="grid-kpis">
      ${porCategoria.map(c => `
        <div class="tarjeta">
          <div class="kpi__etiqueta">${etiquetaCategoriaGasto(c.categoria)}</div>
          <div class="kpi__valor numero">${formatoMoneda(c.total)}</div>
          <div class="kpi__nota">${c.n} ${c.n === 1 ? 'entry' : 'entries'} · ${Math.round((c.total / (totalMes.t || 1)) * 100)}% of the month</div>
        </div>`).join('')}
    </div>` : ''}

    <div class="tarjeta seccion">
      <div class="panel__encabezado">
        <h3>Recent expenses</h3>
        <div class="filtros" style="margin:0;">
          ${icono('filtro')}
          <select class="campo__control" id="filtro-categoria" aria-label="Filter by category">
            <option value="">All categories</option>
            ${CATEGORIAS_GASTO.map(c => `<option value="${c.valor}" ${filtroCategoria === c.valor ? 'selected' : ''}>${c.etiqueta}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="lista" id="lista-gastos"></div>
    </div>

    <div class="tarjeta">
      <div class="panel__encabezado"><div><h3>Last 6 months</h3><p>Total expenses registered per month</p></div></div>
      <div class="grafica-envoltura grafica-envoltura--baja"><canvas id="grafica-gastos-6m"></canvas></div>
    </div>
  `;

  vistaEl.querySelector('#lista-gastos').innerHTML = gastosLista.length
    ? gastosLista.map(g => filaGasto(g)).join('')
    : `<div class="estado-vacio">${icono('vacio')}<h3>No expenses yet</h3><p>Register your first expense to start seeing your monthly behavior.</p></div>`;

  vistaEl.querySelector('#btn-nuevo-gasto').addEventListener('click', () => abrirModalGasto({ cuentas, tarjetas }, () => render(vistaEl)));
  vistaEl.querySelector('#filtro-categoria').addEventListener('change', (e) => { filtroCategoria = e.target.value; render(vistaEl); });

  const lista = vistaEl.querySelector('#lista-gastos');
  delegarClicEliminar(lista, '.btn-eliminar', (id) => confirmarYEliminar({
    mensaje: 'This expense will be deleted and the balance of the affected account/card will be reverted.',
    accion: async () => {
      const tx = await consultar(`SELECT * FROM transacciones WHERE ref_tabla='gastos' AND ref_id=$1 ORDER BY id DESC`, [id]);
      for (const t of tx) await revertirTransaccion(t);
      // Delete the auto-generated recurring row of an MSI purchase BEFORE the
      // expense, or it stays orphaned and keeps counting as "due this month".
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

async function pintarGraficaGastos6Meses() {
  const meses = ultimosMeses(6);
  const totales = [];
  for (const m of meses) {
    const [fila] = await consultar(`SELECT COALESCE(SUM(monto),0) AS t FROM gastos WHERE fecha LIKE $1`, [`${m}%`]);
    totales.push(fila?.t || 0);
  }
  const canvas = document.getElementById('grafica-gastos-6m');
  if (!canvas) return;
  expensesChart?.destroy();
  expensesChart = graficaBarrasPorMes(canvas, {
    etiquetas: meses.map(m => etiquetaMesCorta(m, idioma())),
    valores: totales,
    nombreSerie: idioma() === 'es' ? 'Gastos' : 'Expenses',
    color: coloresTema().perdida,
  });
}

/** Lightweight edit: name/category/date/notes only. The amount is not editable
 * here because it already generated a transaction in the ledger — to fix an
 * amount, delete the expense (reverts the balance) and create it again. */
function abrirModalEditarGasto(g, alGuardar) {
  const { overlay, cerrar } = abrirModal(`
    <h3 class="modal__titulo">Edit expense</h3>
    <p class="modal__subtitulo">The amount isn’t editable here to avoid throwing off your history: if the amount is wrong, delete the expense (reverts the balance) and register it again.</p>
    <form id="form-editar-gasto">
      <div class="campo"><label class="campo__etiqueta">Name</label><input class="campo__control" name="nombre" required value="${escaparHTML(g.nombre)}" /><div class="campo__error"></div></div>
      <div class="campo__fila">
        <div class="campo"><label class="campo__etiqueta">Category</label>
          <select class="campo__control" name="categoria">${CATEGORIAS_GASTO.map(c => `<option value="${c.valor}" ${g.categoria === c.valor ? 'selected' : ''}>${c.etiqueta}</option>`).join('')}</select>
        </div>
        <div class="campo"><label class="campo__etiqueta">Date</label><input class="campo__control" type="date" name="fecha" value="${g.fecha}" /></div>
      </div>
      <div class="campo"><label class="campo__etiqueta">Notes</label><input class="campo__control" name="notas" value="${escaparHTML(g.notas || '')}" /></div>
      <div class="modal__acciones">
        <button type="button" class="btn btn--fantasma" data-cerrar-modal>Cancel</button>
        <button type="submit" class="btn btn--primario">Save changes</button>
      </div>
    </form>`);
  const form = overlay.querySelector('#form-editar-gasto');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const campoNombre = form.nombre.closest('.campo');
    limpiarError(campoNombre);
    if (!form.nombre.value.trim()) { marcarError(campoNombre, 'Enter a name'); return; }
    await conBotonOcupado(form.querySelector('button[type=submit]'), async () => {
      try {
        const fecha = form.fecha.value || g.fecha;
        await ejecutar(`UPDATE gastos SET nombre=$1, categoria=$2, fecha=$3, notas=$4 WHERE id=$5`,
          [form.nombre.value.trim(), form.categoria.value, fecha, form.notas.value.trim() || null, g.id]);
        // El movimiento del historial sigue al gasto (antes conservaba la fecha vieja).
        await ejecutar(`UPDATE transacciones SET fecha=$1, categoria=$2, notas=$3 WHERE ref_tabla='gastos' AND ref_id=$4`,
          [fecha, form.categoria.value, form.nombre.value.trim(), g.id]);
        mostrarToast('Expense updated', 'exito'); cerrar(); alGuardar();
      } catch (err) { console.error(err); mostrarToast('Could not update', 'error'); }
    });
  });
}

function filaGasto(g) {
  const conTarjeta = g.metodo_pago === 'tarjeta';
  const detalle = g.es_msi
    ? `${g.msi_meses} interest-free installments of ${formatoMoneda(g.msi_monto_por_corte || 0)} (${g.msi_periodicidad === 'quincenal' ? 'biweekly' : 'monthly'})`
    : g.tasa_interes > 0 ? `+${g.tasa_interes}% interest on ${formatoMoneda(g.monto_base ?? g.monto)}` : '';
  return `
    <div class="fila" data-id="${g.id}">
      <div class="fila__icono">${icono(conTarjeta ? 'tarjeta' : 'banco')}</div>
      <div class="fila__cuerpo">
        <div class="fila__titulo">${escaparHTML(g.nombre)}</div>
        <div class="fila__meta">${formatoFecha(g.fecha)} · ${etiquetaCategoriaGasto(g.categoria)} · ${conTarjeta ? 'Credit card' : 'Debit'}${detalle ? ` · ${detalle}` : ''}</div>
      </div>
      <div class="numero negativo">${formatoMoneda(g.monto)}</div>
      <div class="fila__acciones">
        <button class="btn-icono btn-editar" data-id="${g.id}" title="Edit" aria-label="Edit">${icono('editar')}</button>
        <button class="btn-icono peligro btn-eliminar" data-id="${g.id}" title="Delete" aria-label="Delete">${icono('eliminar')}</button>
      </div>
    </div>`;
}

export function abrirModalGasto({ cuentas, tarjetas }, alGuardar) {
  const { overlay, cerrar } = abrirModal(`
    <h3 class="modal__titulo">New expense</h3>
    <p class="modal__subtitulo">It’s taken from the account or added to the card right away.</p>
    <form id="form-gasto">
      <div class="campo"><label class="campo__etiqueta">Name</label><input class="campo__control" name="nombre" required /><div class="campo__error"></div></div>
      <div class="campo__fila">
        <div class="campo"><label class="campo__etiqueta">Amount</label><input class="campo__control" name="monto" inputmode="decimal" placeholder="0.00" required /><div class="campo__error"></div></div>
        <div class="campo"><label class="campo__etiqueta">Date</label><input class="campo__control" type="date" name="fecha" value="${hoyISO()}" /></div>
      </div>
      <div class="campo__fila">
        <div class="campo"><label class="campo__etiqueta">Category</label>
          <select class="campo__control" name="categoria">${CATEGORIAS_GASTO.map(c => `<option value="${c.valor}">${c.etiqueta}</option>`).join('')}</select>
        </div>
        <div class="campo"><label class="campo__etiqueta">How was it paid?</label>
          <select class="campo__control" name="metodo_pago"><option value="debito">Debit</option><option value="tarjeta">Credit card</option></select>
        </div>
      </div>
      <div class="campo" id="campo-debito"><label class="campo__etiqueta">Account</label>
        <select class="campo__control" name="cuenta_debito_id">${cuentas.map(c => `<option value="${c.id}">${etiquetaDeCuentaConBanco(c)}</option>`).join('')}</select>
      </div>
      <div class="campo" id="campo-tarjeta" style="display:none;"><label class="campo__etiqueta">Card</label>
        <select class="campo__control" name="tarjeta_id">${tarjetas.map(t => `<option value="${t.id}">${etiquetaDeCuentaConBanco(t)}</option>`).join('')}</select>
      </div>
      <div class="campo" id="campo-msi" style="display:none;">
        <label class="campo__etiqueta"><input type="checkbox" name="es_msi" /> Interest-free installment purchase</label>
        <div class="campo__fila" id="msi-detalle" style="margin-top:8px;">
          <div class="campo" style="margin:0;"><input class="campo__control" name="msi_meses" type="number" min="2" placeholder="Number of months" aria-label="Number of months" /><div class="campo__error"></div></div>
          <select class="campo__control" name="msi_periodicidad" aria-label="Charge frequency">
            <option value="mensual">Charge monthly</option>
            <option value="quincenal">Split biweekly</option>
          </select>
        </div>
        <p id="msi-preview" class="campo__vista-previa"></p>
      </div>
      <div class="campo" id="campo-interes" style="display:none;">
        <label class="campo__etiqueta">Interest rate charged on this purchase (%) — leave 0 if none</label>
        <input class="campo__control" name="tasa_interes" type="number" step="0.01" min="0" placeholder="0" />
        <p id="interes-preview" class="campo__vista-previa"></p>
      </div>
      <div class="campo"><label class="campo__etiqueta">Notes (optional)</label><input class="campo__control" name="notas" /></div>
      <div class="modal__acciones">
        <button type="button" class="btn btn--fantasma" data-cerrar-modal>Cancel</button>
        <button type="submit" class="btn btn--primario">Save expense</button>
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
    form.querySelector('#msi-detalle').style.display = form.es_msi.checked ? 'flex' : 'none';
    form.querySelector('#campo-interes').style.display = esTarjeta && !form.es_msi.checked ? 'block' : 'none';
    if (!esTarjeta) { form.es_msi.checked = false; form.tasa_interes.value = ''; }
  };
  selMetodo.addEventListener('change', actualizar);
  form.es_msi.addEventListener('change', actualizar);
  actualizar();

  // E.g. $6,000 in 3 interest-free installments split biweekly = 6 payments of $1,000.
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
  const actualizarPreviewInteres = () => {
    const preview = overlay.querySelector('#interes-preview');
    const montoTotal = valorNumericoDeInputMoneda(form.monto);
    const tasa = Number(form.tasa_interes.value) || 0;
    if (form.es_msi.checked || !montoTotal || !tasa) { preview.textContent = ''; return; }
    const montoFinal = Math.round(montoTotal * (1 + tasa / 100) * 100) / 100;
    preview.textContent = `With ${tasa}% interest, ${formatoMoneda(montoFinal)} will be charged to the card (base ${formatoMoneda(montoTotal)}).`;
  };
  ['input', 'change'].forEach(ev => {
    for (const el of [form.monto, form.msi_meses, form.msi_periodicidad, form.es_msi]) el.addEventListener(ev, actualizarPreviewMSI);
    for (const el of [form.monto, form.tasa_interes, form.es_msi]) el.addEventListener(ev, actualizarPreviewInteres);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const campoNombre = form.nombre.closest('.campo');
    const campoMonto = form.monto.closest('.campo');
    const campoMeses = form.msi_meses.closest('.campo');
    limpiarError(campoNombre); limpiarError(campoMonto); limpiarError(campoMeses);
    const montoBase = valorNumericoDeInputMoneda(form.monto);
    const esTarjeta = selMetodo.value === 'tarjeta';
    const esMSI = esTarjeta && form.es_msi.checked;
    const meses = esMSI ? Number(form.msi_meses.value) || 0 : null;
    let valido = true;
    if (!form.nombre.value.trim()) { marcarError(campoNombre, 'Enter a name'); valido = false; }
    if (!montoBase || montoBase <= 0) { marcarError(campoMonto, 'Enter a valid amount'); valido = false; }
    // Antes, dejar vacío el número de meses guardaba un plan "a 1 mes".
    if (esMSI && meses < 2) { marcarError(campoMeses, 'Enter at least 2 months'); valido = false; }
    if (!valido) return;

    if (esTarjeta && tarjetas.length === 0) { mostrarToast('Register a credit card first', 'error'); return; }
    if (!esTarjeta && cuentas.length === 0) { mostrarToast('Register a debit account first', 'error'); return; }

    const periodicidadMSI = esMSI ? form.msi_periodicidad.value : null;
    const totalCortes = esMSI ? meses * (periodicidadMSI === 'quincenal' ? 2 : 1) : null;
    // Interest only applies to non-MSI card purchases; monto_base keeps
    // what it was bought for, monto what it ended up costing.
    const tasaInteres = esTarjeta && !esMSI ? (Number(form.tasa_interes.value) || 0) : 0;
    const montoFinal = tasaInteres > 0 ? Math.round(montoBase * (1 + tasaInteres / 100) * 100) / 100 : montoBase;
    const montoPorCorte = esMSI ? Math.round((montoFinal / totalCortes) * 100) / 100 : null;

    await conBotonOcupado(form.querySelector('button[type=submit]'), async () => {
      try {
        const res = await ejecutar(
          `INSERT INTO gastos (nombre, categoria, fecha, monto, notas, metodo_pago, tarjeta_id, cuenta_debito_id, es_msi, msi_meses, reservado_tc, msi_periodicidad, msi_monto_por_corte, tasa_interes, monto_base)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [form.nombre.value.trim(), form.categoria.value, form.fecha.value || hoyISO(), montoFinal, form.notas.value.trim() || null,
           selMetodo.value, esTarjeta ? Number(form.tarjeta_id.value) : null, !esTarjeta ? Number(form.cuenta_debito_id.value) : null,
           esMSI ? 1 : 0, meses, 0, periodicidadMSI, montoPorCorte, tasaInteres, montoBase]
        );
        // The full amount is posted to the card at once (that's how a real
        // installment plan works); the installments are generated in Recurring.
        await registrarGasto({
          gastoId: res.lastInsertId,
          cuentaDebitoId: !esTarjeta ? Number(form.cuenta_debito_id.value) : null,
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
      }
    });
  });
}

/** "Small daily expense in under 3 clicks" flow triggered from the floating button. */
export async function abrirModalGastoRapido(alGuardar) {
  const cuentas = await consultar(`SELECT id, nombre, banco, saldo FROM cuentas_debito`);
  if (cuentas.length === 0) { mostrarToast('Register a debit account first', 'error'); return; }

  const { overlay, cerrar } = abrirModal(`
    <h3 class="modal__titulo">Quick small expense</h3>
    <p class="modal__subtitulo">Coffee, snacks, parking… saved as a small daily spend for today.</p>
    <form id="form-rapido">
      <div class="campo"><label class="campo__etiqueta">What for?</label><input class="campo__control" name="nombre" required /><div class="campo__error"></div></div>
      <div class="campo__fila">
        <div class="campo"><label class="campo__etiqueta">Amount</label><input class="campo__control" name="monto" inputmode="decimal" placeholder="0.00" required /><div class="campo__error"></div></div>
        <div class="campo"><label class="campo__etiqueta">Account</label>
          <select class="campo__control" name="cuenta_debito_id">${cuentas.map(c => `<option value="${c.id}">${etiquetaDeCuentaConBanco(c)}</option>`).join('')}</select>
        </div>
      </div>
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
    const campoNombre = form.nombre.closest('.campo');
    const campoMonto = form.monto.closest('.campo');
    limpiarError(campoNombre); limpiarError(campoMonto);
    const monto = valorNumericoDeInputMoneda(form.monto);
    const nombre = form.nombre.value.trim();
    if (!nombre) { marcarError(campoNombre, 'Enter a name'); return; }
    if (!monto || monto <= 0) { marcarError(campoMonto, 'Enter a valid amount'); return; }
    const cuentaId = Number(form.cuenta_debito_id.value);
    // Antes no se deshabilitaba el botón: un doble clic registraba el gasto dos veces.
    await conBotonOcupado(form.querySelector('button[type=submit]'), async () => {
      try {
        const res = await ejecutar(
          `INSERT INTO gastos (nombre, categoria, fecha, monto, metodo_pago, cuenta_debito_id) VALUES ($1,'hormiga',$2,$3,'debito',$4)`,
          [nombre, hoyISO(), monto, cuentaId]
        );
        await registrarGasto({ gastoId: res.lastInsertId, cuentaDebitoId: cuentaId, metodoPago: 'debito', monto, categoria: 'hormiga', notas: nombre, fecha: hoyISO() });
        mostrarToast('Small expense registered', 'exito');
        cerrar();
        alGuardar?.();
      } catch (err) {
        console.error(err);
        mostrarToast('Could not register', 'error');
      }
    });
  });
}
