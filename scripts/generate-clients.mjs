// Generates one typed fetch client per upstream from the vendored specs in openapi/.
// Output goes to src/generated/<name>/ (git-ignored, rebuilt by `npm run build`).
import { execFileSync } from 'node:child_process';
import { readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

const UPSTREAMS = ['pimatrix', 'pivoice'];
const generator = join('node_modules', '.bin', 'openapi');

async function fixImports(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { await fixImports(path); continue; }
    if (!entry.name.endsWith('.ts')) continue;
    const original = await readFile(path, 'utf8');
    const updated = original.replace(/(from\s+["'])(\.{1,2}\/[^"']+)(["'])/g, (match, prefix, specifier, suffix) =>
      /\.[a-zA-Z0-9]+$/.test(specifier) ? match : prefix + specifier + '.js' + suffix);
    if (updated !== original) await writeFile(path, updated);
  }
}

// pivoice's spec points Status.radio at "#/components/schemas/RadioStatus/properties/targets"; the generator emits an
// import for a file it never writes. Replace it with an indexed access type.
async function fixPropertyRefs(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { await fixPropertyRefs(path); continue; }
    if (!entry.name.endsWith('.ts')) continue;
    const original = await readFile(path, 'utf8');
    const updated = original.replace(/^import type \{ (\w+)_properties_(\w+) \} from '[^']+';\n/gm, (_m, schema, property) =>
      `import type { ${schema} } from './${schema}.js';\ntype ${schema}_properties_${property} = ${schema}['${property}'];\n`);
    if (updated !== original) await writeFile(path, updated);
  }
}

for (const name of UPSTREAMS) {
  const output = join('src', 'generated', name);
  await rm(output, { recursive: true, force: true });
  execFileSync(generator, ['--input', join('openapi', `${name}.yaml`), '--output', output, '--client', 'fetch', '--name', 'Client'], { stdio: 'inherit' });
  await fixImports(output);
  await fixPropertyRefs(output);
}
console.log('generated clients:', UPSTREAMS.join(', '));
