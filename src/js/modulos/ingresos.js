import { consultar, ejecutar } from '../db.js';
import { registrarIngreso, aplicarRecurrente, revertirTransaccion } from '../ledger.js';
import { formatoMoneda, formatoFecha, hoyISO, activarInputMoneda, valorNumericoDeInputMoneda } from '../formato.js';
import { icono } from '../iconos.js';
import { abrirModal, construirSelector, marcarError, limpiarError } from '../ui.js';
import { mostrarToast, confirmarModal } from '../toasts.js';
import { confirmarYEliminar, delegarClicEliminar } from '../eliminar.js';
import { montoMensualEstimado, montoAnualEstimado, proximasFechasDelMes } from '../proyecciones.js';
import { idioma } from '../i18n.js';

let incomeChart; // Chart.js instance for the last-6-months income chart

export async function render(vistaEl) {
  const cuentas = await consultar(`SELECT id, nombre FROM cuentas_debito`);
  const recurrentes = await consultar(`SELECT * FROM recurrentes WHERE tipo = 'ingreso' ORDER BY creado_en DESC`);
  const extras = await consultar(`SELECT * FROM ingresos_extra ORDER BY fecha DESC LIMIT 30`);

  const prefijoMes = hoyISO().slice(0, 7);
  const totalMes = await consultar(
    `SELECT COALESCE(SUM(monto),0) AS t FROM transacciones
     WHERE fecha LIKE $1 AND (tipo='ingreso' OR (tipo='recurrente' AND destino LIKE 'debito:%'))`, [`${prefijoMes}%`]
  );
  const totalAnio = await consultar(
    `SELECT COALESCE(SUM(monto),0) AS t FROM transacciones
     WHERE fecha LIKE $1 AND (tipo='ingreso' OR (tipo='recurrente' AND destino LIKE 'debito:%'))`, [`${hoyISO().slice(0,4)}%`]
  );

  vistaEl.innerHTML = `
    <div class="vista__encabezado">
      <div><h1>Salary and Income</h1><p>Fixed, variable, and extra income</p></div>
      <div style="display:flex; gap:10px;">
        <button class="btn btn--fantasma" id="btn-nuevo-extra">${icono('masa')} Extra income</button>
        <button class="btn btn--primario" id="btn-nuevo-recurrente">${icono('masa')} New fixed income</button>
      </div>
    </div>

    <div class="grid-kpis">
      <div class="tarjeta"><div class="kpi__etiqueta">${icono('ingreso')} Total this month</div><div class="kpi__valor numero positivo">${formatoMoneda(totalMes[0].t)}</div></div>
      <div class="tarjeta"><div class="kpi__etiqueta">${icono('ingreso')} Total this year</div><div class="kpi__valor numero positivo">${formatoMoneda(totalAnio[0].t)}</div></div>
    </div>

    <div class="tarjeta" style="margin-bottom:14px;">
      <h3>My income (fixed and variable)</h3>
      <div class="lista" id="lista-recurrentes" style="margin-top:12px;"></div>
    </div>

    <div class="tarjeta" style="margin-bottom:14px;">
      <h3>Extra income</h3>
      <div class="lista" id="lista-extras" style="margin-top:12px;"></div>
    </div>

    <div class="tarjeta">
      <h3>Last 6 months</h3>
      <canvas id="grafica-ingresos-6m" height="160"></canvas>
    </div>
  `;

  if (cuentas.length === 0) {
    vistaEl.querySelector('#lista-recurrentes').innerHTML = estadoVacio('You need at least one debit account. Create one first under Cards.', 'banco');
  } else if (recurrentes.length === 0) {
    vistaEl.querySelector('#lista-recurrentes').innerHTML = estadoVacio('You haven\'t registered your salary or main income yet.', 'rayo');
  } else {
    const html = [];
    const [anio, mes] = hoyISO().split('-').map(Number);
    const prefijo = `${anio}-${String(mes).padStart(2,'0')}`;
    for (const r of recurrentes) {
      const fechas = proximasFechasDelMes(r, anio, mes);
      const proximaISO = `${prefijo}-${String(fechas[fechas.length-1]).padStart(2,'0')}`;

      if (r.periodicidad === 'quincenal') {
        // Biweekly income = two separate paychecks this month; each one can be
        // confirmed/adjusted/undone independently instead of sharing one status.
        const txDelMes = await consultar(
          `SELECT * FROM transacciones WHERE ref_tabla='recurrentes' AND ref_id=$1 AND tipo='recurrente' AND fecha LIKE $2`,
          [r.id, `${prefijo}%`]
        );
        html.push(`
          <div class="fila" data-id="${r.id}" style="flex-wrap:wrap;">
            <div class="fila__icono">${icono('ingreso')}</div>
            <div class="fila__cuerpo">
              <div class="fila__titulo">${r.nombre} <span class="badge badge--pendiente">biweekly</span></div>
              <div class="fila__meta">2 paychecks this month · ${formatoMoneda(r.monto)} each</div>
            </div>
            <div class="fila__acciones"><button class="btn-icono btn-editar-recurrente" data-id="${r.id}">${icono('editar')}</button><button class="btn-icono peligro btn-eliminar" data-id="${r.id}">${icono('eliminar')}</button></div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; padding:0 0 10px 44px;">
            ${fechas.map((d, i) => {
              const fechaISO = `${prefijo}-${String(d).padStart(2,'0')}`;
              const tx = txDelMes.find(t => t.fecha === fechaISO);
              return `
                <div class="tarjeta" style="padding:10px;">
                  <div class="fila__meta" style="margin-bottom:6px;">Paycheck ${i+1} · ${formatoFecha(fechaISO)}</div>
                  ${tx ? `
                    <span class="badge badge--pagado">received</span>
                    <button class="btn btn--fantasma btn-deshacer-pago-fecha" data-id="${r.id}" data-txid="${tx.id}" style="padding:5px 10px; margin-top:6px;">${icono('deshacer')} Undo</button>
                  ` : `
                    <button class="btn btn--primario btn-confirmar-pago-fecha" data-id="${r.id}" data-fecha="${fechaISO}" style="padding:5px 10px;">Confirm</button>
                  `}
                </div>`;
            }).join('')}
          </div>`);
        continue;
      }

      html.push(`
        <div class="fila" data-id="${r.id}">
          <div class="fila__icono">${icono('ingreso')}</div>
          <div class="fila__cuerpo">
            <div class="fila__titulo">${r.nombre} ${r.es_variable ? '<span class="badge badge--pendiente">variable</span>' : ''}</div>
            <div class="fila__meta">${etiquetaPeriodicidad(r)} · estimated monthly ${formatoMoneda(montoMensualEstimado(r))} · next payment ${formatoFecha(proximaISO)}</div>
          </div>
          <span class="badge badge--${r.estado}">${r.estado}</span>
          <div class="fila__acciones">
            ${r.estado !== 'pagado' ? `
              <button class="btn btn--primario btn-confirmar-pago" data-id="${r.id}" style="padding:7px 12px;" title="Adds the amount to your debit account">Confirm payment</button>
              <button class="btn btn--fantasma btn-confirmar-pago-sd" data-id="${r.id}" style="padding:7px 12px;" title="Only changes the status, doesn't move money">Already received (no deposit)</button>` : `
              <button class="btn btn--fantasma btn-deshacer-pago" data-id="${r.id}" style="padding:7px 12px;" title="Undo the last payment">${icono('deshacer')} Undo</button>`}
            <button class="btn-icono btn-editar-recurrente" data-id="${r.id}">${icono('editar')}</button>
            <button class="btn-icono peligro btn-eliminar" data-id="${r.id}">${icono('eliminar')}</button>
          </div>
        </div>`);
    }
    vistaEl.querySelector('#lista-recurrentes').innerHTML = html.join('');
  }

  vistaEl.querySelector('#lista-extras').innerHTML = extras.length
    ? extras.map(e => `
      <div class="fila" data-id="${e.id}">
        <div class="fila__icono">${icono('masa')}</div>
        <div class="fila__cuerpo"><div class="fila__titulo">${e.nombre}</div><div class="fila__meta">${formatoFecha(e.fecha)} · ${e.categoria || 'no category'}</div></div>
        <div class="numero positivo">${formatoMoneda(e.monto)}</div>
        <div class="fila__acciones">
          <button class="btn-icono btn-editar-extra" data-id="${e.id}">${icono('editar')}</button>
          <button class="btn-icono peligro btn-eliminar-extra" data-id="${e.id}">${icono('eliminar')}</button>
        </div>
      </div>`).join('')
    : estadoVacio('No extra income registered yet.', 'masa');

  vistaEl.querySelector('#btn-nuevo-recurrente').addEventListener('click', () => abrirModalRecurrente(cuentas, () => render(vistaEl), null));
  vistaEl.querySelector('#btn-nuevo-extra').addEventListener('click', () => abrirModalExtra(cuentas, () => render(vistaEl)));

  const listaRec = vistaEl.querySelector('#lista-recurrentes');
  delegarClicEliminar(listaRec, '.btn-eliminar', (id) => confirmarYEliminar({
    mensaje: 'This recurring income will be deleted. This action cannot be undone.',
    accion: () => ejecutar(`DELETE FROM recurrentes WHERE id = $1`, [id]),
    alExito: () => render(vistaEl),
  }));
  listaRec.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-confirmar-pago');
    const btnSD = e.target.closest('.btn-confirmar-pago-sd');
    const btnEditar = e.target.closest('.btn-editar-recurrente');
    const btnFecha = e.target.closest('.btn-confirmar-pago-fecha');
    const btnDeshacerFecha = e.target.closest('.btn-deshacer-pago-fecha');
    const btnDeshacer = e.target.closest('.btn-deshacer-pago');

    if (btnFecha) {
      const r = recurrentes.find(x => String(x.id) === String(btnFecha.dataset.id));
      if (cuentas.length === 0) { mostrarToast('Register a debit account first', 'error'); return; }
      btnFecha.disabled = true; btnFecha.classList.add('btn--carga');
      try {
        await aplicarRecurrente({ recurrente: r, cuentaDebitoId: r.cuenta_destino_id || cuentas[0].id, monto: r.monto, fecha: btnFecha.dataset.fecha });
        mostrarToast('Paycheck confirmed', 'exito');
        await render(vistaEl);
      } catch (err) { console.error(err); mostrarToast('Could not confirm the paycheck', 'error'); btnFecha.disabled = false; btnFecha.classList.remove('btn--carga'); }
      return;
    }
    if (btnDeshacerFecha) {
      btnDeshacerFecha.disabled = true; btnDeshacerFecha.classList.add('btn--carga');
      try {
        const [tx] = await consultar(`SELECT * FROM transacciones WHERE id = $1`, [btnDeshacerFecha.dataset.txid]);
        if (tx) await revertirTransaccion(tx);
        mostrarToast('Payment undone', 'info');
        await render(vistaEl);
      } catch (err) { console.error(err); mostrarToast('Could not undo the payment', 'error'); btnDeshacerFecha.disabled = false; btnDeshacerFecha.classList.remove('btn--carga'); }
      return;
    }
    if (btnDeshacer) {
      const r = recurrentes.find(x => String(x.id) === String(btnDeshacer.dataset.id));
      btnDeshacer.disabled = true; btnDeshacer.classList.add('btn--carga');
      try {
        const tx = await consultar(
          `SELECT * FROM transacciones WHERE ref_tabla='recurrentes' AND ref_id=$1 AND tipo='recurrente' ORDER BY id DESC`, [r.id]
        );
        for (const t of tx) await revertirTransaccion(t);
        await ejecutar(`UPDATE recurrentes SET estado='pendiente' WHERE id=$1`, [r.id]);
        mostrarToast('Payment undone — back to pending', 'info');
        await render(vistaEl);
      } catch (err) { console.error(err); mostrarToast('Could not undo the payment', 'error'); btnDeshacer.disabled = false; btnDeshacer.classList.remove('btn--carga'); }
      return;
    }
    if (btnEditar) {
      const r = recurrentes.find(x => String(x.id) === String(btnEditar.dataset.id));
      abrirModalRecurrente(cuentas, () => render(vistaEl), r);
      return;
    }
    if (btnSD) {
      // Marks as received without creating a transaction or adding to the balance
      // (already recorded elsewhere, or you just want to reflect the status
      // without duplicating the income).
      await ejecutar(`UPDATE recurrentes SET estado = 'pagado', ultima_aplicacion = $1 WHERE id = $2`, [hoyISO(), btnSD.dataset.id]);
      mostrarToast('Marked as received (no deposit added)', 'exito');
      await render(vistaEl);
      return;
    }
    if (!btn) return;
    const id = String(btn.dataset.id);
    const r = recurrentes.find(x => String(x.id) === id);
    if (!r) return;
    if (cuentas.length === 0) { mostrarToast('Register a debit account first', 'error'); return; }
    btn.disabled = true; btn.classList.add('btn--carga');
    try {
      await aplicarRecurrente({ recurrente: r, cuentaDebitoId: r.cuenta_destino_id || cuentas[0].id, monto: r.monto, fecha: hoyISO() });
      mostrarToast('Payment confirmed', 'exito');
      await render(vistaEl);
    } catch (err) {
      console.error(err);
      mostrarToast('Could not confirm the payment', 'error');
      btn.disabled = false; btn.classList.remove('btn--carga');
    }
  });

  const listaExtras = vistaEl.querySelector('#lista-extras');
  delegarClicEliminar(listaExtras, '.btn-eliminar-extra', (id) => confirmarYEliminar({
    mensaje: 'This extra income entry will be deleted.',
    accion: () => ejecutar(`DELETE FROM ingresos_extra WHERE id = $1`, [id]),
    alExito: () => render(vistaEl),
  }));
  listaExtras.addEventListener('click', (e) => {
    const btnEditar = e.target.closest('.btn-editar-extra');
    if (!btnEditar) return;
    const extra = extras.find(x => String(x.id) === String(btnEditar.dataset.id));
    abrirModalEditarExtra(extra, () => render(vistaEl));
  });

  await pintarGraficaIngresos6Meses();
}

