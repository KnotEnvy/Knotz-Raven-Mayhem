import type { StageDefinition } from '../types';
import { ENEMIES } from './enemies';
import { STAGE_OVERFLOW_TUNING } from './tuning';

export const STAGES: StageDefinition[] = [
  {
    id: 'graveyard-dusk',
    title: 'Graveyard Dusk',
    subtitle: 'Warm up under the violet moon.',
    targetKills: 18,
    spawnEveryMs: 820,
    speedMultiplier: 1,
    rewardCoins: 18,
    palette: {
      skyTop: 0x140926,
      skyBottom: 0x2b1747,
      neon: 0xff42f8,
      haze: 0x5b2d8a,
    },
    enemyPool: [
      { id: 'normal', weight: 70 },
      { id: 'fast', weight: 16 },
      { id: 'golden', weight: 5 },
      { id: 'armored', weight: 9 },
    ],
  },
  {
    id: 'neon-boardwalk',
    title: 'Neon Boardwalk',
    subtitle: 'The flock learns to fake you out.',
    targetKills: 24,
    spawnEveryMs: 700,
    speedMultiplier: 1.12,
    rewardCoins: 26,
    palette: {
      skyTop: 0x021831,
      skyBottom: 0x092e45,
      neon: 0x20f2ff,
      haze: 0xffb11f,
    },
    enemyPool: [
      { id: 'normal', weight: 46 },
      { id: 'fast', weight: 22 },
      { id: 'mini', weight: 12 },
      { id: 'golden', weight: 6 },
      { id: 'shield', weight: 14 },
    ],
  },
  {
    id: 'storm-tower',
    title: 'Storm Tower',
    subtitle: 'Keep the combo alive through the thunder.',
    targetKills: 30,
    spawnEveryMs: 620,
    speedMultiplier: 1.24,
    rewardCoins: 35,
    palette: {
      skyTop: 0x071c2f,
      skyBottom: 0x3b1448,
      neon: 0x93ff29,
      haze: 0x27a8ff,
    },
    enemyPool: [
      { id: 'normal', weight: 30 },
      { id: 'fast', weight: 24 },
      { id: 'armored', weight: 14 },
      { id: 'mini', weight: 12 },
      { id: 'splitter', weight: 12 },
      { id: 'golden', weight: 8 },
    ],
    boss: 'boss',
  },
  {
    id: 'junkyard-moon',
    title: 'Junkyard Moon',
    subtitle: 'Scrap metal, bird armor, and no clean shots.',
    targetKills: 36,
    spawnEveryMs: 540,
    speedMultiplier: 1.38,
    rewardCoins: 48,
    palette: {
      skyTop: 0x1b1025,
      skyBottom: 0x332800,
      neon: 0xffe14b,
      haze: 0xff6d2d,
    },
    enemyPool: [
      { id: 'normal', weight: 24 },
      { id: 'fast', weight: 22 },
      { id: 'armored', weight: 18 },
      { id: 'shield', weight: 16 },
      { id: 'dive', weight: 10 },
      { id: 'golden', weight: 10 },
    ],
  },
  {
    id: 'carnival-night',
    title: 'Carnival Night',
    subtitle: 'Everything splits, dives, and glows.',
    targetKills: 42,
    spawnEveryMs: 500,
    speedMultiplier: 1.52,
    rewardCoins: 62,
    palette: {
      skyTop: 0x23051f,
      skyBottom: 0x042c31,
      neon: 0xff2f7f,
      haze: 0x2cffc8,
    },
    enemyPool: [
      { id: 'fast', weight: 25 },
      { id: 'mini', weight: 18 },
      { id: 'splitter', weight: 20 },
      { id: 'shield', weight: 14 },
      { id: 'dive', weight: 14 },
      { id: 'golden', weight: 9 },
    ],
  },
  {
    id: 'raven-kings-nest',
    title: "Raven King's Nest",
    subtitle: 'The cabinet wants one more quarter.',
    targetKills: 50,
    spawnEveryMs: 460,
    speedMultiplier: 1.72,
    rewardCoins: 85,
    palette: {
      skyTop: 0x050711,
      skyBottom: 0x3b0614,
      neon: 0xff1e3d,
      haze: 0x9c2dff,
    },
    enemyPool: [
      { id: 'fast', weight: 24 },
      { id: 'armored', weight: 18 },
      { id: 'mini', weight: 16 },
      { id: 'splitter', weight: 18 },
      { id: 'shield', weight: 14 },
      { id: 'dive', weight: 10 },
    ],
    boss: 'boss',
  },
  {
    id: 'jackpot-alley',
    title: 'Jackpot Alley',
    subtitle: 'Bonus round: grab coins, keep the streak, no lives lost.',
    targetKills: 22,
    spawnEveryMs: 430,
    speedMultiplier: 1.38,
    rewardCoins: 70,
    bonus: true,
    palette: {
      skyTop: 0x1a0827,
      skyBottom: 0x3a2100,
      neon: 0xffd447,
      haze: 0xff7a1f,
    },
    enemyPool: [
      { id: 'golden', weight: 36 },
      { id: 'mini', weight: 26 },
      { id: 'fast', weight: 18 },
      { id: 'wraith', weight: 20 },
    ],
  },
  {
    id: 'cinder-viaduct',
    title: 'Cinder Viaduct',
    subtitle: 'Wraiths fade across the tracks while brutes soak shots.',
    targetKills: 58,
    spawnEveryMs: 430,
    speedMultiplier: 1.86,
    rewardCoins: 98,
    palette: {
      skyTop: 0x150810,
      skyBottom: 0x39110b,
      neon: 0xff8738,
      haze: 0x49e7ff,
    },
    enemyPool: [
      { id: 'fast', weight: 20 },
      { id: 'shield', weight: 14 },
      { id: 'splitter', weight: 16 },
      { id: 'dive', weight: 12 },
      { id: 'wraith', weight: 22 },
      { id: 'brute', weight: 16 },
    ],
  },
  {
    id: 'clocktower-apex',
    title: 'Clocktower Apex',
    subtitle: 'Final loop pressure with every flock trick in play.',
    targetKills: 66,
    spawnEveryMs: 395,
    speedMultiplier: 2,
    rewardCoins: 120,
    palette: {
      skyTop: 0x020918,
      skyBottom: 0x25145a,
      neon: 0x5ee7ff,
      haze: 0xff3fb4,
    },
    enemyPool: [
      { id: 'fast', weight: 18 },
      { id: 'armored', weight: 12 },
      { id: 'shield', weight: 14 },
      { id: 'splitter', weight: 16 },
      { id: 'dive', weight: 14 },
      { id: 'wraith', weight: 16 },
      { id: 'brute', weight: 10 },
    ],
    boss: 'boss',
  },
];

