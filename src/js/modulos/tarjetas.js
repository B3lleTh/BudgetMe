import { consultar, ejecutar } from "../db.js";
import {
  formatoMoneda,
  hoyISO,
  activarInputMoneda,
  valorNumericoDeInputMoneda,
  escaparHTML,
} from "../formato.js";
import { icono } from "../iconos.js";
import { abrirModal, marcarError, limpiarError, conBotonOcupado } from "../ui.js";
import { mostrarToast } from "../toasts.js";
import { confirmarYEliminar, delegarClicEliminar } from "../eliminar.js";
import { transferirEntreCuentas } from "../ledger.js";
import { etiquetaDeCuentaConBanco } from '../etiquetas.js';

export async function render(vistaEl) {
  const cuentas = await consultar(
    `SELECT * FROM cuentas_debito ORDER BY creado_en DESC`,
  );
  const tarjetas = await consultar(
    `SELECT * FROM tarjetas ORDER BY tipo, creado_en DESC`,
  );

  const cajas = await consultar(`SELECT id, nombre, saldo FROM cajas WHERE es_sistema = 0 ORDER BY nombre`);

  const totalDebito = cuentas.reduce((a, c) => a + c.saldo, 0);
  const totalDeudaTC = tarjetas
    .filter((t) => t.tipo === "credito")
    .reduce((a, t) => a + t.saldo, 0);
  const totalDisponibleTC = tarjetas
    .filter((t) => t.tipo === "credito")
    .reduce((a, t) => a + Math.max(0, (t.limite || 0) - t.saldo), 0);

  vistaEl.innerHTML = `
    <div class="vista__encabezado">
      <div><h1>Cards & Accounts</h1><p>Your bank accounts and credit cards. Card payments are made from Recurring, where each card’s monthly payment appears on its own.</p></div>
      <div class="vista__acciones">
        <button class="btn btn--fantasma" id="btn-mover-dinero">${icono("transferir")} Move money</button>
        <button class="btn btn--fantasma" id="btn-nueva-cuenta">${icono("banco")} Debit account</button>
        <button class="btn btn--primario" id="btn-nueva-tarjeta">${icono("tarjeta")} Card</button>
      </div>
    </div>

    <div class="grid-kpis">
      <div class="tarjeta"><div class="kpi__etiqueta">${icono("banco")} Total in debit accounts</div><div class="kpi__valor numero positivo">${formatoMoneda(totalDebito)}</div></div>
      <div class="tarjeta"><div class="kpi__etiqueta">${icono("tarjeta")} Total credit card debt</div><div class="kpi__valor numero negativo">${formatoMoneda(totalDeudaTC)}</div></div>
      <div class="tarjeta"><div class="kpi__etiqueta">${icono("tarjeta")} Available credit</div><div class="kpi__valor numero">${formatoMoneda(totalDisponibleTC)}</div></div>
    </div>

    <div class="tarjeta seccion">
      <div class="panel__encabezado"><h3>Debit Accounts</h3></div>
      <div class="lista" id="lista-cuentas"></div>
    </div>

    <div class="tarjeta">
      <div class="panel__encabezado"><h3>Cards</h3></div>
      <div class="lista" id="lista-tarjetas"></div>
    </div>
  `;

  vistaEl.querySelector("#lista-cuentas").innerHTML = cuentas.length
    ? cuentas
        .map(
          (c) => `
      <div class="fila" data-id="${c.id}">
        <div class="fila__icono">${icono("banco")}</div>
        <div class="fila__cuerpo"><div class="fila__titulo">${escaparHTML(c.nombre)}</div><div class="fila__meta">${escaparHTML(c.banco || "no bank")}</div></div>
        <div class="numero ${c.saldo < 0 ? "negativo" : ""}">${formatoMoneda(c.saldo)}</div>
        <div class="fila__acciones">
          <button class="btn-icono btn-editar-cuenta" data-id="${c.id}" title="Edit" aria-label="Edit">${icono("editar")}</button>
          <button class="btn-icono peligro btn-eliminar-cuenta" data-id="${c.id}" title="Delete" aria-label="Delete">${icono("eliminar")}</button>
        </div>
      </div>`,
        )
        .join("")
    : `<div class="estado-vacio">${icono("banco")}<p>You don't have any debit accounts yet.</p></div>`;

  vistaEl.querySelector("#lista-tarjetas").innerHTML = tarjetas.length
    ? tarjetas
        .map((t) => renderizarFilaTarjetaConDisponibleYPorcentajeUsado(t))
        .join("")
    : `<div class="estado-vacio">${icono("tarjeta")}<p>You don't have any cards registered yet.</p></div>`;

  vistaEl
    .querySelector("#btn-nueva-cuenta")
    .addEventListener("click", () =>
      abrirModalCrearOEditarCuentaDebito(null, () => render(vistaEl)),
    );
  vistaEl
    .querySelector("#btn-nueva-tarjeta")
    .addEventListener("click", () =>
      abrirModalCrearOEditarTarjeta(null, () => render(vistaEl)),
    );
    vistaEl.querySelector("#btn-mover-dinero").addEventListener("click", () =>
  abrirModalMoverDineroEntreCuentasOCajas(cuentas, cajas, () => render(vistaEl)));

  const listaCuentas = vistaEl.querySelector("#lista-cuentas");
  delegarClicEliminar(listaCuentas, ".btn-eliminar-cuenta", (id) => {
    // Borrar una cuenta con dinero lo hacía desaparecer del patrimonio sin
    // dejar rastro: primero hay que moverlo a otra cuenta o caja.
    const cuenta = cuentas.find((x) => String(x.id) === id);
    if (cuenta && Math.abs(cuenta.saldo) >= 0.01) {
      mostrarToast("This account still has a balance. Move the money to another account first (Move money), then delete it.", "error", 6000);
      return;
    }
    return confirmarYEliminar({
      mensaje:
        "This debit account will be deleted. This does not revert past transactions.",
      accion: () => ejecutar(`DELETE FROM cuentas_debito WHERE id = $1`, [id]),
      alExito: () => render(vistaEl),
    });
  });
  listaCuentas.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-editar-cuenta");
    if (!btn) return;
    const c = cuentas.find((x) => String(x.id) === String(btn.dataset.id));
    abrirModalCrearOEditarCuentaDebito(c, () => render(vistaEl));
  });

  const listaTarjetas = vistaEl.querySelector("#lista-tarjetas");
  delegarClicEliminar(listaTarjetas, ".btn-eliminar-tarjeta", (id) => {
    const tarjeta = tarjetas.find((x) => String(x.id) === id);
    if (tarjeta && tarjeta.tipo === "credito" && tarjeta.saldo >= 0.01) {
      mostrarToast("This card still has debt. Pay it off from Recurring (or set its debt to 0 if it’s already paid), then delete it.", "error", 6000);
      return;
    }
    return confirmarYEliminar({
      mensaje:
        "This card will be deleted. This does not revert past transactions.",
      accion: async () => {
        // BUG FIX: deleting a card used to leave its auto-generated recurring
        // rows (the MSI installments and the aggregate "card payment" row
        // created by sincronizarMensualidadesTC, both linked via tarjeta_id)
        // orphaned in the recurrentes table forever — they kept counting
        // toward "pending to pay" on a card that no longer exists. Clean
        // them up first, same pattern as deleting a gasto in gastos.js.
        await ejecutar(`DELETE FROM recurrentes WHERE tarjeta_id = $1`, [id]);
        await ejecutar(`DELETE FROM tarjetas WHERE id = $1`, [id]);
      },
      alExito: () => render(vistaEl),
    });
  });
  listaTarjetas.addEventListener("click", (e) => {
    const btnEditar = e.target.closest(".btn-editar-tarjeta");
    if (btnEditar) {
      const t = tarjetas.find(
        (x) => String(x.id) === String(btnEditar.dataset.id),
      );
      abrirModalCrearOEditarTarjeta(t, () => render(vistaEl));
    }
  });
}

