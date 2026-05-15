import { getCrosshair, getWeapon } from '../data/weapons';
import type { PlayerStats, SaveData } from '../types';

export function getPlayerStats(save: SaveData): PlayerStats {
  const steadyHands = save.upgrades.steadyHands ?? 0;
  const comboCore = save.upgrades.comboCore ?? 0;
  const thickJacket = save.upgrades.thickJacket ?? 0;
  const bountyChip = save.upgrades.bountyChip ?? 0;

  return {
    startingLives: 3 + Math.floor(thickJacket / 2),
    comboWindowMs: 1900 + comboCore * 220,
    cooldownMultiplier: Math.max(0.72, 1 - steadyHands * 0.055),
    scoreMultiplier: 1 + bountyChip * 0.08,
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
