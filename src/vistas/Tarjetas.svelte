<script lang="ts">
  import Encabezado from '../componentes/Encabezado.svelte';
  import Fila from '../componentes/Fila.svelte';
  import Icono from '../componentes/Icono.svelte';
  import Kpi from '../componentes/Kpi.svelte';
  import Barra from '../componentes/Barra.svelte';
  import EstadoVacio from '../componentes/EstadoVacio.svelte';
  import FormularioCuenta from '../componentes/tarjetas/FormularioCuenta.svelte';
  import FormularioTarjeta from '../componentes/tarjetas/FormularioTarjeta.svelte';
  import MoverDinero from '../componentes/tarjetas/MoverDinero.svelte';
  import { consultar, ejecutar } from '../lib/datos/db';
  import { formatoMoneda } from '../lib/formato';
  import { confirmarYEliminar, mostrarToast } from '../lib/avisos.svelte';
  import { t } from '../lib/i18n.svelte';
  import type { Caja, CuentaDebito, Tarjeta } from '../lib/datos/tipos';

  let cuentas = $state<CuentaDebito[]>([]), tarjetas = $state<Tarjeta[]>([]), cajas = $state<Caja[]>([]);
  let formCuenta = $state<{ registro: CuentaDebito | null } | null>(null);
  let formTarjeta = $state<{ registro: Tarjeta | null } | null>(null);
  let mover = $state(false);

  const credito = $derived(tarjetas.filter((x) => x.tipo === 'credito'));
  const totalDebito = $derived(cuentas.reduce((a, c) => a + c.saldo, 0));
  const deuda = $derived(credito.reduce((a, x) => a + x.saldo, 0));
  const disponible = $derived(credito.reduce((a, x) => a + Math.max(0, (x.limite || 0) - x.saldo), 0));

  async function cargar() {
    cuentas = await consultar(`SELECT * FROM cuentas_debito ORDER BY creado_en DESC`);
    tarjetas = await consultar(`SELECT * FROM tarjetas ORDER BY tipo, creado_en DESC`);
    cajas = await consultar(`SELECT * FROM cajas WHERE es_sistema = 0 ORDER BY nombre`);
  }
  cargar();

  function eliminarCuenta(c: CuentaDebito) {
    // Borrar una cuenta con dinero lo hacía desaparecer del patrimonio.
    if (Math.abs(c.saldo) >= 0.01) return mostrarToast('This account still has a balance. Move the money to another account first (Move money), then delete it.', 'error', 6000);
    confirmarYEliminar({ mensaje: 'This debit account will be deleted. This does not revert past transactions.', accion: () => ejecutar(`DELETE FROM cuentas_debito WHERE id = $1`, [c.id]), alExito: cargar });
  }
  function eliminarTarjeta(x: Tarjeta) {
    if (x.tipo === 'credito' && x.saldo >= 0.01) return mostrarToast('This card still has debt. Pay it off from Recurring (or set its debt to 0 if it\'s already paid), then delete it.', 'error', 6000);
    confirmarYEliminar({
      mensaje: 'This card will be deleted. This does not revert past transactions.',
      // Los recurrentes automáticos de la tarjeta se borran antes (si no, quedan huérfanos).
      accion: async () => { await ejecutar(`DELETE FROM recurrentes WHERE tarjeta_id = $1`, [x.id]); await ejecutar(`DELETE FROM tarjetas WHERE id = $1`, [x.id]); },
      alExito: cargar,
    });
  }
  const abrirMover = () => (cuentas.length + cajas.length < 2 ? mostrarToast('You need at least two accounts or boxes to move money', 'error') : (mover = true));
</script>