function etiquetaPeriodicidad(r) {
  const mapa = { semanal: 'Weekly', quincenal: 'Biweekly', mensual: 'Monthly', personalizada: `Every ${r.intervalo_dias} days` };
  return mapa[r.periodicidad] || r.periodicidad;
}

function estadoVacio(mensaje, iconoNombre) {
  return `<div class="estado-vacio">${icono(iconoNombre)}<p>${mensaje}</p></div>`;
}

/** Renders a bar chart with total income for each of the last 6 months,
 * reusing the same Chart.js pattern as dashboard.js (pintarGraficaAnual). */
async function pintarGraficaIngresos6Meses() {
  const meses = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - (5 - i));
    return d.toISOString().slice(0, 7);
  });
  const totales = [];
  for (const m of meses) {
    const fila = await consultar(
      `SELECT COALESCE(SUM(monto),0) AS t FROM transacciones
       WHERE fecha LIKE $1 AND (tipo='ingreso' OR (tipo='recurrente' AND destino LIKE 'debito:%'))`,
      [`${m}%`]
    );
    totales.push(fila[0]?.t || 0);
  }
  const canvas = document.getElementById('grafica-ingresos-6m');
  if (!canvas) return;
  incomeChart?.destroy();
  incomeChart = new Chart(canvas, {
    type: 'bar',
    data: { labels: meses.map(m => m.slice(5)), datasets: [{ label: idioma() === 'es' ? 'Ingresos' : 'Income', data: totales, backgroundColor: '#34d399' }] },
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

function abrirModalRecurrente(cuentas, alGuardar, registro = null) {
  const editando = !!registro;
  const { overlay, cerrar } = abrirModal(`
    <h3 class="modal__titulo">${editando ? 'Edit' : 'New'} fixed income</h3>
    <form id="form-recurrente">
      <div class="campo"><label class="campo__etiqueta">Name</label><input class="campo__control" name="nombre" placeholder="Salary, freelance…" required value="${registro?.nombre || ''}" /><div class="campo__error"></div></div>
      <div class="campo__fila">
        <div class="campo">
          <label class="campo__etiqueta">Type</label>
          <select class="campo__control" name="tipo_ingreso">
            <option value="fijo" ${!registro?.es_variable ? 'selected' : ''}>Fixed (salary)</option>
            <option value="variable" ${registro?.es_variable ? 'selected' : ''}>Variable / freelance</option>
          </select>
        </div>
        <div class="campo">
          <label class="campo__etiqueta">Frequency</label>
          <select class="campo__control" name="periodicidad">
            <option value="semanal" ${registro?.periodicidad==='semanal'?'selected':''}>Weekly</option>
            <option value="quincenal" ${registro?.periodicidad==='quincenal'?'selected':''}>Biweekly</option>
            <option value="mensual" ${!registro || registro?.periodicidad==='mensual'?'selected':''}>Monthly</option>
            <option value="personalizada" ${registro?.periodicidad==='personalizada'?'selected':''}>Custom</option>
          </select>
        </div>
      </div>
      <div class="campo" id="campo-dias" style="display:none;"><label class="campo__etiqueta">Payment days (e.g. 15,30)</label><input class="campo__control" name="dias_de_pago" placeholder="15,30" value="${(() => { try { return JSON.parse(registro?.dias_de_pago||'[]').join(','); } catch { return ''; } })()}" /></div>
      <div class="campo" id="campo-intervalo" style="display:none;"><label class="campo__etiqueta">Every how many days</label><input class="campo__control" name="intervalo_dias" type="number" min="1" value="${registro?.intervalo_dias || ''}" /></div>
      <div class="campo"><label class="campo__etiqueta">Amount ${''}<span id="etq-monto">fixed</span></label><input class="campo__control" name="monto" inputmode="decimal" placeholder="0.00" required value="${registro?.monto || ''}" /><div class="campo__error"></div></div>
      <div class="campo"><label class="campo__etiqueta">Destination account</label>
        <select class="campo__control" name="cuenta_destino_id">${cuentas.map(c => `<option value="${c.id}" ${registro?.cuenta_destino_id===c.id?'selected':''}>${c.nombre}</option>`).join('')}</select>
      </div>
      <div class="modal__acciones">
        <button type="button" class="btn btn--fantasma" data-cerrar-modal>Cancel</button>
        <button type="submit" class="btn btn--primario">${editando ? 'Save changes' : 'Save'}</button>
      </div>
    </form>
  `);

  const form = overlay.querySelector('#form-recurrente');
  const selPeriodicidad = form.periodicidad;
  const selTipo = form.tipo_ingreso;
  const inputMonto = form.monto;
  activarInputMoneda(inputMonto);

  const actualizarCampos = () => {
    form.querySelector('#campo-dias').style.display = selPeriodicidad.value === 'quincenal' ? 'block' : 'none';
    form.querySelector('#campo-intervalo').style.display = selPeriodicidad.value === 'personalizada' ? 'block' : 'none';
    overlay.querySelector('#etq-monto').textContent = selTipo.value === 'variable' ? '(estimated average)' : 'fixed';
  };
  selPeriodicidad.addEventListener('change', actualizarCampos);
  selTipo.addEventListener('change', actualizarCampos);
  actualizarCampos();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const campoNombre = form.nombre.closest('.campo');
    const campoMonto = inputMonto.closest('.campo');
    limpiarError(campoNombre); limpiarError(campoMonto);
    const monto = valorNumericoDeInputMoneda(inputMonto);
    let valido = true;
    if (!form.nombre.value.trim()) { marcarError(campoNombre, 'Enter a name'); valido = false; }
    if (!monto || monto <= 0) { marcarError(campoMonto, 'Enter a valid amount'); valido = false; }
    if (!valido) return;

    const dias = selPeriodicidad.value === 'quincenal'
      ? form.dias_de_pago.value.split(',').map(n => Number(n.trim())).filter(Boolean)
      : selPeriodicidad.value === 'personalizada'
      ? []
      : [];

    try {
      if (editando) {
        await ejecutar(
          `UPDATE recurrentes SET nombre=$1, monto=$2, periodicidad=$3, dias_de_pago=$4, intervalo_dias=$5, es_variable=$6, cuenta_destino_id=$7 WHERE id=$8`,
          [form.nombre.value.trim(), monto, selPeriodicidad.value, JSON.stringify(dias), Number(form.intervalo_dias.value) || null, selTipo.value === 'variable' ? 1 : 0, Number(form.cuenta_destino_id.value), registro.id]
        );
        mostrarToast('Income updated', 'exito');
      } else {
        await ejecutar(
          `INSERT INTO recurrentes (tipo, nombre, categoria, monto, periodicidad, dias_de_pago, intervalo_dias, es_variable, cuenta_destino_id, estado)
           VALUES ('ingreso',$1,'salario',$2,$3,$4,$5,$6,$7,'pendiente')`,
          [form.nombre.value.trim(), monto, selPeriodicidad.value, JSON.stringify(dias), Number(form.intervalo_dias.value) || null, selTipo.value === 'variable' ? 1 : 0, Number(form.cuenta_destino_id.value)]
        );
        mostrarToast('Income registered', 'exito');
      }
      cerrar();
      alGuardar();
    } catch (err) {
      console.error(err);
      mostrarToast('Could not save the income', 'error');
    }
  });
}