/** Renders one card's row: name, type badge, and — for credit cards — the
 * statement/due days plus how much of the limit is currently used. */
function renderizarFilaTarjetaConDisponibleYPorcentajeUsado(t) {
  const esCredito = t.tipo === "credito";
  const disponible = esCredito ? (t.limite || 0) - t.saldo : null;
  const porcentaje =
    esCredito && t.limite
      ? Math.min(100, Math.round((t.saldo / t.limite) * 100))
      : null;
  const claseBarra = porcentaje >= 80 ? "barra--alerta" : "";
  return `
    <div class="fila" data-id="${t.id}">
      <div class="fila__icono">${icono("tarjeta")}</div>
      <div class="fila__cuerpo">
        <div class="fila__titulo">${escaparHTML(t.nombre)} <span class="badge">${esCredito ? "Credit" : "Debit"}</span></div>
        <div class="fila__meta">
          ${esCredito ? `${escaparHTML(t.banco || "")}${t.banco ? " · " : ""}Statement day ${t.fecha_corte || "—"} · Payment due day ${t.fecha_limite_pago || "—"}` : escaparHTML(t.banco || "")}
        </div>
        ${porcentaje != null ? `<div style="display:flex; align-items:center; gap:10px; margin-top:8px; max-width:420px;">
          <div class="barra ${claseBarra}" style="flex:1;"><div class="barra__relleno" style="width:${porcentaje}%;"></div></div>
          <span class="fila__meta" style="margin:0; white-space:nowrap;">${porcentaje}% used · Available ${formatoMoneda(disponible)}</span>
        </div>` : ""}
      </div>
      <div class="fila__monto"><span class="numero ${esCredito && t.saldo > 0 ? "negativo" : ""}">${formatoMoneda(t.saldo)}</span>${esCredito ? `<small>owed</small>` : ""}</div>
      <div class="fila__acciones">
        <button class="btn-icono btn-editar-tarjeta" data-id="${t.id}" title="Edit" aria-label="Edit">${icono("editar")}</button>
        <button class="btn-icono peligro btn-eliminar-tarjeta" data-id="${t.id}" title="Delete" aria-label="Delete">${icono("eliminar")}</button>
      </div>
    </div>`;
}

