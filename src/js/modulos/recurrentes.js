import { etiquetaDeCuentaConBanco } from '../etiquetas.js';
import { consultar, ejecutar } from '../db.js';
import { aplicarRecurrente, abonarRecurrente, revertirTransaccion, pagarTarjeta, pagarPrestamo, revertirPagoPrestamo } from '../ledger.js';
import { formatoMoneda, hoyISO, ultimosMeses, etiquetaMesCorta, activarInputMoneda, valorNumericoDeInputMoneda, escaparHTML } from '../formato.js';
import { icono } from '../iconos.js';
import { abrirModal, marcarError, limpiarError, conBotonOcupado } from '../ui.js';
import { mostrarToast } from '../toasts.js';
import { confirmarYEliminar, delegarClicEliminar } from '../eliminar.js';
import { idioma } from '../i18n.js';
import { sincronizarMensualidadesTC } from '../sincronizartc.js';
import { sincronizarPrestamos } from '../sincronizarPrestamos.js';
import { transaccionesDelPeriodoDeRecurrente } from '../consultas.js';
import { coloresTema, graficaBarrasPorMes } from '../graficas.js';

const MESES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const ETIQUETA_ESTADO = { pendiente: 'Pending', pagado: 'Paid', omitido: 'Skipped' };
const ORDEN_ESTADO = { pendiente: 0, omitido: 1, pagado: 2 };

let recurringChart; // Chart.js instance for the last-6-months recurring payments chart

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
const restante = (r) => Math.max(0, r.monto - (r.abonado || 0));