export function getStage(index: number): StageDefinition {
  if (index < STAGES.length) return STAGES[index];

  const finalStage = STAGES[STAGES.length - 1];
  const overflow = index - STAGES.length + 1;

  return {
    ...finalStage,
    id: `${finalStage.id}-${overflow}`,
    title: `${finalStage.title} +${overflow}`,
    targetKills: finalStage.targetKills + overflow * STAGE_OVERFLOW_TUNING.targetKillsPerLoop,
    spawnEveryMs: Math.max(
      STAGE_OVERFLOW_TUNING.minimumSpawnEveryMs,
      finalStage.spawnEveryMs - overflow * STAGE_OVERFLOW_TUNING.spawnMsReductionPerLoop,
    ),
    speedMultiplier: finalStage.speedMultiplier + overflow * STAGE_OVERFLOW_TUNING.speedMultiplierPerLoop,
    rewardCoins: finalStage.rewardCoins + overflow * STAGE_OVERFLOW_TUNING.rewardCoinsPerLoop,
  };
}

export function getNewEnemyLabelsForStage(index: number): string[] {
  if (index < 0 || index >= STAGES.length) return [];

  const seen = new Set(STAGES.slice(0, index).flatMap((stage) => stage.enemyPool.map((entry) => entry.id)));
  if (STAGES.slice(0, index).some((stage) => stage.boss)) seen.add('boss');

  const current = new Set(STAGES[index].enemyPool.map((entry) => entry.id));
  if (STAGES[index].boss) current.add(STAGES[index].boss);

  return [...current]
    .filter((id) => !seen.has(id))
    .map((id) => ENEMIES[id].label);
}
