import { consultar, ejecutar } from '../db.js';
import { crearPrestamo, abonarCapitalPrestamo } from '../ledger.js';
import { formatoMoneda, formatoFecha, hoyISO, activarInputMoneda, valorNumericoDeInputMoneda } from '../formato.js';
import { icono } from '../iconos.js';
import { abrirModal, marcarError, limpiarError } from '../ui.js';
import { mostrarToast } from '../toasts.js';
import { confirmarYEliminar, delegarClicEliminar } from '../eliminar.js';
import { sincronizarPrestamos, calcularPagoMensual } from '../sincronizarPrestamos.js';

// Se mantiene fuera de render() para que el filtro sobreviva entre
// re-renders de la misma sesión (mismo criterio que el toggle de
// "mostrar liquidados" que ya usas en otras vistas con estado local).
let mostrarLiquidados = true;

export async function render(vistaEl) {
  const cuentas = await consultar(`SELECT id, nombre FROM cuentas_debito`);
  await sincronizarPrestamos();
  const prestamos = await consultar(`SELECT * FROM prestamos ORDER BY estado ASC, activo DESC, creado_en DESC`);

  const activos = prestamos.filter(p => p.estado === 'activo');
  const totalDeuda = activos.reduce((a, p) => a + p.saldo_actual, 0);
  const totalMensualidad = activos.filter(p => p.activo).reduce((a, p) => a + p.pago_mensual, 0);
  const visibles = mostrarLiquidados ? prestamos : prestamos.filter(p => p.estado !== 'liquidado');

  vistaEl.innerHTML = `
    <div class="vista__encabezado">
      <div><h1>Loans</h1><p>Track personal loans, their interest, and their payoff progress</p></div>
      <button class="btn btn--primario" id="btn-nuevo-prestamo">${icono('prestamo')} New loan</button>
    </div>

    <div class="grid-kpis" style="margin-bottom:14px;">
      <div class="tarjeta"><div class="kpi__etiqueta">${icono('alerta')} Total owed</div><div class="kpi__valor numero negativo">${formatoMoneda(totalDeuda)}</div></div>
      <div class="tarjeta"><div class="kpi__etiqueta">${icono('recurrente')} Monthly payments committed</div><div class="kpi__valor numero negativo">${formatoMoneda(totalMensualidad)}</div></div>
    </div>

    <div class="tarjeta">
      <div style="display:flex; align-items:center; justify-content:flex-end; margin-bottom:10px;">
        <label style="display:flex; align-items:center; gap:6px; font-size:12.5px; opacity:.85; cursor:pointer;">
          <input type="checkbox" id="chk-mostrar-liquidados" ${mostrarLiquidados ? 'checked' : ''} />
          Show paid-off loans
        </label>
      </div>
      <div class="lista" id="lista-prestamos"></div>
    </div>
  `;

  vistaEl.querySelector('#lista-prestamos').innerHTML = visibles.length
    ? visibles.map(p => filaPrestamo(p)).join('')
    : `<div class="estado-vacio">${icono('prestamo')}<h3>No loans registered yet</h3><p>Register a loan you're paying off — new or one you already had running.</p></div>`;

  vistaEl.querySelector('#btn-nuevo-prestamo').addEventListener('click', () => abrirModalCrearPrestamo(cuentas, () => render(vistaEl)));
  vistaEl.querySelector('#chk-mostrar-liquidados').addEventListener('change', (e) => {
    mostrarLiquidados = e.target.checked;
    render(vistaEl);
  });

  const lista = vistaEl.querySelector('#lista-prestamos');

  lista.querySelectorAll('.btn-editar-prestamo').forEach(btn =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const p = prestamos.find(x => String(x.id) === btn.dataset.id);
      abrirModalEditarPrestamo(p, cuentas, () => render(vistaEl));
    })
  );

  lista.querySelectorAll('.btn-pausar-prestamo').forEach(btn =>
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const p = prestamos.find(x => String(x.id) === btn.dataset.id);
      const nuevoActivo = p.activo ? 0 : 1;
      try {
        await ejecutar(`UPDATE prestamos SET activo = $1 WHERE id = $2`, [nuevoActivo, p.id]);
        mostrarToast(nuevoActivo ? 'Loan resumed' : 'Loan paused — no monthly charge while paused', 'exito');
        render(vistaEl);
      } catch (err) {
        console.error(err);
        mostrarToast('Could not update the loan', 'error');
      }
    })
  );

  lista.querySelectorAll('.btn-abono-prestamo').forEach(btn =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const p = prestamos.find(x => String(x.id) === btn.dataset.id);
      abrirModalAbonoCapital(p, cuentas, () => render(vistaEl));
    })
  );

  lista.querySelectorAll('.btn-amortizacion-prestamo').forEach(btn =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const p = prestamos.find(x => String(x.id) === btn.dataset.id);
      abrirModalAmortizacion(p);
    })
  );

  delegarClicEliminar(lista, '.btn-eliminar-prestamo', (id) => confirmarYEliminar({
    mensaje: 'This loan will be deleted. This does not revert past payments already applied.',
    accion: async () => {
      // Mismo patrón que borrar una tarjeta: limpiar el recurrente ligado
      // antes de borrar el préstamo, para no dejar huérfanos.
      await ejecutar(`DELETE FROM recurrentes WHERE prestamo_id = $1`, [id]);
      await ejecutar(`DELETE FROM prestamos WHERE id = $1`, [id]);
    },
    alExito: () => render(vistaEl),
  }));
}

