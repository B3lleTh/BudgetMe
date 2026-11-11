// Arranca Vite y Chromium con Tauri simulado (SQLite en WASM vía sql.js).
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SQL_JS = require.resolve('sql.js/dist/sql-wasm.js');
const SQL_WASM = require.resolve('sql.js/dist/sql-wasm.wasm');

export async function iniciarEntorno() {
  const servidor = await createServer({ configFile: new URL('../../vite.config.ts', import.meta.url).pathname, server: { port: 0, strictPort: false }, logLevel: 'error' });
  await servidor.listen();
  const url = servidor.resolvedUrls.local[0].replace(/\/$/, '');
  const navegador = await chromium.launch();
  const simulado = (await readFile(SQL_JS, 'utf8')) + '\n' + (await readFile(new URL('./tauri-simulado.js', import.meta.url), 'utf8'));
  const wasm = await readFile(SQL_WASM);

  /** Página nueva con base vacía. `fecha` fija el reloj; `esquema` light/dark. */
  async function pagina({ fecha, esquema = 'light', ancho = 1360, alto = 900 } = {}) {
    const ctx = await navegador.newContext({ timezoneId: 'America/Mexico_City', viewport: { width: ancho, height: alto }, colorScheme: esquema });
    const page = await ctx.newPage();
    if (fecha) await page.clock.install({ time: new Date(fecha) });
    await page.addInitScript(simulado);
    await page.route('**/__mock/sql-wasm.wasm', (r) => r.fulfill({ body: wasm, contentType: 'application/wasm' }));
    page.on('pageerror', (e) => console.log('  PAGEERROR', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.log('  CONSOLE', m.text()); });
    await page.goto(`${url}/#bienvenida`);
    await page.waitForFunction(() => document.querySelector('.nav__item') && !document.querySelector('.cargando'), null, { timeout: 20000 });
    return page;
  }

  return {
    url, pagina,
    async cerrar() { await navegador.close(); await servidor.close(); },
  };
}

/** Importa un módulo de la app dentro de la página (misma instancia que usa la app). */
export const modulo = (ruta) => `await import('/src/${ruta}')`;

export function contador() {
  let fallos = 0, total = 0;
  return {
    revisar(nombre, ok, info) { total++; if (!ok) fallos++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${nombre}${ok ? '' : '  → ' + JSON.stringify(info)}`); },
    get fallos() { return fallos; }, get total() { return total; },
  };
}
