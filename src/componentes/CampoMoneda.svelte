<script lang="ts">
  import Campo from './Campo.svelte';

  // `valor` es el número; el input muestra separador de miles mientras escribes.
  let { etiqueta, valor = $bindable(0), error = '', placeholder = '0.00' }: { etiqueta?: string; valor?: number; error?: string; placeholder?: string } = $props();

  const NUMERO = new Intl.NumberFormat('en-US');
  const formatear = (crudo: string) => {
    const limpio = crudo.replace(/[^\d.]/g, '');
    const [entero = '', ...resto] = limpio.split('.');
    const sinCeros = entero.replace(/^0+(?=\d)/, '');
    const decimales = resto.length ? '.' + resto.join('').slice(0, 2) : '';
    return sinCeros ? NUMERO.format(Number(sinCeros)) + decimales : (decimales ? '0' + decimales : '');
  };
  let texto = $state(valor ? formatear(String(valor)) : '');

  function alEscribir(e: Event & { currentTarget: HTMLInputElement }) {
    const input = e.currentTarget;
    const alFinal = input.selectionStart === input.value.length;
    texto = formatear(input.value);
    input.value = texto;
    if (alFinal) input.setSelectionRange(texto.length, texto.length);
    valor = Number(texto.replace(/,/g, '')) || 0;
  }
</script>

<Campo {etiqueta} {error}>
  <input class="campo__control" inputmode="decimal" {placeholder} value={texto} oninput={alEscribir} />
</Campo>