function filaPrestamo(p) {
  const progreso = p.plazo_meses ? Math.min(100, Math.round((p.meses_pagados / p.plazo_meses) * 100)) : 0;
  const liquidado = p.estado === 'liquidado';
  const pausado = !liquidado && !p.activo;
  return `
    <div class="fila" data-id="${p.id}" style="flex-wrap:wrap; opacity:${liquidado ? .6 : 1};">
      <div class="fila__icono">${icono('prestamo')}</div>
      <div class="fila__cuerpo">
        <div class="fila__titulo">
          ${p.nombre}
          ${liquidado ? '<span class="badge badge--pagado">Paid off</span>' : ''}
          ${pausado ? '<span class="badge">Paused</span>' : ''}
        </div>
        <div class="fila__meta">
          ${p.tasa_interes}% annual · ${p.meses_pagados}/${p.plazo_meses} payments (${progreso}%) · Statement day ${p.fecha_corte || '—'} · Monthly payment ${formatoMoneda(p.pago_mensual)}
        </div>
        <div style="height:6px; border-radius:4px; background:rgba(255,255,255,.08); overflow:hidden; margin-top:8px; max-width:320px;">
          <div style="height:100%; width:${progreso}%; border-radius:4px; background:${liquidado ? '#4ade80' : '#60a5fa'}; transition:width .3s;"></div>
        </div>
      </div>
      <div class="numero negativo">${formatoMoneda(p.saldo_actual)}</div>
      <div class="fila__acciones">
        ${!liquidado ? `<button class="btn-icono btn-amortizacion-prestamo" data-id="${p.id}" title="View amortization schedule">${icono('historial')}</button>` : ''}
        ${!liquidado ? `<button class="btn-icono btn-abono-prestamo" data-id="${p.id}" title="Extra principal payment">${icono('masa')}</button>` : ''}
        ${!liquidado ? `<button class="btn-icono btn-pausar-prestamo" data-id="${p.id}" title="${p.activo ? 'Pause loan' : 'Resume loan'}">${icono(p.activo ? 'reloj' : 'check')}</button>` : ''}
        ${!liquidado ? `<button class="btn-icono btn-editar-prestamo" data-id="${p.id}" title="Edit loan">${icono('editar')}</button>` : ''}
        <button class="btn-icono peligro btn-eliminar-prestamo" data-id="${p.id}">${icono('eliminar')}</button>
      </div>
    </div>`;
}

