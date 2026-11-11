<script lang="ts">
  let { porcentaje, variante = '' }: { porcentaje: number; variante?: '' | 'meta' | 'listo' | 'alerta' } = $props();
</script>

<div class="barra {variante ? `barra--${variante}` : ''}" role="progressbar" aria-valuenow={Math.round(porcentaje)} aria-valuemin="0" aria-valuemax="100">
  <div class="barra__relleno" style:width="{Math.min(100, Math.max(0, porcentaje))}%"></div>
</div>
