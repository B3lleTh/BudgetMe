// Figura de bienvenida: un clasificador de monedas isométrico (kit anatomy,
// src/vendor/iso-kit.js). Cada tubo es un lugar donde vive tu dinero y su
// pila de monedas es proporcional a tu saldo real: la figura ES el resumen.
// @ts-nocheck — geometría con el kit anatomy (JS sin tipos).
import * as k from '../../lib/vendor/iso-kit.js';

export const ANCHO = 640;
export const ALTO = 330;
const PLACA = { x: -128, y: -40, w: 256, d: 80, r: 8 };
const PLACA_H = 9;
const PATA_H = 4;
export const TUBOS_X = [-81, -27, 27, 81];
export const TUBO_Y = 4;
const COLLAR_R = 17;
const COLLAR_H = 6;
const MONEDA_R = 13.5;
const MONEDA_H = 2.6;
const PASO = 3.1;
export const MAX_MONEDAS = 26;
export const TOPE = 92;
const POSTE_R = 1.4;
const POSTE_A = 16;
const ESPINA_Y = -31;
export const CAIDA = 120; // altura desde la que caen las monedas al montar

export const P = k.fitProjection(
  [...k.boxCorners(PLACA, -PLACA_H - PATA_H, 0), [-118, ESPINA_Y, TOPE + 8], [118, ESPINA_Y, TOPE + 8], [81, TUBO_Y, TOPE + 6]],
  ANCHO, ALTO, { pad: 26, azimuth: 62 },
);
const en = (p) => k.iso(p, P);
const S = (paths, estilo) => k.solidSvg(paths, estilo);
const L = (d, estilo) => k.lineSvg(d, estilo);
const D = (puntos, estilo) => k.dotsSvg(puntos, estilo);
const FRENTE = Math.atan2(k.towardViewer(P)[1], k.towardViewer(P)[0]);

function placa() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLACA, -PLACA_H - PATA_H, PLACA_H, P)}"/>`];
  const patas = k.corners(PLACA, 18).sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  for (const [x, y] of patas) {
    out.push(S(k.cylinder(x, y, 6.5, -PLACA_H - PATA_H, 1.4, P, 28), { tone: 'lo' }));
    out.push(S(k.cylinder(x, y, 5, -PLACA_H - PATA_H + 1.4, PATA_H - 1.4, P, 28), { tone: 'mid' }));
  }
  out.push(S(k.slabOf(PLACA, -PLACA_H, PLACA_H, P, 8, 1.4), { tone: 'mid' }));
  out.push(L(k.planOutline(k.insetPlan(PLACA, 5), 0, P), { tone: 'faint' }));
  const tornillos = k.corners(PLACA, 10);
  out.push(L(tornillos.map(([x, y]) => k.ring(x, y, 2, 0, P, 16)).join(''), { tone: 'lo' }));
  out.push(D(tornillos.map(([x, y]) => en([x, y, 0])), { size: 0.5 }));
  // Regla al frente: una marca por cada moneda de capacidad del tubo.
  const regla = { x: -112, y: PLACA.y + PLACA.d - 13, w: 224, d: 6, r: 1 };
  out.push(S(k.slabOf(regla, 0, 0.6, P, 3), { tone: 'lo', crease: 'none' }));
  const marcas = k.topTicks(regla.x + 4, regla.x + regla.w - 4, 4, 5, regla.y + 0.8, 0.6, [1.8, 3.4], P);
  out.push(L(marcas.minor, { tone: 'lo' }), L(marcas.major, { tone: 'mid' }));
  out.push(D([en([regla.x + 2, regla.y + 3, 0.6]), en([regla.x + regla.w - 2, regla.y + 3, 0.6])], { size: 0.45 }));
  return out.join('');
}

/** Espina trasera: dos postes y un travesaño que sostienen los collares superiores. */
function espina() {
  const out = [];
  for (const x of [-118, 118]) {
    out.push(S(k.slabOf({ x: x - 3, y: ESPINA_Y - 3, w: 6, d: 6, r: 1 }, 0, TOPE + 6, P, 3, 0.4), { tone: 'mid' }));
    out.push(D([en([x, ESPINA_Y, TOPE + 6])], { size: 0.45 }));
  }
  out.push(S(k.slabOf({ x: -121, y: ESPINA_Y - 3, w: 242, d: 6, r: 1.2 }, TOPE, 6, P, 3, 0.4), { tone: 'mid' }));
  out.push(L(k.lineOnTop([-114, ESPINA_Y], [114, ESPINA_Y], TOPE + 6, P), { tone: 'faint' }));
  for (const x of TUBOS_X) {
    const brazo = { x: x - 3, y: ESPINA_Y + 3, w: 6, d: TUBO_Y - COLLAR_R - ESPINA_Y - 3 + 1, r: 0.8 };
    out.push(S(k.slabOf(brazo, TOPE + 1, 4, P, 3, 0.3), { tone: 'mid' }));
    out.push(D([en([x, ESPINA_Y + 6, TOPE + 5])], { size: 0.4 }));
  }
  return out.join('');
}