function abrirModalCrearPrestamo(cuentas, alGuardar) {
  const { overlay, cerrar } = abrirModal(`
    <h3 class="modal__titulo">New loan</h3>
    <form id="form-prestamo">
      <div class="campo"><label class="campo__etiqueta">Name</label><input class="campo__control" name="nombre" placeholder="Car loan, personal loan…" required /><div class="campo__error"></div></div>
      <div class="campo__fila">
        <div class="campo"><label class="campo__etiqueta">Original amount</label><input class="campo__control" name="monto_original" inputmode="decimal" placeholder="0.00" required /><div class="campo__error"></div></div>
        <div class="campo"><label class="campo__etiqueta">Annual interest rate (%)</label><input class="campo__control" name="tasa_interes" type="number" step="0.01" min="0" placeholder="0" /></div>
      </div>
      <div class="campo__fila">
        <div class="campo"><label class="campo__etiqueta">Total term (months)</label><input class="campo__control" name="plazo_meses" type="number" min="1" required /></div>
        <div class="campo"><label class="campo__etiqueta">Statement/payment day</label><input class="campo__control" name="fecha_corte" type="number" min="1" max="31" /></div>
      </div>
      <div class="campo"><label class="campo__etiqueta">Start date</label><input class="campo__control" type="date" name="fecha_inicio" value="${hoyISO()}" /></div>

      <div class="campo">
        <label class="campo__etiqueta"><input type="checkbox" name="ya_iniciado" /> I already have this loan running (some payments already made outside the app)</label>
      </div>

      <div id="campo-nuevo">
        <div class="campo"><label class="campo__etiqueta">Deposit the loan amount into an account?</label>
          <select class="campo__control" name="cuenta_destino_id">
            <option value="">No — I already have the money / don't track this deposit</option>
            ${cuentas.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')}
          </select>
        </div>
      </div>

      <div id="campo-ya-iniciado" style="display:none;">
        <div class="campo__fila">
          <div class="campo"><label class="campo__etiqueta">Remaining balance owed today</label><input class="campo__control" name="saldo_actual" inputmode="decimal" placeholder="0.00" /></div>
          <div class="campo"><label class="campo__etiqueta">Payments already made</label><input class="campo__control" name="meses_pagados" type="number" min="0" /></div>
        </div>
      </div>

      <div class="campo"><label class="campo__etiqueta">Notes</label><textarea class="campo__control" name="notas" rows="2" placeholder="Optional"></textarea></div>

      <div class="campo"><label class="campo__etiqueta">Pay from account</label>
        <select class="campo__control" name="cuenta_pago_id" required>${cuentas.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')}</select>
      </div>

      <p id="pago-preview" style="font-size:12.5px; margin:4px 0 12px; opacity:.85;"></p>

      <div class="modal__acciones">
        <button type="button" class="btn btn--fantasma" data-cerrar-modal>Cancel</button>
        <button type="submit" class="btn btn--primario">Save</button>
      </div>
    </form>`);

  const form = overlay.querySelector('#form-prestamo');
  activarInputMoneda(form.monto_original);
  activarInputMoneda(form.saldo_actual);

  const alternarYaIniciado = () => {
    const yaIniciado = form.ya_iniciado.checked;
    overlay.querySelector('#campo-ya-iniciado').style.display = yaIniciado ? 'block' : 'none';
    overlay.querySelector('#campo-nuevo').style.display = yaIniciado ? 'none' : 'block';
    actualizarPreview();
  };
  form.ya_iniciado.addEventListener('change', alternarYaIniciado);

  // Live preview of the amortized monthly payment, so the user sees the
  // real number before saving instead of guessing it themselves.
  const actualizarPreview = () => {
    const preview = overlay.querySelector('#pago-preview');
    const yaIniciado = form.ya_iniciado.checked;
    const montoOriginal = valorNumericoDeInputMoneda(form.monto_original);
    const tasa = Number(form.tasa_interes.value) || 0;
    const plazo = Number(form.plazo_meses.value) || 0;
    const mesesPagados = yaIniciado ? (Number(form.meses_pagados.value) || 0) : 0;
    const saldo = yaIniciado ? (valorNumericoDeInputMoneda(form.saldo_actual) || 0) : montoOriginal;
    const mesesRestantes = plazo - mesesPagados;
    if (!saldo || !plazo || mesesRestantes <= 0) { preview.textContent = ''; return; }
    const pago = calcularPagoMensual(saldo, tasa, mesesRestantes);
    preview.textContent = `Estimated monthly payment: ${formatoMoneda(pago)} for ${mesesRestantes} remaining months.`;
  };
  ['input', 'change'].forEach(ev => {
    form.monto_original.addEventListener(ev, actualizarPreview);
    form.tasa_interes.addEventListener(ev, actualizarPreview);
    form.plazo_meses.addEventListener(ev, actualizarPreview);
    form.saldo_actual.addEventListener(ev, actualizarPreview);
    form.meses_pagados.addEventListener(ev, actualizarPreview);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const campoNombre = form.nombre.closest('.campo');
    const campoMonto = form.monto_original.closest('.campo');
    limpiarError(campoNombre); limpiarError(campoMonto);
    const montoOriginal = valorNumericoDeInputMoneda(form.monto_original);
    let valido = true;
    if (!form.nombre.value.trim()) { marcarError(campoNombre, 'Enter a name'); valido = false; }
    if (!montoOriginal || montoOriginal <= 0) { marcarError(campoMonto, 'Enter a valid amount'); valido = false; }
    if (!valido) return;
    if (cuentas.length === 0) { mostrarToast('Register a debit account first', 'error'); return; }

    const yaIniciado = form.ya_iniciado.checked;
    const tasaInteres = Number(form.tasa_interes.value) || 0;
    const plazoMeses = Number(form.plazo_meses.value) || 1;
    const mesesPagados = yaIniciado ? (Number(form.meses_pagados.value) || 0) : 0;
    const saldoInicial = yaIniciado ? (valorNumericoDeInputMoneda(form.saldo_actual) || 0) : montoOriginal;
    const mesesRestantes = plazoMeses - mesesPagados;
    if (mesesRestantes <= 0) { mostrarToast('Payments already made cannot reach or exceed the total term', 'error'); return; }
    const pagoMensual = calcularPagoMensual(saldoInicial, tasaInteres, mesesRestantes);

    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.classList.add('btn--carga');
    try {
      await crearPrestamo({
        nombre: form.nombre.value.trim(),
        montoOriginal,
        saldoInicial,
        tasaInteres,
        plazoMeses,
        mesesPagados,
        pagoMensual,
        fechaInicio: form.fecha_inicio.value || hoyISO(),
        fechaCorte: Number(form.fecha_corte.value) || null,
        // A new loan only deposits money if the user picked an account.
        cuentaDestinoId: !yaIniciado && form.cuenta_destino_id.value ? Number(form.cuenta_destino_id.value) : null,
        cuentaPagoId: Number(form.cuenta_pago_id.value),
        notas: form.notas.value.trim() || null,
      });
      mostrarToast('Loan registered', 'exito');
      cerrar(); alGuardar();
    } catch (err) {
      console.error(err);
      mostrarToast('Could not save the loan', 'error');
      btn.disabled = false; btn.classList.remove('btn--carga');
    }
  });
}

