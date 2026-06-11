// Mobile layout audit: drives the dev server in headless Chrome/Edge at the
// handoff's phone landscape sizes, screenshots every UI surface, and probes
// for unreachable or undersized tap targets. Synthetic ui-state events are
// injected through the existing knotz:ui-state bridge to reach states that
// need real play (S-rank stage clear, run report).
//
// Usage: node scripts/audit-mobile.mjs   (expects npm run dev on 127.0.0.1:5173)
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const BASE_URL = process.env.AUDIT_URL ?? 'http://127.0.0.1:5173/';
const OUT_DIR = join(process.cwd(), 'audit-shots');

const browserCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

const executablePath = browserCandidates.find((candidate) => existsSync(candidate));
if (!executablePath) {
  console.error('No Chrome or Edge install found. Set CHROME_PATH.');
  process.exit(1);
}

const SIZES = [
  ['667x375-iphone-se', 667, 375],
  ['740x360-android', 740, 360],
  ['844x390-iphone14', 844, 390],
  ['932x430-promax', 932, 430],
  ['1180x820-ipad', 1180, 820],
  ['1440x900-desktop', 1440, 900],
];

const makeGrade = (over = {}) => ({
  gradeLabel: 'S',
  gradePercent: 96,
  starCount: 5,
  escapedGradeEligible: 1,
  gradeEligibleKilled: 46,
  gradeEligibleSpawned: 48,
  shieldedEscapes: 1,
  ...over,
});

const makeSnapshot = (over = {}) => ({
  score: 48230,
  stageIndex: 4,
  stageSpawns: 38,
  stageTargetKills: 38,
  comboWindowMs: 2600,
  comboTimerMs: 1400,
  comboMultiplier: 6,
  stageAccuracy: 88,
  accuracy: 84,
  bestCombo: 14,
  kills: 132,
  stageKills: 46,
  gradeShieldCharges: 2,
  coinsEarned: 162,
  totalStars: 17,
  averageGradePercent: 86,
  perfectStages: 2,
  weaponName: 'Burst Rifle',
  crosshairName: 'Wide Tracker',
  activePowerups: [{ label: 'Overdrive', timeLeftMs: 2600, durationMs: 4500 }],
  stageGrade: makeGrade(),
  ...over,
});

const STAGE_CLEAR_STATE = {
  screen: 'stage-clear',
  summary: {
    snapshot: makeSnapshot(),
    currentStage: { title: 'Storm Tower', subtitle: 'Lightning pressure' },
    nextStage: { title: 'Junkyard Moon', subtitle: 'Armored scrap flock rises' },
    rewardCoins: 188,
    baseRewardCoins: 140,
    newEnemyLabels: ['Armored Raven', 'Mini Swarm'],
    nextStageIsBonus: false,
  },
};

const GAMEOVER_STATE = {
  screen: 'gameover',
  snapshot: makeSnapshot(),
  rewards: { newHighScore: true, totalCoins: 412 },
  save: {
    coins: 412,
    upgrades: {},
    unlockedWeapons: ['pistol'],
    unlockedCrosshairs: ['standard'],
  },
};

async function probeLayout(page, label) {
  const issues = await page.evaluate(() => {
    const found = [];
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;

    const isScrollableAncestorAvailable = (el) => {
      let node = el.parentElement;
      while (node) {
        const style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 4) return true;
        node = node.parentElement;
      }
      const doc = document.scrollingElement;
      return doc ? doc.scrollHeight > doc.clientHeight + 4 : false;
    };

    document.querySelectorAll('button, a, [data-action]').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const text = (el.textContent ?? '').trim().slice(0, 28) || el.tagName;
      const fullyOffscreen = rect.bottom < 0 || rect.top > viewH || rect.right < 0 || rect.left > viewW;
      const partiallyClipped = rect.top < -2 || rect.bottom > viewH + 2 || rect.left < -2 || rect.right > viewW + 2;

      if (fullyOffscreen && !isScrollableAncestorAvailable(el)) {
        found.push(`UNREACHABLE "${text}" at top:${Math.round(rect.top)} left:${Math.round(rect.left)}`);
      } else if (partiallyClipped && !isScrollableAncestorAvailable(el)) {
        found.push(`CLIPPED "${text}" rect ${Math.round(rect.top)},${Math.round(rect.left)} ${Math.round(rect.width)}x${Math.round(rect.height)}`);
      }

      if (el.tagName === 'BUTTON' && rect.height > 0 && rect.height < 36) {
        found.push(`SMALL-TARGET "${text}" ${Math.round(rect.width)}x${Math.round(rect.height)}`);
      }
    });

    return found;
  });

  for (const issue of issues) console.log(`  [${label}] ${issue}`);
  return issues.length;
}

const browser = await chromium.launch({ executablePath, headless: true });
mkdirSync(OUT_DIR, { recursive: true });
let totalIssues = 0;

for (const [name, width, height] of SIZES) {
  const isPhone = width < 1000;
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: isPhone,
    isMobile: isPhone,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => console.log(`  [${name}] PAGE ERROR: ${error.message}`));
  const shot = async (label) => {
    await page.screenshot({ path: join(OUT_DIR, `${name}--${label}.png`) });
    totalIssues += await probeLayout(page, `${name} ${label}`);
  };

  console.log(`\n=== ${name} ===`);
  await page.goto(BASE_URL);
  await page.waitForSelector('.attract-shell', { timeout: 20000 });
  await page.waitForTimeout(800);
  await shot('01-home');

  const menuShots = [
    ['open-armory', '02-armory'],
    ['open-records', '03-records'],
    ['open-options', '04-options'],
    ['open-credits', '05-credits'],
  ];
  for (const [action, label] of menuShots) {
    await page.click(`[data-action="${action}"]`);
    await page.waitForTimeout(400);
    await shot(label);
  }

  await page.click('[data-action="show-home"]');
  await page.waitForTimeout(300);

  await page.evaluate((state) => {
    window.dispatchEvent(new CustomEvent('knotz:ui-state', { detail: state }));
  }, STAGE_CLEAR_STATE);
  await page.waitForTimeout(500);
  await shot('06-stage-clear-s');

  await page.evaluate((state) => {
    window.dispatchEvent(new CustomEvent('knotz:ui-state', { detail: state }));
  }, GAMEOVER_STATE);
  await page.waitForTimeout(400);
  await shot('07-run-report');

  await page.reload();
  await page.waitForSelector('.attract-shell', { timeout: 20000 });
  await page.click('[data-action="start-run"]');
  await page.waitForSelector('.hud', { timeout: 20000 });
  await page.waitForTimeout(1800);
  await shot('08-hud');

  await page.click('.grade-cluster [data-action="pause"]');
  await page.waitForTimeout(400);
  await shot('09-pause');

  await context.close();
}

await browser.close();
console.log(`\nDone. Screenshots in ${OUT_DIR}. Issues flagged: ${totalIssues}`);
