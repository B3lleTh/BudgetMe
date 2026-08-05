import { consultar, ejecutar } from '../db.js';
import { aplicarRecurrente, abonarRecurrente, revertirTransaccion, pagarTarjeta } from '../ledger.js';
import { formatoMoneda, hoyISO, activarInputMoneda, valorNumericoDeInputMoneda } from '../formato.js';
import { icono } from '../iconos.js';
import { abrirModal, marcarError, limpiarError } from '../ui.js';
import { mostrarToast } from '../toasts.js';
import { confirmarYEliminar, delegarClicEliminar } from '../eliminar.js';
import { idioma } from '../i18n.js';

const MESES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const ETIQUETA_ESTADO = { pendiente: 'Pending', pagado: 'Paid', omitido: 'Skipped' };

let recurringChart; // Chart.js instance for the last-6-months recurring expenses chart

function mesesActivos(r) {
  try { const arr = JSON.parse(r.meses_activos || '[]'); return Array.isArray(arr) ? arr : []; }
  catch { return []; }
}
function aplicaEsteMes(r) {
  if (!r.activo) return false;
  const meses = mesesActivos(r);
  if (meses.length === 0) return true; // no selection = every month
  return meses.includes(new Date().getMonth() + 1);
}

/** Keeps one auto-generated recurring expense per credit card in sync,
 * representing its current statement balance ("mensualidad"), so it shows
 * up in Recurring to be marked as paid just like any other fixed expense. */
/** Keeps the credit-card auto-recurring expenses in sync:
 * - Each active interest-free installment (MSI) purchase gets its OWN
 *   recurring row for exactly msi_meses cycles (amount = msi_monto_por_corte).
 *   Once msi_pagados reaches msi_meses it's fully settled and the row is
 *   removed — it does NOT keep charging forever.
 * - Everything else on the card (regular, non-MSI charges) is combined into
 *   one aggregate "card payment" recurring row for the current balance. */
async function sincronizarMensualidadesTC() {
  const tarjetas = await consultar(`SELECT * FROM tarjetas WHERE tipo = 'credito'`);
  for (const tj of tarjetas) {
    const gastosMSI = await consultar(`SELECT * FROM gastos WHERE tarjeta_id = $1 AND es_msi = 1`, [tj.id]);
    let deudaMSIRestante = 0;

    for (const g of gastosMSI) {
      const restanteDeuda = Math.max(0, g.monto - (g.msi_monto_por_corte || 0) * g.msi_pagados);
      deudaMSIRestante += restanteDeuda;
      const [recExistente] = await consultar(`SELECT * FROM recurrentes WHERE gasto_id = $1 LIMIT 1`, [g.id]);
      if (g.msi_pagados >= g.msi_meses || restanteDeuda <= 0) {
        if (recExistente) await ejecutar(`DELETE FROM recurrentes WHERE id = $1`, [recExistente.id]);
        continue;
      }
      const nombre = `${tj.nombre} — ${g.nombre || g.categoria} (installment ${g.msi_pagados + 1}/${g.msi_meses})`;
      if (!recExistente) {
        await ejecutar(
          `INSERT INTO recurrentes (tipo, nombre, categoria, monto, periodicidad, tarjeta_id, gasto_id, estado) VALUES ('gasto', $1, 'tarjeta_credito', $2, 'mensual', $3, $4, 'pendiente')`,
          [nombre, g.msi_monto_por_corte, tj.id, g.id]
        );
      } else if (recExistente.estado === 'pendiente') {
        await ejecutar(`UPDATE recurrentes SET monto = $1, nombre = $2 WHERE id = $3`, [g.msi_monto_por_corte, nombre, recExistente.id]);
      }
    }

    const montoNoMSI = Math.max(0, tj.saldo - deudaMSIRestante);
    const [agregadoExistente] = await consultar(`SELECT * FROM recurrentes WHERE tarjeta_id = $1 AND gasto_id IS NULL LIMIT 1`, [tj.id]);
    if (!agregadoExistente) {
      if (montoNoMSI > 0) {
        await ejecutar(
          `INSERT INTO recurrentes (tipo, nombre, categoria, monto, periodicidad, tarjeta_id, estado) VALUES ('gasto', $1, 'tarjeta_credito', $2, 'mensual', $3, 'pendiente')`,
          [`${tj.nombre} — card payment`, montoNoMSI, tj.id]
        );
      }
    } else if (agregadoExistente.estado === 'pendiente') {
      if (montoNoMSI <= 0) await ejecutar(`DELETE FROM recurrentes WHERE id = $1`, [agregadoExistente.id]);
      else if (agregadoExistente.monto !== montoNoMSI) await ejecutar(`UPDATE recurrentes SET monto = $1 WHERE id = $2`, [montoNoMSI, agregadoExistente.id]);
    }
  }
}