export async function render(vistaEl) {
  const cuentas = await consultar(`SELECT id, nombre, banco, saldo FROM cuentas_debito`);
  await sincronizarMensualidadesTC();
  await sincronizarPrestamos();
  const recurrentes = await consultar(`SELECT * FROM recurrentes WHERE tipo = 'gasto' ORDER BY creado_en DESC`);

  const activosEsteMes = recurrentes.filter(aplicaEsteMes);
  const totalPendiente = activosEsteMes.filter(r => r.estado === 'pendiente').reduce((a, r) => a + restante(r), 0);
  const totalPagado = activosEsteMes.filter(r => r.estado === 'pagado').reduce((a, r) => a + r.monto, 0)
    + activosEsteMes.filter(r => r.estado === 'pendiente').reduce((a, r) => a + (r.abonado || 0), 0);
  // Pendientes de este mes arriba; luego pagados/omitidos; al final lo pausado.
  const ordenados = [...recurrentes].sort((a, b) =>
    (aplicaEsteMes(b) - aplicaEsteMes(a)) || (ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado]) || (b.monto - a.monto));

  vistaEl.innerHTML = `
    <div class="vista__encabezado">
      <div><h1>Recurring expenses</h1><p>Rent, subscriptions, insurance, plus your card and loan installments. Everything goes back to pending at the start of each month.</p></div>
      <div class="vista__acciones"><button class="btn btn--primario" id="btn-nuevo-recurrente">${icono('masa')} New recurring expense</button></div>
    </div>

    <div class="grid-kpis">
      <div class="tarjeta"><div class="kpi__etiqueta">${icono('calendario')} Pending this month</div><div class="kpi__valor numero negativo">${formatoMoneda(totalPendiente)}</div></div>
      <div class="tarjeta"><div class="kpi__etiqueta">${icono('check')} Already paid this month</div><div class="kpi__valor numero positivo">${formatoMoneda(totalPagado)}</div></div>
      <div class="tarjeta"><div class="kpi__etiqueta">${icono('recurrente')} Total committed</div><div class="kpi__valor numero">${formatoMoneda(totalPendiente + totalPagado)}</div></div>
    </div>

    <div class="tarjeta seccion"><div class="lista" id="lista-recurrentes"></div></div>

    <div class="tarjeta">
      <div class="panel__encabezado"><div><h3>Last 6 months</h3><p>Recurring payments made per month</p></div></div>
      <div class="grafica-envoltura grafica-envoltura--baja"><canvas id="grafica-recurrentes-6m"></canvas></div>
    </div>
  `;

  vistaEl.querySelector('#lista-recurrentes').innerHTML = ordenados.length
    ? ordenados.map(r => filaRecurrente(r)).join('')
    : `<div class="estado-vacio">${icono('recurrente')}<h3>No recurring expenses yet</h3><p>Register Netflix, gym, insurance, or any fixed monthly payment.</p></div>`;

  vistaEl.querySelector('#btn-nuevo-recurrente').addEventListener('click', () => {
    if (cuentas.length === 0) { mostrarToast('Register a debit account first', 'error'); return; }
    abrirModalRecurrente(cuentas, null, () => render(vistaEl));
  });

  const lista = vistaEl.querySelector('#lista-recurrentes');
  const buscar = (b) => recurrentes.find(x => String(x.id) === String(b.dataset.id));

  lista.addEventListener('click', (e) => {
    const btnMas = e.target.closest('.btn-mas-opciones');
    if (!btnMas) return;
    const id = btnMas.dataset.id;
    // The "⋮" menu is a modal (no z-index issues) that clicks the row's hidden
    // real buttons, so every action keeps a single implementation.
    const origen = document.getElementById(`acciones-ocultas-${id}`);
    const r = buscar(btnMas);
    const opciones = Array.from(origen.querySelectorAll('button')).map(b => ({ html: b.innerHTML, clase: b.className, disparar: () => b.click() }));
    const { overlay, cerrar } = abrirModal(`
      <h3 class="modal__titulo">${escaparHTML(r?.nombre || 'Options')}</h3>
      <div class="lista" id="modal-opciones-lista" style="margin-top:10px;"></div>
    `, { clase: 'modal--opciones' });
    const cont = overlay.querySelector('#modal-opciones-lista');
    cont.innerHTML = opciones.map((o, i) => `<button class="menu-acciones__item ${o.clase.includes('peligro') ? 'peligro' : ''}" data-i="${i}">${o.html}</button>`).join('');
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
    const btnEditar = e.target.closest('.btn-editar');
    const btnActivo = e.target.closest('.toggle-activo');

    if (btnDeshacerPago) {
      const r = buscar(btnDeshacerPago);
      await conBotonOcupado(btnDeshacerPago, async () => {
        try {
          await deshacerPagoDelPeriodo(r);
          mostrarToast('Payment undone — back to pending', 'info');
          await render(vistaEl);
        } catch (err) { console.error(err); mostrarToast('Could not undo the payment', 'error'); }
      });
      return;
    }
    if (btnAbonar) {
      const r = buscar(btnAbonar);
      if (r.tarjeta_id || r.prestamo_id) { mostrarToast('Card and loan payments must be made in full from Recurring', 'error'); return; }
      if (cuentas.length === 0) { mostrarToast('Register a debit account first', 'error'); return; }
      abrirModalAbono(r, cuentas, () => render(vistaEl));
      return;
    }
    if (btnEditar) {
      abrirModalRecurrente(cuentas, buscar(btnEditar), () => render(vistaEl));
      return;
    }
    if (btnActivo) {
      await ejecutar(`UPDATE recurrentes SET activo = $1 WHERE id = $2`, [btnActivo.checked ? 1 : 0, btnActivo.dataset.id]);
      mostrarToast(btnActivo.checked ? 'Recurring expense reactivated' : 'Recurring expense paused', 'info');
      await render(vistaEl);
      return;
    }
    if (btnPagar) {
      const r = buscar(btnPagar);
      if (cuentas.length === 0) { mostrarToast('Register a debit account first', 'error'); return; }
      if (r.tarjeta_id || r.prestamo_id) {
        abrirModalPagarTarjetaOPrestamo(r, cuentas, () => render(vistaEl));
        return;
      }
      await conBotonOcupado(btnPagar, async () => {
        try {
          await aplicarRecurrente({ recurrente: r, cuentaDebitoId: r.cuenta_destino_id || cuentas[0].id, monto: restante(r), fecha: hoyISO() });
          mostrarToast('Marked as paid and deducted', 'exito');
          await render(vistaEl);
        } catch (err) { console.error(err); mostrarToast('Could not mark as paid', 'error'); }
      });
      return;
    }
    if (btnPagarSD) {
      const r = buscar(btnPagarSD);
      if (r?.tarjeta_id || r?.prestamo_id) { mostrarToast('Card and loan payments must be made in full from Recurring', 'error'); return; }
      // Paid "outside" the app (cash, another account…): only the status changes.
      await ejecutar(`UPDATE recurrentes SET estado = 'pagado', ultima_aplicacion = $1 WHERE id = $2`, [hoyISO(), btnPagarSD.dataset.id]);
      mostrarToast('Marked as paid (no deduction)', 'exito');
      await render(vistaEl);
      return;
    }
    if (btnOmitir) {
      // La fecha permite que el reinicio mensual lo regrese a pendiente.
      await ejecutar(`UPDATE recurrentes SET estado = 'omitido', ultima_aplicacion = $1 WHERE id = $2`, [hoyISO(), btnOmitir.dataset.id]);
      mostrarToast('Recurring expense skipped this period', 'info');
      await render(vistaEl);
      return;
    }
    if (btnDeshacerOmitir) {
      await ejecutar(`UPDATE recurrentes SET estado = 'pendiente' WHERE id = $1`, [btnDeshacerOmitir.dataset.id]);
      mostrarToast('Skip undone — back to pending', 'info');
      await render(vistaEl);
    }
  });

  await pintarGraficaRecurrentes6Meses();
}

