<script lang="ts">
  import type { Component } from 'svelte';
  import { obtenerDB } from './lib/datos/db';
  import { cargarIdioma, t } from './lib/i18n.svelte';
  import { cargarTema } from './lib/tema';
  import { navegacion, navegar, type Vista } from './lib/navegacion.svelte';
  import Icono from './componentes/Icono.svelte';
  import Logo from './componentes/Logo.svelte';
  import Toasts from './componentes/Toasts.svelte';
  import Confirmacion from './componentes/Confirmacion.svelte';
  import GastoRapido from './componentes/GastoRapido.svelte';
  import Bienvenida from './vistas/Bienvenida.svelte';
  import Panel from './vistas/Panel.svelte';
  import Historial from './vistas/Historial.svelte';
  import Ingresos from './vistas/Ingresos.svelte';
  import Gastos from './vistas/Gastos.svelte';
  import Recurrentes from './vistas/Recurrentes.svelte';
  import Tarjetas from './vistas/Tarjetas.svelte';
  import Cajas from './vistas/Cajas.svelte';
  import Inversiones from './vistas/Inversiones.svelte';
  import Prestamos from './vistas/Prestamos.svelte';
  import Respaldos from './vistas/Respaldos.svelte';
  import Configuracion from './vistas/Configuracion.svelte';

  const VISTAS: Record<Vista, { etiqueta: string; icono: string; componente: Component }> = {
    bienvenida: { etiqueta: 'Welcome', icono: 'inicio', componente: Bienvenida },
    dashboard: { etiqueta: 'Dashboard', icono: 'dashboard', componente: Panel },
    historial: { etiqueta: 'History', icono: 'historial', componente: Historial },
    ingresos: { etiqueta: 'Salary & Income', icono: 'ingreso', componente: Ingresos },
    gastos: { etiqueta: 'Expenses', icono: 'gasto', componente: Gastos },
    recurrentes: { etiqueta: 'Recurring', icono: 'recurrente', componente: Recurrentes },
    tarjetas: { etiqueta: 'Cards & Accounts', icono: 'tarjeta', componente: Tarjetas },
    cajas: { etiqueta: 'Savings Boxes', icono: 'caja', componente: Cajas },
    inversiones: { etiqueta: 'Investments', icono: 'grafica', componente: Inversiones },
    prestamos: { etiqueta: 'Loans', icono: 'prestamo', componente: Prestamos },
    respaldos: { etiqueta: 'Backups', icono: 'respaldo', componente: Respaldos },
    configuracion: { etiqueta: 'Settings', icono: 'configuracion', componente: Configuracion },
  };
  const GRUPOS: { titulo?: string; vistas: Vista[]; pie?: boolean }[] = [
    { vistas: ['bienvenida', 'dashboard', 'historial'] },
    { titulo: 'Money in and out', vistas: ['ingresos', 'gastos', 'recurrentes'] },
    { titulo: 'What you have and owe', vistas: ['tarjetas', 'cajas', 'inversiones', 'prestamos'] },
    { vistas: ['respaldos', 'configuracion'], pie: true },
  ];

  let estado = $state<'cargando' | 'listo' | 'error'>('cargando');
  let errorArranque = $state('');
  let gastoRapido = $state(false);

  async function iniciar() {
    estado = 'cargando';
    try {
      await Promise.race([
        (async () => { await obtenerDB(); await cargarIdioma(); await cargarTema(); })(),
        new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('The database took too long to open')), 15000)),
      ]);
      await navegar();
      estado = 'listo';
    } catch (e) {
      console.error('Could not start:', e);
      errorArranque = String((e as Error)?.message || e);
      estado = 'error';
    }
  }
  iniciar();
  addEventListener('hashchange', () => navegar());

  const Actual = $derived(VISTAS[navegacion.vista].componente);
</script>

<div class="app">
  <nav class="nav" aria-label="Main">
    <div class="nav__marca"><Logo /><span>BudgetMe</span></div>
    {#each GRUPOS as grupo}
      <div class="nav__grupo" class:nav__grupo--pie={grupo.pie}>
        {#if grupo.titulo}<span class="nav__titulo-grupo">{t(grupo.titulo)}</span>{/if}
        {#each grupo.vistas as v}
          <button class="nav__item" class:activo={navegacion.vista === v} aria-current={navegacion.vista === v ? 'page' : undefined} onclick={() => navegar(v)}>
            <Icono nombre={VISTAS[v].icono} /><span>{t(VISTAS[v].etiqueta)}</span>
          </button>
        {/each}
      </div>
    {/each}
  </nav>

  <main class="vista">
    {#if estado === 'cargando'}
      <div class="cargando">{t('Loading…')}</div>
    {:else if estado === 'error'}
      <div class="tarjeta">
        <h3>{t('The database could not be opened')}</h3>
        <pre class="ayuda" style="white-space:pre-wrap; margin:10px 0 14px;">{errorArranque}</pre>
        <button class="btn btn--primario" onclick={iniciar}>{t('Retry')}</button>
      </div>
    {:else}
      {#key navegacion.version}
        <Actual />
      {/key}
    {/if}
  </main>
</div>

{#if estado === 'listo'}
  <button class="fab" title={t('Log a quick small expense')} onclick={() => (gastoRapido = true)}>
    <Icono nombre="masa" /><span>{t('Quick expense')}</span>
  </button>
{/if}
<GastoRapido bind:abierto={gastoRapido} alGuardar={() => ['gastos', 'dashboard', 'bienvenida'].includes(navegacion.vista) && navegar(navegacion.vista)} />
<Toasts />
<Confirmacion />
