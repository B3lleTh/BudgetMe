// npm run capturas [-- light|dark] — capturas de todas las vistas con datos de ejemplo en tests/capturas/.
import { mkdir } from 'node:fs/promises';
import { iniciarEntorno } from './entorno.mjs';
import { sembrar, irA } from './semilla.mjs';

const esquema = process.argv[2] === 'dark' ? 'dark' : 'light';
const idioma = process.argv[3] === 'es' ? 'es' : 'en';
const VISTAS = ['bienvenida', 'dashboard', 'historial', 'ingresos', 'gastos', 'recurrentes', 'tarjetas', 'cajas', 'inversiones', 'prestamos', 'respaldos', 'configuracion'];
const salida = new URL('../capturas/', import.meta.url).pathname;
await mkdir(salida, { recursive: true });

const entorno = await iniciarEntorno();
const page = await entorno.pagina({ esquema });
await sembrar(page);
if (idioma === 'es') await page.evaluate(async () => (await import('/src/lib/i18n.svelte.ts')).establecerIdioma('es'));
for (const v of VISTAS) {
  await irA(page, v);
  await page.waitForTimeout(v === 'bienvenida' ? 4500 : 900);
  await page.addStyleTag({ content: '.app{height:auto!important}.vista{height:auto!important;overflow:visible!important}' });
  await page.screenshot({ path: `${salida}${v}-${esquema}-${idioma}.png`, fullPage: true });
}
await entorno.cerrar();
console.log(`capturas en ${salida}`);
