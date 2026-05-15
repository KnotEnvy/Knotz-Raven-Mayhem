import type { UpgradeDefinition } from '../types';

export const UPGRADES: UpgradeDefinition[] = [
  {
    id: 'steadyHands',
    name: 'Steady Hands',
    tagline: 'Reduces weapon cooldown each rank.',
    maxRank: 5,
    baseCost: 55,
    perRank: 35,
    stat: 'cooldown',
  },
  {
    id: 'comboCore',
    name: 'Combo Core',
    tagline: 'Extends the combo timer for deeper chains.',
    maxRank: 5,
    baseCost: 50,
    perRank: 40,
    stat: 'comboWindow',
  },
  {
    id: 'thickJacket',
    name: 'Thick Jacket',
    tagline: 'Adds extra starting lives at higher ranks.',
    maxRank: 3,
    baseCost: 90,
    perRank: 75,
    stat: 'startingLives',
  },
  {
    id: 'bountyChip',
    name: 'Bounty Chip',
    tagline: 'Boosts score and coin payout from every run.',
    maxRank: 5,
    baseCost: 75,
    perRank: 60,
    stat: 'scoreMultiplier',
  },
];

export function getUpgradeCost(definition: UpgradeDefinition, currentRank: number): number {
  return definition.baseCost + definition.perRank * currentRank;
}
