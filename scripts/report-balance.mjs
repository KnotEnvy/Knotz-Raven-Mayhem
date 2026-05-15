import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = process.cwd();
const moduleCache = new Map();

const { ENEMIES } = loadTsModule(resolve(root, 'src/game/data/enemies.ts'));
const { STAGES } = loadTsModule(resolve(root, 'src/game/data/stages.ts'));
const { WEAPONS, CROSSHAIRS } = loadTsModule(resolve(root, 'src/game/data/weapons.ts'));
const { UPGRADES, getUpgradeCost } = loadTsModule(resolve(root, 'src/game/data/upgrades.ts'));
const { ECONOMY_TUNING, POWERUP_TUNING } = loadTsModule(resolve(root, 'src/game/data/tuning.ts'));

const profiles = [
  { label: 'Learning run', accuracy: 62, comboScoreMultiplier: 1.05 },
  { label: 'Solid run', accuracy: 78, comboScoreMultiplier: 1.35 },
  { label: 'Hot run', accuracy: 90, comboScoreMultiplier: 1.75 },
];

const failures = [];
const warnings = [];

validateContent();

const stageRows = STAGES.map((stage, index) => describeStage(stage, index));
const runRows = profiles.map((profile) => describeRunProfile(profile));
const economyRows = describeEconomy();

printReport(stageRows, runRows, economyRows);

