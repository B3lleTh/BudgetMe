// Tema único para todas las gráficas Chart.js: los colores salen de los
// tokens CSS, así las gráficas siguen el modo claro/oscuro de la app.
import Chart from 'chart.js/auto';
import type { ChartConfiguration } from 'chart.js';
import { formatoMoneda } from './formato';

function token(nombre: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
}

/** Colores actuales del tema (se leen en cada render por si cambió el modo). */
export function coloresTema() {
  return {
    tinta: token('--tinta'),
    tinta2: token('--tinta-2'),
    tinta3: token('--tinta-3'),
    linea: token('--linea'),
    superficie: token('--superficie'),
    ganancia: token('--ganancia'),
    perdida: token('--perdida'),
    advertencia: token('--advertencia'),
    info: token('--info'),
    laton: token('--laton'),
  };
}

/** "#17794A" + 0.15 → "rgba(23,121,74,0.15)" */
export function conAlfa(hex: string, alfa: number) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
}

function montoCompacto(v: number | string) {
  v = Number(v);
  const abs = Math.abs(v);
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${Math.round(v / 1e3)}k`;
  return `$${v}`;
}

const quieto = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Relleno vertical en degradado (color arriba → transparente abajo). Es
 * "scriptable": Chart.js lo recalcula cuando cambia el tamaño del área. */
export function degradado(color: string, arriba = 0.9, abajo = 0.25) {
  return (ctx: any) => {
    const { chart } = ctx;
    const area = chart.chartArea;
    if (!area) return conAlfa(color, arriba);
    const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
    g.addColorStop(0, conAlfa(color, arriba));
    g.addColorStop(1, conAlfa(color, abajo));
    return g;
  };
}

/** Entrada escalonada: cada barra/punto crece desde la base un poco después
 * del anterior, y las líneas se dibujan de izquierda a derecha. */
function animacionEntrada() {
  if (quieto()) return false;
  let iniciada = false;
  return {
    duration: 700,
    easing: 'easeOutQuart',
    onComplete: () => { iniciada = true; },
    delay: (ctx: any) => (ctx.type === 'data' && ctx.mode === 'default' && !iniciada ? ctx.dataIndex * 28 + ctx.datasetIndex * 90 : 0),
  };
}

/** Al pasar el cursor sobre una columna, las demás se atenúan. */
function resaltarAlPasar(_evento: unknown, elementos: any[], chart: any) {
  const activo = elementos[0]?.index ?? null;
  if (chart.$activo === activo) return;
  chart.$activo = activo;
  chart.data.datasets.forEach((ds: any) => {
    if (ds.type === 'line' || chart.config.type === 'line') return;
    ds.$color ??= ds.backgroundColor;
    ds.backgroundColor = activo === null ? ds.$color
      : (ctx: any) => (ctx.dataIndex === activo ? (typeof ds.$color === 'function' ? ds.$color(ctx) : ds.$color) : conAlfa(ds.$base, 0.22));
  });
  chart.update('none');
}

export function opcionesBase({ leyenda = true } = {}): any {
  const c = coloresTema();
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: animacionEntrada(),
    animations: quieto() ? false : {
      y: { from: (ctx: any) => (ctx.type === 'data' ? ctx.chart.scales.y?.getPixelForValue(0) : undefined) },
    },
    onHover: resaltarAlPasar,
    interaction: { mode: 'index', intersect: false },
    font: { family: "'Public Sans', system-ui, sans-serif" },
    plugins: {
      legend: {
        display: leyenda,
        align: 'end',
        labels: {
          color: c.tinta2, usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 8, boxHeight: 8, padding: 14, font: { size: 12 },
          // La leyenda conserva el color base aunque las barras estén atenuadas.
          generateLabels: (chart: any) => Chart.defaults.plugins.legend.labels.generateLabels(chart).map((l: any) => {
            const base = chart.data.datasets[l.datasetIndex]?.$base;
            return base ? { ...l, fillStyle: base, strokeStyle: base } : l;
          }),
        },
      },
      tooltip: {
        backgroundColor: c.superficie, titleColor: c.tinta, bodyColor: c.tinta2,
        titleFont: { weight: '600' }, caretSize: 5, usePointStyle: true,
        borderColor: c.linea, borderWidth: 1, padding: 10, cornerRadius: 6, boxPadding: 4,
        callbacks: {
          label: (ctx: any) => ` ${ctx.dataset.label}: ${formatoMoneda(ctx.parsed.y)}`,
          labelColor: (ctx: any) => { const col = ctx.dataset.$base || ctx.dataset.borderColor; return { borderColor: col, backgroundColor: col, borderRadius: 2 }; },
        },
      },
    },
    scales: {
      x: { ticks: { color: c.tinta3, font: { size: 11.5 } }, grid: { display: false }, border: { color: c.linea } },
      y: {
        beginAtZero: true,
        suggestedMax: 1000, // sin datos, el eje no muestra "$0.5 / $1"
        ticks: { color: c.tinta3, font: { size: 11.5 }, callback: montoCompacto, maxTicksLimit: 5 },
        grid: { color: c.linea }, border: { display: false },
      },
    },
  };
}

/** Barras simples por mes (vistas de Ingresos, Gastos y Recurrentes). */
export function barrasPorMes({ etiquetas, valores, nombreSerie, color }: { etiquetas: string[]; valores: number[]; nombreSerie: string; color: string }): ChartConfiguration {
  return {
    type: 'bar',
    data: {
      labels: etiquetas,
      datasets: [{
        label: nombreSerie, data: valores, $base: color,
        backgroundColor: degradado(color), hoverBackgroundColor: color,
        borderRadius: 4, borderSkipped: 'bottom', maxBarThickness: 36,
      }],
    },
    options: opcionesBase({ leyenda: false }),
  } as unknown as ChartConfiguration;
}

/** Línea vertical "hoy" sobre el eje x y sombreado de los días que faltan. */
export const pluginHoy = {
  id: 'hoy',
  beforeDatasetsDraw(chart: any, _args: unknown, opciones: any) {
    if (opciones?.indice == null) return;
    const { ctx, chartArea: area, scales: { x } } = chart;
    const px = x.getPixelForValue(opciones.indice);
    const c = coloresTema();
    ctx.save();
    ctx.fillStyle = conAlfa(c.tinta, 0.035);
    ctx.fillRect(px, area.top, area.right - px, area.bottom - area.top);
    ctx.strokeStyle = conAlfa(c.tinta3, 0.9);
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(px, area.top); ctx.lineTo(px, area.bottom); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = c.tinta2;
    ctx.font = "600 11px 'Public Sans', system-ui";
    ctx.textAlign = 'left';
    ctx.fillText(opciones.texto, px + 5, area.top + 11);
    ctx.restore();
  },
};

/** Acción de Svelte: <canvas use:grafica={() => config}>. Crea el gráfico al
 * montar, lo rehace si cambia la función y lo destruye al desmontar. */
export function grafica(nodo: HTMLCanvasElement, crear: () => ChartConfiguration) {
  // Chart.js "parcha" los arreglos de datos para observarlos; los proxies de
  // $state no lo permiten, así que se le entregan copias planas.
  const plano = (config: ChartConfiguration) => {
    config.data.labels = config.data.labels ? [...config.data.labels] : config.data.labels;
    config.data.datasets = config.data.datasets.map((ds) => ({ ...ds, data: [...ds.data] }) as typeof ds);
    return config;
  };
  let instancia = new Chart(nodo, plano(crear()));
  return {
    update(nuevo: () => ChartConfiguration) { instancia.destroy(); instancia = new Chart(nodo, plano(nuevo())); },
    destroy() { instancia.destroy(); },
  };
}
