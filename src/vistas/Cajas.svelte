<script lang="ts">
  import Encabezado from '../componentes/Encabezado.svelte';
  import Icono from '../componentes/Icono.svelte';
  import Kpi from '../componentes/Kpi.svelte';
  import Barra from '../componentes/Barra.svelte';
  import EstadoVacio from '../componentes/EstadoVacio.svelte';
  import FormularioCaja from '../componentes/cajas/FormularioCaja.svelte';
  import MovimientoCaja from '../componentes/cajas/MovimientoCaja.svelte';
  import AjusteCaja from '../componentes/cajas/AjusteCaja.svelte';
  import { consultar, ejecutar } from '../lib/datos/db';
  import { formatoMoneda } from '../lib/formato';
  import { confirmarYEliminar, mostrarToast } from '../lib/avisos.svelte';
  import { t } from '../lib/i18n.svelte';
  import type { Caja, CuentaDebito } from '../lib/datos/tipos';

  let cajas = $state<Caja[]>([]), cuentas = $state<CuentaDebito[]>([]);
  let form = $state<{ registro: Caja | null } | null>(null);
  let movimiento = $state<{ caja: Caja; direccion: 'deposito' | 'retiro' } | null>(null);
  let ajuste = $state<Caja | null>(null);

  const metas = $derived(cajas.filter((c) => !c.es_sistema).reduce((a, c) => a + c.saldo, 0));
  const total = $derived(cajas.reduce((a, c) => a + c.saldo, 0));

  async function cargar() {
    cajas = await consultar(`SELECT * FROM cajas ORDER BY es_sistema, creado_en DESC`);
    cuentas = await consultar(`SELECT id, nombre, banco, saldo FROM cuentas_debito`);
  }
  cargar();

  function mover(caja: Caja, direccion: 'deposito' | 'retiro') {
    if (!cuentas.length) return mostrarToast('Register a debit account first', 'error');
    movimiento = { caja, direccion };
  }
  function eliminar(c: Caja) {
    // Borrar una caja con dinero lo desaparecía (no regresaba a ninguna cuenta).
    if (c.saldo >= 0.01) return mostrarToast('This box still has money. Withdraw it to an account first, then delete the box.', 'error', 6000);
    // `AND es_sistema = 0`: la caja de reserva nunca se puede borrar.
    confirmarYEliminar({ mensaje: 'This savings box will be deleted.', accion: () => ejecutar(`DELETE FROM cajas WHERE id = $1 AND es_sistema = 0`, [c.id]), alExito: cargar });
  }
</script>

<Encabezado titulo={t('Savings boxes')}>
  {t('Money you set aside from your accounts for a goal. It stays yours, but it no longer counts as available to spend.')}
  {#snippet acciones()}<button class="btn btn--primario" onclick={() => (form = { registro: null })}><Icono nombre="masa" /> {t('New box')}</button>{/snippet}
</Encabezado>

<div class="grid-kpis">
  <Kpi etiqueta={t('Saved toward goals')} icono="caja" valor={formatoMoneda(metas)} clase="positivo" />
  <Kpi etiqueta={t('Reserved for card payments')} icono="candado" valor={formatoMoneda(total - metas)} />
  <Kpi etiqueta={t('Total in boxes')} icono="caja" valor={formatoMoneda(total)} />
</div>

<div class="grid-2">
  {#each cajas as c (c.id)}
    {@const progreso = c.meta ? Math.min(100, Math.round((c.saldo / c.meta) * 100)) : null}
    <article class="tarjeta caja">
      <header>
        <div>
          <h3 class="titulo"><Icono nombre={c.es_sistema ? 'candado' : 'caja'} /> {c.es_sistema ? t('Reserved for Card Payments') : c.nombre}</h3>
          {#if c.objetivo && !c.es_sistema}<p class="ayuda">{c.objetivo}</p>{/if}
        </div>
        {#if !c.es_sistema}
          <div class="iconos">
            <button class="btn-icono" title={t('Edit')} aria-label={t('Edit')} onclick={() => (form = { registro: c })}><Icono nombre="editar" /></button>
            <button class="btn-icono peligro" title={t('Delete')} aria-label={t('Delete')} onclick={() => eliminar(c)}><Icono nombre="eliminar" /></button>
          </div>
        {/if}
      </header>
      <div class="kpi__valor numero saldo">{formatoMoneda(c.saldo)}</div>
      {#if progreso !== null}
        <Barra porcentaje={progreso} variante={progreso >= 100 ? 'listo' : 'meta'} />
        <div class="fila__meta meta"><span>{t('{p}% of goal', { p: progreso })}</span><span>{t('Goal')}: {formatoMoneda(c.meta)}</span></div>
      {/if}
      {#if c.es_sistema}<p class="ayuda">{t('Deposit, withdraw, or adjust here yourself whenever you decide to set money aside to pay off your cards. Nothing moves automatically.')}</p>{/if}
      <div class="botones">
        <button class="btn btn--fantasma btn--sm" onclick={() => mover(c, 'deposito')}>{t('Deposit')}</button>
        <button class="btn btn--fantasma btn--sm" onclick={() => mover(c, 'retiro')}>{t('Withdraw')}</button>
        {#if c.es_sistema}<button class="btn btn--fantasma btn--sm" onclick={() => (ajuste = c)}>{t('Adjust balance')}</button>{/if}
      </div>
    </article>
  {:else}
    <div class="tarjeta" style="grid-column:1/-1;"><EstadoVacio icono="caja" titulo={t('You don\'t have any boxes yet')} texto={t('Create one for Emergencies, Trips, or whatever you want to save for.')} /></div>
  {/each}
</div>

{#if form}<FormularioCaja registro={form.registro} alGuardar={cargar} bind:abierto={() => !!form, (v) => !v && (form = null)} />{/if}
{#if movimiento}<MovimientoCaja caja={movimiento.caja} direccion={movimiento.direccion} {cuentas} alGuardar={cargar} bind:abierto={() => !!movimiento, (v) => !v && (movimiento = null)} />{/if}
{#if ajuste}<AjusteCaja caja={ajuste} alGuardar={cargar} bind:abierto={() => !!ajuste, (v) => !v && (ajuste = null)} />{/if}

<style>
  .caja { display: flex; flex-direction: column; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
  .titulo { display: flex; align-items: center; gap: 8px; }
  .ayuda { margin-top: 6px; }
  .iconos { display: flex; gap: 2px; }
  .saldo { margin: 14px 0 12px; }
  .meta { display: flex; justify-content: space-between; margin-top: 6px; }
  .botones { display: flex; gap: 8px; margin-top: auto; padding-top: 16px; flex-wrap: wrap; }
  .botones .btn { flex: 1; }
</style>
