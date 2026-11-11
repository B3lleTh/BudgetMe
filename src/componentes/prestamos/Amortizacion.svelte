<script lang="ts">
  import Modal from '../Modal.svelte';
  import { formatoMoneda } from '../../lib/formato';
  import { t } from '../../lib/i18n.svelte';
  import type { Prestamo } from '../../lib/datos/tipos';

  /** Tabla estimada de los meses restantes (cálculo puro, misma regla que pagarPrestamo). */
  let { abierto = $bindable(), prestamo: p }: { abierto: boolean; prestamo: Prestamo } = $props();

  const filas: { mes: number; interes: number; capital: number; saldo: number }[] = [];
  let saldo = p.saldo_actual;
  const tasaMensual = p.tasa_interes / 100 / 12;
  for (let i = 1; i <= Math.max(0, p.plazo_meses - p.meses_pagados) && saldo > 0.005; i++) {
    const interes = Math.round(saldo * tasaMensual * 100) / 100;
    const capital = Math.min(saldo, Math.max(0, p.pago_mensual - interes));
    saldo = Math.max(0, saldo - capital);
    filas.push({ mes: p.meses_pagados + i, interes, capital, saldo });
  }
  const totalInteres = filas.reduce((a, f) => a + f.interes, 0);
</script>

<Modal bind:abierto titulo={`${t('Estimated amortization')} — ${p.nombre}`} subtitulo={t('Assumes the current monthly payment stays fixed and no extra principal payments are made. Total remaining interest: {total}.', { total: formatoMoneda(totalInteres) })} ancho="ancho">
  <div class="tabla">
    <table class="tabla-mini">
      <thead><tr><th>#</th><th class="derecha">{t('Interest')}</th><th class="derecha">{t('Principal')}</th><th class="derecha">{t('Remaining balance')}</th></tr></thead>
      <tbody>
        {#each filas as f}
          <tr><td>{f.mes}</td><td class="numero negativo derecha">{formatoMoneda(f.interes)}</td><td class="numero derecha">{formatoMoneda(f.capital)}</td><td class="numero derecha">{formatoMoneda(f.saldo)}</td></tr>
        {:else}
          <tr><td colspan="4" class="texto-tenue">{t('No remaining months to project.')}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
</Modal>

<style>
  .tabla { max-height: 340px; overflow-y: auto; }
</style>
