import { etiquetaDeCuentaConBanco } from '../etiquetas.js';
import { consultar, ejecutar } from '../db.js';
import { registrarIngreso, aplicarRecurrente, revertirTransaccion } from '../ledger.js';
import { formatoMoneda, formatoFecha, hoyISO, prefijoMes, ultimosMeses, etiquetaMesCorta, activarInputMoneda, valorNumericoDeInputMoneda, escaparHTML } from '../formato.js';
import { icono } from '../iconos.js';
import { abrirModal, marcarError, limpiarError, conBotonOcupado } from '../ui.js';
import { mostrarToast } from '../toasts.js';
import { confirmarYEliminar, delegarClicEliminar } from '../eliminar.js';
import { montoMensualEstimado, proximasFechasDelMes } from '../proyecciones.js';
import { idioma } from '../i18n.js';
import { SQL_ES_INGRESO, transaccionesDelPeriodoDeRecurrente } from '../consultas.js';
import { coloresTema, graficaBarrasPorMes } from '../graficas.js';

let incomeChart; // Chart.js instance for the last-6-months income chart

const ETIQUETA_ESTADO = { pendiente: 'Pending', pagado: 'Received', omitido: 'Skipped' };

export async function render(vistaEl) {
  const cuentas = await consultar(`SELECT id, nombre, banco FROM cuentas_debito`);
  const recurrentes = await consultar(`SELECT * FROM recurrentes WHERE tipo = 'ingreso' ORDER BY creado_en DESC`);
  const extras = await consultar(`SELECT * FROM ingresos_extra ORDER BY fecha DESC, id DESC LIMIT 30`);

  const prefijo = prefijoMes(0);
  const [totalMes] = await consultar(`SELECT COALESCE(SUM(monto),0) AS t FROM transacciones WHERE fecha LIKE $1 AND ${SQL_ES_INGRESO}`, [`${prefijo}%`]);
  const [totalAnio] = await consultar(`SELECT COALESCE(SUM(monto),0) AS t FROM transacciones WHERE fecha LIKE $1 AND ${SQL_ES_INGRESO}`, [`${prefijo.slice(0, 4)}%`]);
  const esperadoMes = recurrentes.reduce((a, r) => a + montoMensualEstimado(r), 0);

  vistaEl.innerHTML = `
    <div class="vista__encabezado">
      <div><h1>Salary and Income</h1><p>Your fixed and variable income, plus one-off money like bonuses or refunds.</p></div>
      <div class="vista__acciones">
        <button class="btn btn--fantasma" id="btn-nuevo-extra">${icono('masa')} Extra income</button>
        <button class="btn btn--primario" id="btn-nuevo-recurrente">${icono('masa')} New fixed income</button>
      </div>
    </div>

    <div class="grid-kpis">
      <div class="tarjeta"><div class="kpi__etiqueta">${icono('ingreso')} Received this month</div><div class="kpi__valor numero positivo">${formatoMoneda(totalMes.t)}</div></div>
      <div class="tarjeta"><div class="kpi__etiqueta">${icono('calendario')} Expected per month</div><div class="kpi__valor numero">${formatoMoneda(esperadoMes)}</div><div class="kpi__nota">From your fixed and variable income</div></div>
      <div class="tarjeta"><div class="kpi__etiqueta">${icono('grafica')} Received this year</div><div class="kpi__valor numero">${formatoMoneda(totalAnio.t)}</div></div>
    </div>

    <div class="tarjeta seccion">
      <div class="panel__encabezado"><div><h3>My income (fixed and variable)</h3><p>Confirm each payment when it reaches your account.</p></div></div>
      <div class="lista" id="lista-recurrentes"></div>
    </div>

    <div class="tarjeta seccion">
      <div class="panel__encabezado"><h3>Extra income</h3></div>
      <div class="lista" id="lista-extras"></div>
    </div>

    <div class="tarjeta">
      <div class="panel__encabezado"><div><h3>Last 6 months</h3><p>Income received per month</p></div></div>
      <div class="grafica-envoltura grafica-envoltura--baja"><canvas id="grafica-ingresos-6m"></canvas></div>
    </div>
  `;

  if (cuentas.length === 0) {
    vistaEl.querySelector('#lista-recurrentes').innerHTML = estadoVacio('You need at least one debit account. Create one first under Cards & Accounts.', 'banco');
  } else if (recurrentes.length === 0) {
    vistaEl.querySelector('#lista-recurrentes').innerHTML = estadoVacio('You haven’t registered your salary or main income yet.', 'ingreso');
  } else {
    const html = [];
    const [anio, mes] = prefijo.split('-').map(Number);
    for (const r of recurrentes) {
      const fechas = proximasFechasDelMes(r, anio, mes);
      const proximaISO = `${prefijo}-${String(fechas[fechas.length - 1]).padStart(2, '0')}`;
      const acciones = `
        <button class="btn-icono btn-editar-recurrente" data-id="${r.id}" title="Edit" aria-label="Edit">${icono('editar')}</button>
        <button class="btn-icono peligro btn-eliminar" data-id="${r.id}" title="Delete" aria-label="Delete">${icono('eliminar')}</button>`;

      if (r.periodicidad === 'quincenal') {
        // Biweekly income = two separate paychecks this month; each one can be
        // confirmed/undone on its own instead of sharing one status.
        const txDelMes = await consultar(
          `SELECT * FROM transacciones WHERE ref_tabla='recurrentes' AND ref_id=$1 AND tipo='recurrente' AND fecha LIKE $2`,
          [r.id, `${prefijo}%`]
        );
        html.push(`
          <div class="fila-grupo">
            <div class="fila" data-id="${r.id}" style="border-bottom:none;">
              <div class="fila__icono fila__icono--ingreso">${icono('ingreso')}</div>
              <div class="fila__cuerpo">
                <div class="fila__titulo">${escaparHTML(r.nombre)} <span class="badge">Biweekly</span></div>
                <div class="fila__meta">2 paychecks this month · ${formatoMoneda(r.monto)} each</div>
              </div>
              <div class="numero positivo">${formatoMoneda(r.monto * 2)}</div>
              <div class="fila__acciones">${acciones}</div>
            </div>
            <div class="fila__sub">
              ${fechas.map((d, i) => {
                const fechaISO = `${prefijo}-${String(d).padStart(2, '0')}`;
                const tx = txDelMes.find(t => t.fecha === fechaISO);
                return `
                  <div class="pago-quincena">
                    <div><div style="font-weight:600; font-size:13px;">Paycheck ${i + 1}</div><div class="fila__meta">${formatoFecha(fechaISO)}</div></div>
                    ${tx
                      ? `<div style="display:flex; align-items:center; gap:6px;"><span class="badge badge--pagado">Received</span><button class="btn-icono btn-deshacer-pago-fecha" data-id="${r.id}" data-txid="${tx.id}" title="Undo" aria-label="Undo">${icono('deshacer')}</button></div>`
                      : `<button class="btn btn--primario btn--sm btn-confirmar-pago-fecha" data-id="${r.id}" data-fecha="${fechaISO}">Confirm</button>`}
                  </div>`;
              }).join('')}
            </div>
          </div>`);
        continue;
      }

      html.push(`
        <div class="fila" data-id="${r.id}">
          <div class="fila__icono fila__icono--ingreso">${icono('ingreso')}</div>
          <div class="fila__cuerpo">
            <div class="fila__titulo">${escaparHTML(r.nombre)} ${r.es_variable ? '<span class="badge">Variable</span>' : ''}</div>
            <div class="fila__meta">${etiquetaPeriodicidad(r)} · estimated monthly ${formatoMoneda(montoMensualEstimado(r))} · next payment ${formatoFecha(proximaISO)}</div>
          </div>
          <div class="numero positivo">${formatoMoneda(r.monto)}</div>
          <span class="badge badge--${r.estado}">${ETIQUETA_ESTADO[r.estado] || r.estado}</span>
          <div class="fila__acciones">
            ${r.estado !== 'pagado' ? `
              <button class="btn btn--primario btn--sm btn-confirmar-pago" data-id="${r.id}" title="Adds the amount to your debit account">Confirm payment</button>
              <button class="btn btn--fantasma btn--sm btn-confirmar-pago-sd" data-id="${r.id}" title="Only changes the status, doesn’t move money">Already received (no deposit)</button>` : `
              <button class="btn btn--fantasma btn--sm btn-deshacer-pago" data-id="${r.id}" title="Undo this month’s payment">${icono('deshacer')} Undo</button>`}
            ${acciones}
          </div>
        </div>`);
    }
    vistaEl.querySelector('#lista-recurrentes').innerHTML = html.join('');
  }

  vistaEl.querySelector('#lista-extras').innerHTML = extras.length
    ? extras.map(e => `
      <div class="fila" data-id="${e.id}">
        <div class="fila__icono fila__icono--ingreso">${icono('masa')}</div>
        <div class="fila__cuerpo"><div class="fila__titulo">${escaparHTML(e.nombre)}</div><div class="fila__meta">${formatoFecha(e.fecha)} · ${escaparHTML(e.categoria || 'no category')}</div></div>
        <div class="numero positivo">${formatoMoneda(e.monto)}</div>
        <div class="fila__acciones">
          <button class="btn-icono btn-editar-extra" data-id="${e.id}" title="Edit" aria-label="Edit">${icono('editar')}</button>
          <button class="btn-icono peligro btn-eliminar-extra" data-id="${e.id}" title="Delete" aria-label="Delete">${icono('eliminar')}</button>
        </div>
      </div>`).join('')
    : estadoVacio('No extra income registered yet.', 'masa');

  vistaEl.querySelector('#btn-nuevo-recurrente').addEventListener('click', () => {
    if (cuentas.length === 0) { mostrarToast('Register a debit account first', 'error'); return; }
    abrirModalRecurrente(cuentas, () => render(vistaEl), null);
  });
  vistaEl.querySelector('#btn-nuevo-extra').addEventListener('click', () => {
    if (cuentas.length === 0) { mostrarToast('Register a debit account first', 'error'); return; }
    abrirModalExtra(cuentas, () => render(vistaEl));
  });

  const listaRec = vistaEl.querySelector('#lista-recurrentes');
  delegarClicEliminar(listaRec, '.btn-eliminar', (id) => confirmarYEliminar({
    mensaje: 'This recurring income will be deleted. Payments you already received stay in your history.',
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
    const buscar = (b) => recurrentes.find(x => String(x.id) === String(b.dataset.id));

    if (btnFecha) {
      const r = buscar(btnFecha);
      await conBotonOcupado(btnFecha, async () => {
        try {
          await aplicarRecurrente({ recurrente: r, cuentaDebitoId: r.cuenta_destino_id || cuentas[0].id, monto: r.monto, fecha: btnFecha.dataset.fecha });
          mostrarToast('Paycheck confirmed', 'exito');
          await render(vistaEl);
        } catch (err) { console.error(err); mostrarToast('Could not confirm the paycheck', 'error'); }
      });
      return;
    }
    if (btnDeshacerFecha) {
      await conBotonOcupado(btnDeshacerFecha, async () => {
        try {
          const [tx] = await consultar(`SELECT * FROM transacciones WHERE id = $1`, [btnDeshacerFecha.dataset.txid]);
          if (tx) await revertirTransaccion(tx);
          mostrarToast('Payment undone', 'info');
          await render(vistaEl);
        } catch (err) { console.error(err); mostrarToast('Could not undo the payment', 'error'); }
      });
      return;
    }
    if (btnDeshacer) {
      const r = buscar(btnDeshacer);
      await conBotonOcupado(btnDeshacer, async () => {
        try {
          const tx = await transaccionesDelPeriodoDeRecurrente(r, ['recurrente']);
          for (const t of tx) await revertirTransaccion(t);
          await ejecutar(`UPDATE recurrentes SET estado='pendiente' WHERE id=$1`, [r.id]);
          mostrarToast('Payment undone — back to pending', 'info');
          await render(vistaEl);
        } catch (err) { console.error(err); mostrarToast('Could not undo the payment', 'error'); }
      });
      return;
    }
    if (btnEditar) {
      abrirModalRecurrente(cuentas, () => render(vistaEl), buscar(btnEditar));
      return;
    }
    if (btnSD) {
      // Marks as received without moving money (already recorded elsewhere).
      await ejecutar(`UPDATE recurrentes SET estado = 'pagado', ultima_aplicacion = $1 WHERE id = $2`, [hoyISO(), btnSD.dataset.id]);
      mostrarToast('Marked as received (no deposit added)', 'exito');
      await render(vistaEl);
      return;
    }
    if (!btn) return;
    const r = buscar(btn);
    if (!r) return;
    await conBotonOcupado(btn, async () => {
      try {
        await aplicarRecurrente({ recurrente: r, cuentaDebitoId: r.cuenta_destino_id || cuentas[0].id, monto: r.monto, fecha: hoyISO() });
        mostrarToast('Payment confirmed', 'exito');
        await render(vistaEl);
      } catch (err) {
        console.error(err);
        mostrarToast('Could not confirm the payment', 'error');
      }
    });
  });

  const listaExtras = vistaEl.querySelector('#lista-extras');
  delegarClicEliminar(listaExtras, '.btn-eliminar-extra', (id) => confirmarYEliminar({
    mensaje: 'This extra income entry will be deleted and the amount will be removed from your account balance.',
    accion: async () => {
      // Revert the ledger entry first, or the account keeps the deleted income.
      const tx = await consultar(`SELECT * FROM transacciones WHERE ref_tabla='ingresos_extra' AND ref_id=$1 ORDER BY id DESC`, [id]);
      for (const t of tx) await revertirTransaccion(t);
      await ejecutar(`DELETE FROM ingresos_extra WHERE id = $1`, [id]);
    },
    alExito: () => render(vistaEl),
  }));
  listaExtras.addEventListener('click', (e) => {
    const btnEditar = e.target.closest('.btn-editar-extra');
    if (!btnEditar) return;
    const extra = extras.find(x => String(x.id) === String(btnEditar.dataset.id));
    abrirModalEditarExtra(extra, cuentas, () => render(vistaEl));
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

async function pintarGraficaIngresos6Meses() {
  const meses = ultimosMeses(6);
  const totales = [];
  for (const m of meses) {
    const [fila] = await consultar(`SELECT COALESCE(SUM(monto),0) AS t FROM transacciones WHERE fecha LIKE $1 AND ${SQL_ES_INGRESO}`, [`${m}%`]);
    totales.push(fila?.t || 0);
  }
  const canvas = document.getElementById('grafica-ingresos-6m');
  if (!canvas) return;
  incomeChart?.destroy();
  incomeChart = graficaBarrasPorMes(canvas, {
    etiquetas: meses.map(m => etiquetaMesCorta(m, idioma())),
    valores: totales,
    nombreSerie: idioma() === 'es' ? 'Ingresos' : 'Income',
    color: coloresTema().ganancia,
  });
}

function abrirModalRecurrente(cuentas, alGuardar, registro = null) {
  const editando = !!registro;
  const diasGuardados = (() => { try { return JSON.parse(registro?.dias_de_pago || '[]').join(','); } catch { return ''; } })();
  const { overlay, cerrar } = abrirModal(`
    <h3 class="modal__titulo">${editando ? 'Edit fixed income' : 'New fixed income'}</h3>
    <p class="modal__subtitulo">A salary or any income that repeats. You confirm each payment when it arrives.</p>
    <form id="form-recurrente">
      <div class="campo"><label class="campo__etiqueta">Name</label><input class="campo__control" name="nombre" placeholder="Salary, freelance…" required value="${escaparHTML(registro?.nombre || '')}" /><div class="campo__error"></div></div>
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
            <option value="semanal" ${registro?.periodicidad === 'semanal' ? 'selected' : ''}>Weekly</option>
            <option value="quincenal" ${registro?.periodicidad === 'quincenal' ? 'selected' : ''}>Biweekly</option>
            <option value="mensual" ${!registro || registro?.periodicidad === 'mensual' ? 'selected' : ''}>Monthly</option>
            <option value="personalizada" ${registro?.periodicidad === 'personalizada' ? 'selected' : ''}>Custom</option>
          </select>
        </div>
      </div>
      <div class="campo" id="campo-dias" style="display:none;"><label class="campo__etiqueta">Payment days (e.g. 15,30)</label><input class="campo__control" name="dias_de_pago" placeholder="15,30" value="${escaparHTML(diasGuardados)}" /></div>
      <div class="campo" id="campo-intervalo" style="display:none;"><label class="campo__etiqueta">Every how many days</label><input class="campo__control" name="intervalo_dias" type="number" min="1" value="${registro?.intervalo_dias || ''}" /></div>
      <div class="campo__fila">
        <div class="campo"><label class="campo__etiqueta">Amount <span id="etq-monto">fixed</span></label><input class="campo__control" name="monto" inputmode="decimal" placeholder="0.00" required value="${registro?.monto || ''}" /><div class="campo__error"></div></div>
        <div class="campo"><label class="campo__etiqueta">Destination account</label>
          <select class="campo__control" name="cuenta_destino_id">${cuentas.map(c => `<option value="${c.id}" ${registro?.cuenta_destino_id === c.id ? 'selected' : ''}>${etiquetaDeCuentaConBanco(c)}</option>`).join('')}</select>
        </div>
      </div>
      <div class="modal__acciones">
        <button type="button" class="btn btn--fantasma" data-cerrar-modal>Cancel</button>
        <button type="submit" class="btn btn--primario">${editando ? 'Save changes' : 'Save income'}</button>
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
      ? form.dias_de_pago.value.split(',').map(n => Number(n.trim())).filter(n => n >= 1 && n <= 31)
      : [];

    await conBotonOcupado(form.querySelector('button[type=submit]'), async () => {
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
  });
}

function abrirModalExtra(cuentas, alGuardar) {
  const { overlay, cerrar } = abrirModal(`
    <h3 class="modal__titulo">Extra income</h3>
    <p class="modal__subtitulo">One-off money: a bonus, a refund, something you sold. It’s added to the account right away.</p>
    <form id="form-extra">
      <div class="campo"><label class="campo__etiqueta">Name</label><input class="campo__control" name="nombre" placeholder="Bonus, refund, sale…" required /><div class="campo__error"></div></div>
      <div class="campo__fila">
        <div class="campo"><label class="campo__etiqueta">Amount</label><input class="campo__control" name="monto" inputmode="decimal" placeholder="0.00" required /><div class="campo__error"></div></div>
        <div class="campo"><label class="campo__etiqueta">Date</label><input class="campo__control" type="date" name="fecha" value="${hoyISO()}" /></div>
      </div>
      <div class="campo__fila">
        <div class="campo"><label class="campo__etiqueta">Category</label><input class="campo__control" name="categoria" placeholder="Freelance" /></div>
        <div class="campo"><label class="campo__etiqueta">Destination account</label>
          <select class="campo__control" name="cuenta_destino_id">${cuentas.map(c => `<option value="${c.id}">${etiquetaDeCuentaConBanco(c)}</option>`).join('')}</select>
        </div>
      </div>
      <div class="modal__acciones">
        <button type="button" class="btn btn--fantasma" data-cerrar-modal>Cancel</button>
        <button type="submit" class="btn btn--primario">Save income</button>
      </div>
    </form>
  `);
  const form = overlay.querySelector('#form-extra');
  activarInputMoneda(form.monto);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const campoNombre = form.nombre.closest('.campo');
    const campoMonto = form.monto.closest('.campo');
    limpiarError(campoNombre); limpiarError(campoMonto);
    const monto = valorNumericoDeInputMoneda(form.monto);
    if (!form.nombre.value.trim()) { marcarError(campoNombre, 'Enter a name'); return; }
    if (!monto || monto <= 0) { marcarError(campoMonto, 'Enter a valid amount'); return; }

    await conBotonOcupado(form.querySelector('button[type=submit]'), async () => {
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
  });
}

/** Edits an extra income entry. If the amount, date or account changes, the
 * ledger entry is reverted and posted again with the new values — before,
 * only the list changed and the account balance and totals kept the old
 * amount. */
async function abrirModalEditarExtra(extra, cuentas, alGuardar) {
  const [txActual] = await consultar(`SELECT * FROM transacciones WHERE ref_tabla='ingresos_extra' AND ref_id=$1 ORDER BY id DESC LIMIT 1`, [extra.id]);
  const cuentaActual = txActual?.destino?.startsWith('debito:') ? Number(txActual.destino.split(':')[1]) : cuentas[0]?.id;
  const { overlay, cerrar } = abrirModal(`
    <h3 class="modal__titulo">Edit extra income</h3>
    <form id="form-editar-extra">
      <div class="campo"><label class="campo__etiqueta">Name</label><input class="campo__control" name="nombre" required value="${escaparHTML(extra.nombre)}" /><div class="campo__error"></div></div>
      <div class="campo__fila">
        <div class="campo"><label class="campo__etiqueta">Amount</label><input class="campo__control" name="monto" inputmode="decimal" placeholder="0.00" required value="${extra.monto}" /><div class="campo__error"></div></div>
        <div class="campo"><label class="campo__etiqueta">Date</label><input class="campo__control" type="date" name="fecha" value="${extra.fecha}" /></div>
      </div>
      <div class="campo__fila">
        <div class="campo"><label class="campo__etiqueta">Category</label><input class="campo__control" name="categoria" value="${escaparHTML(extra.categoria || '')}" /></div>
        <div class="campo"><label class="campo__etiqueta">Destination account</label>
          <select class="campo__control" name="cuenta_destino_id">${cuentas.map(c => `<option value="${c.id}" ${c.id === cuentaActual ? 'selected' : ''}>${etiquetaDeCuentaConBanco(c)}</option>`).join('')}</select>
        </div>
      </div>
      <div class="campo"><label class="campo__etiqueta">Notes</label><input class="campo__control" name="notas" value="${escaparHTML(extra.notas || '')}" /></div>
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
    const nombre = form.nombre.value.trim();
    const categoria = form.categoria.value.trim() || null;
    const fecha = form.fecha.value || extra.fecha;
    const cuentaId = Number(form.cuenta_destino_id.value);

    await conBotonOcupado(form.querySelector('button[type=submit]'), async () => {
      try {
        const cambioDinero = monto !== extra.monto || fecha !== extra.fecha || cuentaId !== cuentaActual || !txActual;
        if (cambioDinero) {
          if (txActual) await revertirTransaccion(txActual);
          await registrarIngreso({
            cuentaDebitoId: cuentaId, monto, categoria: categoria || 'ingreso_extra',
            notas: nombre, fecha, refTabla: 'ingresos_extra', refId: extra.id,
          });
        } else {
          await ejecutar(`UPDATE transacciones SET notas=$1, categoria=$2 WHERE id=$3`, [nombre, categoria || 'ingreso_extra', txActual.id]);
        }
        await ejecutar(
          `UPDATE ingresos_extra SET nombre=$1, categoria=$2, fecha=$3, monto=$4, notas=$5 WHERE id=$6`,
          [nombre, categoria, fecha, monto, form.notas.value.trim() || null, extra.id]
        );
        mostrarToast('Income updated', 'exito');
        cerrar();
        alGuardar();
      } catch (err) {
        console.error(err);
        mostrarToast('Could not update the income', 'error');
      }
    });
  });
}
