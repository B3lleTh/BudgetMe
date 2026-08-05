import { consultar, ejecutar } from '../db.js';
import { crearInversion, capitalizarInversion, retirarInversion } from '../ledger.js';
import { formatoMoneda, formatoFecha, hoyISO, activarInputMoneda, valorNumericoDeInputMoneda } from '../formato.js';
import { icono } from '../iconos.js';
import { abrirModal, marcarError, limpiarError } from '../ui.js';
import { mostrarToast } from '../toasts.js';
import { confirmarYEliminar, delegarClicEliminar } from '../eliminar.js';

export async function render(vistaEl) {
  const inversiones = await consultar(`SELECT * FROM inversiones ORDER BY creado_en DESC`);
  const cuentas = await consultar(`SELECT id, nombre, saldo FROM cuentas_debito`);

  const totalInvertido = inversiones.reduce((a, i) => a + i.aporte_inicial, 0);
  const totalActual = inversiones.reduce((a, i) => a + i.saldo, 0);
  const totalGanado = totalActual - totalInvertido;

  vistaEl.innerHTML = `
    <div class="vista__encabezado">
      <div><h1>Investments & Projections</h1><p>Simulate returns or track a real savings fund that reinvests its interest</p></div>
      <div style="display:flex; gap:10px;">
        <button class="btn btn--fantasma" id="btn-simular">${icono('rayo')} Simulate</button>
        <button class="btn btn--primario" id="btn-nueva-inversion">${icono('caja')} New investment</button>
      </div>
    </div>

    <div class="grid-kpis" style="margin-bottom:14px;">
      <div class="tarjeta"><div class="kpi__etiqueta">${icono('caja')} Total invested</div><div class="kpi__valor numero">${formatoMoneda(totalInvertido)}</div></div>
      <div class="tarjeta"><div class="kpi__etiqueta">${icono('caja')} Current value</div><div class="kpi__valor numero positivo">${formatoMoneda(totalActual)}</div></div>
      <div class="tarjeta"><div class="kpi__etiqueta">${icono('rayo')} Interest earned</div><div class="kpi__valor numero positivo">${formatoMoneda(totalGanado)}</div></div>
    </div>

    <div class="tarjeta"><div class="lista" id="lista-inversiones"></div></div>
  `;

  const lista = vistaEl.querySelector('#lista-inversiones');
  lista.innerHTML = inversiones.length ? inversiones.map(i => filaInversion(i)).join('')
    : `<div class="estado-vacio">${icono('caja')}<h3>No investments yet</h3><p>Create a fund and watch its interest compound monthly.</p></div>`;

  vistaEl.querySelector('#btn-nueva-inversion').addEventListener('click', () => abrirModalNueva(cuentas, () => render(vistaEl)));
  vistaEl.querySelector('#btn-simular').addEventListener('click', () => abrirModalSimulador());

  delegarClicEliminar(lista, '.btn-eliminar', (id) => confirmarYEliminar({
    mensaje: 'This investment will be deleted (its history stays in Transactions).',
    accion: () => ejecutar(`DELETE FROM inversiones WHERE id = $1`, [id]),
    alExito: () => render(vistaEl),
  }));

  lista.addEventListener('toggle', (e) => {
    if (e.target.classList?.contains('menu-acciones') && e.target.open) {
      lista.querySelectorAll('.menu-acciones[open]').forEach(d => { if (d !== e.target) d.open = false; });
    }
  }, true);
  lista.addEventListener('click', async (e) => {
    if (e.target.closest('.menu-acciones__item')) e.target.closest('.menu-acciones').open = false;
    if (!e.target.closest('.menu-acciones')) lista.querySelectorAll('.menu-acciones[open]').forEach(d => d.open = false);

    const btnAvanzar = e.target.closest('.btn-avanzar-mes');
    const btnRetirar = e.target.closest('.btn-retirar-inversion');
    if (btnAvanzar) {
      const inv = inversiones.find(x => String(x.id) === String(btnAvanzar.dataset.id));
      btnAvanzar.disabled = true; btnAvanzar.classList.add('btn--carga');
      try {
        await capitalizarInversion(inv, hoyISO());
        mostrarToast('Month capitalized — interest reinvested', 'exito');
        await render(vistaEl);
      } catch (err) { console.error(err); mostrarToast('Could not capitalize the month', 'error'); }
      return;
    }
    if (btnRetirar) {
      const inv = inversiones.find(x => String(x.id) === String(btnRetirar.dataset.id));
      if (cuentas.length === 0) { mostrarToast('Register a debit account first', 'error'); return; }
      abrirModalRetiro(inv, cuentas, () => render(vistaEl));
    }
  });
}