function abrirModalExtra(cuentas, alGuardar) {
  const { overlay, cerrar } = abrirModal(`
    <h3 class="modal__titulo">Extra income</h3>
    <form id="form-extra">
      <div class="campo"><label class="campo__etiqueta">Name</label><input class="campo__control" name="nombre" placeholder="Bonus, refund, sale…" required /><div class="campo__error"></div></div>
      <div class="campo__fila">
        <div class="campo"><label class="campo__etiqueta">Category</label><input class="campo__control" name="categoria" placeholder="Freelance" /></div>
        <div class="campo"><label class="campo__etiqueta">Date</label><input class="campo__control" type="date" name="fecha" value="${hoyISO()}" /></div>
      </div>
      <div class="campo"><label class="campo__etiqueta">Amount</label><input class="campo__control" name="monto" inputmode="decimal" placeholder="0.00" required /><div class="campo__error"></div></div>
      <div class="campo"><label class="campo__etiqueta">Destination account</label>
        <select class="campo__control" name="cuenta_destino_id">${cuentas.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')}</select>
      </div>
      <div class="modal__acciones">
        <button type="button" class="btn btn--fantasma" data-cerrar-modal>Cancel</button>
        <button type="submit" class="btn btn--primario">Save</button>
      </div>
    </form>
  `);
  const form = overlay.querySelector('#form-extra');
  activarInputMoneda(form.monto);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const campoMonto = form.monto.closest('.campo');
    limpiarError(campoMonto);
    const monto = valorNumericoDeInputMoneda(form.monto);
    if (!monto || monto <= 0) { marcarError(campoMonto, 'Enter a valid amount'); return; }
    if (cuentas.length === 0) { mostrarToast('Register a debit account first', 'error'); return; }

    try {
      const res = await ejecutar(
        `INSERT INTO ingresos_extra (nombre, categoria, fecha, monto, notas) VALUES ($1,$2,$3,$4,NULL)`,
        [form.nombre.value.trim(), form.categoria.value.trim() || null, form.fecha.value || hoyISO(), monto]
      );
      await registrarIngreso({
        cuentaDebitoId: Number(form.cuenta_destino_id.value), monto, categoria: form.categoria.value.trim() || 'ingreso_extra',
        notas: form.nombre.value.trim(), fecha: form.fecha.value || hoyISO(), refTabla: 'ingresos_extra', refId: res.lastInsertId,
      });
      mostrarToast('Income registered', 'exito');
      cerrar();
      alGuardar();
    } catch (err) {
      console.error(err);
      mostrarToast('Could not save the income', 'error');
    }
  });
}