export async function render(vistaEl) {
  const cuentas = await consultar(`SELECT id, nombre FROM cuentas_debito`);
  await sincronizarMensualidadesTC();
  const recurrentes = await consultar(`SELECT * FROM recurrentes WHERE tipo = 'gasto' ORDER BY creado_en DESC`);

  const activosEsteMes = recurrentes.filter(aplicaEsteMes);
  const totalPendiente = activosEsteMes.filter(r => r.estado === 'pendiente').reduce((a, r) => a + r.monto, 0);
  const totalPagado = activosEsteMes.filter(r => r.estado === 'pagado').reduce((a, r) => a + r.monto, 0);

  vistaEl.innerHTML = `
    <div class="vista__encabezado">
      <div><h1>Recurring expenses</h1><p>Subscriptions, insurance, and fixed monthly payments</p></div>
      <button class="btn btn--primario" id="btn-nuevo-recurrente">${icono('recurrente')} New recurring expense</button>
    </div>

    <div class="grid-kpis" style="margin-bottom:14px;">
      <div class="tarjeta"><div class="kpi__etiqueta">${icono('alerta')} Pending this month</div><div class="kpi__valor numero negativo">${formatoMoneda(totalPendiente)}</div></div>
      <div class="tarjeta"><div class="kpi__etiqueta">${icono('check')} Already paid this month</div><div class="kpi__valor numero positivo">${formatoMoneda(totalPagado)}</div></div>
      <div class="tarjeta"><div class="kpi__etiqueta">${icono('recurrente')} Total committed</div><div class="kpi__valor numero">${formatoMoneda(totalPendiente + totalPagado)}</div></div>
    </div>

    <div class="tarjeta"><div class="lista" id="lista-recurrentes"></div></div>

    <div class="tarjeta" style="margin-top:14px;">
      <h3>Last 6 months</h3>
      <canvas id="grafica-recurrentes-6m" height="160"></canvas>
    </div>
  `;

  vistaEl.querySelector('#lista-recurrentes').innerHTML = recurrentes.length
    ? recurrentes.map(r => filaRecurrente(r)).join('')
    : `<div class="estado-vacio">${icono('recurrente')}<h3>No recurring expenses yet</h3><p>Register Netflix, gym, insurance, or any fixed monthly payment.</p></div>`;

  vistaEl.querySelector('#btn-nuevo-recurrente').addEventListener('click', () => abrirModalRecurrente(cuentas, null, () => render(vistaEl)));

  const lista = vistaEl.querySelector('#lista-recurrentes');
  lista.addEventListener('click', (e) => {
    const btnMas = e.target.closest('.btn-mas-opciones');
    if (!btnMas) return;
    const id = btnMas.dataset.id;
    const origen = document.getElementById(`acciones-ocultas-${id}`);
    const r = recurrentes.find(x => String(x.id) === String(id));
    const opciones = Array.from(origen.querySelectorAll('button')).map(b => ({
      html: b.innerHTML, clase: b.className, disparar: () => b.click(),
    }));
    const { overlay, cerrar } = abrirModal(`
      <h3 class="modal__titulo">${r?.nombre || 'Options'}</h3>
      <div class="lista" id="modal-opciones-lista"></div>
    `);
    const cont = overlay.querySelector('#modal-opciones-lista');
    cont.innerHTML = opciones.map((o, i) => `<button class="menu-acciones__item ${o.clase.includes('peligro') ? 'peligro' : ''}" data-i="${i}" style="width:100%;">${o.html}</button>`).join('');
    cont.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-i]');
      if (!b) return;
      cerrar();
      opciones[Number(b.dataset.i)].disparar();
    });
  });
  delegarClicEliminar(lista, '.btn-eliminar', (id) => confirmarYEliminar({
    mensaje: 'This recurring expense will be deleted.',
    accion: () => ejecutar(`DELETE FROM recurrentes WHERE id = $1`, [id]),
    alExito: () => render(vistaEl),
  }));

  lista.addEventListener('click', async (e) => {
    const btnPagar = e.target.closest('.btn-marcar-pagado');
    const btnPagarSD = e.target.closest('.btn-marcar-pagado-sd');
    const btnOmitir = e.target.closest('.btn-omitir');
    const btnDeshacerOmitir = e.target.closest('.btn-deshacer-omitir');
    const btnDeshacerPago = e.target.closest('.btn-deshacer-pago');
    const btnAbonar = e.target.closest('.btn-abonar');

    if (btnDeshacerPago) {
      const r = recurrentes.find(x => String(x.id) === String(btnDeshacerPago.dataset.id));
      btnDeshacerPago.disabled = true; btnDeshacerPago.classList.add('btn--carga');
      try {
        const tx = await consultar(
          `SELECT * FROM transacciones WHERE ref_tabla='recurrentes' AND ref_id=$1 AND tipo IN ('recurrente','abono_recurrente','pago_tc') ORDER BY id DESC`,
          [r.id]
        );
        for (const t of tx) {
          if (t.tipo === 'pago_tc') {
            // Card debt DECREASES on payment, unlike other destinos — undo it manually
            // instead of the generic reversal, which assumes destino balances increase.
            const [entidadOrigen, idOrigen] = t.origen.split(':');
            if (entidadOrigen === 'debito') await ejecutar(`UPDATE cuentas_debito SET saldo = saldo + $1 WHERE id = $2`, [t.monto, idOrigen]);
            if (entidadOrigen === 'caja') await ejecutar(`UPDATE cajas SET saldo = saldo + $1 WHERE id = $2`, [t.monto, idOrigen]);
            const [, idTarjeta] = t.destino.split(':');
            await ejecutar(`UPDATE tarjetas SET saldo = saldo + $1 WHERE id = $2`, [t.monto, idTarjeta]);
            if (r.gasto_id) await ejecutar(`UPDATE gastos SET msi_pagados = MAX(0, msi_pagados - 1) WHERE id = $1`, [r.gasto_id]);
            await ejecutar(`DELETE FROM transacciones WHERE id = $1`, [t.id]);
          } else {
            await revertirTransaccion(t);
          }
        }
        await ejecutar(`UPDATE recurrentes SET estado='pendiente', abonado=0 WHERE id=$1`, [r.id]);
        mostrarToast('Payment undone — back to pending', 'info');
        await render(vistaEl);
      } catch (err) { console.error(err); mostrarToast('Could not undo the payment', 'error'); btnDeshacerPago.disabled = false; btnDeshacerPago.classList.remove('btn--carga'); }
      return;
    }

    if (btnAbonar) {
      const r = recurrentes.find(x => String(x.id) === String(btnAbonar.dataset.id));
      if (cuentas.length === 0) { mostrarToast('Register a debit account first', 'error'); return; }
      abrirModalAbono(r, cuentas, () => render(vistaEl));
      return;
    }
    const btnEditar = e.target.closest('.btn-editar');
    const btnActivo = e.target.closest('.toggle-activo');

    if (btnEditar) {
      const r = recurrentes.find(x => String(x.id) === String(btnEditar.dataset.id));
      abrirModalRecurrente(cuentas, r, () => render(vistaEl));
      return;
    }
    if (btnActivo) {
      await ejecutar(`UPDATE recurrentes SET activo = $1 WHERE id = $2`, [btnActivo.checked ? 1 : 0, btnActivo.dataset.id]);
      mostrarToast(btnActivo.checked ? 'Recurring expense reactivated' : 'Recurring expense paused', 'info');
      await render(vistaEl);
      return;
    }
    if (btnPagar) {
      const r = recurrentes.find(x => String(x.id) === String(btnPagar.dataset.id));
      if (cuentas.length === 0) { mostrarToast('Register a debit account first', 'error'); return; }
      btnPagar.disabled = true; btnPagar.classList.add('btn--carga');
      try {
        const restante = Math.max(0, r.monto - (r.abonado || 0));
        if (r.tarjeta_id) {
          await pagarTarjeta({ tarjetaId: r.tarjeta_id, cuentaDebitoId: r.cuenta_destino_id || cuentas[0].id, monto: restante, fecha: hoyISO(), refTabla: 'recurrentes', refId: r.id });
          if (r.gasto_id) {
            await ejecutar(`UPDATE gastos SET msi_pagados = msi_pagados + 1 WHERE id = $1`, [r.gasto_id]);
          }
          await ejecutar(`UPDATE recurrentes SET estado='pagado', abonado=0 WHERE id=$1`, [r.id]);
        } else {
          await aplicarRecurrente({ recurrente: r, cuentaDebitoId: r.cuenta_destino_id || cuentas[0].id, monto: restante, fecha: hoyISO() });
        }
        mostrarToast('Marked as paid and deducted', 'exito');
        await render(vistaEl);
      } catch (err) { console.error(err); mostrarToast('Could not mark as paid', 'error'); btnPagar.disabled = false; btnPagar.classList.remove('btn--carga'); }
    }
    if (btnPagarSD) {
      // Marks as paid WITHOUT creating a transaction or deducting the balance:
      // useful when it was already paid "outside" the app (cash, another
      // account, etc.) and you just want to reflect the status without
      // duplicating the deduction.
      await ejecutar(`UPDATE recurrentes SET estado = 'pagado', ultima_aplicacion = $1 WHERE id = $2`, [hoyISO(), btnPagarSD.dataset.id]);
      mostrarToast('Marked as paid (no deduction)', 'exito');
      await render(vistaEl);
    }
    if (btnOmitir) {
      await ejecutar(`UPDATE recurrentes SET estado = 'omitido' WHERE id = $1`, [btnOmitir.dataset.id]);
      mostrarToast('Recurring expense skipped this period', 'info');
      await render(vistaEl);
    }
    if (btnDeshacerOmitir) {
      await ejecutar(`UPDATE recurrentes SET estado = 'pendiente' WHERE id = $1`, [btnDeshacerOmitir.dataset.id]);
      mostrarToast('Skip undone — back to pending', 'info');
      await render(vistaEl);
    }
  });

  await pintarGraficaRecurrentes6Meses();
}

