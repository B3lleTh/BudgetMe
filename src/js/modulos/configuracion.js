import { t, idioma, establecerIdioma } from '../i18n.js';
import { mostrarToast } from '../toasts.js';
import { icono } from '../iconos.js';
import { consultar, ejecutar } from '../db.js';

export async function render(vistaEl) {
  const actual = idioma();
  const fila = await consultar(`SELECT valor FROM configuracion WHERE clave = 'nombre_usuario'`);
  const nombreActual = fila[0]?.valor || '';
  vistaEl.innerHTML = `
    <div class="vista__encabezado">
      <div><h1>${t('settings.title')}</h1><p>${t('settings.subtitle')}</p></div>
    </div>

    <div class="tarjeta" style="margin-bottom:14px;">
      <h3>${icono('usuario')} Your name</h3>
      <p style="font-size:13px; opacity:.75; margin:8px 0 14px;">Shown as a greeting on the Dashboard.</p>
      <div style="display:flex; gap:8px;">
        <input class="campo__control" id="input-nombre-usuario" placeholder="Your name" value="${nombreActual}" style="flex:1;" />
        <button class="btn btn--primario" id="btn-guardar-nombre">Save</button>
      </div>
    </div>

    <div class="tarjeta">
      <h3>${icono('configuracion')} ${t('settings.language')}</h3>
      <p style="font-size:13px; opacity:.75; margin:8px 0 14px;">${t('settings.language.help')}</p>
      <div style="display:flex; gap:8px;">
        <button class="btn ${actual === 'en' ? 'btn--primario' : 'btn--fantasma'}" id="btn-idioma-en">${t('settings.language.en')}</button>
        <button class="btn ${actual === 'es' ? 'btn--primario' : 'btn--fantasma'}" id="btn-idioma-es">${t('settings.language.es')}</button>
      </div>
    </div>

    <div class="tarjeta" style="margin-top:14px;">
      <h3>${t('settings.note.title')}</h3>
      <p style="font-size:13px; opacity:.75; margin-top:8px;">${t('settings.note.body')}</p>
    </div>
  `;

  vistaEl.querySelector('#btn-idioma-en').addEventListener('click', () => cambiarIdioma('en', vistaEl));
  vistaEl.querySelector('#btn-idioma-es').addEventListener('click', () => cambiarIdioma('es', vistaEl));
  vistaEl.querySelector('#btn-guardar-nombre').addEventListener('click', async () => {
    const nombre = vistaEl.querySelector('#input-nombre-usuario').value.trim();
    await ejecutar(`INSERT INTO configuracion (clave, valor) VALUES ('nombre_usuario', $1) ON CONFLICT(clave) DO UPDATE SET valor = $1`, [nombre]);
    mostrarToast('Name saved', 'exito');
  });
}

async function cambiarIdioma(nuevo, vistaEl) {
  if (nuevo === idioma()) return;
  await establecerIdioma(nuevo);
  mostrarToast(t('toast.language.changed'), 'exito');
  document.dispatchEvent(new CustomEvent('idioma-cambiado'));
}
