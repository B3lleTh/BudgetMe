<script lang="ts">
  import Encabezado from '../componentes/Encabezado.svelte';
  import Fila from '../componentes/Fila.svelte';
  import Icono from '../componentes/Icono.svelte';
  import Kpi from '../componentes/Kpi.svelte';
  import EstadoVacio from '../componentes/EstadoVacio.svelte';
  import NuevaInversion from '../componentes/inversiones/NuevaInversion.svelte';
  import RetiroInversion from '../componentes/inversiones/RetiroInversion.svelte';
  import Simulador from '../componentes/inversiones/Simulador.svelte';
  import { consultar, ejecutar } from '../lib/datos/db';
  import { capitalizarInversion } from '../lib/datos/ledger';
  import { formatoMoneda, formatoFecha, hoyISO } from '../lib/formato';
  import { confirmarYEliminar, mostrarToast } from '../lib/avisos.svelte';
  import { t } from '../lib/i18n.svelte';
  import type { CuentaDebito, Inversion } from '../lib/datos/tipos';

  let inversiones = $state<Inversion[]>([]), cuentas = $state<CuentaDebito[]>([]);
  let nueva = $state(false), simulador = $state(false), retiro = $state<Inversion | null>(null);
  let ocupado = $state<number | null>(null);

  const invertido = $derived(inversiones.reduce((a, i) => a + i.aporte_inicial, 0));
  const actual = $derived(inversiones.reduce((a, i) => a + i.saldo, 0));

  async function cargar() {
    inversiones = await consultar(`SELECT * FROM inversiones ORDER BY creado_en DESC`);
    cuentas = await consultar(`SELECT id, nombre, banco, saldo FROM cuentas_debito`);
  }
  cargar();

  async function avanzarMes(inv: Inversion) {
    if (ocupado) return;
    ocupado = inv.id;
    try { await capitalizarInversion(inv, hoyISO()); mostrarToast('Month capitalized — interest reinvested', 'exito'); await cargar(); }
    catch (err) { console.error(err); mostrarToast('Could not capitalize the month', 'error'); }
    finally { ocupado = null; }
  }
  function eliminar(inv: Inversion) {
    if (inv.saldo >= 0.01) return mostrarToast('This investment still has money. Withdraw it to an account first, then delete it.', 'error', 6000);
    confirmarYEliminar({ mensaje: 'This investment will be deleted (its history stays in Transactions).', accion: () => ejecutar(`DELETE FROM inversiones WHERE id = $1`, [inv.id]), alExito: cargar });
  }
  const retirar = (inv: Inversion) => (cuentas.length ? (retiro = inv) : mostrarToast('Register a debit account first', 'error'));
</script>

<Encabezado titulo={t('Investments & Projections')}>
  {t('Track a fund that reinvests its interest every month (CETES, a savings account with yield…), or simulate one before investing.')}
  {#snippet acciones()}
    <button class="btn btn--fantasma" onclick={() => (simulador = true)}><Icono nombre="grafica" /> {t('Simulate')}</button>
    <button class="btn btn--primario" onclick={() => (nueva = true)}><Icono nombre="masa" /> {t('New investment')}</button>
  {/snippet}
</Encabezado>

<div class="grid-kpis">
  <Kpi etiqueta={t('Total invested')} icono="caja" valor={formatoMoneda(invertido)} />
  <Kpi etiqueta={t('Current value')} icono="grafica" valor={formatoMoneda(actual)} />
  <Kpi etiqueta={t('Interest earned')} icono="tendencia_arriba" valor={formatoMoneda(actual - invertido)} clase="positivo" />
</div>

<section class="tarjeta">
  <div class="lista">
    {#each inversiones as inv (inv.id)}
      <Fila icono="grafica" titulo={inv.nombre}
        meta={`${inv.tasa_anual}% ${t('annual')} · ${t('started')} ${formatoFecha(inv.fecha_inicio)} · ${inv.meses_capitalizados} ${t('month(s) compounded')}`}>
        {#snippet monto()}<div class="fila__monto"><span class="numero">{formatoMoneda(inv.saldo)}</span><small class="positivo">+{formatoMoneda(inv.saldo - inv.aporte_inicial)} {t('gained')}</small></div>{/snippet}
        {#snippet acciones()}
          <button class="btn btn--fantasma btn--sm" title={t('Applies one month of compound interest')} class:btn--carga={ocupado === inv.id} disabled={!!ocupado} onclick={() => avanzarMes(inv)}>{t('Advance 1 month')}</button>
          <button class="btn-icono" title={t('Withdraw')} aria-label={t('Withdraw')} onclick={() => retirar(inv)}><Icono nombre="gasto" /></button>
          <button class="btn-icono peligro" title={t('Delete')} aria-label={t('Delete')} onclick={() => eliminar(inv)}><Icono nombre="eliminar" /></button>
        {/snippet}
      </Fila>
    {:else}
      <EstadoVacio icono="grafica" titulo={t('No investments yet')} texto={t('Create a fund and watch its interest compound monthly.')} />
    {/each}
  </div>
</section>

{#if nueva}<NuevaInversion bind:abierto={nueva} {cuentas} alGuardar={cargar} />{/if}
{#if simulador}<Simulador bind:abierto={simulador} />{/if}
{#if retiro}<RetiroInversion inversion={retiro} {cuentas} alGuardar={cargar} bind:abierto={() => !!retiro, (v) => !v && (retiro = null)} />{/if}