/** Reverts only THIS period's payments of a recurring item (see
 * transaccionesDelPeriodoDeRecurrente). Card payments go through the generic
 * reversal (it knows a card balance is debt); each one also gives back one
 * MSI installment. Loan payments restore the exact principal applied. */
async function deshacerPagoDelPeriodo(r) {
  const tx = await transaccionesDelPeriodoDeRecurrente(r, ['recurrente', 'abono_recurrente', 'pago_tc', 'pago_prestamo']);
  for (const t of tx) {
    if (t.tipo === 'pago_prestamo') {
      const [pr] = await consultar(`SELECT * FROM prestamos WHERE id = $1`, [r.prestamo_id]);
      if (pr) await revertirPagoPrestamo(t, pr);
      else await revertirTransaccion(t);
    } else {
      await revertirTransaccion(t);
      if (t.tipo === 'pago_tc' && r.gasto_id) {
        await ejecutar(`UPDATE gastos SET msi_pagados = MAX(0, msi_pagados - 1) WHERE id = $1`, [r.gasto_id]);
      }
    }
  }
  await ejecutar(`UPDATE recurrentes SET estado='pendiente', abonado=0 WHERE id=$1`, [r.id]);
}

/** Card installments and loan payments: asks where the money comes from.
 * Before, it always came out of the first debit account with no choice, and
 * the "Reserved for Card Payments" box could never be used to pay. */
