import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const sourceHtml = join(root, 'scripts', 'social-preview.html');
const outputPng = join(root, 'public', 'social-preview.png');

const browserCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

const browser = browserCandidates.find((candidate) => existsSync(candidate));

if (!browser) {
  console.error('No Chrome or Edge install found. Set CHROME_PATH to a Chromium browser executable.');
  process.exit(1);
}

if (!existsSync(sourceHtml)) {
  console.error(`Missing capsule source: ${sourceHtml}`);
  process.exit(1);
}

const profileDir = mkdtempSync(join(tmpdir(), 'raven-capsule-'));

const result = spawnSync(
  browser,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--window-size=1200,630',
    `--user-data-dir=${profileDir}`,
    `--screenshot=${outputPng}`,
    pathToFileURL(sourceHtml).href,
  ],
  { stdio: 'inherit', timeout: 60_000 },
);

rmSync(profileDir, { recursive: true, force: true });

if (result.status !== 0) {
  console.error(`Capsule render failed with exit code ${result.status}.`);
  process.exit(result.status ?? 1);
}

console.log(`Capsule rendered: ${outputPng} (1200x630)`);
