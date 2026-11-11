import { consultar } from '../db.js';
import { revertirTransferencia } from '../ledger.js';
import { formatoMoneda, formatoFecha, escaparHTML } from '../formato.js';
import { icono } from '../iconos.js';
import { confirmarYEliminar, delegarClicEliminar } from '../eliminar.js';
import { etiquetaDeCuentaConBanco } from '../etiquetas.js';

const ETIQUETAS_TIPO = {
  ingreso: 'Income', gasto: 'Expense', recurrente: 'Recurring', abono_recurrente: 'Partial Payment',
  pago_tc: 'Card Payment', transferencia: 'Transfer', deposito: 'Deposit', retiro: 'Withdrawal',
  movimiento_caja: 'Box Movement', ajuste_caja: 'Balance Adjustment',
  pago_prestamo: 'Loan payment', abono_capital_prestamo: 'Extra loan payment',
  aporte_inversion: 'Investment contribution', interes_inversion: 'Investment interest', retiro_inversion: 'Investment withdrawal',
};

// Money moving between the user's own accounts, boxes, cards and
// investments: neither income nor expense (same money, different place).
const TIPOS_NEUTROS = new Set(['transferencia', 'deposito', 'retiro', 'movimiento_caja', 'ajuste_caja', 'pago_tc', 'aporte_inversion', 'retiro_inversion']);
const TIPOS_POSITIVOS = new Set(['ingreso', 'interes_inversion']);

let filtroTipoActual = '';

export async function render(vistaEl) {
  const filtroTipo = filtroTipoActual;
  const filas = await consultar(
    filtroTipo ? `SELECT * FROM transacciones WHERE tipo = $1 ORDER BY fecha DESC, id DESC LIMIT 150`
               : `SELECT * FROM transacciones ORDER BY fecha DESC, id DESC LIMIT 150`,
    filtroTipo ? [filtroTipo] : []
  );
  const nombres = await cargarNombresDeCuentasTarjetasYCajas();

  vistaEl.innerHTML = `
    <div class="vista__encabezado">
      <div><h1>Transaction History</h1><p>The general ledger: every movement of money is recorded here. Showing the latest 150.</p></div>
    </div>
    <div class="tarjeta">
      <div class="panel__encabezado">
        <h3>Movements</h3>
        <div class="filtros" style="margin:0;">
          ${icono('filtro')}
          <select class="campo__control" id="filtro-tipo" aria-label="Filter by type">
            <option value="">All types</option>
            ${Object.entries(ETIQUETAS_TIPO).map(([v, e]) => `<option value="${v}" ${filtroTipo === v ? 'selected' : ''}>${e}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="lista" id="lista-historial"></div>
    </div>
  `;

  const lista = vistaEl.querySelector('#lista-historial');
  lista.innerHTML = filas.length
    ? filas.map(t => renderizarFilaDeTransaccionConNombresLegibles(t, nombres)).join('')
    : `<div class="estado-vacio">${icono('historial')}<h3>No transactions</h3><p>Every financial action you register will automatically appear here.</p></div>`;

  vistaEl.querySelector('#filtro-tipo').addEventListener('change', (e) => {
    filtroTipoActual = e.target.value;
    render(vistaEl);
  });

  delegarClicEliminar(lista, '.btn-eliminar-transferencia', (id) => confirmarYEliminar({
    mensaje: 'This transfer will be deleted and the money will return to the original account.',
    accion: async () => {
      const tx = filas.find(f => String(f.id) === id);
      if (!tx) throw new Error('Transfer not found');
      await revertirTransferencia(tx);
    },
    alExito: () => render(vistaEl),
  }));
}

/** Maps 'debito:3' / 'tarjeta:1' / 'caja:2' to the real names, so the history
 * never shows raw internal prefixes to the user. */
async function cargarNombresDeCuentasTarjetasYCajas() {
  const cuentas = await consultar(`SELECT id, nombre, banco FROM cuentas_debito`);
  const tarjetas = await consultar(`SELECT id, nombre, banco FROM tarjetas`);
  const cajas = await consultar(`SELECT id, nombre FROM cajas`);
  const nombres = {};
  for (const c of cuentas) nombres[`debito:${c.id}`] = etiquetaDeCuentaConBanco(c);
  for (const t of tarjetas) nombres[`tarjeta:${t.id}`] = etiquetaDeCuentaConBanco(t);
  for (const c of cajas) nombres[`caja:${c.id}`] = escaparHTML(c.nombre);
  return nombres;
}

function nombreLegibleDeReferencia(ref, nombres) {
  if (!ref) return '—';
  if (ref === 'externo') return 'External';
  if (nombres[ref]) return nombres[ref];
  if (ref.startsWith('debito')) return 'Deleted account';
  if (ref.startsWith('tarjeta')) return 'Deleted card';
  if (ref.startsWith('caja')) return 'Deleted box';
  return ref;
}

function renderizarFilaDeTransaccionConNombresLegibles(t, nombres) {
  const neutra = TIPOS_NEUTROS.has(t.tipo);
  const esPositivo = TIPOS_POSITIVOS.has(t.tipo) || (t.tipo === 'recurrente' && (t.destino || '').startsWith('debito'));
  const iconoFila = neutra ? 'transferir' : (esPositivo ? 'ingreso' : 'gasto');
  const claseIcono = neutra ? '' : (esPositivo ? 'fila__icono--ingreso' : 'fila__icono--gasto');
  const claseMonto = neutra ? '' : (esPositivo ? 'positivo' : 'negativo');
  const signo = neutra ? '' : (esPositivo ? '+ ' : '− ');
  return `
    <div class="fila">
      <div class="fila__icono ${claseIcono}">${icono(iconoFila)}</div>
      <div class="fila__cuerpo">
        <div class="fila__titulo">${escaparHTML(t.notas || ETIQUETAS_TIPO[t.tipo] || t.tipo)}</div>
        <div class="fila__meta">${formatoFecha(t.fecha)} · ${ETIQUETAS_TIPO[t.tipo] || escaparHTML(t.tipo)} · ${nombreLegibleDeReferencia(t.origen, nombres)} → ${nombreLegibleDeReferencia(t.destino, nombres)}</div>
      </div>
      <div class="numero ${claseMonto}">${signo}${formatoMoneda(t.monto)}</div>
      ${t.tipo === 'transferencia' ? `<div class="fila__acciones"><button class="btn-icono peligro btn-eliminar-transferencia" data-id="${t.id}" title="Delete transfer" aria-label="Delete transfer">${icono('eliminar')}</button></div>` : '<div class="fila__acciones" style="width:30px;"></div>'}
    </div>`;
}