<Encabezado titulo={t('Cards & Accounts')}>
  {t('Your bank accounts and credit cards. Card payments are made from Recurring, where each card\'s monthly payment appears on its own.')}
  {#snippet acciones()}
    <button class="btn btn--fantasma" onclick={abrirMover}><Icono nombre="transferir" /> {t('Move money')}</button>
    <button class="btn btn--fantasma" onclick={() => (formCuenta = { registro: null })}><Icono nombre="banco" /> {t('Debit account')}</button>
    <button class="btn btn--primario" onclick={() => (formTarjeta = { registro: null })}><Icono nombre="tarjeta" /> {t('Card')}</button>
  {/snippet}
</Encabezado>

<div class="grid-kpis">
  <Kpi etiqueta={t('Total in debit accounts')} icono="banco" valor={formatoMoneda(totalDebito)} clase="positivo" />
  <Kpi etiqueta={t('Total credit card debt')} icono="tarjeta" valor={formatoMoneda(deuda)} clase="negativo" />
  <Kpi etiqueta={t('Available credit')} icono="tarjeta" valor={formatoMoneda(disponible)} />
</div>

<section class="tarjeta seccion">
  <div class="panel__encabezado"><h3>{t('Debit Accounts')}</h3></div>
  <div class="lista">
    {#each cuentas as c (c.id)}
      <Fila icono="banco" titulo={c.nombre} meta={c.banco || t('no bank')}>
        {#snippet monto()}<div class="numero" class:negativo={c.saldo < 0}>{formatoMoneda(c.saldo)}</div>{/snippet}
        {#snippet acciones()}
          <button class="btn-icono" title={t('Edit')} aria-label={t('Edit')} onclick={() => (formCuenta = { registro: c })}><Icono nombre="editar" /></button>
          <button class="btn-icono peligro" title={t('Delete')} aria-label={t('Delete')} onclick={() => eliminarCuenta(c)}><Icono nombre="eliminar" /></button>
        {/snippet}
      </Fila>
    {:else}
      <EstadoVacio icono="banco" texto={t('You don\'t have any debit accounts yet.')} />
    {/each}
  </div>
</section>

<section class="tarjeta">
  <div class="panel__encabezado"><h3>{t('Cards')}</h3></div>
  <div class="lista">
    {#each tarjetas as x (x.id)}
      {@const esCredito = x.tipo === 'credito'}
      {@const porcentaje = esCredito && x.limite ? Math.min(100, Math.round((x.saldo / x.limite) * 100)) : null}
      <Fila icono="tarjeta"
        meta={esCredito ? `${x.banco ? `${x.banco} · ` : ''}${t('Statement day')} ${x.fecha_corte || '—'} · ${t('Payment due day')} ${x.fecha_limite_pago || '—'}` : x.banco || ''}>
        {#snippet titulo()}{x.nombre} <span class="badge">{t(esCredito ? 'Credit' : 'Debit')}</span>{/snippet}
        {#if porcentaje !== null}
          <div class="uso">
            <Barra {porcentaje} variante={porcentaje >= 80 ? 'alerta' : ''} />
            <span class="fila__meta">{t('{p}% used', { p: porcentaje })} · {t('Available')} {formatoMoneda((x.limite || 0) - x.saldo)}</span>
          </div>
        {/if}
        {#snippet monto()}<div class="fila__monto"><span class="numero" class:negativo={esCredito && x.saldo > 0}>{formatoMoneda(x.saldo)}</span>{#if esCredito}<small>{t('owed')}</small>{/if}</div>{/snippet}
        {#snippet acciones()}
          <button class="btn-icono" title={t('Edit')} aria-label={t('Edit')} onclick={() => (formTarjeta = { registro: x })}><Icono nombre="editar" /></button>
          <button class="btn-icono peligro" title={t('Delete')} aria-label={t('Delete')} onclick={() => eliminarTarjeta(x)}><Icono nombre="eliminar" /></button>
        {/snippet}
      </Fila>
    {:else}
      <EstadoVacio icono="tarjeta" texto={t('You don\'t have any cards registered yet.')} />
    {/each}
  </div>
</section>

{#if formCuenta}<FormularioCuenta registro={formCuenta.registro} alGuardar={cargar} bind:abierto={() => !!formCuenta, (v) => !v && (formCuenta = null)} />{/if}
{#if formTarjeta}<FormularioTarjeta registro={formTarjeta.registro} alGuardar={cargar} bind:abierto={() => !!formTarjeta, (v) => !v && (formTarjeta = null)} />{/if}
{#if mover}<MoverDinero bind:abierto={mover} {cuentas} {cajas} alGuardar={cargar} />{/if}

<style>
  .uso { display: flex; align-items: center; gap: 10px; margin-top: 8px; max-width: 420px; }
  .uso :global(.barra) { flex: 1; }
  .uso .fila__meta { margin: 0; white-space: nowrap; }
</style>
