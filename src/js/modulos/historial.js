import { consultar } from '../db.js';
import { formatoMoneda, formatoFecha } from '../formato.js';
import { icono } from '../iconos.js';

const ETIQUETAS_TIPO = {
  ingreso: 'Income', gasto: 'Expense', transferencia: 'Transfer', pago_tc: 'Card Payment',
  movimiento_caja: 'Box Movement', retiro: 'Withdrawal', deposito: 'Deposit', recurrente: 'Recurring',
  ajuste_caja: 'Balance Adjustment', abono_recurrente: 'Partial Payment',
};

export async function render(vistaEl) {
  const filtroTipo = vistaEl.dataset.filtroTipo || '';
  const filas = await consultar(
    filtroTipo ? `SELECT * FROM transacciones WHERE tipo = $1 ORDER BY fecha DESC, id DESC LIMIT 150`
               : `SELECT * FROM transacciones ORDER BY fecha DESC, id DESC LIMIT 150`,
    filtroTipo ? [filtroTipo] : []
  );

  vistaEl.innerHTML = `
    <div class="vista__encabezado">
      <div><h1>Transaction History</h1><p>The general ledger: absolutely everything gets recorded here</p></div>
    </div>
    <div class="tarjeta" style="margin-bottom:14px; display:flex; gap:8px; align-items:center;">
      ${icono('filtro')}
      <select class="campo__control" id="filtro-tipo" style="max-width:240px;">
        <option value="">All types</option>
        ${Object.entries(ETIQUETAS_TIPO).map(([v, e]) => `<option value="${v}" ${filtroTipo===v?'selected':''}>${e}</option>`).join('')}
      </select>
    </div>
    <div class="tarjeta"><div class="lista" id="lista-historial"></div></div>
  `;

  vistaEl.querySelector('#lista-historial').innerHTML = filas.length
    ? filas.map(fila).join('')
    : `<div class="estado-vacio">${icono('historial')}<h3>No transactions</h3><p>Every financial action you register will automatically appear here.</p></div>`;

  vistaEl.querySelector('#filtro-tipo').addEventListener('change', (e) => { vistaEl.dataset.filtroTipo = e.target.value; render(vistaEl); });
}

function fila(t) {
  const esPositivo = t.tipo === 'ingreso' || (t.tipo === 'recurrente' && (t.destino || '').startsWith('debito'));
  return `
    <div class="fila">
      <div class="fila__icono">${icono(esPositivo ? 'ingreso' : 'gasto')}</div>
      <div class="fila__cuerpo">
        <div class="fila__titulo">${ETIQUETAS_TIPO[t.tipo] || t.tipo}${t.notas ? ' — ' + t.notas : ''}</div>
        <div class="fila__meta">${formatoFecha(t.fecha)} · ${t.origen || '—'} → ${t.destino || '—'}${t.categoria ? ' · ' + t.categoria : ''}</div>
      </div>
      <div class="numero ${esPositivo ? 'positivo' : 'negativo'}">${esPositivo ? '+' : '−'} ${formatoMoneda(t.monto)}</div>
    </div>`;
}
