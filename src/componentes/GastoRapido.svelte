<script lang="ts">
  import Modal from './Modal.svelte';
  import Campo from './Campo.svelte';
  import CampoMoneda from './CampoMoneda.svelte';
  import { consultar, ejecutar } from '../lib/datos/db';
  import { registrarGasto } from '../lib/datos/ledger';
  import { hoyISO } from '../lib/formato';
  import { etiquetaDeCuentaConBanco } from '../lib/etiquetas';
  import { mostrarToast } from '../lib/avisos.svelte';
  import { t } from '../lib/i18n.svelte';
  import type { CuentaDebito } from '../lib/datos/tipos';

  /** "Small daily expense in under 3 clicks", desde el botón flotante. */
  let { abierto = $bindable(), alGuardar }: { abierto: boolean; alGuardar?: () => void } = $props();

  let cuentas = $state<CuentaDebito[]>([]);
  let nombre = $state(''), monto = $state(0), cuentaId = $state<number>();
  let errores = $state<{ nombre?: string; monto?: string }>({});
  let guardando = $state(false);

  $effect(() => {
    if (!abierto) return;
    nombre = ''; monto = 0; errores = {};
    consultar(`SELECT id, nombre, banco, saldo FROM cuentas_debito`).then((filas) => {
      cuentas = filas;
      cuentaId = filas[0]?.id;
      if (!filas.length) { mostrarToast('Register a debit account first', 'error'); abierto = false; }
    });
  });

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    errores = {};
    if (!nombre.trim()) errores.nombre = 'Enter a name';
    if (!(monto > 0)) errores.monto = 'Enter a valid amount';
    if (errores.nombre || errores.monto || guardando || !cuentaId) return;
    guardando = true; // un doble clic ya no registra el gasto dos veces
    try {
      const res = await ejecutar(
        `INSERT INTO gastos (nombre, categoria, fecha, monto, metodo_pago, cuenta_debito_id) VALUES ($1,'hormiga',$2,$3,'debito',$4)`,
        [nombre.trim(), hoyISO(), monto, cuentaId]
      );
      await registrarGasto({ gastoId: res.lastInsertId, cuentaDebitoId: cuentaId, metodoPago: 'debito', monto, categoria: 'hormiga', notas: nombre.trim(), fecha: hoyISO() });
      mostrarToast('Small expense registered', 'exito');
      abierto = false;
      alGuardar?.();
    } catch (err) {
      console.error(err);
      mostrarToast('Could not register', 'error');
    } finally {
      guardando = false;
    }
  }
</script>

<Modal bind:abierto titulo={t('Quick small expense')} subtitulo={t('Coffee, snacks, parking… saved as a small daily spend for today.')}>
  <form id="form-rapido" onsubmit={guardar}>
    <Campo etiqueta="What for?" error={errores.nombre}><input class="campo__control" name="nombre" bind:value={nombre} /></Campo>
    <div class="campo__fila">
      <CampoMoneda etiqueta="Amount" bind:valor={monto} error={errores.monto} />
      <Campo etiqueta="Account">
        <select class="campo__control" name="cuenta_debito_id" bind:value={cuentaId}>
          {#each cuentas as c (c.id)}<option value={c.id}>{etiquetaDeCuentaConBanco(c)}</option>{/each}
        </select>
      </Campo>
    </div>
  </form>
  {#snippet acciones()}
    <div class="modal__acciones">
      <button type="button" class="btn btn--fantasma" onclick={() => (abierto = false)}>{t('Cancel')}</button>
      <button type="submit" form="form-rapido" class="btn btn--primario" class:btn--carga={guardando} disabled={guardando}>{t('Register')}</button>
    </div>
  {/snippet}
</Modal>