/** Collar superior hueco: solo su banda exterior y sus dos bordes, para que
 * se vea la boca del tubo (relleno convexo lo dibujaba como una tapa). */
function collarAbierto(x, y) {
  const e = k.extrude(k.circleRing(x, y, COLLAR_R, 40), TOPE, 5, P, { convex: true });
  const sombras = e.shades.map((d, n) => (d ? `<path class="iso-shade" data-shade="${n}" d="${d}"/>` : '')).join('');
  return `<g class="iso-solid">${sombras}<path class="iso-line iso-edge" data-tone="mid" d="${e.outline}"/></g>`
    + L(k.ring(x, y, COLLAR_R, TOPE + 5, P, 40), { tone: 'mid' })
    + L(k.ring(x, y, COLLAR_R - 2.4, TOPE + 5, P, 40), { tone: 'lo' });
}

function poste(x, y, angulo) {
  const px = x + Math.cos(angulo) * POSTE_A, py = y + Math.sin(angulo) * POSTE_A;
  return S(k.cylinder(px, py, POSTE_R, COLLAR_H, TOPE - COLLAR_H, P, 12), { tone: 'mid', crease: 'none' });
}

const monedaSvg = (x, y, z, encendida) =>
  S(k.cylinder(x, y, MONEDA_R, z, MONEDA_H, P, 36, 0.5), { tone: 'mid', crease: 'lo', className: 'moneda', lit: encendida });

function tubo(i, monedas) {
  const x = TUBOS_X[i], y = TUBO_Y;
  const atras = [FRENTE + Math.PI * 2 / 3, FRENTE - Math.PI * 2 / 3];
  const pila = Array.from({ length: monedas }, (_, n) =>
    `<g data-moneda="${i}-${n}" data-z="${COLLAR_H + n * PASO}">${monedaSvg(x, y, COLLAR_H + n * PASO, false)}</g>`).join('');
  // Pestaña frontal con tres renglones grabados (el "nombre" del tubo).
  const pestana = { x: x - 11, y: PLACA.y + PLACA.d - 30, w: 22, d: 10, r: 1.2 };
  const renglones = [2.5, 5, 7.5].map((dy, n) => L(k.lineOnTop([pestana.x + 3, pestana.y + dy], [pestana.x + (n === 2 ? 12 : 19), pestana.y + dy], 1, P), { tone: 'lo', free: true })).join('');
  return `
    <g data-tubo="${i}">
      ${S(k.slabOf(pestana, 0, 1, P, 3, 0.3), { tone: 'lo', className: 'pestana' })}
      <g class="pestana-renglones">${renglones}</g>
      <path class="iso-halo" d="${k.haloOf({ x: x - 15, y: y - 15, w: 30, d: 30, r: 15 }, 0, 0.1, P)}" style="filter:blur(4px)"/>
      ${S(k.cylinder(x, y, COLLAR_R, 0, COLLAR_H, P, 40, 0.6), { tone: 'mid' })}
      ${L(k.ring(x, y, MONEDA_R + 1, COLLAR_H, P, 40), { tone: 'lo' })}
      ${atras.map(a => poste(x, y, a)).join('')}
      ${L(k.ring(x, y, COLLAR_R, TOPE, P, 40), { tone: 'lo' })}
      <g class="pila">${pila}</g>
      ${poste(x, y, FRENTE)}
      ${collarAbierto(x, y)}
      ${D([0, 1, 2].map(n => en([x + Math.cos(FRENTE + n * 2.094) * (COLLAR_R - 1.2), y + Math.sin(FRENTE + n * 2.094) * (COLLAR_R - 1.2), TOPE + 5])), { size: 0.4 })}
    </g>`;
}


/** SVG completo con `cuantas[i]` monedas en cada tubo (de atrás hacia adelante). */
export function svgDeFigura(cuantas, etiqueta) {
  const orden = TUBOS_X.map((x, i) => i).sort((a, b) => k.depthOf([TUBOS_X[a], TUBO_Y, 0], P) - k.depthOf([TUBOS_X[b], TUBO_Y, 0], P));
  return k.figureSvg({ width: ANCHO, height: ALTO, label: etiqueta, body: [placa(), espina(), ...orden.map((i) => tubo(i, cuantas[i]))] });
}

export const desplazamiento = (z) => k.translateAlong(P, [0, 0, z]);
export const centrosX = () => TUBOS_X.map((x) => en([x, TUBO_Y, TOPE / 2])[0]);
