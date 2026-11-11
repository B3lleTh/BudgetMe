<script lang="ts">
  import Modal from '../Modal.svelte';
  import Campo from '../Campo.svelte';
  import CampoMoneda from '../CampoMoneda.svelte';
  import { ejecutar } from '../../lib/datos/db';
  import { etiquetaDeCuentaConBanco } from '../../lib/etiquetas';
  import { mostrarToast } from '../../lib/avisos.svelte';
  import { t } from '../../lib/i18n.svelte';
  import type { CuentaDebito, Recurrente } from '../../lib/datos/tipos';

  /** Crear (registro null) o editar un ingreso recurrente. */
  let { abierto = $bindable(), registro = null, cuentas, alGuardar }: { abierto: boolean; registro?: Recurrente | null; cuentas: CuentaDebito[]; alGuardar: () => void } = $props();

  const diasGuardados = (() => { try { return JSON.parse(registro?.dias_de_pago || '[]').join(','); } catch { return ''; } })();
  let nombre = $state(registro?.nombre ?? ''), monto = $state(registro?.monto ?? 0);
  let tipo = $state(registro?.es_variable ? 'variable' : 'fijo'), periodicidad = $state(registro?.periodicidad ?? 'mensual');
  let dias = $state(diasGuardados), intervalo = $state<number | null>(registro?.intervalo_dias ?? null);
  let cuentaId = $state(registro?.cuenta_destino_id ?? cuentas[0]?.id);
  let errores = $state<Record<string, string>>({}), guardando = $state(false);

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    errores = {};
    if (!nombre.trim()) errores.nombre = 'Enter a name';
    if (!(monto > 0)) errores.monto = 'Enter a valid amount';
    if (Object.keys(errores).length || guardando) return;
    const diasDePago = periodicidad === 'quincenal' ? dias.split(',').map((n) => Number(n.trim())).filter((n) => n >= 1 && n <= 31) : [];
    const valores = [nombre.trim(), monto, periodicidad, JSON.stringify(diasDePago), Number(intervalo) || null, tipo === 'variable' ? 1 : 0, cuentaId];
    guardando = true;
    try {
      if (registro) {
        await ejecutar(`UPDATE recurrentes SET nombre=$1, monto=$2, periodicidad=$3, dias_de_pago=$4, intervalo_dias=$5, es_variable=$6, cuenta_destino_id=$7 WHERE id=$8`, [...valores, registro.id]);
        mostrarToast('Income updated', 'exito');
      } else {
        await ejecutar(`INSERT INTO recurrentes (tipo, nombre, categoria, monto, periodicidad, dias_de_pago, intervalo_dias, es_variable, cuenta_destino_id, estado) VALUES ('ingreso',$1,'salario',$2,$3,$4,$5,$6,$7,'pendiente')`, valores);
        mostrarToast('Income registered', 'exito');
      }
      abierto = false;
      alGuardar();
    } catch (err) {
      console.error(err);
      mostrarToast('Could not save the income', 'error');
    } finally {
      guardando = false;
    }
  }
</script>

<Modal bind:abierto titulo={t(registro ? 'Edit fixed income' : 'New fixed income')} subtitulo={t('A salary or any income that repeats. You confirm each payment when it arrives.')} ancho="ancho">
  <form id="form-ingreso-fijo" onsubmit={guardar}>
    <Campo etiqueta="Name" error={errores.nombre}><input class="campo__control" name="nombre" placeholder={t('Salary, freelance…')} bind:value={nombre} /></Campo>
    <div class="campo__fila">
      <Campo etiqueta="Type">
        <select class="campo__control" bind:value={tipo}><option value="fijo">{t('Fixed (salary)')}</option><option value="variable">{t('Variable / freelance')}</option></select>
      </Campo>
      <Campo etiqueta="Frequency">
        <select class="campo__control" name="periodicidad" bind:value={periodicidad}>
          <option value="semanal">{t('Weekly')}</option><option value="quincenal">{t('Biweekly')}</option>
          <option value="mensual">{t('Monthly')}</option><option value="personalizada">{t('Custom')}</option>
        </select>
      </Campo>
    </div>
    {#if periodicidad === 'quincenal'}
      <Campo etiqueta="Payment days (e.g. 15,30)"><input class="campo__control" placeholder="15,30" bind:value={dias} /></Campo>
    {:else if periodicidad === 'personalizada'}
      <Campo etiqueta="Every how many days"><input class="campo__control" type="number" min="1" bind:value={intervalo} /></Campo>
    {/if}
    <div class="campo__fila">
      <CampoMoneda etiqueta={tipo === 'variable' ? 'Amount (estimated average)' : 'Amount'} bind:valor={monto} error={errores.monto} />
      <Campo etiqueta="Destination account">
        <select class="campo__control" bind:value={cuentaId}>{#each cuentas as c (c.id)}<option value={c.id}>{etiquetaDeCuentaConBanco(c)}</option>{/each}</select>
      </Campo>
    </div>
  </form>
  {#snippet acciones()}
    <div class="modal__acciones">
      <button type="button" class="btn btn--fantasma" onclick={() => (abierto = false)}>{t('Cancel')}</button>
      <button type="submit" form="form-ingreso-fijo" class="btn btn--primario" disabled={guardando}>{t(registro ? 'Save changes' : 'Save income')}</button>
    </div>
  {/snippet}
</Modal>