async function abrirModalPagarTarjetaOPrestamo(r, cuentas, alGuardar) {
  const monto = restante(r);
  const esTarjeta = !!r.tarjeta_id;
  const [reserva] = esTarjeta ? await consultar(`SELECT id, nombre, saldo FROM cajas WHERE es_sistema = 1 LIMIT 1`) : [];
  const cuentaSugerida = r.cuenta_destino_id || cuentas[0].id;
  const opcion = (valor, titulo, saldo, marcada) => {
    const alcanza = saldo >= monto;
    return `
      <label class="opcion-pago ${alcanza ? '' : 'opcion-pago--deshabilitada'}">
        <input type="radio" name="origen" value="${valor}" ${marcada && alcanza ? 'checked' : ''} ${alcanza ? '' : 'disabled'} />
        <div class="fila__cuerpo"><div class="fila__titulo">${titulo}</div><div class="fila__meta">Available ${formatoMoneda(saldo)}${alcanza ? '' : ' — not enough'}</div></div>
      </label>`;
  };
  const { overlay, cerrar } = abrirModal(`
    <h3 class="modal__titulo">Pay ${escaparHTML(r.nombre)}</h3>
    <p class="modal__subtitulo">${formatoMoneda(monto)} will come out of the account you choose${esTarjeta ? ' and lower the card’s debt' : ' and lower the loan’s balance'}.</p>
    <form id="form-pagar">
      <div class="opciones-pago">
        ${cuentas.map(c => opcion(`debito:${c.id}`, etiquetaDeCuentaConBanco(c), c.saldo, c.id === cuentaSugerida)).join('')}
        ${reserva ? opcion('reserva', 'Reserved for Card Payments', reserva.saldo, false) : ''}
      </div>
      <div class="campo__error" id="error-origen" style="margin-top:8px;"></div>
      <div class="modal__acciones">
        <button type="button" class="btn btn--fantasma" data-cerrar-modal>Cancel</button>
        <button type="submit" class="btn btn--primario">Pay ${formatoMoneda(monto)}</button>
      </div>
    </form>`);
  const form = overlay.querySelector('#form-pagar');
  if (!form.querySelector('input[name=origen]:checked')) form.querySelector('input[name=origen]:not([disabled])')?.click();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const elegido = form.querySelector('input[name=origen]:checked')?.value;
    const errorEl = overlay.querySelector('#error-origen');
    if (!elegido) { errorEl.textContent = 'None of your accounts has enough balance for this payment.'; errorEl.style.display = 'block'; return; }
    const usarReservaTC = elegido === 'reserva';
    const cuentaDebitoId = usarReservaTC ? null : Number(elegido.split(':')[1]);

    await conBotonOcupado(form.querySelector('button[type=submit]'), async () => {
      try {
        if (esTarjeta) {
          await pagarTarjeta({ tarjetaId: r.tarjeta_id, cuentaDebitoId, usarReservaTC, monto, fecha: hoyISO(), refTabla: 'recurrentes', refId: r.id });
          if (r.gasto_id) await ejecutar(`UPDATE gastos SET msi_pagados = msi_pagados + 1 WHERE id = $1`, [r.gasto_id]);
        } else {
          const [pr] = await consultar(`SELECT * FROM prestamos WHERE id = $1`, [r.prestamo_id]);
          await pagarPrestamo({ prestamo: pr, cuentaDebitoId, monto, fecha: hoyISO(), refTabla: 'recurrentes', refId: r.id });
        }
        await ejecutar(`UPDATE recurrentes SET estado='pagado', abonado=0, ultima_aplicacion=$1 WHERE id=$2`, [hoyISO(), r.id]);
        mostrarToast('Payment registered', 'exito');
        cerrar();
        alGuardar();
      } catch (err) {
        console.error(err);
        mostrarToast(String(err).includes('INSUFFICIENT_RESERVE_BALANCE') ? 'Not enough money reserved for card payments' : 'Could not mark as paid', 'error');
      }
    });
  });
}

async function pintarGraficaRecurrentes6Meses() {
  const meses = ultimosMeses(6);
  const totales = [];
  for (const m of meses) {
    const [fila] = await consultar(
      `SELECT COALESCE(SUM(monto),0) AS t FROM transacciones
       WHERE fecha LIKE $1 AND ref_tabla = 'recurrentes' AND origen <> 'externo'
         AND tipo IN ('recurrente', 'abono_recurrente', 'pago_tc', 'pago_prestamo')`,
      [`${m}%`]
    );
    totales.push(fila?.t || 0);
  }
  const canvas = document.getElementById('grafica-recurrentes-6m');
  if (!canvas) return;
  recurringChart?.destroy();
  recurringChart = graficaBarrasPorMes(canvas, {
    etiquetas: meses.map(m => etiquetaMesCorta(m, idioma())),
    valores: totales,
    nombreSerie: idioma() === 'es' ? 'Pagos recurrentes' : 'Recurring payments',
    color: coloresTema().tinta2,
  });
}

