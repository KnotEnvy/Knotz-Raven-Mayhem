import { CROSSHAIRS, WEAPONS } from './data/weapons';
import { UPGRADES, getUpgradeCost } from './data/upgrades';
import type { CrosshairId, RunRewards, RunSnapshot, SaveData, UpgradeId, WeaponId } from './types';

const SAVE_KEY = 'knotz-raven-mayhem-save-v1';

export const DEFAULT_SAVE: SaveData = {
  version: 1,
  highScore: 0,
  bestStage: 1,
  bestCombo: 0,
  lifetimeKills: 0,
  coins: 0,
  selectedWeapon: 'pistol',
  selectedCrosshair: 'classic',
  unlockedWeapons: ['pistol'],
  unlockedCrosshairs: ['classic'],
  upgrades: {},
};

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return cloneSave(DEFAULT_SAVE);

    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return normalizeSave(parsed);
  } catch {
    return cloneSave(DEFAULT_SAVE);
  }
}

export function persistSave(save: SaveData): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(normalizeSave(save)));
}

export function resetSave(): SaveData {
  const save = cloneSave(DEFAULT_SAVE);
  persistSave(save);
  return save;
}

export function purchaseWeapon(save: SaveData, weaponId: WeaponId): SaveData {
  const weapon = WEAPONS.find((item) => item.id === weaponId);
  if (!weapon || save.unlockedWeapons.includes(weaponId) || save.coins < weapon.cost) return save;

  const next = cloneSave(save);
  next.coins -= weapon.cost;
  next.unlockedWeapons.push(weaponId);
  next.selectedWeapon = weaponId;
  persistSave(next);
  return next;
}

export function purchaseCrosshair(save: SaveData, crosshairId: CrosshairId): SaveData {
  const crosshair = CROSSHAIRS.find((item) => item.id === crosshairId);
  if (!crosshair || save.unlockedCrosshairs.includes(crosshairId) || save.coins < crosshair.cost) return save;

  const next = cloneSave(save);
  next.coins -= crosshair.cost;
  next.unlockedCrosshairs.push(crosshairId);
  next.selectedCrosshair = crosshairId;
  persistSave(next);
  return next;
}

export function selectWeapon(save: SaveData, weaponId: WeaponId): SaveData {
  if (!save.unlockedWeapons.includes(weaponId)) return save;
  const next = cloneSave(save);
  next.selectedWeapon = weaponId;
  persistSave(next);
  return next;
}

export function selectCrosshair(save: SaveData, crosshairId: CrosshairId): SaveData {
  if (!save.unlockedCrosshairs.includes(crosshairId)) return save;
  const next = cloneSave(save);
  next.selectedCrosshair = crosshairId;
  persistSave(next);
  return next;
}

export function purchaseUpgrade(save: SaveData, upgradeId: UpgradeId): SaveData {
  const upgrade = UPGRADES.find((item) => item.id === upgradeId);
  if (!upgrade) return save;

  const rank = save.upgrades[upgradeId] ?? 0;
  if (rank >= upgrade.maxRank) return save;

  const cost = getUpgradeCost(upgrade, rank);
  if (save.coins < cost) return save;

  const next = cloneSave(save);
  next.coins -= cost;
  next.upgrades[upgradeId] = rank + 1;
  persistSave(next);
  return next;
}

export function applyRunRewards(save: SaveData, snapshot: RunSnapshot, rewards: RunRewards): SaveData {
  const next = cloneSave(save);
  next.coins += rewards.totalCoins;
  next.highScore = Math.max(next.highScore, snapshot.score);
  next.bestStage = Math.max(next.bestStage, snapshot.stageIndex);
  next.bestCombo = Math.max(next.bestCombo, snapshot.bestCombo);
  next.lifetimeKills += snapshot.kills;
  persistSave(next);
  return next;
}

export function calculateRunRewards(save: SaveData, snapshot: RunSnapshot, bossKills: number): RunRewards {
  const scoreCoins = Math.floor(snapshot.score / 75);
  const stageCoins = Math.max(0, snapshot.stageIndex - 1) * 10;
  const accuracyBonus = snapshot.accuracy >= 70 ? Math.floor(snapshot.accuracy / 10) * 3 : 0;
  const bossBonus = bossKills * 35;
  const payoutMultiplier = 1 + (save.upgrades.bountyChip ?? 0) * 0.08;
  const totalCoins = Math.max(8, Math.floor((scoreCoins + stageCoins + accuracyBonus + bossBonus + snapshot.coinsEarned) * payoutMultiplier));

  return {
    scoreCoins,
    stageCoins,
    accuracyBonus,
    bossBonus,
    totalCoins,
    newHighScore: snapshot.score > save.highScore,
    newBestStage: snapshot.stageIndex > save.bestStage,
  };
}

function normalizeSave(input: Partial<SaveData>): SaveData {
  const unlockedWeapons = sanitizeIds(input.unlockedWeapons, WEAPONS.map((item) => item.id), DEFAULT_SAVE.unlockedWeapons);
  const unlockedCrosshairs = sanitizeIds(input.unlockedCrosshairs, CROSSHAIRS.map((item) => item.id), DEFAULT_SAVE.unlockedCrosshairs);
  const selectedWeapon = unlockedWeapons.includes(input.selectedWeapon as WeaponId)
    ? (input.selectedWeapon as WeaponId)
    : DEFAULT_SAVE.selectedWeapon;
  const selectedCrosshair = unlockedCrosshairs.includes(input.selectedCrosshair as CrosshairId)
    ? (input.selectedCrosshair as CrosshairId)
    : DEFAULT_SAVE.selectedCrosshair;

  return {
    version: 1,
    highScore: Number.isFinite(input.highScore) ? Number(input.highScore) : 0,
    bestStage: Number.isFinite(input.bestStage) ? Math.max(1, Number(input.bestStage)) : 1,
    bestCombo: Number.isFinite(input.bestCombo) ? Number(input.bestCombo) : 0,
    lifetimeKills: Number.isFinite(input.lifetimeKills) ? Number(input.lifetimeKills) : 0,
    coins: Number.isFinite(input.coins) ? Math.max(0, Number(input.coins)) : 0,
    selectedWeapon,
    selectedCrosshair,
    unlockedWeapons,
    unlockedCrosshairs,
    upgrades: normalizeUpgrades(input.upgrades),
  };
}

function normalizeUpgrades(input: SaveData['upgrades'] | undefined): SaveData['upgrades'] {
  const output: SaveData['upgrades'] = {};
  for (const upgrade of UPGRADES) {
    const value = input?.[upgrade.id] ?? 0;
    output[upgrade.id] = Math.max(0, Math.min(upgrade.maxRank, Math.floor(value)));
  }
  return output;
}

function sanitizeIds<TId extends string>(input: TId[] | undefined, allowed: TId[], fallback: TId[]): TId[] {
  const values = input?.filter((id) => allowed.includes(id)) ?? [];
  const merged = new Set([...fallback, ...values]);
  return [...merged];
}

function cloneSave(save: SaveData): SaveData {
  return JSON.parse(JSON.stringify(save)) as SaveData;
}