/** Opens the create/edit modal for a debit account (name, bank, balance).
 * `registro` null = create mode; passing an existing row = edit mode. */
function abrirModalCrearOEditarCuentaDebito(registro, alGuardar) {
  const editando = !!registro;
  const { overlay, cerrar } = abrirModal(`
    <h3 class="modal__titulo">${editando ? "Edit" : "New"} debit account</h3>
    <form id="form-cuenta">
      <div class="campo"><label class="campo__etiqueta">Name</label><input class="campo__control" name="nombre" required value="${escaparHTML(registro?.nombre || "")}" /><div class="campo__error"></div></div>
      <div class="campo"><label class="campo__etiqueta">Bank</label><input class="campo__control" name="banco" value="${escaparHTML(registro?.banco || "")}" /></div>
      <div class="campo"><label class="campo__etiqueta">${editando ? "Current balance" : "Starting balance"}</label><input class="campo__control" name="saldo" inputmode="decimal" placeholder="0.00" value="${registro?.saldo ?? ""}" /></div>
      <div class="modal__acciones">
        <button type="button" class="btn btn--fantasma" data-cerrar-modal>Cancel</button>
        <button type="submit" class="btn btn--primario">${editando ? "Save changes" : "Save"}</button>
      </div>
    </form>`);
  const form = overlay.querySelector("#form-cuenta");
  activarInputMoneda(form.saldo);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const campoNombre = form.nombre.closest(".campo");
    limpiarError(campoNombre);
    if (!form.nombre.value.trim()) {
      marcarError(campoNombre, "Enter a name");
      return;
    }
    try {
      if (editando) {
        await ejecutar(
          `UPDATE cuentas_debito SET nombre=$1, banco=$2, saldo=$3 WHERE id=$4`,
          [
            form.nombre.value.trim(),
            form.banco.value.trim() || null,
            valorNumericoDeInputMoneda(form.saldo),
            registro.id,
          ],
        );
        mostrarToast("Account updated", "exito");
      } else {
        await ejecutar(
          `INSERT INTO cuentas_debito (nombre, banco, saldo) VALUES ($1,$2,$3)`,
          [
            form.nombre.value.trim(),
            form.banco.value.trim() || null,
            valorNumericoDeInputMoneda(form.saldo),
          ],
        );
        mostrarToast("Account created", "exito");
      }
      cerrar();
      alGuardar();
    } catch (err) {
      console.error(err);
      mostrarToast("Could not save the account", "error");
    }
  });
}

