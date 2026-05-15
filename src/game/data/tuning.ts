import type { PowerupId } from '../types';

export const PLAYER_TUNING = {
  baseStartingLives: 3,
  thickJacketRanksPerLife: 2,
  baseComboWindowMs: 1900,
  comboCoreWindowBonusMs: 220,
  steadyHandsCooldownReduction: 0.055,
  minimumCooldownMultiplier: 0.72,
  bountyChipMultiplierPerRank: 0.08,
  overdriveCooldownMultiplier: 0.58,
  killsPerComboMultiplierStep: 4,
  maxComboMultiplier: 6,
  extraLifeOverflowCap: 2,
} as const;

export const ECONOMY_TUNING = {
  scoreCoinDivisor: 75,
  stageClearCoinsPerStage: 10,
  accuracyBonusThreshold: 70,
  accuracyBonusStepPercent: 10,
  accuracyBonusCoinsPerStep: 3,
  bossKillBonusCoins: 35,
  minimumRunCoins: 8,
  bountyChipPayoutMultiplierPerRank: PLAYER_TUNING.bountyChipMultiplierPerRank,
} as const;

export const POWERUP_TUNING: {
  dropChance: number;
  bossDropChance: number;
  collectRadius: number;
  mobileCollectRadiusBonus: number;
  multishotChainRadius: number;
  fallSpeedPerMs: number;
  bobSpeedPerMs: number;
  rotationSpeedPerMs: number;
  durationsMs: Record<PowerupId, number>;
} = {
  dropChance: 0.16,
  bossDropChance: 1,
  collectRadius: 42,
  mobileCollectRadiusBonus: 16,
  multishotChainRadius: 190,
  fallSpeedPerMs: 0.06,
  bobSpeedPerMs: 0.18,
  rotationSpeedPerMs: 0.0025,
  durationsMs: {
    slowmo: 8000,
    multishot: 6000,
    scoreBoost: 6000,
    extraLife: 0,
    overdrive: 4500,
  },
};

export const INPUT_TUNING = {
  compactViewportWidth: 700,
  compactViewportHeight: 520,
  mobileHitRadiusBonus: 14,
  mobileCrosshairVisualBonus: 6,
} as const;

export const PRESENTATION_TUNING = {
  desktopStarCount: 70,
  mobileStarCount: 42,
  desktopFeatherCap: 44,
  mobileFeatherCap: 18,
  reducedMotionFeatherCap: 8,
} as const;

export const STAGE_OVERFLOW_TUNING = {
  targetKillsPerLoop: 8,
  spawnMsReductionPerLoop: 18,
  minimumSpawnEveryMs: 330,
  speedMultiplierPerLoop: 0.12,
  rewardCoinsPerLoop: 15,
} as const;
