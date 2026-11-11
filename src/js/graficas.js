// Tema único para todas las gráficas Chart.js: los colores salen de los
// tokens CSS, así las gráficas siguen el modo claro/oscuro de la app.
import { formatoMoneda } from './formato.js';

function token(nombre) {
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
export function conAlfa(hex, alfa) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
}

function montoCompacto(v) {
  const abs = Math.abs(v);
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${Math.round(v / 1e3)}k`;
  return `$${v}`;
}

export function opcionesBase({ leyenda = true } = {}) {
  const c = coloresTema();
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    font: { family: "'Public Sans', system-ui, sans-serif" },
    plugins: {
      legend: {
        display: leyenda,
        align: 'end',
        labels: { color: c.tinta2, usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 8, boxHeight: 8, padding: 14, font: { size: 12 } },
      },
      tooltip: {
        backgroundColor: c.superficie, titleColor: c.tinta, bodyColor: c.tinta2,
        borderColor: c.linea, borderWidth: 1, padding: 10, cornerRadius: 6, boxPadding: 4,
        callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${formatoMoneda(ctx.parsed.y)}` },
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
export function graficaBarrasPorMes(canvas, { etiquetas, valores, nombreSerie, color }) {
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: etiquetas,
      datasets: [{
        label: nombreSerie, data: valores,
        backgroundColor: conAlfa(color, 0.85), hoverBackgroundColor: color,
        borderRadius: 3, maxBarThickness: 36,
      }],
    },
    options: opcionesBase({ leyenda: false }),
  });
}
