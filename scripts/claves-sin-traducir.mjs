// Lista los textos de t('…') / etiquetas que no tienen traducción en src/lib/traducciones.ts.
// Uso: node scripts/claves-sin-traducir.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ES = Function(readFileSync('src/lib/traducciones.ts', 'utf8').replace(/^[\s\S]*?=\s*/, 'return ').replace(/;\s*$/, ''))();
const archivos = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? archivos(join(dir, n)) : [join(dir, n)]));
const claves = new Set();
for (const f of archivos('src').filter((f) => /\.(svelte|ts)$/.test(f) && !f.includes('traducciones'))) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/\bt\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g)) claves.add(m[2].replace(/\\'/g, "'"));
  for (const m of s.matchAll(/(?:etiqueta|titulo|texto|mensaje|error|textoConfirmar)(?::|=)\s*(['"])((?:\\.|(?!\1).)*)\1/g)) if (/^[A-Z]/.test(m[2])) claves.add(m[2].replace(/\\'/g, "'"));
  for (const m of s.matchAll(/mostrarToast\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)) claves.add(m[2].replace(/\\'/g, "'"));
}
const faltan = [...claves].filter((c) => !c.includes('${') && !(c.replace(/’/g, "'") in ES)).sort();
console.log(faltan.join('\n'));
console.log(`\n${faltan.length} sin traducir de ${claves.size}`);
