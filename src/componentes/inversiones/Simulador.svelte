<script lang="ts">
  import Modal from '../Modal.svelte';
  import Campo from '../Campo.svelte';
  import CampoMoneda from '../CampoMoneda.svelte';
  import { formatoMoneda } from '../../lib/formato';
  import { t } from '../../lib/i18n.svelte';

  /** Calculadora pura: proyecta el valor con interés reinvertido cada mes. */
  let { abierto = $bindable() }: { abierto: boolean } = $props();

  let capital = $state(10000), tasa = $state<number | null>(10.9), anios = $state(1);
  const filas = $derived.by(() => {
    const mensual = (Number(tasa) || 0) / 100 / 12;
    let valor = capital;
    return Array.from({ length: Math.min(30, Math.max(1, Number(anios) || 1)) }, (_, i) => {
      for (let m = 0; m < 12; m++) valor *= 1 + mensual;
      return { anio: i + 1, valor };
    });
  });
  const final = $derived(filas[filas.length - 1]?.valor ?? capital);
</script>

<Modal bind:abierto titulo={t('Simulate an investment')}>
  <div class="campo__fila">
    <CampoMoneda etiqueta="Initial amount" bind:valor={capital} />
    <Campo etiqueta="Annual rate (%)"><input class="campo__control" type="number" step="0.01" min="0" bind:value={tasa} /></Campo>
  </div>
  <Campo etiqueta="Years to project"><input class="campo__control" type="number" min="1" max="30" bind:value={anios} /></Campo>
  <div class="kpi__etiqueta">{t('Final value after')} {filas.length} {t('year(s)')}</div>
  <div class="kpi__valor numero">{formatoMoneda(final)}</div>
  <div class="kpi__nota positivo">+{formatoMoneda(final - capital)} {t('in reinvested interest')}</div>
  <table class="tabla-mini" style="margin-top:12px;">
    <tbody>{#each filas as f}<tr><td>{t('Year')} {f.anio}</td><td class="numero derecha">{formatoMoneda(f.valor)}</td></tr>{/each}</tbody>
  </table>
</Modal>