/** Lightweight edit for an existing extra income entry: name, category, date,
 * amount, and notes. The amount here only updates the ingresos_extra record;
 * it does not retroactively adjust the transaction already posted to the
 * ledger, matching the same approach used for editing gastos. */
function abrirModalEditarExtra(extra, alGuardar) {
  const { overlay, cerrar } = abrirModal(`
    <h3 class="modal__titulo">Edit extra income</h3>
    <form id="form-editar-extra">
      <div class="campo"><label class="campo__etiqueta">Name</label><input class="campo__control" name="nombre" required value="${extra.nombre}" /><div class="campo__error"></div></div>
      <div class="campo__fila">
        <div class="campo"><label class="campo__etiqueta">Category</label><input class="campo__control" name="categoria" value="${extra.categoria || ''}" /></div>
        <div class="campo"><label class="campo__etiqueta">Date</label><input class="campo__control" type="date" name="fecha" value="${extra.fecha}" /></div>
      </div>
      <div class="campo"><label class="campo__etiqueta">Amount</label><input class="campo__control" name="monto" inputmode="decimal" placeholder="0.00" required value="${extra.monto}" /><div class="campo__error"></div></div>
      <div class="campo"><label class="campo__etiqueta">Notes</label><input class="campo__control" name="notas" value="${extra.notas || ''}" /></div>
      <div class="modal__acciones">
        <button type="button" class="btn btn--fantasma" data-cerrar-modal>Cancel</button>
        <button type="submit" class="btn btn--primario">Save changes</button>
      </div>
    </form>
  `);
  const form = overlay.querySelector('#form-editar-extra');
  activarInputMoneda(form.monto);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const campoNombre = form.nombre.closest('.campo');
    const campoMonto = form.monto.closest('.campo');
    limpiarError(campoNombre); limpiarError(campoMonto);
    const monto = valorNumericoDeInputMoneda(form.monto);
    let valido = true;
    if (!form.nombre.value.trim()) { marcarError(campoNombre, 'Enter a name'); valido = false; }
    if (!monto || monto <= 0) { marcarError(campoMonto, 'Enter a valid amount'); valido = false; }
    if (!valido) return;
    try {
      await ejecutar(
        `UPDATE ingresos_extra SET nombre=$1, categoria=$2, fecha=$3, monto=$4, notas=$5 WHERE id=$6`,
        [form.nombre.value.trim(), form.categoria.value.trim() || null, form.fecha.value || hoyISO(), monto, form.notas.value.trim() || null, extra.id]
      );
      mostrarToast('Income updated', 'exito');
      cerrar();
      alGuardar();
    } catch (err) {
      console.error(err);
      mostrarToast('Could not update the income', 'error');
    }
  });
}
