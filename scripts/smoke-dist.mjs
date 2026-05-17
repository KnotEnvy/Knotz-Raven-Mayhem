import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

const root = process.cwd();
const distDir = join(root, 'dist');
const basePath = '/Knotz-Raven-Mayhem/';
const failures = [];
const releaseShellAssets = [
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

if (!existsSync(join(distDir, 'index.html'))) {
  fail('dist/index.html is missing. Run npm run build before npm run release:smoke.');
  finish();
}

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
  const pathname = decodeURIComponent(requestUrl.pathname);

  if (!pathname.startsWith(basePath)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  const relativePath = pathname.slice(basePath.length) || 'index.html';
  const filePath = safeDistPath(relativePath);

  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'content-type': contentType(filePath),
    'cache-control': 'no-store',
  });
  createReadStream(filePath).pipe(response);
});

try {
  await listen(server);
  const port = server.address().port;
  const pageUrl = `http://127.0.0.1:${port}${basePath}`;
  const page = await fetchText(pageUrl, 'index');
  const linkedAssets = [...page.matchAll(/\b(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((match) => match[1]);

  if (linkedAssets.length === 0) {
    fail('served index did not expose any relative built asset links.');
  }

  for (const asset of linkedAssets) {
    const assetUrl = new URL(asset, pageUrl).toString();
    await fetchOk(assetUrl, `linked asset ${asset}`);
  }

  for (const seedAsset of ['raven.png', 'boom.png', 'boom.wav', 'boom.mp3']) {
    await fetchOk(new URL(`./assets/${seedAsset}`, pageUrl).toString(), `seed asset ${seedAsset}`);
  }

  for (const asset of releaseShellAssets) {
    await fetchOk(new URL(`./${asset}`, pageUrl).toString(), `release shell asset ${asset}`);
  }

  if (failures.length === 0) {
    console.log(
      `Dist smoke passed: basePath=${basePath} linkedAssets=${linkedAssets.length} seedAssets=4 releaseShellAssets=${releaseShellAssets.length}`,
    );
  }
} finally {
  server.close();
}

finish();

function safeDistPath(relativePath) {
  const normalized = normalize(relativePath);
  if (normalized.startsWith('..') || normalized.includes(`..${sep}`)) return null;
  return join(distDir, normalized);
}

function contentType(filePath) {
  switch (extname(filePath)) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.png':
      return 'image/png';
    case '.svg':
      return 'image/svg+xml; charset=utf-8';
    case '.webmanifest':
      return 'application/manifest+json; charset=utf-8';
    case '.txt':
      return 'text/plain; charset=utf-8';
    case '.xml':
      return 'application/xml; charset=utf-8';
    case '.wav':
      return 'audio/wav';
    case '.mp3':
      return 'audio/mpeg';
    default:
      return 'application/octet-stream';
  }
}

function listen(target) {
  return new Promise((resolve, reject) => {
    target.once('error', reject);
    target.listen(0, '127.0.0.1', () => resolve());
  });
}

async function fetchText(url, label) {
  const response = await fetchOk(url, label);
  return response.text();
}

async function fetchOk(url, label) {
  const response = await fetch(url);
  if (!response.ok) {
    fail(`${label} failed over HTTP: ${response.status} ${url}`);
  }
  return response;
}

function fail(message) {
  failures.push(message);
}

function finish() {
  if (failures.length > 0) {
    console.error('Dist smoke failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
}
