// Empaqueta dist/ en un .zip listo para itch.io (index.html en la raíz del zip).
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';
import { zipSync } from 'fflate';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const releaseDir = join(root, 'release');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

if (!existsSync(join(dist, 'index.html'))) {
  console.error('No existe dist/index.html. Ejecuta primero "npm run build".');
  process.exit(1);
}

/** Recorre dist/ y devuelve { 'ruta/relativa': Uint8Array }. */
function collect(dir, files = {}) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collect(full, files);
    else files[relative(dist, full).split(sep).join('/')] = new Uint8Array(readFileSync(full));
  }
  return files;
}

const files = collect(dist);
const zipped = zipSync(files, { level: 9 });
mkdirSync(releaseDir, { recursive: true });
const out = join(releaseDir, `minibox-${version}-itch.zip`);
writeFileSync(out, zipped);
console.log(`Listo: ${relative(root, out)} (${Object.keys(files).length} archivos, ${(zipped.length / 1024).toFixed(0)} KB)`);
