// Copia las dependencias del frontend a src/vendor/ para que la app arranque
// sin internet (antes se cargaban desde esm.sh / jsDelivr en cada inicio).
// Uso: npm install && npm run vendor
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const NM = 'node_modules';
const VENDOR = 'src/vendor';

rmSync(VENDOR, { recursive: true, force: true });
mkdirSync(VENDOR, { recursive: true });

const copias = [
  [`${NM}/@tauri-apps/api/core.js`, `${VENDOR}/tauri-api/core.js`],
  [`${NM}/@tauri-apps/api/external/tslib/tslib.es6.js`, `${VENDOR}/tauri-api/external/tslib/tslib.es6.js`],
  [`${NM}/@tauri-apps/plugin-sql/dist-js/index.js`, `${VENDOR}/plugin-sql.js`],
  [`${NM}/@tauri-apps/plugin-dialog/dist-js/index.js`, `${VENDOR}/plugin-dialog.js`],
  [`${NM}/chart.js/dist/chart.umd.min.js`, `${VENDOR}/chart.umd.min.js`],
  [`${NM}/@fontsource-variable/public-sans/files/public-sans-latin-wght-normal.woff2`, `${VENDOR}/fonts/public-sans-latin.woff2`],
  [`${NM}/@fontsource-variable/public-sans/files/public-sans-latin-ext-wght-normal.woff2`, `${VENDOR}/fonts/public-sans-latin-ext.woff2`],
];

for (const [origen, destino] of copias) {
  cpSync(origen, destino, { recursive: true });
  console.log(`vendor: ${destino}`);
}