function filaInversion(i) {
  const ganado = i.saldo - i.aporte_inicial;
  return `
    <div class="fila" data-id="${i.id}" style="flex-wrap:wrap;">
      <div class="fila__icono">${icono('caja')}</div>
      <div class="fila__cuerpo">
        <div class="fila__titulo">${i.nombre}</div>
        <div class="fila__meta">${i.tasa_anual}% annual · started ${formatoFecha(i.fecha_inicio)} · ${i.meses_capitalizados} month(s) compounded</div>
      </div>
      <div class="numero positivo">${formatoMoneda(i.saldo)}<div style="font-size:11px; opacity:.75; font-weight:400;">+${formatoMoneda(ganado)} gained</div></div>
      <div class="fila__acciones">
        <button class="btn btn--primario btn-avanzar-mes" data-id="${i.id}" style="padding:7px 12px;" title="Applies one month of compound interest">Advance 1 month</button>
        <details class="menu-acciones">
          <summary class="btn-icono" title="More options">⋮</summary>
          <div class="menu-acciones__lista">
            <button class="menu-acciones__item btn-retirar-inversion" data-id="${i.id}">${icono('gasto')} Withdraw</button>
            <button class="menu-acciones__item peligro btn-eliminar" data-id="${i.id}">${icono('eliminar')} Delete</button>
          </div>
        </details>
      </div>
    </div>`;
}

function abrirModalNueva(cuentas, alGuardar) {
  const { overlay, cerrar } = abrirModal(`
    <h3 class="modal__titulo">New investment</h3>
    <form id="form-inversion">
      <div class="campo"><label class="campo__etiqueta">Name</label><input class="campo__control" name="nombre" placeholder="Retirement fund, CETES…" required /><div class="campo__error"></div></div>
      <div class="campo__fila">
        <div class="campo"><label class="campo__etiqueta">Initial amount</label><input class="campo__control" name="aporte" inputmode="decimal" placeholder="0.00" required /><div class="campo__error"></div></div>
        <div class="campo"><label class="campo__etiqueta">Annual interest rate (%)</label><input class="campo__control" name="tasa" inputmode="decimal" placeholder="10.9" required /></div>
      </div>
      <div class="campo"><label class="campo__etiqueta">Funding account (optional)</label>
        <select class="campo__control" name="cuenta_origen_id"><option value="">— None (just track it) —</option>${cuentas.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')}</select>
      </div>
      <div class="modal__acciones">
        <button type="button" class="btn btn--fantasma" data-cerrar-modal>Cancel</button>
        <button type="submit" class="btn btn--primario">Save</button>
      </div>
    </form>
  `);
  const form = overlay.querySelector('#form-inversion');
  activarInputMoneda(form.aporte);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const campoNombre = form.nombre.closest('.campo');
    const campoAporte = form.aporte.closest('.campo');
    limpiarError(campoNombre); limpiarError(campoAporte);
    const aporte = valorNumericoDeInputMoneda(form.aporte);
    const tasa = Number(form.tasa.value);
    let valido = true;
    if (!form.nombre.value.trim()) { marcarError(campoNombre, 'Enter a name'); valido = false; }
    if (!aporte || aporte <= 0) { marcarError(campoAporte, 'Enter a valid amount'); valido = false; }
    if (!valido) return;
    try {
      await crearInversion({ nombre: form.nombre.value.trim(), cuentaOrigenId: Number(form.cuenta_origen_id.value) || null, aporte, tasaAnual: tasa || 0, fecha: hoyISO() });
      mostrarToast('Investment created', 'exito');
      cerrar(); alGuardar();
    } catch (err) {
      if (String(err).includes('INSUFFICIENT_DEBIT_BALANCE')) marcarError(campoAporte, 'Not enough balance in that account');
      else mostrarToast('Could not create the investment', 'error');
    }
  });
}

