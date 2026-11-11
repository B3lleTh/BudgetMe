<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '../lib/i18n.svelte';

  let { etiqueta, error = '', children }: { etiqueta?: string; error?: string; children: Snippet } = $props();
</script>

<!-- svelte-ignore a11y_label_has_associated_control -->
<label class="campo" class:campo--invalido={!!error}>
  {#if etiqueta}<span class="campo__etiqueta">{t(etiqueta)}</span>{/if}
  {@render children()}
  {#if error}<span class="campo__error">{t(error)}</span>{/if}
</label>
