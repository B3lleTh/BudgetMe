import { t, idioma, establecerIdioma } from '../i18n.js';
import { mostrarToast } from '../toasts.js';
import { icono } from '../iconos.js';
import { consultar, ejecutar } from '../db.js';
import { escaparHTML } from '../formato.js';
import { aplicarTema } from '../ui.js';

const TEMAS = [['sistema', 'Match my system'], ['claro', 'Light'], ['oscuro', 'Dark']];

export async function render(vistaEl) {
  const actual = idioma();
  const filas = await consultar(`SELECT clave, valor FROM configuracion WHERE clave IN ('nombre_usuario', 'tema')`);
  const config = Object.fromEntries(filas.map(f => [f.clave, f.valor]));
  const nombreActual = config.nombre_usuario || '';
  const temaActual = config.tema || 'sistema';
  vistaEl.innerHTML = `
    <div class="vista__encabezado">
      <div><h1>${t('settings.title')}</h1><p>${t('settings.subtitle')}</p></div>
    </div>

    <div class="tarjeta seccion">
      <h3 style="display:flex; align-items:center; gap:8px;">${icono('usuario')} Your name</h3>
      <p class="ayuda" style="margin:6px 0 14px;">Shown as a greeting on the Dashboard.</p>
      <form id="form-nombre" style="display:flex; gap:8px; max-width:460px;">
        <input class="campo__control" id="input-nombre-usuario" placeholder="Your name" value="${escaparHTML(nombreActual)}" aria-label="Your name" />
        <button class="btn btn--primario" type="submit">Save</button>
      </form>
    </div>

    <div class="tarjeta seccion">
      <h3 style="display:flex; align-items:center; gap:8px;">${icono('configuracion')} ${t('settings.language')}</h3>
      <p class="ayuda" style="margin:6px 0 14px;">${t('settings.language.help')}</p>
      <div style="display:flex; gap:8px;">
        <button class="btn ${actual === 'en' ? 'btn--primario' : 'btn--fantasma'}" id="btn-idioma-en" aria-pressed="${actual === 'en'}">${t('settings.language.en')}</button>
        <button class="btn ${actual === 'es' ? 'btn--primario' : 'btn--fantasma'}" id="btn-idioma-es" aria-pressed="${actual === 'es'}">${t('settings.language.es')}</button>
      </div>
    </div>

    <div class="tarjeta">
      <h3 style="display:flex; align-items:center; gap:8px;">${icono('dashboard')} Appearance</h3>
      <p class="ayuda" style="margin:6px 0 14px;">Light or dark colors for the whole app.</p>
      <div style="display:flex; gap:8px; flex-wrap:wrap;" id="opciones-tema">
        ${TEMAS.map(([valor, etiqueta]) => `<button class="btn ${temaActual === valor ? 'btn--primario' : 'btn--fantasma'}" data-tema="${valor}" aria-pressed="${temaActual === valor}">${etiqueta}</button>`).join('')}
      </div>
    </div>
  `;

  vistaEl.querySelector('#btn-idioma-en').addEventListener('click', () => cambiarIdioma('en'));
  vistaEl.querySelector('#btn-idioma-es').addEventListener('click', () => cambiarIdioma('es'));
  vistaEl.querySelector('#form-nombre').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = vistaEl.querySelector('#input-nombre-usuario').value.trim();
    await ejecutar(`INSERT INTO configuracion (clave, valor) VALUES ('nombre_usuario', $1) ON CONFLICT(clave) DO UPDATE SET valor = $1`, [nombre]);
    mostrarToast('Name saved', 'exito');
  });
  vistaEl.querySelector('#opciones-tema').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-tema]');
    if (!btn) return;
    await ejecutar(`INSERT INTO configuracion (clave, valor) VALUES ('tema', $1) ON CONFLICT(clave) DO UPDATE SET valor = $1`, [btn.dataset.tema]);
    aplicarTema(btn.dataset.tema);
    // Re-render para que las gráficas tomen los colores nuevos.
    document.dispatchEvent(new CustomEvent('idioma-cambiado'));
  });
}

async function cambiarIdioma(nuevo) {
  if (nuevo === idioma()) return;
  await establecerIdioma(nuevo);
  mostrarToast(t('toast.language.changed'), 'exito');
  document.dispatchEvent(new CustomEvent('idioma-cambiado'));
}