/** Renders a bar chart with total recurring-expense payments posted to the
 * ledger for each of the last 6 months, reusing the same Chart.js pattern
 * as dashboard.js (pintarGraficaAnual). */
async function pintarGraficaRecurrentes6Meses() {
  const meses = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - (5 - i));
    return d.toISOString().slice(0, 7);
  });
  const totales = [];
  for (const m of meses) {
    const fila = await consultar(
      `SELECT COALESCE(SUM(monto),0) AS t FROM transacciones
       WHERE fecha LIKE $1 AND tipo='recurrente' AND ref_tabla='recurrentes'
       AND ref_id IN (SELECT id FROM recurrentes WHERE tipo='gasto')`,
      [`${m}%`]
    );
    totales.push(fila[0]?.t || 0);
  }
  const canvas = document.getElementById('grafica-recurrentes-6m');
  if (!canvas) return;
  recurringChart?.destroy();
  recurringChart = new Chart(canvas, {
    type: 'bar',
    data: { labels: meses.map(m => m.slice(5)), datasets: [{ label: idioma() === 'es' ? 'Recurrentes pagados' : 'Recurring expenses paid', data: totales, backgroundColor: '#f59e0b' }] },
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

function filaRecurrente(r) {
  const mapa = { semanal: 'Weekly', quincenal: 'Biweekly', mensual: 'Monthly', personalizada: `Every ${r.intervalo_dias} days` };
  const meses = mesesActivos(r);
  const etiquetaMeses = meses.length ? meses.map(m => MESES[m - 1]).join(', ') : 'Every month';
  const activo = r.activo === undefined || r.activo === null ? 1 : r.activo;
  return `
    <div class="fila" data-id="${r.id}" style="flex-wrap:wrap; opacity:${activo ? 1 : .55};">
      <div class="fila__icono">${icono('recurrente')}</div>
      <div class="fila__cuerpo">
        <div class="fila__titulo">${r.nombre}</div>
        <div class="fila__meta">${mapa[r.periodicidad] || r.periodicidad} · ${r.categoria || 'no category'} · applies: ${etiquetaMeses}</div>
      </div>
      <div class="numero negativo">${formatoMoneda(r.monto)}${r.abonado > 0 ? `<div style="font-size:11px; opacity:.75; font-weight:400;">Paid so far: ${formatoMoneda(r.abonado)} of ${formatoMoneda(r.monto)}</div>` : ''}</div>
      <span class="badge badge--${r.estado}">${ETIQUETA_ESTADO[r.estado] || r.estado}</span>
      <label class="switch" title="Active this period">
        <input type="checkbox" class="toggle-activo" data-id="${r.id}" ${activo ? 'checked' : ''} />
        <span class="switch__pista"></span>
      </label>
      <div class="fila__acciones">
        ${r.estado === 'pendiente' && activo ? `
          <button class="btn btn--primario btn-marcar-pagado" data-id="${r.id}" style="padding:7px 12px;" title="Deducts the amount from your debit account">Mark as paid</button>
          <button class="btn btn--fantasma btn-omitir" data-id="${r.id}" style="padding:7px 12px;">Skip</button>` : ''}
        ${r.estado === 'omitido' ? `
          <button class="btn btn--fantasma btn-deshacer-omitir" data-id="${r.id}" style="padding:7px 12px;">Undo skip</button>` : ''}
        ${r.estado === 'pagado' ? `
          <button class="btn btn--fantasma btn-deshacer-pago" data-id="${r.id}" style="padding:7px 12px;" title="Undo the last payment for this item">${icono('deshacer')} Undo payment</button>` : ''}
        <div id="acciones-ocultas-${r.id}" style="display:none;">
          ${r.estado === 'pendiente' && activo ? `
            <button class="menu-acciones__item btn-marcar-pagado-sd" data-id="${r.id}">${icono('check')} Already paid (no deduction)</button>
            <button class="menu-acciones__item btn-abonar" data-id="${r.id}">${icono('ingreso')} Add partial payment</button>
          ` : ''}
          <button class="menu-acciones__item btn-editar" data-id="${r.id}">${icono('editar')} Edit</button>
          <button class="menu-acciones__item peligro btn-eliminar" data-id="${r.id}">${icono('eliminar')} Delete</button>
        </div>
        <button class="btn-icono btn-mas-opciones" data-id="${r.id}" title="More options">⋮</button>
      </div>
    </div>`;
}

function abrirModalRecurrente(cuentas, registro, alGuardar) {
  const editando = !!registro;
  const meses = registro ? mesesActivos(registro) : [];
  const { overlay, cerrar } = abrirModal(`
    <h3 class="modal__titulo">${editando ? 'Edit' : 'New'} recurring expense</h3>
    <form id="form-recurrente">
      <div class="campo"><label class="campo__etiqueta">Name</label><input class="campo__control" name="nombre" placeholder="Netflix, gym, insurance…" required value="${registro?.nombre || ''}" /><div class="campo__error"></div></div>
      <div class="campo__fila">
        <div class="campo"><label class="campo__etiqueta">Category</label><input class="campo__control" name="categoria" placeholder="Subscription" value="${registro?.categoria || ''}" /></div>
        <div class="campo"><label class="campo__etiqueta">Frequency</label>
          <select class="campo__control" name="periodicidad">
            ${[['mensual','Monthly'],['semanal','Weekly'],['quincenal','Biweekly'],['personalizada','Custom']].map(([p, etq]) => `<option value="${p}" ${registro?.periodicidad===p?'selected':''}>${etq}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="campo"><label class="campo__etiqueta">Amount</label><input class="campo__control" name="monto" inputmode="decimal" placeholder="0.00" required value="${registro?.monto || ''}" /><div class="campo__error"></div></div>
      <div class="campo"><label class="campo__etiqueta">Charge account</label>
        <select class="campo__control" name="cuenta_destino_id">${cuentas.map(c => `<option value="${c.id}" ${registro?.cuenta_destino_id===c.id?'selected':''}>${c.nombre}</option>`).join('')}</select>
      </div>
      <div class="campo">
        <label class="campo__etiqueta">Which months does it apply to? (leave empty for all)</label>
        <div style="display:flex; flex-wrap:wrap; gap:6px;">
          ${MESES.map((m, i) => `
            <label style="display:flex; align-items:center; gap:4px; font-size:12px; background:var(--fondo-elevado); padding:5px 8px; border-radius:8px;">
              <input type="checkbox" name="mes" value="${i + 1}" ${meses.includes(i + 1) ? 'checked' : ''} /> ${m}
            </label>`).join('')}
        </div>
      </div>
      <div class="modal__acciones">
        <button type="button" class="btn btn--fantasma" data-cerrar-modal>Cancel</button>
        <button type="submit" class="btn btn--primario">${editando ? 'Save changes' : 'Save'}</button>
      </div>
    </form>`);
  const form = overlay.querySelector('#form-recurrente');
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
    const mesesSeleccionados = [...form.querySelectorAll('input[name="mes"]:checked')].map(el => Number(el.value));
    try {
      if (editando) {
        await ejecutar(
          `UPDATE recurrentes SET nombre=$1, categoria=$2, monto=$3, periodicidad=$4, cuenta_destino_id=$5, meses_activos=$6 WHERE id=$7`,
          [form.nombre.value.trim(), form.categoria.value.trim() || null, monto, form.periodicidad.value, Number(form.cuenta_destino_id.value), JSON.stringify(mesesSeleccionados), registro.id]
        );
        mostrarToast('Recurring expense updated', 'exito');
      } else {
        await ejecutar(
          `INSERT INTO recurrentes (tipo, nombre, categoria, monto, periodicidad, cuenta_destino_id, estado, meses_activos) VALUES ('gasto',$1,$2,$3,$4,$5,'pendiente',$6)`,
          [form.nombre.value.trim(), form.categoria.value.trim() || null, monto, form.periodicidad.value, Number(form.cuenta_destino_id.value), JSON.stringify(mesesSeleccionados)]
        );
        mostrarToast('Recurring expense created', 'exito');
      }
      cerrar(); alGuardar();
    } catch (err) { console.error(err); mostrarToast('Could not save', 'error'); }
  });
}

/** Registers a partial payment (abono) toward a pending recurring expense,
 * without needing to pay it off in full right away. */
function abrirModalAbono(r, cuentas, alGuardar) {
  const restante = Math.max(0, r.monto - (r.abonado || 0));
  const { overlay, cerrar } = abrirModal(`
    <h3 class="modal__titulo">Add payment — ${r.nombre}</h3>
    <p style="font-size:13px; opacity:.75; margin:-4px 0 12px;">Remaining to fully pay this period: ${formatoMoneda(restante)}</p>
    <form id="form-abono">
      <div class="campo"><label class="campo__etiqueta">Amount to pay now</label><input class="campo__control" name="monto" inputmode="decimal" placeholder="0.00" required /><div class="campo__error"></div></div>
      <div class="campo"><label class="campo__etiqueta">From account</label>
        <select class="campo__control" name="cuenta_debito_id">${cuentas.map(c => `<option value="${c.id}" ${r.cuenta_destino_id===c.id?'selected':''}>${c.nombre}</option>`).join('')}</select>
      </div>
      <div class="modal__acciones">
        <button type="button" class="btn btn--fantasma" data-cerrar-modal>Cancel</button>
        <button type="submit" class="btn btn--primario">Register payment</button>
      </div>
    </form>`);
  const form = overlay.querySelector('#form-abono');
  activarInputMoneda(form.monto);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const campo = form.monto.closest('.campo');
    limpiarError(campo);
    const monto = valorNumericoDeInputMoneda(form.monto);
    if (!monto || monto <= 0) { marcarError(campo, 'Enter a valid amount'); return; }
    if (monto > restante) { marcarError(campo, `Cannot exceed the remaining amount (${formatoMoneda(restante)})`); return; }
    try {
      await abonarRecurrente({ recurrente: r, cuentaDebitoId: Number(form.cuenta_debito_id.value), monto, fecha: hoyISO() });
      mostrarToast(monto >= restante ? 'Fully paid off' : 'Partial payment registered', 'exito');
      cerrar(); alGuardar();
    } catch (err) { console.error(err); mostrarToast('Could not register the payment', 'error'); }
  });
}
