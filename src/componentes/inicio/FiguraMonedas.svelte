<script lang="ts">
  import { svgDeFigura, desplazamiento, centrosX, ANCHO, CAIDA, MAX_MONEDAS } from './geometria.js';
  import { formatoMoneda } from '../../lib/formato';
  import { t } from '../../lib/i18n.svelte';

  /** Clasificador de monedas (kit anatomy): cada tubo es un lugar donde vive
   * tu dinero y su pila es proporcional al saldo. Las monedas caen al montar;
   * el cursor o las flechas eligen un tubo y la esquina muestra su monto. */
  let { categorias }: { categorias: { etiqueta: string; valor: number }[] } = $props();

  const maximo = $derived(Math.max(...categorias.map((c) => c.valor), 1));
  const cuantas = $derived(categorias.map((c) => (c.valor > 0 ? Math.max(1, Math.round((c.valor / maximo) * MAX_MONEDAS)) : 0)));
  const svg = $derived(svgDeFigura(cuantas, `${t('A coin sorter with four tubes, each stack as tall as the money in that place')}: ${categorias.map((c) => `${c.etiqueta} ${formatoMoneda(c.valor)}`).join(', ')}.`));

  let escenario = $state<HTMLDivElement>();
  let seleccion = $state(0);
  let gira = true;
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;

  $effect(() => { seleccion = Math.max(0, cuantas.findIndex((c) => c > 0)); });

  // Resalta el tubo elegido: su moneda superior en latón y su pestaña.
  $effect(() => {
    const lienzo = escenario?.querySelector('svg');
    if (!lienzo) return;
    for (const g of lienzo.querySelectorAll<SVGGElement>('[data-tubo]')) {
      const i = Number(g.dataset.tubo);
      g.toggleAttribute('data-elegido', i === seleccion);
      const pila = g.querySelectorAll('[data-moneda] .iso-solid');
      pila.forEach((s, n) => s.toggleAttribute('data-lit', i === seleccion && n === pila.length - 1));
    }
  });

  // Caída con gravedad y un rebote pequeño; los tubos se intercalan como en
  // una clasificadora real. Después, recorrido lento por los tubos con saldo.
  $effect(() => {
    const lienzo = escenario?.querySelector('svg');
    if (!lienzo) return;
    const monedas = [...lienzo.querySelectorAll<SVGGElement>('[data-moneda]')].map((el) => {
      const [tubo, n] = el.dataset.moneda!.split('-').map(Number);
      return { el, z: quieto ? 0 : CAIDA + n * 2, v: 0, salida: (n * 4 + tubo) * 0.035, listo: quieto };
    });
    for (const m of monedas) m.el.setAttribute('transform', desplazamiento(m.z));
    if (quieto) return;
    let cuadro = 0, previo = 0, reloj = 0, ultimoGiro = 0;
    const tick = (ahora: number) => {
      const dt = previo ? Math.min((ahora - previo) / 1000, 1 / 30) : 1 / 60;
      previo = ahora;
      reloj += dt;
      let cayendo = false;
      for (const m of monedas) {
        if (m.listo) continue;
        cayendo = true;
        if (reloj < m.salida) continue;
        m.v -= 900 * dt;
        m.z += m.v * dt;
        if (m.z <= 0) { m.z = 0; m.v = Math.abs(m.v) > 60 ? -m.v * 0.22 : 0; if (!m.v) m.listo = true; }
        m.el.setAttribute('transform', desplazamiento(m.z));
      }
      if (!cayendo && gira && reloj - ultimoGiro > 2.8) {
        ultimoGiro = reloj;
        const con = cuantas.map((_, i) => i).filter((i) => cuantas[i] > 0);
        if (con.length > 1) seleccion = con[(con.indexOf(seleccion) + 1) % con.length];
      }
      cuadro = requestAnimationFrame(tick);
    };
    cuadro = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(cuadro);
  });

  let pausa = 0;
  function elegir(i: number) {
    gira = false;
    seleccion = Math.max(0, Math.min(3, i));
    clearTimeout(pausa);
    pausa = setTimeout(() => (gira = !quieto), 4000);
  }
  function alMover(e: PointerEvent) {
    const caja = escenario!.querySelector('svg')!.getBoundingClientRect();
    const px = ((e.clientX - caja.left) / caja.width) * ANCHO;
    const centros = centrosX();
    elegir(centros.reduce((mejor, cx, i) => (Math.abs(cx - px) < Math.abs(centros[mejor] - px) ? i : mejor), 0));
  }
  function alTecla(e: KeyboardEvent) {
    const paso = ({ ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 } as Record<string, number>)[e.key];
    if (paso === undefined) return;
    e.preventDefault();
    elegir(seleccion + paso);
  }
  const lectura = $derived(`${categorias[seleccion]?.etiqueta} · ${formatoMoneda(categorias[seleccion]?.valor)}`);
</script>

<figure class="iso figura">
  <div class="iso-plate">
    <span class="esquina esquina--titulo">{t('Where your money is')}</span>
    <span class="esquina esquina--pista">{t('Hover a tube')}</span>
    <span class="esquina esquina--lectura" aria-live="polite">{lectura}</span>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div bind:this={escenario} class="iso-stage" tabindex="0" role="slider" aria-label={t('Where your money is')}
      aria-valuemin={1} aria-valuemax={4} aria-valuenow={seleccion + 1} aria-valuetext={lectura} onpointermove={alMover} onkeydown={alTecla}>
      <!-- SVG generado por el kit anatomy a partir de los saldos (no contiene texto del usuario). -->
      {@html svg}
    </div>
  </div>
  <figcaption>{t('Each tube is a place where you keep money; its stack of coins grows with the balance.')}</figcaption>
</figure>

<style>
  .figura { margin: 0; }
  .esquina { position: absolute; font-size: 12px; color: var(--tinta-3); }
  .esquina--titulo { top: 18px; right: 20px; }
  .esquina--pista { bottom: 16px; left: 20px; }
  .esquina--lectura { bottom: 16px; right: 20px; color: var(--tinta); font-weight: 600; font-size: 13px; }
  figcaption { margin-top: 10px; font-size: 12.5px; color: var(--tinta-3); }
</style>