// Editable libremente: nombre, tasa de interés, plazo, día de corte, cuenta
// de pago, notas. monto_original / saldo_actual / meses_pagados quedan
// protegidos aquí — solo cambian a través de pagos reales o de un abono a
// capital, nunca desde este formulario, para no descuadrar el historial
// (mismo criterio que ya usas con el monto de un gasto).
function abrirModalEditarPrestamo(prestamo, cuentas, alGuardar) {
  const { overlay, cerrar } = abrirModal(`
    <h3 class="modal__titulo">Edit loan</h3>
    <p style="font-size:12.5px; opacity:.75; margin:-6px 0 14px;">
      Remaining balance and payments made can't be edited here — they only change through real payments or an extra principal payment.
    </p>
    <form id="form-editar-prestamo">
      <div class="campo"><label class="campo__etiqueta">Name</label><input class="campo__control" name="nombre" value="${prestamo.nombre}" required /><div class="campo__error"></div></div>
      <div class="campo__fila">
        <div class="campo"><label class="campo__etiqueta">Annual interest rate (%)</label><input class="campo__control" name="tasa_interes" type="number" step="0.01" min="0" value="${prestamo.tasa_interes}" /></div>
        <div class="campo"><label class="campo__etiqueta">Total term (months)</label><input class="campo__control" name="plazo_meses" type="number" min="${prestamo.meses_pagados + 1}" value="${prestamo.plazo_meses}" required /><div class="campo__error"></div></div>
      </div>
      <div class="campo__fila">
        <div class="campo"><label class="campo__etiqueta">Statement/payment day</label><input class="campo__control" name="fecha_corte" type="number" min="1" max="31" value="${prestamo.fecha_corte || ''}" /></div>
        <div class="campo"><label class="campo__etiqueta">Pay from account</label>
          <select class="campo__control" name="cuenta_pago_id">${cuentas.map(c => `<option value="${c.id}" ${c.id === prestamo.cuenta_pago_id ? 'selected' : ''}>${c.nombre}</option>`).join('')}</select>
        </div>
      </div>
      <div class="campo"><label class="campo__etiqueta">Notes</label><textarea class="campo__control" name="notas" rows="2">${prestamo.notas || ''}</textarea></div>

      <p id="pago-preview-editar" style="font-size:12.5px; margin:4px 0 12px; opacity:.85;"></p>

      <div class="modal__acciones">
        <button type="button" class="btn btn--fantasma" data-cerrar-modal>Cancel</button>
        <button type="submit" class="btn btn--primario">Save changes</button>
      </div>
    </form>`);

  const form = overlay.querySelector('#form-editar-prestamo');

  const actualizarPreview = () => {
    const preview = overlay.querySelector('#pago-preview-editar');
    const tasa = Number(form.tasa_interes.value) || 0;
    const plazo = Number(form.plazo_meses.value) || 0;
    const mesesRestantes = plazo - prestamo.meses_pagados;
    if (mesesRestantes <= 0) { preview.textContent = ''; return; }
    const pago = calcularPagoMensual(prestamo.saldo_actual, tasa, mesesRestantes);
    preview.textContent = `New monthly payment: ${formatoMoneda(pago)} for ${mesesRestantes} remaining months (recalculated on current balance ${formatoMoneda(prestamo.saldo_actual)}).`;
  };
  actualizarPreview();
  ['input', 'change'].forEach(ev => {
    form.tasa_interes.addEventListener(ev, actualizarPreview);
    form.plazo_meses.addEventListener(ev, actualizarPreview);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const campoNombre = form.nombre.closest('.campo');
    const campoPlazo = form.plazo_meses.closest('.campo');
    limpiarError(campoNombre); limpiarError(campoPlazo);
    let valido = true;
    if (!form.nombre.value.trim()) { marcarError(campoNombre, 'Enter a name'); valido = false; }
    const plazoMeses = Number(form.plazo_meses.value) || 0;
    const mesesRestantes = plazoMeses - prestamo.meses_pagados;
    if (mesesRestantes <= 0) { marcarError(campoPlazo, 'Term must be greater than payments already made'); valido = false; }
    if (!valido) return;

    const tasaInteres = Number(form.tasa_interes.value) || 0;
    const pagoMensual = calcularPagoMensual(prestamo.saldo_actual, tasaInteres, mesesRestantes);

    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.classList.add('btn--carga');
    try {
      await ejecutar(
        `UPDATE prestamos SET nombre = $1, tasa_interes = $2, plazo_meses = $3, pago_mensual = $4, fecha_corte = $5, cuenta_pago_id = $6, notas = $7 WHERE id = $8`,
        [form.nombre.value.trim(), tasaInteres, plazoMeses, pagoMensual, Number(form.fecha_corte.value) || null, Number(form.cuenta_pago_id.value) || null, form.notas.value.trim() || null, prestamo.id]
      );
      mostrarToast('Loan updated', 'exito');
      cerrar(); alGuardar();
    } catch (err) {
      console.error(err);
      mostrarToast('Could not update the loan', 'error');
      btn.disabled = false; btn.classList.remove('btn--carga');
    }
  });
}

