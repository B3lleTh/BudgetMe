<script lang="ts">
  import { eventosDelMes, type Evento, type TipoEvento } from './eventos';
  import { diasEnMes } from '../../lib/formato';
  import { t, locale } from '../../lib/i18n.svelte';

  const ETIQUETAS: Record<TipoEvento, string> = { ingreso: 'Payday', corte: 'Card statement', limite: 'Card payment due', prestamo: 'Loan payment' };

  const hoy = new Date();
  const anio = hoy.getFullYear(), mes = hoy.getMonth() + 1;
  const total = diasEnMes(anio, mes);
  // Semana de lunes a domingo; huecos antes del día 1.
  const hueco = (new Date(anio, mes - 1, 1).getDay() + 6) % 7;
  const nombresDias = $derived(Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale(), { weekday: 'narrow' })));
  const titulo = $derived.by(() => { const s = hoy.toLocaleDateString(locale(), { month: 'long', year: 'numeric' }); return s[0].toUpperCase() + s.slice(1); });

  let eventos = $state<Evento[]>([]);
  eventosDelMes(anio, mes).then((e) => (eventos = e));
  const porDia = $derived(eventos.reduce<Record<number, Evento[]>>((acc, e) => ((acc[e.dia] ??= []).push(e), acc), {}));
  const describir = (dia: number) => (porDia[dia] ?? []).map((e) => `${t(ETIQUETAS[e.tipo])}: ${e.texto}`).join('\n');
  const tipos = $derived([...new Set(eventos.map((e) => e.tipo))]);
</script>

<section class="tarjeta">
  <div class="panel__encabezado"><h3>{titulo}</h3></div>
  <div class="calendario" role="grid" aria-label={titulo}>
    {#each nombresDias as d}<span class="cabecera" role="columnheader">{d}</span>{/each}
    {#each Array(hueco) as _}<span></span>{/each}
    {#each Array(total) as _, i}
      {@const dia = i + 1}
      {@const ev = porDia[dia] ?? []}
      <span class="dia" class:hoy={dia === hoy.getDate()} class:pasado={dia < hoy.getDate()} role="gridcell" title={describir(dia) || undefined} aria-label={describir(dia) ? `${dia}. ${describir(dia)}` : String(dia)}>
        {dia}
        {#if ev.length}<span class="marcas">{#each [...new Set(ev.map((e) => e.tipo))] as tipo}<i class="marca marca--{tipo}"></i>{/each}</span>{/if}
      </span>
    {/each}
  </div>
  {#if tipos.length}
    <div class="leyenda">{#each tipos as tipo}<span><i class="marca marca--{tipo}"></i>{t(ETIQUETAS[tipo])}</span>{/each}</div>
  {/if}
</section>

<style>
  .calendario { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center; font-size: 12.5px; }
  .cabecera { color: var(--tinta-3); font-size: 11.5px; padding-bottom: 4px; text-transform: uppercase; }
  .dia { position: relative; aspect-ratio: 1; display: grid; place-items: center; border-radius: 6px; font-variant-numeric: tabular-nums; color: var(--tinta); }
  .dia.pasado { color: var(--tinta-3); }
  .dia.hoy { background: var(--primario); color: var(--primario-texto); font-weight: 650; }
  .marcas { position: absolute; bottom: 3px; display: flex; gap: 2px; }
  .marca { width: 5px; height: 5px; border-radius: 50%; display: inline-block; }
  .marca--ingreso { background: var(--ganancia); }
  .marca--corte { background: var(--tinta-2); }
  .marca--limite { background: var(--perdida); }
  .marca--prestamo { background: var(--laton); }
  .dia.hoy .marca { box-shadow: 0 0 0 1px var(--primario-texto); }
  .leyenda { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 12px; font-size: 12px; color: var(--tinta-2); }
  .leyenda span { display: inline-flex; align-items: center; gap: 6px; }
</style>
