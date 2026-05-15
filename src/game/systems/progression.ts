import { getCrosshair, getWeapon } from '../data/weapons';
import { PLAYER_TUNING } from '../data/tuning';
import type { PlayerStats, SaveData } from '../types';

export function getPlayerStats(save: SaveData): PlayerStats {
  const steadyHands = save.upgrades.steadyHands ?? 0;
  const comboCore = save.upgrades.comboCore ?? 0;
  const thickJacket = save.upgrades.thickJacket ?? 0;
  const bountyChip = save.upgrades.bountyChip ?? 0;

  return {
    startingLives: PLAYER_TUNING.baseStartingLives + Math.floor(thickJacket / PLAYER_TUNING.thickJacketRanksPerLife),
    comboWindowMs: PLAYER_TUNING.baseComboWindowMs + comboCore * PLAYER_TUNING.comboCoreWindowBonusMs,
    cooldownMultiplier: Math.max(
      PLAYER_TUNING.minimumCooldownMultiplier,
      1 - steadyHands * PLAYER_TUNING.steadyHandsCooldownReduction,
    ),
    scoreMultiplier: 1 + bountyChip * PLAYER_TUNING.bountyChipMultiplierPerRank,
  };
}

export function getLoadout(save: SaveData) {
  const weapon = getWeapon(save.selectedWeapon);
  const crosshair = getCrosshair(save.selectedCrosshair);
  const stats = getPlayerStats(save);

  return {
    weapon,
    crosshair,
    stats: {
      ...stats,
      cooldownMultiplier: stats.cooldownMultiplier * crosshair.cooldownMultiplier,
    },
  };
}
