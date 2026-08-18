import { consultar, ejecutar } from "../db.js";
import {
  formatoMoneda,
  formatoFecha,
  hoyISO,
  activarInputMoneda,
  valorNumericoDeInputMoneda,
} from "../formato.js";
import { icono } from "../iconos.js";
import { abrirModal, marcarError, limpiarError } from "../ui.js";
import { mostrarToast } from "../toasts.js";
import { confirmarYEliminar, delegarClicEliminar } from "../eliminar.js";

export async function render(vistaEl) {
  const cuentas = await consultar(
    `SELECT * FROM cuentas_debito ORDER BY creado_en DESC`,
  );
  const tarjetas = await consultar(
    `SELECT * FROM tarjetas ORDER BY tipo, creado_en DESC`,
  );

  const totalDebito = cuentas.reduce((a, c) => a + c.saldo, 0);
  const totalDeudaTC = tarjetas
    .filter((t) => t.tipo === "credito")
    .reduce((a, t) => a + t.saldo, 0);
  const totalDisponibleTC = tarjetas
    .filter((t) => t.tipo === "credito")
    .reduce((a, t) => a + Math.max(0, (t.limite || 0) - t.saldo), 0);

  vistaEl.innerHTML = `
    <div class="vista__encabezado">
      <div><h1>Cards & Accounts</h1><p>Debit, credit, and their real availability · card payments are made from Recurring</p></div>
      <div style="display:flex; gap:10px;">
        <button class="btn btn--fantasma" id="btn-nueva-cuenta">${icono("banco")} Debit account</button>
        <button class="btn btn--primario" id="btn-nueva-tarjeta">${icono("tarjeta")} Card</button>
      </div>
    </div>

    <div class="grid-kpis" style="margin-bottom:14px;">
      <div class="tarjeta"><div class="kpi__etiqueta">${icono("banco")} Total in debit accounts</div><div class="kpi__valor numero positivo">${formatoMoneda(totalDebito)}</div></div>
      <div class="tarjeta"><div class="kpi__etiqueta">${icono("tarjeta")} Total credit card debt</div><div class="kpi__valor numero negativo">${formatoMoneda(totalDeudaTC)}</div></div>
      <div class="tarjeta"><div class="kpi__etiqueta">${icono("tarjeta")} Available credit</div><div class="kpi__valor numero">${formatoMoneda(totalDisponibleTC)}</div></div>
    </div>

    <div class="tarjeta" style="margin-bottom:14px;">
      <h3>Debit Accounts</h3>
      <div class="lista" id="lista-cuentas" style="margin-top:12px;"></div>
    </div>

    <div class="tarjeta">
      <h3>Cards</h3>
      <div class="lista" id="lista-tarjetas" style="margin-top:12px;"></div>
    </div>
  `;

  vistaEl.querySelector("#lista-cuentas").innerHTML = cuentas.length
    ? cuentas
        .map(
          (c) => `
      <div class="fila" data-id="${c.id}">
        <div class="fila__icono">${icono("banco")}</div>
        <div class="fila__cuerpo"><div class="fila__titulo">${c.nombre}</div><div class="fila__meta">${c.banco || "no bank"}</div></div>
        <div class="numero positivo">${formatoMoneda(c.saldo)}</div>
        <div class="fila__acciones">
          <button class="btn-icono btn-editar-cuenta" data-id="${c.id}">${icono("editar")}</button>
          <button class="btn-icono peligro btn-eliminar-cuenta" data-id="${c.id}">${icono("eliminar")}</button>
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

  const listaCuentas = vistaEl.querySelector("#lista-cuentas");
  delegarClicEliminar(listaCuentas, ".btn-eliminar-cuenta", (id) =>
    confirmarYEliminar({
      mensaje:
        "This debit account will be deleted. This does not revert past transactions.",
      accion: () => ejecutar(`DELETE FROM cuentas_debito WHERE id = $1`, [id]),
      alExito: () => render(vistaEl),
    }),
  );
  listaCuentas.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-editar-cuenta");
    if (!btn) return;
    const c = cuentas.find((x) => String(x.id) === String(btn.dataset.id));
    abrirModalCrearOEditarCuentaDebito(c, () => render(vistaEl));
  });

  const listaTarjetas = vistaEl.querySelector("#lista-tarjetas");
  delegarClicEliminar(listaTarjetas, ".btn-eliminar-tarjeta", (id) =>
    confirmarYEliminar({
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
    }),
  );
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
  return `
    <div class="fila" data-id="${t.id}" style="flex-wrap:wrap;">
      <div class="fila__icono">${icono("tarjeta")}</div>
      <div class="fila__cuerpo">
        <div class="fila__titulo">${t.nombre} <span class="badge badge--pendiente">${esCredito ? "credit" : "debit"}</span></div>
        <div class="fila__meta">
          ${esCredito ? `Statement day ${t.fecha_corte || "—"} · Payment due day ${t.fecha_limite_pago || "—"} · Available ${formatoMoneda(disponible)} (${porcentaje}% used)` : t.banco || ""}
        </div>
      </div>
      <div class="numero ${esCredito ? "negativo" : "positivo"}">${formatoMoneda(t.saldo)}</div>
      <div class="fila__acciones">
        <button class="btn-icono btn-editar-tarjeta" data-id="${t.id}">${icono("editar")}</button>
        <button class="btn-icono peligro btn-eliminar-tarjeta" data-id="${t.id}">${icono("eliminar")}</button>
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
      <div class="campo"><label class="campo__etiqueta">Name</label><input class="campo__control" name="nombre" required value="${registro?.nombre || ""}" /><div class="campo__error"></div></div>
      <div class="campo"><label class="campo__etiqueta">Bank</label><input class="campo__control" name="banco" value="${registro?.banco || ""}" /></div>
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
      <div class="campo"><label class="campo__etiqueta">Name</label><input class="campo__control" name="nombre" required value="${registro?.nombre || ""}" /><div class="campo__error"></div></div>
      <div class="campo__fila">
        <div class="campo"><label class="campo__etiqueta">Bank</label><input class="campo__control" name="banco" value="${registro?.banco || ""}" /></div>
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