// Abono a capital extra: reduce saldo_actual directamente, fuera del
// calendario normal de mensualidades (ver abonarCapitalPrestamo en el ledger).
function abrirModalAbonoCapital(prestamo, cuentas, alGuardar) {
  const { overlay, cerrar } = abrirModal(`
    <h3 class="modal__titulo">Extra principal payment</h3>
    <p style="font-size:12.5px; opacity:.75; margin:-6px 0 14px;">
      Pays down ${prestamo.nombre}'s balance directly, on top of the regular monthly payment. The monthly payment will be recalculated afterward.
    </p>
    <form id="form-abono-prestamo">
      <div class="campo"><label class="campo__etiqueta">Amount</label><input class="campo__control" name="monto" inputmode="decimal" placeholder="0.00" required /><div class="campo__error"></div></div>
      <div class="campo"><label class="campo__etiqueta">From account</label>
        <select class="campo__control" name="cuenta_debito_id" required>${cuentas.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')}</select>
      </div>
      <div class="campo"><label class="campo__etiqueta">Date</label><input class="campo__control" type="date" name="fecha" value="${hoyISO()}" /></div>
      <p style="font-size:12.5px; opacity:.85; margin:4px 0 12px;">Current balance: ${formatoMoneda(prestamo.saldo_actual)}</p>
      <div class="modal__acciones">
        <button type="button" class="btn btn--fantasma" data-cerrar-modal>Cancel</button>
        <button type="submit" class="btn btn--primario">Apply payment</button>
      </div>
    </form>`);

  const form = overlay.querySelector('#form-abono-prestamo');
  activarInputMoneda(form.monto);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const campoMonto = form.monto.closest('.campo');
    limpiarError(campoMonto);
    const monto = valorNumericoDeInputMoneda(form.monto);
    if (!monto || monto <= 0) { marcarError(campoMonto, 'Enter a valid amount'); return; }
    if (monto > prestamo.saldo_actual) { marcarError(campoMonto, `Cannot exceed the current balance (${formatoMoneda(prestamo.saldo_actual)})`); return; }

    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.classList.add('btn--carga');
    try {
      await abonarCapitalPrestamo({
        prestamo,
        cuentaDebitoId: Number(form.cuenta_debito_id.value),
        monto,
        fecha: form.fecha.value || hoyISO(),
      });
      mostrarToast('Extra payment applied — balance and monthly payment updated', 'exito');
      cerrar(); alGuardar();
    } catch (err) {
      console.error(err);
      mostrarToast('Could not apply the payment', 'error');
      btn.disabled = false; btn.classList.remove('btn--carga');
    }
  });
}

