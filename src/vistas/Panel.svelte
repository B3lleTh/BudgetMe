<script lang="ts">
  import type { ChartConfiguration } from 'chart.js';
  import Encabezado from '../componentes/Encabezado.svelte';
  import Kpi from '../componentes/Kpi.svelte';
  import Icono from '../componentes/Icono.svelte';
  import Modal from '../componentes/Modal.svelte';
  import EstadoVacio from '../componentes/EstadoVacio.svelte';
  import Patrimonio from '../componentes/panel/Patrimonio.svelte';
  import { filasDesglose, TITULOS, type FilaDesglose, type TipoDesglose, type Contexto } from '../componentes/panel/desglose';
  import { consultar } from '../lib/datos/db';
  import { SQL_ES_GASTO_FIJO } from '../lib/datos/consultas';
  import { balance, totalesMes, pendientePorPagar, proximaFechaDia, diasHasta, sincronizarTodo } from '../lib/datos/resumen';
  import { formatoMoneda, formatoFecha, prefijoMes, ultimosMeses, etiquetaMesCorta, diasEnMes } from '../lib/formato';
  import { navegar } from '../lib/navegacion.svelte';
  import { t, idioma, locale } from '../lib/i18n.svelte';
  import { grafica, opcionesBase, coloresTema, conAlfa, degradado, pluginHoy } from '../lib/graficas';

  let ctx = $state<Contexto | null>(null);
  let anterior = $state({ ingresos: 0, gastos: 0 });
  let nombre = $state(''), sinIngresos = $state(false);
  let diario = $state<number[]>([]), anual = $state<{ meses: string[]; ingresos: number[]; gastos: number[] } | null>(null);
  let desglose = $state<{ titulo: string; filas: FilaDesglose[] } | null>(null);

  function textoDias(iso: string) {
    const n = diasHasta(iso);
    return n === 0 ? t('today') : n === 1 ? t('tomorrow') : t('in {n} days', { n });
  }

  async function cargar() {
    nombre = (await consultar(`SELECT valor FROM configuracion WHERE clave = 'nombre_usuario'`))[0]?.valor?.trim() || '';
    sinIngresos = (await consultar(`SELECT COUNT(*) AS n FROM recurrentes WHERE tipo='ingreso'`))[0].n === 0;
    if (sinIngresos) return;
    await sincronizarTodo();
    const mes = prefijoMes(0);
    const [tot, ant] = await Promise.all([totalesMes(mes), totalesMes(prefijoMes(-1))]);
    anterior = ant;
    const siguiente: Contexto = { b: await balance(), mes, tot, pendiente: await pendientePorPagar(), textoDias };
    // Gasto por día del mes (incluye recurrentes pagados y préstamos).
    const filas = await consultar(`SELECT fecha, monto FROM gastos WHERE fecha LIKE $1 UNION ALL SELECT fecha, monto FROM transacciones WHERE fecha LIKE $1 AND ${SQL_ES_GASTO_FIJO}`, [`${mes}%`]);
    const [a, m] = mes.split('-').map(Number);
    const dias = Array(diasEnMes(a, m)).fill(0);
    for (const f of filas) dias[Number(f.fecha.slice(8)) - 1] += f.monto;
    diario = dias;
    const meses = ultimosMeses(12);
    const totales = await Promise.all(meses.map(totalesMes));
    anual = { meses, ingresos: totales.map((x) => x.ingresos), gastos: totales.map((x) => x.gastos) };
    // Al final: así las gráficas se crean ya con sus datos.
    ctx = siguiente;
  }
  cargar();

  async function abrir(tipo: TipoDesglose) {
    if (!ctx) return;
    const filas = await filasDesglose(tipo, ctx);
    desglose = { titulo: t(TITULOS[tipo]), filas: filas.length ? filas : [{ etiqueta: t('No details available'), valor: '—' }] };
  }

  const variacion = (actual: number, previo: number) => (previo ? ((actual - previo) / previo) * 100 : null);

  function configMensual(): ChartConfiguration {
    const c = coloresTema();
    const hoy = new Date().getDate() - 1;
    let acumulado = 0;
    // El acumulado se corta en hoy: los días futuros no tienen gasto todavía.
    const serie = diario.map((v, i) => (i <= hoy ? (acumulado += v) : null));
    const opciones = opcionesBase();
    opciones.scales.y1 = { position: 'right', beginAtZero: true, ticks: { ...opciones.scales.y.ticks }, grid: { display: false }, border: { display: false } };
    opciones.scales.x.ticks.maxTicksLimit = 10;
    opciones.plugins.hoy = { indice: hoy, texto: t('Today') };
    return {
      data: {
        labels: diario.map((_, i) => i + 1),
        datasets: [
          { type: 'bar', label: t('Spent that day'), data: diario, $base: c.tinta2, backgroundColor: degradado(c.tinta2, 0.85, 0.35), hoverBackgroundColor: c.tinta, order: 2, borderRadius: 3, borderSkipped: 'bottom', maxBarThickness: 14 },
          { type: 'line', label: t('Running total'), data: serie, borderColor: c.perdida, borderWidth: 2.25, backgroundColor: degradado(c.perdida, 0.22, 0), tension: 0.35, fill: true, yAxisID: 'y1', order: 1,
            pointRadius: (p: any) => (p.dataIndex === hoy ? 4 : 0), pointBackgroundColor: c.superficie, pointBorderColor: c.perdida, pointBorderWidth: 2, pointHoverRadius: 5, pointHoverBackgroundColor: c.perdida },
        ],
      },
      options: opciones,
      plugins: [pluginHoy],
    } as unknown as ChartConfiguration;
  }

  function configAnual(): ChartConfiguration {
    const c = coloresTema();
    const s = anual!;
    return {
      type: 'bar',
      data: {
        labels: s.meses.map((m) => etiquetaMesCorta(m, idioma.actual)),
        datasets: [
          { label: t('Income'), data: s.ingresos, $base: c.ganancia, backgroundColor: degradado(c.ganancia), hoverBackgroundColor: c.ganancia, borderRadius: 3, borderSkipped: 'bottom', maxBarThickness: 12 },
          { label: t('Expenses'), data: s.gastos, $base: c.perdida, backgroundColor: degradado(c.perdida), hoverBackgroundColor: c.perdida, borderRadius: 3, borderSkipped: 'bottom', maxBarThickness: 12 },
        ],
      },
      options: opcionesBase(),
    } as unknown as ChartConfiguration;
  }

  const fechaHoy = $derived(new Date().toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' }));
  const saludo = $derived(nombre ? t('Hi, {nombre}', { nombre }) : t('Dashboard'));
</script>

{#snippet textoNota(texto: string)}<div class="kpi__nota">{texto}</div>{/snippet}
{#snippet cambio(v: number | null, masEsMejor: boolean)}
  {#if v !== null}
    <div class="kpi__variacion {v >= 0 === masEsMejor ? 'positivo' : 'negativo'}">
      <Icono nombre={v >= 0 ? 'tendencia_arriba' : 'tendencia_abajo'} /> {Math.abs(v).toFixed(1)}% <span class="texto-tenue">{t('vs previous month')}</span>
    </div>
  {/if}
{/snippet}

{#if sinIngresos}
  <Encabezado titulo={saludo}>{t('Let\'s set up the basics.')}</Encabezado>
  <div class="tarjeta">
    <EstadoVacio icono="ingreso" titulo={t('First, register your income')} texto={t('Without your salary or main income registered, the rest of the dashboard indicators have nothing to calculate from.')}>
      <button class="btn btn--primario" onclick={() => navegar('ingresos')}>{t('Register my income')}</button>
    </EstadoVacio>
  </div>
{:else if ctx}
  {@const { b, tot, pendiente } = ctx}
  {@const sobra = tot.ingresos - tot.gastos}
  {@const corte = b.tarjetas.map((x) => proximaFechaDia(x.fecha_corte)).filter(Boolean).sort()[0]}
  {@const limite = b.tarjetas.map((x) => proximaFechaDia(x.fecha_limite_pago)).filter(Boolean).sort()[0]}

  <Encabezado titulo={saludo}>{fechaHoy}. {t('Select any figure to see where it comes from.')}</Encabezado>

  <Patrimonio {b} alAbrir={() => abrir('patrimonio')} />

  <section class="panel-seccion">
    <h2 class="panel-seccion__titulo">{t('This month')}</h2>
    <div class="grid-kpis">
      <Kpi etiqueta={t('Income received')} icono="ingreso" valor={formatoMoneda(tot.ingresos)} clase="positivo" alAbrir={() => abrir('ingresosMes')}>
        {#snippet nota()}{@render cambio(variacion(tot.ingresos, anterior.ingresos), true)}{/snippet}
      </Kpi>
      <Kpi etiqueta={t('Expenses')} icono="gasto" valor={formatoMoneda(tot.gastos)} clase="negativo" alAbrir={() => abrir('gastosMes')}>
        {#snippet nota()}{@render cambio(variacion(tot.gastos, anterior.gastos), false)}{/snippet}
      </Kpi>
      <Kpi etiqueta={t('Left over')} icono="caja" valor={formatoMoneda(sobra)} clase={sobra >= 0 ? 'positivo' : 'negativo'} alAbrir={() => abrir('ahorroMes')}>
        {#snippet nota()}{@render textoNota(t('Income minus expenses'))}{/snippet}
      </Kpi>
      <Kpi etiqueta={t('Still due this month')} icono="calendario" valor={formatoMoneda(pendiente.total)} alAbrir={() => abrir('pendiente')}>
        {#snippet nota()}{@render textoNota(t(pendiente.detalle.length === 1 ? '{n} pending payment' : '{n} pending payments', { n: pendiente.detalle.length }))}{/snippet}
      </Kpi>
    </div>
  </section>

  {#if b.tarjetas.length}
    <section class="panel-seccion">
      <h2 class="panel-seccion__titulo">{t('Credit cards')}</h2>
      <div class="grid-kpis">
        <Kpi etiqueta={t('Credit used')} icono="tarjeta" valor={formatoMoneda(b.creditoUtilizado)} clase={b.creditoUtilizado > 0 ? 'negativo' : ''} alAbrir={() => abrir('creditoUsado')}>
          {#snippet nota()}{#if b.creditoLimite}{@render textoNota(t('{p}% of {limite}', { p: Math.round((b.creditoUtilizado / b.creditoLimite) * 100), limite: formatoMoneda(b.creditoLimite) }))}{/if}{/snippet}
        </Kpi>
        <Kpi etiqueta={t('Credit available')} icono="tarjeta" valor={formatoMoneda(b.creditoDisponible)} alAbrir={() => abrir('creditoDisponible')} />
        <Kpi etiqueta={t('Next statement date')} icono="calendario" valor={corte ? formatoFecha(corte) : '—'} alAbrir={() => abrir('proximoCorte')}>
          {#snippet nota()}{#if corte}{@render textoNota(textoDias(corte))}{/if}{/snippet}
        </Kpi>
        <Kpi etiqueta={t('Next payment due date')} icono="alerta" valor={limite ? formatoFecha(limite) : '—'} alAbrir={() => abrir('proximoLimite')}>
          {#snippet nota()}{#if limite}{@render textoNota(textoDias(limite))}{/if}{/snippet}
        </Kpi>
      </div>
    </section>
  {/if}

  {#if b.prestamos.length}
    <section class="panel-seccion">
      <h2 class="panel-seccion__titulo">{t('Loans')}</h2>
      <div class="grid-kpis">
        <Kpi etiqueta={t('Total owed on loans')} icono="prestamo" valor={formatoMoneda(b.deudaPrestamos)} clase="negativo" alAbrir={() => abrir('prestamos')} />
        <Kpi etiqueta={t('Monthly payments committed')} icono="recurrente" valor={formatoMoneda(b.prestamos.filter((p) => p.activo).reduce((a, p) => a + p.pago_mensual, 0))} alAbrir={() => abrir('prestamos')} />
      </div>
    </section>
  {/if}

  <div class="grid-graficas">
    <section class="tarjeta">
      <div class="panel__encabezado"><div><h3>{t('Spending this month')}</h3><p>{t('Daily expenses and the running total')}</p></div></div>
      <div class="grafica-envoltura"><canvas use:grafica={configMensual}></canvas></div>
    </section>
    <section class="tarjeta">
      <div class="panel__encabezado"><div><h3>{t('Last 12 months')}</h3><p>{t('Income against expenses')}</p></div></div>
      <div class="grafica-envoltura">{#if anual}<canvas use:grafica={configAnual}></canvas>{/if}</div>
    </section>
  </div>
{:else}
  <div class="cargando">{t('Loading dashboard…')}</div>
{/if}

{#if desglose}
  <Modal abierto={true} titulo={desglose.titulo} alCerrar={() => (desglose = null)}>
    <div class="lista">
      {#each desglose.filas as f}
        <div class="fila" class:fila--total={f.total}>
          <div class="fila__cuerpo"><div class="fila__titulo" style:font-weight={f.total ? 600 : 500}>{f.etiqueta}</div></div>
          <div class="numero {f.clase ?? ''}">{f.valor}</div>
        </div>
      {/each}
    </div>
  </Modal>
{/if}

<style>
  .fila--total { border-top: 1px solid var(--linea-fuerte); }
</style>
