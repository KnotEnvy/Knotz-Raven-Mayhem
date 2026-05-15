import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';

const root = process.cwd();
const distDir = join(root, 'dist');
const indexPath = join(distDir, 'index.html');
const requiredSeedAssets = ['raven.png', 'boom.png', 'boom.wav', 'boom.mp3'];

const failures = [];
const report = [];

function fail(message) {
  failures.push(message);
}

function assertFile(path, label) {
  if (!existsSync(path)) {
    fail(`${label} is missing: ${path}`);
    return false;
  }

  const stat = statSync(path);
  if (!stat.isFile() || stat.size <= 0) {
    fail(`${label} is empty or not a file: ${path}`);
    return false;
  }

  return true;
}

if (!assertFile(indexPath, 'dist index')) {
  finish();
}

const indexHtml = readFileSync(indexPath, 'utf8');
const linkedAssets = [...indexHtml.matchAll(/\b(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((match) => match[1]);

if (indexHtml.includes('/@vite/client') || indexHtml.includes('/src/main.ts')) {
  fail('dist/index.html still references the dev server entrypoint.');
}

if (/\b(?:src|href)="\/(?!\/)/.test(indexHtml)) {
  fail('dist/index.html contains root-relative asset links; static subpath deploys require ./ links.');
}

if (!linkedAssets.some((asset) => asset.endsWith('.js'))) {
  fail('dist/index.html does not link a built JavaScript chunk.');
}

if (!linkedAssets.some((asset) => asset.endsWith('.css'))) {
  fail('dist/index.html does not link a built CSS chunk.');
}

for (const asset of linkedAssets) {
  const assetPath = join(distDir, normalize(asset.replace(/^\.\//, '')));
  assertFile(assetPath, `linked asset ${asset}`);
}

for (const asset of requiredSeedAssets) {
  assertFile(join(distDir, 'assets', asset), `seed asset ${asset}`);
}

report.push(`linkedAssets=${linkedAssets.length}`);
report.push(`seedAssets=${requiredSeedAssets.length}`);

finish();

function finish() {
  if (failures.length > 0) {
    console.error('Release check failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(`Release check passed: ${report.join(' ')}`);
}
