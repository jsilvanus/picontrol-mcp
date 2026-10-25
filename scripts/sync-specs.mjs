// Copies the OpenAPI specs from checkouts of the upstream repos into openapi/.
// Usage: npm run spec:sync [-- --pimatrix ../pimatrix --pivoice ../pivoice]
import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';

const args = process.argv.slice(2);
const pick = (flag, fallback) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : fallback; };
const sources = { pimatrix: pick('--pimatrix', '../pimatrix'), pivoice: pick('--pivoice', '../pivoice') };

for (const [name, dir] of Object.entries(sources)) {
  await copyFile(join(dir, 'openapi', 'openapi.yaml'), join('openapi', `${name}.yaml`));
  console.log(`openapi/${name}.yaml <- ${dir}/openapi/openapi.yaml`);
}
