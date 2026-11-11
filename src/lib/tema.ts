import { consultar, ejecutar } from './datos/db';

export type Tema = 'sistema' | 'claro' | 'oscuro';

export function aplicarTema(tema: Tema | string | null | undefined) {
  const raiz = document.documentElement;
  if (tema === 'claro') raiz.dataset.theme = 'light';
  else if (tema === 'oscuro') raiz.dataset.theme = 'dark';
  else delete raiz.dataset.theme;
}

export async function cargarTema() {
  const [fila] = await consultar(`SELECT valor FROM configuracion WHERE clave = 'tema'`);
  aplicarTema(fila?.valor);
  return (fila?.valor || 'sistema') as Tema;
}

export async function guardarTema(tema: Tema) {
  await ejecutar(`INSERT INTO configuracion (clave, valor) VALUES ('tema', $1) ON CONFLICT(clave) DO UPDATE SET valor = $1`, [tema]);
  aplicarTema(tema);
}
