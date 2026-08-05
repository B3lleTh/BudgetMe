import { consultar, ejecutar } from '../db.js';
import { movimientoCaja, ajustarSaldoCaja } from '../ledger.js';
import { formatoMoneda, hoyISO, activarInputMoneda, valorNumericoDeInputMoneda } from '../formato.js';
import { icono } from '../iconos.js';
import { abrirModal, marcarError, limpiarError } from '../ui.js';
import { mostrarToast } from '../toasts.js';
import { confirmarYEliminar, delegarClicEliminar } from '../eliminar.js';

export async function render(vistaEl) {
  const cajas = await consultar(`SELECT * FROM cajas ORDER BY es_sistema, creado_en DESC`);
  const cuentas = await consultar(`SELECT id, nombre, saldo FROM cuentas_debito`);

  const totalConTC = cajas.reduce((a, c) => a + c.saldo, 0);
  const totalSinTC = cajas.filter(c => !c.es_sistema).reduce((a, c) => a + c.saldo, 0);

  vistaEl.innerHTML = `
    <div class="vista__encabezado">
      <div><h1>Savings boxes</h1><p>Goals and money set aside with a purpose</p></div>
      <button class="btn btn--primario" id="btn-nueva-caja">${icono('caja')} New box</button>
    </div>
    <div class="grid-kpis" style="margin-bottom:14px;">
      <div class="tarjeta"><div class="kpi__etiqueta">${icono('caja')} Total saved (all boxes)</div><div class="kpi__valor numero positivo">${formatoMoneda(totalConTC)}</div></div>
      <div class="tarjeta"><div class="kpi__etiqueta">${icono('caja')} Total saved (excluding card reserve)</div><div class="kpi__valor numero">${formatoMoneda(totalSinTC)}</div></div>
    </div>
    <div class="grid-2" id="grid-cajas"></div>
  `;

  const grid = vistaEl.querySelector('#grid-cajas');
  grid.innerHTML = cajas.length ? cajas.map(c => tarjetaCaja(c)).join('') : `
    <div class="estado-vacio tarjeta" style="grid-column:1/-1;">${icono('caja')}<h3>You don't have any boxes yet</h3><p>Create one for Emergencies, Trips, or whatever you want to save for.</p></div>`;

  vistaEl.querySelector('#btn-nueva-caja').addEventListener('click', () => abrirModalCaja(() => render(vistaEl)));

  delegarClicEliminar(grid, '.btn-eliminar-caja', (id) => confirmarYEliminar({
    mensaje: 'This savings box will be deleted.',
    accion: () => ejecutar(`DELETE FROM cajas WHERE id = $1 AND es_sistema = 0`, [id]),
    alExito: () => render(vistaEl),
  }));

  grid.addEventListener('click', (e) => {
    const btnDep = e.target.closest('.btn-depositar');
    const btnRet = e.target.closest('.btn-retirar');
    const btnEditar = e.target.closest('.btn-editar-caja');
    const btnAjustar = e.target.closest('.btn-ajustar-caja');
    if (btnDep) abrirModalMovimiento(cajas.find(c => String(c.id) === btnDep.dataset.id), 'deposito', cuentas, () => render(vistaEl));
    if (btnRet) abrirModalMovimiento(cajas.find(c => String(c.id) === btnRet.dataset.id), 'retiro', cuentas, () => render(vistaEl));
    if (btnEditar) abrirModalEditarCaja(cajas.find(c => String(c.id) === btnEditar.dataset.id), () => render(vistaEl));
    if (btnAjustar) abrirModalAjusteCaja(cajas.find(c => String(c.id) === btnAjustar.dataset.id), () => render(vistaEl));
  });
}

function tarjetaCaja(c) {
  const progreso = c.meta ? Math.min(100, Math.round((c.saldo / c.meta) * 100)) : null;
  return `
    <div class="tarjeta" data-id="${c.id}">
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div class="kpi__etiqueta">${icono(c.es_sistema ? 'candado' : 'caja')} ${c.nombre}</div>
        <div style="display:flex; gap:4px;">
          <button class="btn-icono btn-editar-caja" data-id="${c.id}">${icono('editar')}</button>
          ${!c.es_sistema ? `<button class="btn-icono peligro btn-eliminar-caja" data-id="${c.id}">${icono('eliminar')}</button>` : ''}
        </div>
      </div>
      <div class="kpi__valor numero positivo">${formatoMoneda(c.saldo)}</div>
      ${c.meta ? `<p style="margin-top:6px;">Goal: ${formatoMoneda(c.meta)} (${progreso}%)</p>` : ''}
      <div style="display:flex; gap:8px; margin-top:14px; flex-wrap:wrap;">
        <button class="btn btn--fantasma btn-depositar" data-id="${c.id}" style="flex:1;">Deposit</button>
        <button class="btn btn--fantasma btn-retirar" data-id="${c.id}" style="flex:1;">Withdraw</button>
        ${c.es_sistema ? `<button class="btn btn--fantasma btn-ajustar-caja" data-id="${c.id}" style="flex:1;">Adjust balance</button>` : ''}
      </div>
      ${c.es_sistema ? `<p style="margin-top:8px; font-size:12px;">Deposit, withdraw, or adjust here yourself whenever you decide to set money aside to pay off your cards. Nothing moves automatically.</p>` : ''}
    </div>`;
}

