<script lang="ts">
  import Encabezado from '../componentes/Encabezado.svelte';
  import Icono from '../componentes/Icono.svelte';
  import FiguraMonedas from '../componentes/inicio/FiguraMonedas.svelte';
  import CalendarioMes from '../componentes/inicio/CalendarioMes.svelte';
  import Avisos from '../componentes/inicio/Avisos.svelte';
  import ActividadReciente from '../componentes/inicio/ActividadReciente.svelte';
  import { calcularAvisos, type Aviso } from '../componentes/inicio/avisos';
  import { consultar } from '../lib/datos/db';
  import { balance, totalesMes, pendientePorPagar, sincronizarTodo, type Balance, type Pendiente } from '../lib/datos/resumen';
  import { formatoMoneda, prefijoMes } from '../lib/formato';
  import { navegar, type Vista } from '../lib/navegacion.svelte';
  import { nombreDeRecurrente } from '../lib/etiquetas';
  import { t } from '../lib/i18n.svelte';

  let nombre = $state('');
  let pasos = $state<{ cuentas: number; ingresos: number; fijos: number } | null>(null);
  let datos = $state<{ b: Balance; mes: { ingresos: number; gastos: number }; pendiente: { total: number; detalle: Pendiente[] }; avisos: Aviso[] } | null>(null);

  async function cargar() {
    nombre = (await consultar(`SELECT valor FROM configuracion WHERE clave = 'nombre_usuario'`))[0]?.valor?.trim() || '';
    const n = async (sql: string) => (await consultar(sql))[0].n as number;
    pasos = {
      cuentas: await n(`SELECT COUNT(*) n FROM cuentas_debito`),
      ingresos: await n(`SELECT COUNT(*) n FROM recurrentes WHERE tipo = 'ingreso'`),
      fijos: await n(`SELECT COUNT(*) n FROM recurrentes WHERE tipo = 'gasto' AND tarjeta_id IS NULL AND prestamo_id IS NULL`),
    };
    if (!pasos.cuentas || !pasos.ingresos) return;
    await sincronizarTodo();
    const [b, mes, anterior, pendiente] = await Promise.all([balance(), totalesMes(prefijoMes(0)), totalesMes(prefijoMes(-1)), pendientePorPagar()]);
    datos = { b, mes, pendiente, avisos: await calcularAvisos(b, pendiente.detalle, mes.gastos, anterior.gastos) };
  }
  cargar();

  const hora = new Date().getHours();
  const saludo = $derived.by(() => {
    const parte = t(hora < 12 ? 'Good morning' : hora < 19 ? 'Good afternoon' : 'Good evening');
    return nombre ? `${parte}, ${nombre}` : parte;
  });
  const PASOS: { clave: 'cuentas' | 'ingresos' | 'fijos'; titulo: string; texto: string; destino: Vista }[] = [
    { clave: 'cuentas', titulo: 'Add your bank account', texto: 'Where your salary arrives and your money lives.', destino: 'tarjetas' },
    { clave: 'ingresos', titulo: 'Register your income', texto: 'Your salary or main income, so the app knows what comes in.', destino: 'ingresos' },
    { clave: 'fijos', titulo: 'Add a recurring expense', texto: 'Rent, subscriptions, insurance… anything you pay every month.', destino: 'recurrentes' },
  ];
</script>