function filaRecurrente(r) {
  const mapa = { semanal: 'Weekly', quincenal: 'Biweekly', mensual: 'Monthly', personalizada: `Every ${r.intervalo_dias} days` };
  const meses = mesesActivos(r);
  const etiquetaMeses = meses.length ? meses.map(m => MESES[m - 1]).join(', ') : 'Every month';
  const activo = r.activo === undefined || r.activo === null ? 1 : r.activo;
  // Card- and loan-linked rows must ALWAYS go through pagarTarjeta()/
  // pagarPrestamo() so the real debt goes down: "already paid (no
  // deduction)" and "partial payment" are hidden for them.
  const esDeTarjetaOPrestamo = !!r.tarjeta_id || !!r.prestamo_id;
  const origen = r.tarjeta_id ? 'Credit card' : r.prestamo_id ? 'Loan' : escaparHTML(r.categoria || 'no category');
  return `
    <div class="fila ${activo && aplicaEsteMes(r) ? '' : 'fila--pausada'}" data-id="${r.id}">
      <div class="fila__icono">${icono(r.tarjeta_id ? 'tarjeta' : r.prestamo_id ? 'prestamo' : 'recurrente')}</div>
      <div class="fila__cuerpo">
        <div class="fila__titulo">${escaparHTML(r.nombre)}</div>
        <div class="fila__meta">${mapa[r.periodicidad] || r.periodicidad} · ${origen} · applies: ${etiquetaMeses}</div>
      </div>
      <div class="fila__monto"><span class="numero negativo">${formatoMoneda(r.monto)}</span>${r.abonado > 0 ? `<small>Paid so far: ${formatoMoneda(r.abonado)}</small>` : ''}</div>
      <span class="badge badge--${r.estado}">${ETIQUETA_ESTADO[r.estado] || r.estado}</span>
      <label class="switch" title="Active this period">
        <input type="checkbox" class="toggle-activo" data-id="${r.id}" ${activo ? 'checked' : ''} aria-label="Active this period" />
        <span class="switch__pista"></span>
      </label>
      <div class="fila__acciones">
        ${r.estado === 'pendiente' && activo ? `
          <button class="btn btn--primario btn--sm btn-marcar-pagado" data-id="${r.id}" title="Deducts the amount from your debit account">${esDeTarjetaOPrestamo ? 'Pay' : 'Mark as paid'}</button>
          <button class="btn btn--fantasma btn--sm btn-omitir" data-id="${r.id}">Skip</button>` : ''}
        ${r.estado === 'omitido' ? `<button class="btn btn--fantasma btn--sm btn-deshacer-omitir" data-id="${r.id}">Undo skip</button>` : ''}
        ${r.estado === 'pagado' ? `<button class="btn btn--fantasma btn--sm btn-deshacer-pago" data-id="${r.id}" title="Undo this month’s payment">${icono('deshacer')} Undo payment</button>` : ''}
        <div id="acciones-ocultas-${r.id}" hidden>
          ${r.estado === 'pendiente' && activo && !esDeTarjetaOPrestamo ? `
            <button class="menu-acciones__item btn-marcar-pagado-sd" data-id="${r.id}">${icono('check')} Already paid (no deduction)</button>
            <button class="menu-acciones__item btn-abonar" data-id="${r.id}">${icono('ingreso')} Add partial payment</button>
          ` : ''}
          ${esDeTarjetaOPrestamo ? '' : `<button class="menu-acciones__item btn-editar" data-id="${r.id}">${icono('editar')} Edit</button>`}
          <button class="menu-acciones__item peligro btn-eliminar" data-id="${r.id}">${icono('eliminar')} Delete</button>
        </div>
        <button class="btn-icono btn-mas-opciones" data-id="${r.id}" title="More options" aria-label="More options">${icono('mas_opciones')}</button>
      </div>
    </div>`;
}