function abrirModalCaja(alGuardar) {
  const { overlay, cerrar } = abrirModal(`
    <h3 class="modal__titulo">New savings box</h3>
    <form id="form-caja">
      <div class="campo"><label class="campo__etiqueta">Name</label><input class="campo__control" name="nombre" placeholder="Emergencies, Trips…" required /><div class="campo__error"></div></div>
      <div class="campo"><label class="campo__etiqueta">Goal description (optional)</label><input class="campo__control" name="objetivo" /></div>
      <div class="campo"><label class="campo__etiqueta">Target amount (optional)</label><input class="campo__control" name="meta" inputmode="decimal" placeholder="0.00" /></div>
      <div class="modal__acciones">
        <button type="button" class="btn btn--fantasma" data-cerrar-modal>Cancel</button>
        <button type="submit" class="btn btn--primario">Create</button>
      </div>
    </form>`);
  const form = overlay.querySelector('#form-caja');
  activarInputMoneda(form.meta);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const campoNombre = form.nombre.closest('.campo');
    limpiarError(campoNombre);
    if (!form.nombre.value.trim()) { marcarError(campoNombre, 'Enter a name'); return; }
    try {
      await ejecutar(`INSERT INTO cajas (nombre, objetivo, meta) VALUES ($1,$2,$3)`,
        [form.nombre.value.trim(), form.objetivo.value.trim() || null, valorNumericoDeInputMoneda(form.meta) || null]);
      mostrarToast('Box created', 'exito'); cerrar(); alGuardar();
    } catch (err) { console.error(err); mostrarToast('Could not create the box', 'error'); }
  });
}

/** Edit an existing savings box: name, goal description, and target amount.
 * Not available for system boxes (es_sistema = 1), which are managed
 * automatically by the app. */
function abrirModalEditarCaja(caja, alGuardar) {
  const { overlay, cerrar } = abrirModal(`
    <h3 class="modal__titulo">Edit savings box</h3>
    <form id="form-editar-caja">
      <div class="campo"><label class="campo__etiqueta">Name</label><input class="campo__control" name="nombre" required value="${caja.nombre}" /><div class="campo__error"></div></div>
      <div class="campo"><label class="campo__etiqueta">Goal description (optional)</label><input class="campo__control" name="objetivo" value="${caja.objetivo || ''}" /></div>
      <div class="campo"><label class="campo__etiqueta">Target amount (optional)</label><input class="campo__control" name="meta" inputmode="decimal" placeholder="0.00" value="${caja.meta || ''}" /></div>
      <div class="modal__acciones">
        <button type="button" class="btn btn--fantasma" data-cerrar-modal>Cancel</button>
        <button type="submit" class="btn btn--primario">Save changes</button>
      </div>
    </form>`);
  const form = overlay.querySelector('#form-editar-caja');
  activarInputMoneda(form.meta);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const campoNombre = form.nombre.closest('.campo');
    limpiarError(campoNombre);
    if (!form.nombre.value.trim()) { marcarError(campoNombre, 'Enter a name'); return; }
    try {
      await ejecutar(`UPDATE cajas SET nombre=$1, objetivo=$2, meta=$3 WHERE id=$4`,
        [form.nombre.value.trim(), form.objetivo.value.trim() || null, valorNumericoDeInputMoneda(form.meta) || null, caja.id]);
      mostrarToast('Box updated', 'exito'); cerrar(); alGuardar();
    } catch (err) { console.error(err); mostrarToast('Could not update the box', 'error'); }
  });
}

