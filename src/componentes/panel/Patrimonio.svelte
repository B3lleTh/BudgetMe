<script lang="ts">
  import { formatoMoneda } from '../../lib/formato';
  import { t } from '../../lib/i18n.svelte';
  import { coloresTema, conAlfa } from '../../lib/graficas';
  import type { Balance } from '../../lib/datos/resumen';

  /** Pieza principal del Panel: patrimonio neto y de qué está hecho — lo
   * que tienes contra lo que debes, a la misma escala. */
  let { b, alAbrir }: { b: Balance; alAbrir: () => void } = $props();

  const c = coloresTema();
  const activos = $derived([
    { etiqueta: 'Debit accounts', valor: b.debito, color: c.tinta },
    { etiqueta: 'Savings boxes', valor: b.ahorrado, color: c.tinta2 },
    { etiqueta: 'Card reserve', valor: b.reservadoTC, color: c.tinta3 },
    { etiqueta: 'Investments', valor: b.invertido, color: c.laton },
  ].filter((s) => s.valor > 0));
  const deudas = $derived([
    { etiqueta: 'Credit cards', valor: b.creditoUtilizado, color: c.perdida },
    { etiqueta: 'Loans', valor: b.deudaPrestamos, color: conAlfa(c.perdida, 0.55) },
  ].filter((s) => s.valor > 0));
  const totalActivos = $derived(activos.reduce((a, s) => a + s.valor, 0));
  const totalDeudas = $derived(deudas.reduce((a, s) => a + s.valor, 0));
  const escala = $derived(Math.max(totalActivos, totalDeudas, 1));
</script>

{#snippet barra(segmentos: typeof activos, total: number)}
  <div class="balance__barra" role="img" aria-label={formatoMoneda(total)}>
    {#each segmentos as s}<div class="balance__segmento" style:width="{(s.valor / escala) * 100}%" style:background={s.color} title="{t(s.etiqueta)}: {formatoMoneda(s.valor)}"></div>{/each}
  </div>
{/snippet}

<button type="button" class="balance" onclick={alAbrir}>
  <div>
    <div class="balance__etiqueta">{t('Net worth')}</div>
    <div class="balance__cifra" class:negativo={b.netWorth < 0}>{formatoMoneda(b.netWorth)}</div>
    <div class="balance__nota">{t('What you have minus what you owe, today.')}</div>
  </div>
  <div>
    <div class="balance__ejes"><span>{t('What you have')}</span><span class="numero">{formatoMoneda(totalActivos)}</span></div>
    {@render barra(activos, totalActivos)}
    <div class="balance__ejes" style="margin-top:14px;"><span>{t('What you owe')}</span><span class="numero" class:negativo={totalDeudas > 0}>{formatoMoneda(totalDeudas)}</span></div>
    {@render barra(deudas, totalDeudas)}
    <div class="balance__leyenda">
      {#each [...activos, ...deudas] as s}<span><i style:background={s.color}></i>{t(s.etiqueta)} <b>{formatoMoneda(s.valor)}</b></span>
      {:else}<span>{t('Add an account to see your balance here.')}</span>{/each}
    </div>
  </div>
</button>

<style>
  .balance { width: 100%; text-align: left; font: inherit; color: inherit; }
</style>
