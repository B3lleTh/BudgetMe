// npm test — pruebas de lógica e interfaz en Chromium con Tauri simulado.
import { iniciarEntorno, contador } from './entorno.mjs';
import { correrLogica } from './logica.mjs';
import { correrInterfaz } from './interfaz.mjs';

const entorno = await iniciarEntorno();
const c = contador();
try {
  console.log('Lógica');
  await correrLogica(entorno, c);
  console.log('\nInterfaz');
  await correrInterfaz(entorno, c);
} finally {
  await entorno.cerrar();
}
console.log(c.fallos ? `\n${c.fallos} de ${c.total} pruebas fallaron` : `\nLas ${c.total} pruebas pasaron`);
process.exit(c.fallos ? 1 : 0);