{#if pasos && (!pasos.cuentas || !pasos.ingresos)}
  <!-- Primera vez: pasos en lugar de cifras en cero. -->
  {@const p = pasos}
  <Encabezado titulo={saludo}>{t('Welcome to BudgetMe. Three steps and your overview is ready.')}</Encabezado>
  <section class="tarjeta">
    <div class="lista">
      {#each PASOS as paso}
        {@const hecho = p[paso.clave] > 0}
        <div class="fila">
          <div class="fila__icono" class:fila__icono--ingreso={hecho}><Icono nombre={hecho ? 'check' : 'masa'} /></div>
          <div class="fila__cuerpo"><div class="fila__titulo">{t(paso.titulo)}</div><div class="fila__meta">{t(paso.texto)}</div></div>
          {#if hecho}<span class="badge badge--pagado">{t('Done')}</span>{:else}<button class="btn btn--primario btn--sm" onclick={() => navegar(paso.destino)}>{t('Start')}</button>{/if}
        </div>
      {/each}
    </div>
  </section>
{:else if datos}
  {@const { b, mes, pendiente, avisos } = datos}
  {@const sobra = mes.ingresos - mes.gastos}
  <Encabezado titulo={saludo}>
    {t('This month you received')} <b class="numero positivo">{formatoMoneda(mes.ingresos)}</b> {t('and spent')} <b class="numero negativo">{formatoMoneda(mes.gastos)}</b>.
    {#if pendiente.total > 0}
      {t('Still due:')} <b class="numero">{formatoMoneda(pendiente.total)}</b> {t(pendiente.detalle.length === 1 ? 'in {n} payment.' : 'in {n} payments.', { n: pendiente.detalle.length })}
    {:else}{t('Nothing is pending this month.')}{/if}
    {#snippet acciones()}<button class="btn btn--fantasma" onclick={() => navegar('dashboard')}><Icono nombre="dashboard" /> {t('Open dashboard')}</button>{/snippet}
  </Encabezado>

  <div class="bienvenida">
    <FiguraMonedas categorias={[
      { etiqueta: t('Debit accounts'), valor: b.debito },
      { etiqueta: t('Savings boxes'), valor: b.ahorrado },
      { etiqueta: t('Card reserve'), valor: b.reservadoTC },
      { etiqueta: t('Investments'), valor: b.invertido },
    ]} />
    <section class="tarjeta proximos">
      <div class="panel__encabezado"><h3>{t('Coming up')}</h3><span class="numero texto-tenue">{formatoMoneda(pendiente.total)}</span></div>
      <div class="lista">
        {#each pendiente.detalle.slice(0, 5) as r (r.id)}
          <div class="fila"><div class="fila__cuerpo"><div class="fila__titulo" style="font-weight:500;">{nombreDeRecurrente(r.nombre, t)}</div></div><div class="numero">{formatoMoneda(r.restante)}</div></div>
        {:else}
          <p class="ayuda" style="padding:12px 0;">{t('Nothing pending — every recurring payment is covered.')}</p>
        {/each}
      </div>
      {#if pendiente.detalle.length > 5}<button class="btn btn--fantasma btn--sm btn--bloque" onclick={() => navegar('recurrentes')}>{t('See all {n}', { n: pendiente.detalle.length })}</button>{/if}
      <p class="balance-mes" class:negativo={sobra < 0}>
        {sobra >= 0 ? t('You\'re {monto} ahead this month.', { monto: formatoMoneda(sobra) }) : t('This month you\'ve spent {monto} more than you received.', { monto: formatoMoneda(-sobra) })}
      </p>
    </section>
  </div>

  <div class="fila-tres">
    <CalendarioMes />
    <Avisos {avisos} />
    <ActividadReciente />
  </div>
{:else}
  <div class="cargando">{t('Loading…')}</div>
{/if}

<style>
  .bienvenida { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(260px, 1fr); gap: 16px; align-items: stretch; margin-bottom: 16px; }
  .proximos { display: flex; flex-direction: column; }
  .proximos .lista { flex: 1; }
  .balance-mes { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--linea); font-size: 12.5px; color: var(--tinta-2); }
  .balance-mes.negativo { color: var(--perdida); }
  .fila-tres { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; align-items: start; }
  @media (max-width: 1180px) { .fila-tres { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 1100px) { .bienvenida { grid-template-columns: 1fr; } }
  @media (max-width: 760px) { .fila-tres { grid-template-columns: 1fr; } }
</style>