function abrirModalRecurrente(cuentas, registro, alGuardar) {
  const editando = !!registro;
  const meses = registro ? mesesActivos(registro) : [];
  const { overlay, cerrar } = abrirModal(`
    <h3 class="modal__titulo">${editando ? 'Edit recurring expense' : 'New recurring expense'}</h3>
    <form id="form-recurrente">
      <div class="campo"><label class="campo__etiqueta">Name</label><input class="campo__control" name="nombre" placeholder="Netflix, gym, insurance…" required value="${escaparHTML(registro?.nombre || '')}" /><div class="campo__error"></div></div>
      <div class="campo__fila">
        <div class="campo"><label class="campo__etiqueta">Amount</label><input class="campo__control" name="monto" inputmode="decimal" placeholder="0.00" required value="${registro?.monto || ''}" /><div class="campo__error"></div></div>
        <div class="campo"><label class="campo__etiqueta">Frequency</label>
          <select class="campo__control" name="periodicidad">
            ${[['mensual','Monthly'],['semanal','Weekly'],['quincenal','Biweekly'],['personalizada','Custom']].map(([p, etq]) => `<option value="${p}" ${registro?.periodicidad === p ? 'selected' : ''}>${etq}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="campo__fila">
        <div class="campo"><label class="campo__etiqueta">Category</label><input class="campo__control" name="categoria" placeholder="Subscription" value="${escaparHTML(registro?.categoria || '')}" /></div>
        <div class="campo"><label class="campo__etiqueta">Charge account</label>
          <select class="campo__control" name="cuenta_destino_id">${cuentas.map(c => `<option value="${c.id}" ${registro?.cuenta_destino_id === c.id ? 'selected' : ''}>${etiquetaDeCuentaConBanco(c)}</option>`).join('')}</select>
        </div>
      </div>
      <div class="campo">
        <label class="campo__etiqueta">Which months does it apply to? (leave empty for all)</label>
        <div class="chips">
          ${MESES.map((m, i) => `<label class="chip"><input type="checkbox" name="mes" value="${i + 1}" ${meses.includes(i + 1) ? 'checked' : ''} />${m}</label>`).join('')}
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
    await conBotonOcupado(form.querySelector('button[type=submit]'), async () => {
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
  });
}

/** Registers a partial payment toward a pending recurring expense. */
function abrirModalAbono(r, cuentas, alGuardar) {
  const pendiente = restante(r);
  const { overlay, cerrar } = abrirModal(`
    <h3 class="modal__titulo">Add payment — ${escaparHTML(r.nombre)}</h3>
    <p class="modal__subtitulo">Remaining to fully pay this period: ${formatoMoneda(pendiente)}</p>
    <form id="form-abono">
      <div class="campo__fila">
        <div class="campo"><label class="campo__etiqueta">Amount to pay now</label><input class="campo__control" name="monto" inputmode="decimal" placeholder="0.00" required /><div class="campo__error"></div></div>
        <div class="campo"><label class="campo__etiqueta">From account</label>
          <select class="campo__control" name="cuenta_debito_id">${cuentas.map(c => `<option value="${c.id}" ${r.cuenta_destino_id === c.id ? 'selected' : ''}>${etiquetaDeCuentaConBanco(c)}</option>`).join('')}</select>
        </div>
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
    if (monto > pendiente) { marcarError(campo, `Cannot exceed the remaining amount (${formatoMoneda(pendiente)})`); return; }
    await conBotonOcupado(form.querySelector('button[type=submit]'), async () => {
      try {
        await abonarRecurrente({ recurrente: r, cuentaDebitoId: Number(form.cuenta_debito_id.value), monto, fecha: hoyISO() });
        mostrarToast(monto >= pendiente ? 'Fully paid off' : 'Partial payment registered', 'exito');
        cerrar(); alGuardar();
      } catch (err) { console.error(err); mostrarToast('Could not register the payment', 'error'); }
    });
  });
}
