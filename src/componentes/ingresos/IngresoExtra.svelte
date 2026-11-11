<script lang="ts">
  import Modal from '../Modal.svelte';
  import Campo from '../Campo.svelte';
  import CampoMoneda from '../CampoMoneda.svelte';
  import { consultar, ejecutar } from '../../lib/datos/db';
  import { registrarIngreso, revertirTransaccion } from '../../lib/datos/ledger';
  import { hoyISO } from '../../lib/formato';
  import { etiquetaDeCuentaConBanco } from '../../lib/etiquetas';
  import { mostrarToast } from '../../lib/avisos.svelte';
  import { t } from '../../lib/i18n.svelte';
  import type { CuentaDebito, IngresoExtra, Transaccion } from '../../lib/datos/tipos';

  /** Crear o editar un ingreso extra. Al editar, si cambia monto, fecha o
   * cuenta, el movimiento se revierte y se registra de nuevo (antes solo
   * cambiaba la lista y el saldo seguía con el monto viejo). */
  let { abierto = $bindable(), extra = null, cuentas, alGuardar }: { abierto: boolean; extra?: IngresoExtra | null; cuentas: CuentaDebito[]; alGuardar: () => void } = $props();

  let nombre = $state(extra?.nombre ?? ''), monto = $state(extra?.monto ?? 0), fecha = $state(extra?.fecha ?? hoyISO());
  let categoria = $state(extra?.categoria ?? ''), notas = $state(extra?.notas ?? '');
  let cuentaId = $state<number | undefined>(cuentas[0]?.id);
  let txActual = $state<Transaccion | null>(null);
  let errores = $state<Record<string, string>>({}), guardando = $state(false);

  if (extra) consultar<Transaccion>(`SELECT * FROM transacciones WHERE ref_tabla='ingresos_extra' AND ref_id=$1 ORDER BY id DESC LIMIT 1`, [extra.id]).then(([tx]) => {
    txActual = tx ?? null;
    if (tx?.destino?.startsWith('debito:')) cuentaId = Number(tx.destino.split(':')[1]);
  });

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    errores = {};
    if (!nombre.trim()) errores.nombre = 'Enter a name';
    if (!(monto > 0)) errores.monto = 'Enter a valid amount';
    if (Object.keys(errores).length || guardando) return;
    const cat = categoria.trim() || null;
    guardando = true;
    try {
      if (!extra) {
        const res = await ejecutar(`INSERT INTO ingresos_extra (nombre, categoria, fecha, monto, notas) VALUES ($1,$2,$3,$4,$5)`, [nombre.trim(), cat, fecha || hoyISO(), monto, notas.trim() || null]);
        await registrarIngreso({ cuentaDebitoId: cuentaId, monto, categoria: cat || 'ingreso_extra', notas: nombre.trim(), fecha: fecha || hoyISO(), refTabla: 'ingresos_extra', refId: res.lastInsertId });
        mostrarToast('Income registered', 'exito');
      } else {
        const cuentaAnterior = txActual?.destino?.startsWith('debito:') ? Number(txActual.destino.split(':')[1]) : null;
        if (!txActual || monto !== extra.monto || fecha !== extra.fecha || cuentaId !== cuentaAnterior) {
          if (txActual) await revertirTransaccion(txActual);
          await registrarIngreso({ cuentaDebitoId: cuentaId, monto, categoria: cat || 'ingreso_extra', notas: nombre.trim(), fecha, refTabla: 'ingresos_extra', refId: extra.id });
        } else {
          await ejecutar(`UPDATE transacciones SET notas=$1, categoria=$2 WHERE id=$3`, [nombre.trim(), cat || 'ingreso_extra', txActual.id]);
        }
        await ejecutar(`UPDATE ingresos_extra SET nombre=$1, categoria=$2, fecha=$3, monto=$4, notas=$5 WHERE id=$6`, [nombre.trim(), cat, fecha, monto, notas.trim() || null, extra.id]);
        mostrarToast('Income updated', 'exito');
      }
      abierto = false;
      alGuardar();
    } catch (err) {
      console.error(err);
      mostrarToast(extra ? 'Could not update the income' : 'Could not save the income', 'error');
    } finally {
      guardando = false;
    }
  }
</script>

<Modal bind:abierto titulo={t(extra ? 'Edit extra income' : 'Extra income')} subtitulo={extra ? undefined : t('One-off money: a bonus, a refund, something you sold. It’s added to the account right away.')} ancho="ancho">
  <form id="form-extra" onsubmit={guardar}>
    <Campo etiqueta="Name" error={errores.nombre}><input class="campo__control" name="nombre" placeholder={t('Bonus, refund, sale…')} bind:value={nombre} /></Campo>
    <div class="campo__fila">
      <CampoMoneda etiqueta="Amount" bind:valor={monto} error={errores.monto} />
      <Campo etiqueta="Date"><input class="campo__control" type="date" bind:value={fecha} /></Campo>
    </div>
    <div class="campo__fila">
      <Campo etiqueta="Category"><input class="campo__control" placeholder="Freelance" bind:value={categoria} /></Campo>
      <Campo etiqueta="Destination account">
        <select class="campo__control" bind:value={cuentaId}>{#each cuentas as c (c.id)}<option value={c.id}>{etiquetaDeCuentaConBanco(c)}</option>{/each}</select>
      </Campo>
    </div>
    {#if extra}<Campo etiqueta="Notes"><input class="campo__control" bind:value={notas} /></Campo>{/if}
  </form>
  {#snippet acciones()}
    <div class="modal__acciones">
      <button type="button" class="btn btn--fantasma" onclick={() => (abierto = false)}>{t('Cancel')}</button>
      <button type="submit" form="form-extra" class="btn btn--primario" disabled={guardando}>{t(extra ? 'Save changes' : 'Save income')}</button>
    </div>
  {/snippet}
</Modal>
