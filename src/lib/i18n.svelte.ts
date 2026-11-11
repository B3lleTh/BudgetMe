import { consultar, ejecutar } from './datos/db';
import { ES } from './traducciones';

export type Idioma = 'en' | 'es';

// Estado reactivo: cualquier plantilla que llame t() se vuelve a pintar al cambiar.
export const idioma = $state<{ actual: Idioma }>({ actual: 'en' });

const normalizar = (s: string) => s.replace(/’/g, "'");

/** Traduce un texto de la UI. Las variables van como {nombre}. Si no hay
 * traducción, se queda el inglés (nunca se muestra una clave cruda). */
export function t(texto: string, variables?: Record<string, string | number>): string {
  let salida = idioma.actual === 'es' ? (ES[normalizar(texto)] ?? texto) : texto;
  if (variables) for (const [k, v] of Object.entries(variables)) salida = salida.replaceAll(`{${k}}`, String(v));
  return salida;
}

export const esEspanol = () => idioma.actual === 'es';
export const locale = () => (idioma.actual === 'es' ? 'es-MX' : 'en-US');

export async function cargarIdioma(): Promise<void> {
  try {
    const [fila] = await consultar(`SELECT valor FROM configuracion WHERE clave = 'idioma'`);
    idioma.actual = fila?.valor === 'es' ? 'es' : 'en';
  } catch {
    idioma.actual = 'en';
  }
}

export async function establecerIdioma(nuevo: Idioma): Promise<void> {
  idioma.actual = nuevo;
  await ejecutar(
    `INSERT INTO configuracion (clave, valor) VALUES ('idioma', $1) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`,
    [nuevo]
  );
}