if (warnings.length > 0) {
  console.log('\nWarnings');
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

if (failures.length > 0) {
  console.error('\nBalance report failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

function validateContent() {
  if (STAGES.length === 0) failures.push('No stages are defined.');

  for (const stage of STAGES) {
    if (stage.targetKills <= 0) failures.push(`${stage.title} has no target kills.`);
    if (stage.spawnEveryMs <= 0) failures.push(`${stage.title} has invalid spawn timing.`);
    if (stage.enemyPool.length === 0) failures.push(`${stage.title} has an empty enemy pool.`);

    for (const entry of stage.enemyPool) {
      if (!ENEMIES[entry.id]) failures.push(`${stage.title} references missing enemy ${entry.id}.`);
      if (entry.weight <= 0) failures.push(`${stage.title} enemy ${entry.id} has non-positive weight.`);
    }

    if (stage.boss && !ENEMIES[stage.boss]) failures.push(`${stage.title} references missing boss ${stage.boss}.`);
  }

  if (WEAPONS.filter((item) => item.cost === 0).length === 0) failures.push('No free starter weapon exists.');
  if (CROSSHAIRS.filter((item) => item.cost === 0).length === 0) failures.push('No free starter crosshair exists.');
  if (POWERUP_TUNING.dropChance <= 0 || POWERUP_TUNING.dropChance >= 1) {
    warnings.push(`Powerup drop chance is ${(POWERUP_TUNING.dropChance * 100).toFixed(0)}%; confirm this feels right in playtests.`);
  }
}

function describeStage(stage, index) {
  const pool = weightedStageAverages(stage);
  const expectedKills = stage.targetKills + (stage.boss ? 1 : 0);
  const expectedScore = Math.round(pool.points * stage.targetKills + (stage.boss ? ENEMIES[stage.boss].points : 0));
  const expectedEnemyCoins = Math.round(pool.coins * stage.targetKills + (stage.boss ? ENEMIES[stage.boss].coinValue : 0));
  const expectedHealth = pool.health * stage.targetKills + (stage.boss ? ENEMIES[stage.boss].health : 0);
  const estimatedSeconds = Math.round((stage.targetKills * stage.spawnEveryMs) / 1000);

  return {
    stage: index + 1,
    title: stage.title,
    targetKills: stage.targetKills,
    expectedKills,
    expectedHealth: round(expectedHealth, 1),
    spawnMs: stage.spawnEveryMs,
    estimatedSeconds,
    speed: stage.speedMultiplier,
    score: expectedScore,
    enemyCoins: expectedEnemyCoins,
    clearCoins: stage.rewardCoins,
    boss: stage.boss ? ENEMIES[stage.boss].label : '-',
  };
}

function describeRunProfile(profile) {
  let cumulativeScore = 0;
  let cumulativeDropCoins = 0;
  let bossKills = 0;
  const milestones = [];

  for (const stageRow of stageRows) {
    cumulativeScore += Math.round(stageRow.score * profile.comboScoreMultiplier);
    cumulativeDropCoins += stageRow.enemyCoins + stageRow.clearCoins;
    if (stageRow.boss !== '-') bossKills++;

    const snapshot = {
      score: cumulativeScore,
      stageIndex: stageRow.stage + 1,
      accuracy: profile.accuracy,
      coinsEarned: cumulativeDropCoins,
    };
    const payout = calculateReward(snapshot, bossKills);
    milestones.push({
      stage: stageRow.stage,
      coins: payout.totalCoins,
      score: cumulativeScore,
    });
  }

  return {
    profile: profile.label,
    accuracy: profile.accuracy,
    clearStage1: milestones[0].coins,
    clearStage3: milestones[2].coins,
    clearStage6: milestones[5].coins,
    scoreStage6: milestones[5].score,
  };
}

function describeEconomy() {
  const paidUnlocks = [...WEAPONS, ...CROSSHAIRS].filter((item) => item.cost > 0).sort((a, b) => a.cost - b.cost);
  const upgradeRanks = UPGRADES.flatMap((upgrade) =>
    Array.from({ length: upgrade.maxRank }, (_, rank) => ({
      name: `${upgrade.name} ${rank + 1}/${upgrade.maxRank}`,
      cost: getUpgradeCost(upgrade, rank),
    })),
  ).sort((a, b) => a.cost - b.cost);

  const firstUnlockCost = Math.min(paidUnlocks[0]?.cost ?? Infinity, upgradeRanks[0]?.cost ?? Infinity);
  const solidStage1Coins = runRows.find((row) => row.profile === 'Solid run')?.clearStage1 ?? 0;
  const solidStage3Coins = runRows.find((row) => row.profile === 'Solid run')?.clearStage3 ?? 0;
  const allUnlockCost = sum(paidUnlocks.map((item) => item.cost));
  const allUpgradeCost = sum(upgradeRanks.map((item) => item.cost));

  if (solidStage1Coins > 0 && Math.ceil(firstUnlockCost / solidStage1Coins) > 2) {
    warnings.push(`First upgrade/unlock takes ${Math.ceil(firstUnlockCost / solidStage1Coins)} solid Stage 1 clears by estimate.`);
  }

  if (solidStage3Coins < paidUnlocks[0].cost) {
    warnings.push('Solid Stage 3 clear estimate cannot buy the cheapest paid loadout unlock.');
  }

  return [
    { label: 'Cheapest first upgrade/unlock', value: firstUnlockCost },
    { label: 'Cheapest paid weapon/crosshair', value: paidUnlocks[0]?.cost ?? 0 },
    { label: 'All paid weapons + crosshairs', value: allUnlockCost },
    { label: 'All permanent upgrade ranks', value: allUpgradeCost },
    { label: 'Full armory economy', value: allUnlockCost + allUpgradeCost },
  ];
}

function weightedStageAverages(stage) {
  const totalWeight = sum(stage.enemyPool.map((entry) => entry.weight));
  return stage.enemyPool.reduce(
    (acc, entry) => {
      const enemy = ENEMIES[entry.id];
      const ratio = entry.weight / totalWeight;
      acc.points += enemy.points * ratio;
      acc.coins += enemy.coinValue * ratio;
      acc.health += enemy.health * ratio;
      return acc;
    },
    { points: 0, coins: 0, health: 0 },
  );
}

function calculateReward(snapshot, bossKills) {
  const scoreCoins = Math.floor(snapshot.score / ECONOMY_TUNING.scoreCoinDivisor);
  const stageCoins = Math.max(0, snapshot.stageIndex - 1) * ECONOMY_TUNING.stageClearCoinsPerStage;
  const accuracyBonus = snapshot.accuracy >= ECONOMY_TUNING.accuracyBonusThreshold
    ? Math.floor(snapshot.accuracy / ECONOMY_TUNING.accuracyBonusStepPercent) * ECONOMY_TUNING.accuracyBonusCoinsPerStep
    : 0;
  const bossBonus = bossKills * ECONOMY_TUNING.bossKillBonusCoins;
  const totalCoins = Math.max(
    ECONOMY_TUNING.minimumRunCoins,
    Math.floor(scoreCoins + stageCoins + accuracyBonus + bossBonus + snapshot.coinsEarned),
  );

  return { totalCoins };
}

function printReport(stageRows, runRows, economyRows) {
  console.log('Knotz Raven Mayhem Balance Report');
  console.log(`stages=${STAGES.length} weapons=${WEAPONS.length} crosshairs=${CROSSHAIRS.length} upgrades=${UPGRADES.length}`);

  console.log('\nStage pacing and payout estimates');
  console.table(stageRows);

  console.log('\nRun reward estimates');
  console.table(runRows);

  console.log('\nEconomy costs');
  console.table(economyRows);
}

function loadTsModule(filePath) {
  const absolutePath = resolve(filePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;
  if (!existsSync(absolutePath)) throw new Error(`Missing module: ${absolutePath}`);

  const source = readFileSync(absolutePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: absolutePath,
  });

  const module = { exports: {} };
  moduleCache.set(absolutePath, module);

  const localRequire = (specifier) => {
    if (!specifier.startsWith('.')) return requireFromUrl(specifier);
    const resolvedPath = resolve(dirname(absolutePath), specifier.endsWith('.ts') ? specifier : `${specifier}.ts`);
    return loadTsModule(resolvedPath);
  };

  const execute = new Function('exports', 'require', 'module', transpiled.outputText);
  execute(module.exports, localRequire, module);
  return module.exports;
}

function requireFromUrl(specifier) {
  return import.meta.require?.(specifier) ?? createRequireFallback(specifier);
}

function createRequireFallback(specifier) {
  throw new Error(`Unsupported non-local import "${specifier}" while loading TypeScript data from ${pathToFileURL(root)}`);
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function round(value, places) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}