function abrirModalRetiro(inv, cuentas, alGuardar) {
  const { overlay, cerrar } = abrirModal(`
    <h3 class="modal__titulo">Withdraw from ${inv.nombre}</h3>
    <form id="form-retiro">
      <div class="campo"><label class="campo__etiqueta">Amount (max ${formatoMoneda(inv.saldo)})</label><input class="campo__control" name="monto" inputmode="decimal" placeholder="0.00" required /><div class="campo__error"></div></div>
      <div class="campo"><label class="campo__etiqueta">Destination account</label>
        <select class="campo__control" name="cuenta_destino_id">${cuentas.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')}</select>
      </div>
      <div class="modal__acciones">
        <button type="button" class="btn btn--fantasma" data-cerrar-modal>Cancel</button>
        <button type="submit" class="btn btn--primario">Withdraw</button>
      </div>
    </form>
  `);
  const form = overlay.querySelector('#form-retiro');
  activarInputMoneda(form.monto);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const campoMonto = form.monto.closest('.campo');
    limpiarError(campoMonto);
    const monto = valorNumericoDeInputMoneda(form.monto);
    if (!monto || monto <= 0 || monto > inv.saldo) { marcarError(campoMonto, 'Enter a valid amount'); return; }
    try {
      await retirarInversion({ inversion: inv, cuentaDestinoId: Number(form.cuenta_destino_id.value), monto, fecha: hoyISO() });
      mostrarToast('Withdrawal registered', 'exito');
      cerrar(); alGuardar();
    } catch (err) { console.error(err); mostrarToast('Could not withdraw', 'error'); }
  });
}

/** Pure calculator — no DB writes. Shows year-end projected values with
 * monthly compounding (interest is reinvested every month). */
function abrirModalSimulador() {
  const { overlay } = abrirModal(`
    <h3 class="modal__titulo">Simulate an investment</h3>
    <form id="form-sim">
      <div class="campo__fila">
        <div class="campo"><label class="campo__etiqueta">Initial amount</label><input class="campo__control" name="capital" inputmode="decimal" placeholder="10000" required /></div>
        <div class="campo"><label class="campo__etiqueta">Annual rate (%)</label><input class="campo__control" name="tasa" inputmode="decimal" placeholder="10.9" required /></div>
      </div>
      <div class="campo"><label class="campo__etiqueta">Years to project</label><input class="campo__control" name="anios" type="number" min="1" max="30" value="1" /></div>
      <div class="modal__acciones"><button type="submit" class="btn btn--primario" style="width:100%;">Calculate</button></div>
    </form>
    <div id="resultado-sim" style="margin-top:14px;"></div>
  `);
  const form = overlay.querySelector('#form-sim');
  activarInputMoneda(form.capital);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const capitalInicial = valorNumericoDeInputMoneda(form.capital);
    const tasaMensual = Number(form.tasa.value) / 100 / 12;
    const anios = Number(form.anios.value) || 1;
    let capital = capitalInicial;
    const filas = [];
    for (let a = 1; a <= anios; a++) {
      for (let m = 1; m <= 12; m++) capital *= (1 + tasaMensual);
      filas.push({ anio: a, valor: capital });
    }
    const ganado = capital - capitalInicial;
    overlay.querySelector('#resultado-sim').innerHTML = `
      <div class="tarjeta">
        <div class="kpi__etiqueta">Final value after ${anios} year(s)</div>
        <div class="kpi__valor numero positivo">${formatoMoneda(capital)}</div>
        <div style="font-size:12px; opacity:.75; margin:4px 0 10px;">+${formatoMoneda(ganado)} in reinvested interest</div>
        <div class="lista">
          ${filas.map(f => `<div class="fila" style="padding:6px 0;"><div class="fila__cuerpo"><div class="fila__meta">Year ${f.anio}</div></div><div class="numero">${formatoMoneda(f.valor)}</div></div>`).join('')}
        </div>
      </div>`;
  });
}