/** Opens the create/edit modal for a card (debit-type or credit-type).
 * Credit-only fields (limit, statement day, due day, and — when editing —
 * current debt) are shown/hidden live as the user toggles the type select.
 * `registro` null = create mode; passing an existing row = edit mode. */
function abrirModalCrearOEditarTarjeta(registro, alGuardar) {
  const editando = !!registro;
  const { overlay, cerrar } = abrirModal(`
    <h3 class="modal__titulo">${editando ? "Edit" : "New"} card</h3>
    <form id="form-tarjeta">
      <div class="campo"><label class="campo__etiqueta">Name</label><input class="campo__control" name="nombre" required value="${escaparHTML(registro?.nombre || "")}" /><div class="campo__error"></div></div>
      <div class="campo__fila">
        <div class="campo"><label class="campo__etiqueta">Bank</label><input class="campo__control" name="banco" value="${escaparHTML(registro?.banco || "")}" /></div>
        <div class="campo"><label class="campo__etiqueta">Type</label>
          <select class="campo__control" name="tipo">
            <option value="credito" ${registro?.tipo !== "debito" ? "selected" : ""}>Credit</option>
            <option value="debito" ${registro?.tipo === "debito" ? "selected" : ""}>Debit</option>
          </select>
        </div>
      </div>
      <div id="campos-credito">
        ${editando ? `<div class="campo"><label class="campo__etiqueta">Current debt</label><input class="campo__control" name="saldo" inputmode="decimal" value="${registro?.saldo ?? 0}" /></div>` : ""}
        <div class="campo"><label class="campo__etiqueta">Credit limit</label><input class="campo__control" name="limite" inputmode="decimal" placeholder="0.00" value="${registro?.limite ?? ""}" /></div>
        <div class="campo__fila">
          <div class="campo"><label class="campo__etiqueta">Statement day</label><input class="campo__control" name="fecha_corte" type="number" min="1" max="31" value="${registro?.fecha_corte ?? ""}" /></div>
          <div class="campo"><label class="campo__etiqueta">Payment due day</label><input class="campo__control" name="fecha_limite_pago" type="number" min="1" max="31" value="${registro?.fecha_limite_pago ?? ""}" /></div>
        </div>
      </div>
      <div class="modal__acciones">
        <button type="button" class="btn btn--fantasma" data-cerrar-modal>Cancel</button>
        <button type="submit" class="btn btn--primario">${editando ? "Save changes" : "Save"}</button>
      </div>
    </form>`);
  const form = overlay.querySelector("#form-tarjeta");
  activarInputMoneda(form.limite);
  if (form.saldo) activarInputMoneda(form.saldo);
  const alternarCamposSoloDeCredito = () => {
    overlay.querySelector("#campos-credito").style.display =
      form.tipo.value === "credito" ? "block" : "none";
  };
  form.tipo.addEventListener("change", alternarCamposSoloDeCredito);
  alternarCamposSoloDeCredito();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const campoNombre = form.nombre.closest(".campo");
    limpiarError(campoNombre);
    if (!form.nombre.value.trim()) {
      marcarError(campoNombre, "Enter a name");
      return;
    }
    try {
      if (editando) {
        await ejecutar(
          `UPDATE tarjetas SET nombre=$1, banco=$2, tipo=$3, limite=$4, fecha_corte=$5, fecha_limite_pago=$6${form.saldo ? ", saldo=$7" : ""} WHERE id=${form.saldo ? "$8" : "$7"}`,
          [
            form.nombre.value.trim(),
            form.banco.value.trim() || null,
            form.tipo.value,
            form.tipo.value === "credito"
              ? valorNumericoDeInputMoneda(form.limite)
              : null,
            Number(form.fecha_corte.value) || null,
            Number(form.fecha_limite_pago.value) || null,
            ...(form.saldo ? [valorNumericoDeInputMoneda(form.saldo)] : []),
            registro.id,
          ],
        );
        mostrarToast("Card updated", "exito");
      } else {
        await ejecutar(
          `INSERT INTO tarjetas (nombre, banco, tipo, limite, fecha_corte, fecha_limite_pago) VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            form.nombre.value.trim(),
            form.banco.value.trim() || null,
            form.tipo.value,
            form.tipo.value === "credito"
              ? valorNumericoDeInputMoneda(form.limite)
              : null,
            Number(form.fecha_corte.value) || null,
            Number(form.fecha_limite_pago.value) || null,
          ],
        );
        mostrarToast("Card created", "exito");
      }
      cerrar();
      alGuardar();
    } catch (err) {
      console.error(err);
      mostrarToast("Could not save the card", "error");
    }
  });
}

/** Moves money between debit accounts and/or savings boxes. It is NOT income or
 * an expense: the ledger stores a single neutral 'transferencia' entry. */
function abrirModalMoverDineroEntreCuentasOCajas(cuentas, cajas, alGuardar) {
  const lugares = [
    ...cuentas.map(c => ({ ref: `debito:${c.id}`, nombre: etiquetaDeCuentaConBanco(c), saldo: c.saldo, tipo: 'Debit' })),
    ...cajas.map(c => ({ ref: `caja:${c.id}`, nombre: c.nombre, saldo: c.saldo, tipo: 'Savings box' })),
  ];
  if (lugares.length < 2) {
    mostrarToast("You need at least two accounts or boxes to move money", "error");
    return;
  }
  const opciones = lugares.map(l =>
    `<option value="${l.ref}" data-saldo="${l.saldo}">${l.tipo === "Savings box" ? escaparHTML(l.nombre) : l.nombre} (${l.tipo})</option>`).join("");

  const { overlay, cerrar } = abrirModal(`
    <h3 class="modal__titulo">Move money</h3>
    <p class="modal__subtitulo">Transfers are not counted as income or expenses — it’s the same money, just moved.</p>
    <form id="form-mover">
      <div class="campo"><label class="campo__etiqueta">Move from</label>
        <select class="campo__control" name="origen">${opciones}</select></div>
      <p id="saldo-origen" class="ayuda" style="margin:-8px 0 14px;"></p>
      <div class="campo"><label class="campo__etiqueta">Move to</label>
        <select class="campo__control" name="destino">${opciones}</select></div>
      <div class="campo"><label class="campo__etiqueta">Amount</label>
        <input class="campo__control" name="monto" inputmode="decimal" placeholder="0.00" required /><div class="campo__error"></div></div>
      <div class="campo"><label class="campo__etiqueta">Notes (optional)</label>
        <input class="campo__control" name="notas" /></div>
      <div class="campo"><label class="campo__etiqueta">Date</label>
        <input class="campo__control" type="date" name="fecha" value="${hoyISO()}" /></div>
      <div class="modal__acciones">
        <button type="button" class="btn btn--fantasma" data-cerrar-modal>Cancel</button>
        <button type="submit" class="btn btn--primario">Move money</button>
      </div>
    </form>`);

  const form = overlay.querySelector("#form-mover");
  activarInputMoneda(form.monto);
  form.destino.selectedIndex = 1;

  const mostrarSaldoDelOrigen = () => {
    const saldo = Number(form.origen.selectedOptions[0]?.dataset.saldo || 0);
    overlay.querySelector("#saldo-origen").textContent = `Available in this account: ${formatoMoneda(saldo)}`;
  };
  mostrarSaldoDelOrigen();
  form.origen.addEventListener("change", mostrarSaldoDelOrigen);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const campoMonto = form.monto.closest(".campo");
    limpiarError(campoMonto);
    const monto = valorNumericoDeInputMoneda(form.monto);
    if (!monto || monto <= 0) { marcarError(campoMonto, "Enter a valid amount"); return; }
    if (form.origen.value === form.destino.value) {
      mostrarToast("Origin and destination must be different", "error"); return;
    }
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true; btn.classList.add("btn--carga");
    try {
      await transferirEntreCuentas({
        origen: form.origen.value, destino: form.destino.value, monto,
        notas: form.notas.value.trim() || null, fecha: form.fecha.value || hoyISO(),
      });
      mostrarToast("Money moved", "exito");
      cerrar(); alGuardar();
    } catch (err) {
      console.error(err);
      const msg = String(err);
      mostrarToast(
        msg.includes("INSUFFICIENT_DEBIT_BALANCE") ? "Not enough balance in the origin"
        : msg.includes("SAME_ACCOUNT") ? "Origin and destination must be different"
        : "Could not move the money", "error");
      btn.disabled = false; btn.classList.remove("btn--carga");
    }
  });
}