function abrirModalMovimiento(caja, direccion, cuentas, alGuardar) {
  if (cuentas.length === 0) { mostrarToast('Register a debit account first', 'error'); return; }
  const esDeposito = direccion === 'deposito';
  const { overlay, cerrar } = abrirModal(`
    <h3 class="modal__titulo">${esDeposito ? 'Deposit to' : 'Withdraw from'} ${caja.nombre}</h3>
    <form id="form-mov">
      <div class="campo"><label class="campo__etiqueta">${esDeposito ? 'From account' : 'To account'}</label>
        <select class="campo__control" name="cuenta_debito_id">${cuentas.map(c => `<option value="${c.id}" data-saldo="${c.saldo}">${c.nombre}</option>`).join('')}</select>
      </div>
      ${esDeposito ? `<p class="campo__ayuda" id="saldo-disponible" style="margin:-6px 0 12px; font-size:13px; opacity:.75;"></p>` : ''}
      <div class="campo"><label class="campo__etiqueta">Amount</label><input class="campo__control" name="monto" inputmode="decimal" placeholder="0.00" required /><div class="campo__error"></div></div>
      <div class="modal__acciones">
        <button type="button" class="btn btn--fantasma" data-cerrar-modal>Cancel</button>
        <button type="submit" class="btn btn--primario">Confirm</button>
      </div>
    </form>`);
  const form = overlay.querySelector('#form-mov');
  activarInputMoneda(form.monto);

  // Show the user, up front, exactly how much is really available in the
  // selected debit account — so they consciously decide what to set aside.
  const etiquetaSaldo = overlay.querySelector('#saldo-disponible');
  const actualizarSaldoMostrado = () => {
    if (!etiquetaSaldo) return;
    const saldo = Number(form.cuenta_debito_id.selectedOptions[0]?.dataset.saldo || 0);
    etiquetaSaldo.textContent = `Available in this account: ${formatoMoneda(saldo)}`;
  };
  if (esDeposito) {
    actualizarSaldoMostrado();
    form.cuenta_debito_id.addEventListener('change', actualizarSaldoMostrado);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const campoMonto = form.monto.closest('.campo');
    limpiarError(campoMonto);
    const monto = valorNumericoDeInputMoneda(form.monto);
    if (!monto || monto <= 0) { marcarError(campoMonto, 'Enter a valid amount'); return; }
    if (direccion === 'retiro' && monto > caja.saldo) { marcarError(campoMonto, 'Not enough balance in the box'); return; }
    if (esDeposito) {
      const saldoCuenta = Number(form.cuenta_debito_id.selectedOptions[0]?.dataset.saldo || 0);
      if (monto > saldoCuenta) {
        marcarError(campoMonto, `Not enough balance in that debit account (available: ${formatoMoneda(saldoCuenta)})`);
        mostrarToast("You can't deposit more than what you actually have available in that debit account", 'error');
        return;
      }
    }
    try {
      await movimientoCaja({ cajaId: caja.id, cuentaDebitoId: Number(form.cuenta_debito_id.value), monto, direccion, fecha: hoyISO() });
      mostrarToast('Movement registered', 'exito'); cerrar(); alGuardar();
    } catch (err) {
      console.error(err);
      if (String(err).includes('INSUFFICIENT_DEBIT_BALANCE')) {
        mostrarToast("You can't deposit more than what you actually have available in that debit account", 'error');
      } else {
        mostrarToast('Could not register the movement', 'error');
      }
    }
  });
}

/** Directly set a box's balance to any amount (including 0), without going
 * through a debit account. Useful for the system "Reserved for Card
 * Payments" box, or to correct any box's balance. Registers a traceable
 * 'ajuste_caja' entry in the ledger instead of silently overwriting saldo. */
function abrirModalAjusteCaja(caja, alGuardar) {
  const { overlay, cerrar } = abrirModal(`
    <h3 class="modal__titulo">Adjust balance of ${caja.nombre}</h3>
    <p style="font-size:13px; opacity:.75; margin:-4px 0 12px;">Current balance: ${formatoMoneda(caja.saldo)}. Set the new balance directly — this does not move money to or from any debit account, it only corrects what this box shows.</p>
    <form id="form-ajuste">
      <div class="campo"><label class="campo__etiqueta">New balance</label><input class="campo__control" name="nuevo_saldo" inputmode="decimal" placeholder="0.00" value="${caja.saldo}" required /><div class="campo__error"></div></div>
      <div class="campo"><label class="campo__etiqueta">Reason (optional)</label><input class="campo__control" name="notas" placeholder="e.g. correction, manual set aside…" /></div>
      <div class="modal__acciones">
        <button type="button" class="btn btn--fantasma" data-cerrar-modal>Cancel</button>
        <button type="submit" class="btn btn--primario">Apply adjustment</button>
      </div>
    </form>`);
  const form = overlay.querySelector('#form-ajuste');
  activarInputMoneda(form.nuevo_saldo);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const campo = form.nuevo_saldo.closest('.campo');
    limpiarError(campo);
    const nuevoSaldo = valorNumericoDeInputMoneda(form.nuevo_saldo);
    if (nuevoSaldo < 0) { marcarError(campo, 'Balance cannot be negative'); return; }
    try {
      await ajustarSaldoCaja({ cajaId: caja.id, nuevoSaldo, notas: form.notas.value.trim() || null, fecha: hoyISO() });
      mostrarToast('Balance adjusted', 'exito'); cerrar(); alGuardar();
    } catch (err) { console.error(err); mostrarToast('Could not adjust the balance', 'error'); }
  });
}
