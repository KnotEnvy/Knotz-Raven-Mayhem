import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';

const root = process.cwd();
const distDir = join(root, 'dist');
const indexPath = join(distDir, 'index.html');
const manifestPath = join(distDir, 'manifest.webmanifest');
const requiredSeedAssets = ['raven.png', 'boom.png', 'boom.wav', 'boom.mp3'];
const canonicalUrl = 'https://knotenvy.github.io/Knotz-Raven-Mayhem/';
const requiredReleaseShellAssets = [
  'favicon.svg',
  'favicon-16x16.png',
  'favicon-32x32.png',
  'apple-touch-icon.png',
  'manifest.webmanifest',
  'robots.txt',
  'sitemap.xml',
  'social-preview.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];
const requiredHtmlPatterns = [
  ['page title', /<title>Knotz Raven Mayhem \| Arcade Raven Shooter<\/title>/],
  ['meta description', /name="description"\s+content="Play Knotz Raven Mayhem,/],
  ['canonical URL', new RegExp(`rel="canonical" href="${escapeRegExp(canonicalUrl)}"`)],
  ['Open Graph title', /property="og:title"/],
  ['Open Graph image', new RegExp(`property="og:image" content="${escapeRegExp(canonicalUrl)}social-preview\\.png"`)],
  ['Twitter card', /name="twitter:card" content="summary_large_image"/],
  ['web manifest', /rel="manifest" href="\.\/manifest\.webmanifest"/],
  ['apple touch icon', /rel="apple-touch-icon" href="\.\/apple-touch-icon\.png"/],
  ['theme color', /name="theme-color" content="#181923"/],
];

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

for (const [label, pattern] of requiredHtmlPatterns) {
  if (!pattern.test(indexHtml)) {
    fail(`dist/index.html is missing release shell metadata: ${label}`);
  }
}

for (const asset of linkedAssets) {
  const assetPath = join(distDir, normalize(asset.replace(/^\.\//, '')));
  assertFile(assetPath, `linked asset ${asset}`);
}

for (const asset of requiredSeedAssets) {
  assertFile(join(distDir, 'assets', asset), `seed asset ${asset}`);
}

for (const asset of requiredReleaseShellAssets) {
  assertFile(join(distDir, normalize(asset)), `release shell asset ${asset}`);
}

validateManifest();

report.push(`linkedAssets=${linkedAssets.length}`);
report.push(`seedAssets=${requiredSeedAssets.length}`);
report.push(`releaseShellAssets=${requiredReleaseShellAssets.length}`);
report.push('pwaManifest=ok');

finish();

function validateManifest() {
  if (!assertFile(manifestPath, 'web manifest')) return;

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    fail(`web manifest is not valid JSON: ${error.message}`);
    return;
  }

  assertManifestField(manifest, 'name', 'Knotz Raven Mayhem');
  assertManifestField(manifest, 'short_name', 'Raven Mayhem');
  assertManifestField(manifest, 'id', './');
  assertManifestField(manifest, 'start_url', './');
  assertManifestField(manifest, 'scope', './');
  assertManifestField(manifest, 'display', 'standalone');
  assertManifestField(manifest, 'orientation', 'landscape');
  assertManifestField(manifest, 'background_color', '#12131d');
  assertManifestField(manifest, 'theme_color', '#181923');

  if (!Array.isArray(manifest.icons) || manifest.icons.length < 2) {
    fail('web manifest must include at least 192px and 512px icons.');
  } else {
    assertManifestAsset(manifest.icons, './icons/icon-192.png', '192x192', 'any maskable', 'manifest icon');
    assertManifestAsset(manifest.icons, './icons/icon-512.png', '512x512', 'any maskable', 'manifest icon');
  }

  if (!Array.isArray(manifest.screenshots) || manifest.screenshots.length < 1) {
    fail('web manifest must include at least one screenshot for install surfaces.');
  } else {
    assertManifestAsset(manifest.screenshots, './social-preview.png', '1200x630', undefined, 'manifest screenshot');
  }
}

function assertManifestField(manifest, field, expected) {
  if (manifest[field] !== expected) {
    fail(`web manifest ${field} must be ${JSON.stringify(expected)}; found ${JSON.stringify(manifest[field])}.`);
  }
}

function assertManifestAsset(assets, src, sizes, purpose, label) {
  const asset = assets.find((item) => item?.src === src);
  if (!asset) {
    fail(`web manifest is missing ${label}: ${src}`);
    return;
  }

  if (asset.sizes !== sizes) {
    fail(`web manifest ${label} ${src} must declare sizes=${sizes}; found ${asset.sizes}.`);
  }

  if (purpose !== undefined && asset.purpose !== purpose) {
    fail(`web manifest ${label} ${src} must declare purpose=${purpose}; found ${asset.purpose}.`);
  }

  assertFile(join(distDir, normalize(src.replace(/^\.\//, ''))), `${label} file ${src}`);
}

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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
