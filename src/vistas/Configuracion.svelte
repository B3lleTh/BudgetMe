<script lang="ts">
  import Encabezado from '../componentes/Encabezado.svelte';
  import Icono from '../componentes/Icono.svelte';
  import { consultar, ejecutar } from '../lib/datos/db';
  import { t, idioma, establecerIdioma, type Idioma } from '../lib/i18n.svelte';
  import { guardarTema, type Tema } from '../lib/tema';
  import { mostrarToast } from '../lib/avisos.svelte';
  import { refrescar } from '../lib/navegacion.svelte';

  const TEMAS: [Tema, string][] = [['sistema', 'Match my system'], ['claro', 'Light'], ['oscuro', 'Dark']];
  let nombre = $state('');
  let tema = $state<Tema>('sistema');

  consultar(`SELECT clave, valor FROM configuracion WHERE clave IN ('nombre_usuario', 'tema')`).then((filas) => {
    const c = Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
    nombre = c.nombre_usuario || '';
    tema = (c.tema || 'sistema') as Tema;
  });

  async function guardarNombre(e: SubmitEvent) {
    e.preventDefault();
    await ejecutar(`INSERT INTO configuracion (clave, valor) VALUES ('nombre_usuario', $1) ON CONFLICT(clave) DO UPDATE SET valor = $1`, [nombre.trim()]);
    mostrarToast('Name saved', 'exito');
  }
  async function cambiarIdioma(nuevo: Idioma) {
    if (nuevo === idioma.actual) return;
    await establecerIdioma(nuevo);
    mostrarToast('Language updated', 'exito');
  }
  async function cambiarTema(nuevo: Tema) {
    tema = nuevo;
    await guardarTema(nuevo);
    refrescar(); // las gráficas toman los colores del tema al crearse
  }
</script>

<Encabezado titulo={t('Settings')}>{t('Your name, language and appearance.')}</Encabezado>

<section class="tarjeta seccion">
  <h3 class="titulo-icono"><Icono nombre="usuario" /> {t('Your name')}</h3>
  <p class="ayuda">{t('Shown as a greeting on the Dashboard.')}</p>
  <form class="fila-form" onsubmit={guardarNombre}>
    <input class="campo__control" placeholder={t('Your name')} aria-label={t('Your name')} bind:value={nombre} />
    <button class="btn btn--primario" type="submit">{t('Save')}</button>
  </form>
</section>

<section class="tarjeta seccion">
  <h3 class="titulo-icono"><Icono nombre="configuracion" /> {t('Language')}</h3>
  <p class="ayuda">{t('Changes the whole app immediately.')}</p>
  <div class="opciones">
    {#each [['en', 'English'], ['es', 'Español']] as [valor, etiqueta]}
      <button class="btn {idioma.actual === valor ? 'btn--primario' : 'btn--fantasma'}" aria-pressed={idioma.actual === valor} onclick={() => cambiarIdioma(valor as Idioma)}>{etiqueta}</button>
    {/each}
  </div>
</section>

<section class="tarjeta">
  <h3 class="titulo-icono"><Icono nombre="dashboard" /> {t('Appearance')}</h3>
  <p class="ayuda">{t('Light or dark colors for the whole app.')}</p>
  <div class="opciones">
    {#each TEMAS as [valor, etiqueta]}
      <button class="btn {tema === valor ? 'btn--primario' : 'btn--fantasma'}" aria-pressed={tema === valor} onclick={() => cambiarTema(valor)}>{t(etiqueta)}</button>
    {/each}
  </div>
</section>

<style>
  .titulo-icono { display: flex; align-items: center; gap: 8px; }
  .ayuda { margin: 6px 0 14px; }
  .fila-form { display: flex; gap: 8px; max-width: 460px; }
  .opciones { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
