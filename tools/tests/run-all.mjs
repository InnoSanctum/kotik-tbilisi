/*
 * Runs every suite and reports one summary.
 *
 *   cd tools/tests && npm install && npm test
 *
 * These tests are optional. The site is plain HTML, CSS and JavaScript with no
 * dependencies and no build step; nothing here is needed to publish it. They
 * exist because this codebase was once rewritten by an assistant that replaced
 * real content with invented content, and a checked-in regression suite is the
 * cheapest way to notice that happening again.
 *
 * For the zero-dependency check that runs without npm, see tools/check_site.py.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

const SUITES = [
  ['i18n-test.mjs', 'Localisation and fallback rules'],
  ['render-test.mjs', 'Page rendering and restored content'],
  ['db-test.mjs', 'Data layer, Supabase, multi-pet'],
  ['qol-test.mjs', 'Slugs, QR codes, shared catalogues'],
  ['admin-test.mjs', 'Admin panel and IP middleware'],
  ['sql-test.mjs', 'Generated seed and schema'],
];

const run = (file) => new Promise((resolve) => {
  const child = spawn(process.execPath, [join(HERE, file)], { stdio: 'inherit' });
  child.on('close', (code) => resolve(code === 0));
  child.on('error', () => resolve(false));
});

let failed = 0;
for (const [file, label] of SUITES) {
  console.log(`\n${'='.repeat(60)}\n${label}  (${file})\n${'='.repeat(60)}`);
  if (!(await run(file))) failed++;
}

console.log(`\n${'='.repeat(60)}`);
if (failed) {
  console.log(`${failed} of ${SUITES.length} suite(s) FAILED`);
  process.exit(1);
}
console.log(`All ${SUITES.length} suites passed.`);