// Tabla de amortización estimada de los meses restantes — cálculo puro en
// frontend (mismo criterio que "Simulate" en inversiones.js), no toca la BD.
// Usa la misma fórmula de mensualidad fija que ya gobierna el préstamo real,
// separando interés/capital mes a mes igual que pagarPrestamo() en el ledger.
function abrirModalAmortizacion(prestamo) {
  const filas = [];
  let saldo = prestamo.saldo_actual;
  const tasaMensual = prestamo.tasa_interes / 100 / 12;
  const mesesRestantes = Math.max(0, prestamo.plazo_meses - prestamo.meses_pagados);

  for (let i = 1; i <= mesesRestantes && saldo > 0.005; i++) {
    const interes = Math.round(saldo * tasaMensual * 100) / 100;
    const capital = Math.min(saldo, Math.max(0, prestamo.pago_mensual - interes));
    saldo = Math.max(0, saldo - capital);
    filas.push({ mes: prestamo.meses_pagados + i, interes, capital, saldo });
  }

  const totalInteres = filas.reduce((a, f) => a + f.interes, 0);

  abrirModal(`
    <h3 class="modal__titulo">Estimated amortization — ${prestamo.nombre}</h3>
    <p style="font-size:12.5px; opacity:.75; margin:-6px 0 14px;">
      Assumes the current monthly payment stays fixed and no extra principal payments are made. Total remaining interest: ${formatoMoneda(totalInteres)}.
    </p>
    <div style="max-height:340px; overflow-y:auto;">
      <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
        <thead>
          <tr style="text-align:left; opacity:.7;">
            <th style="padding:6px 4px;">#</th>
            <th style="padding:6px 4px;">Interest</th>
            <th style="padding:6px 4px;">Principal</th>
            <th style="padding:6px 4px;">Remaining balance</th>
          </tr>
        </thead>
        <tbody>
          ${filas.map(f => `
            <tr style="border-top:1px solid rgba(255,255,255,.08);">
              <td style="padding:6px 4px;">${f.mes}</td>
              <td style="padding:6px 4px;" class="numero negativo">${formatoMoneda(f.interes)}</td>
              <td style="padding:6px 4px;" class="numero">${formatoMoneda(f.capital)}</td>
              <td style="padding:6px 4px;">${formatoMoneda(f.saldo)}</td>
            </tr>`).join('') || '<tr><td colspan="4" style="padding:10px 4px; opacity:.7;">No remaining months to project.</td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="modal__acciones">
      <button type="button" class="btn btn--fantasma" data-cerrar-modal>Close</button>
    </div>
  `);
}