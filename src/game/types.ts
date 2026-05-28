export type EnemyId =
  | 'normal'
  | 'fast'
  | 'golden'
  | 'armored'
  | 'mini'
  | 'shield'
  | 'splitter'
  | 'dive'
  | 'wraith'
  | 'brute'
  | 'boss';

export type WeaponId = 'pistol' | 'burstRifle' | 'scattergun' | 'arcLaser';
export type CrosshairId = 'classic' | 'neonDot' | 'eagleEye' | 'wideNet';
export type UpgradeId = 'steadyHands' | 'comboCore' | 'thickJacket' | 'bountyChip';
export type PowerupId = 'slowmo' | 'multishot' | 'scoreBoost' | 'extraLife' | 'overdrive' | 'coinRush';
export type StageGradeLabel = 'S' | 'A' | 'B' | 'C' | 'D' | 'Bonus';

export interface WeightedEntry<TId extends string> {
  id: TId;
  weight: number;
}

export interface EnemyDefinition {
  id: EnemyId;
  label: string;
  health: number;
  points: number;
  speed: number;
  scale: number;
  tint?: number;
  radius: number;
  behavior: 'straight' | 'zigzag' | 'armored' | 'mini' | 'shield' | 'splitter' | 'dive' | 'wraith' | 'brute' | 'boss';
  coinValue: number;
}

export interface StageDefinition {
  id: string;
  title: string;
  subtitle: string;
  targetKills: number;
  spawnEveryMs: number;
  speedMultiplier: number;
  rewardCoins: number;
  palette: {
    skyTop: number;
    skyBottom: number;
    neon: number;
    haze: number;
  };
  enemyPool: WeightedEntry<EnemyId>[];
  boss?: EnemyId;
  bonus?: boolean;
}

export interface WeaponDefinition {
  id: WeaponId;
  name: string;
  tagline: string;
  cost: number;
  cooldownMs: number;
  damage: number;
  radius: number;
  pellets: number;
  spread: number;
  pierce: number;
  color: string;
}

export interface CrosshairDefinition {
  id: CrosshairId;
  name: string;
  tagline: string;
  effectLabel: string;
  cost: number;
  color: string;
  radiusBonus: number;
  cooldownMultiplier: number;
}

export interface UpgradeDefinition {
  id: UpgradeId;
  name: string;
  tagline: string;
  maxRank: number;
  baseCost: number;
  perRank: number;
  stat: 'cooldown' | 'comboWindow' | 'gradeBuffer' | 'scoreMultiplier';
}

export interface PlayerStats {
  gradeBufferPercent: number;
  comboWindowMs: number;
  cooldownMultiplier: number;
  scoreMultiplier: number;
}

export interface StageGrade {
  gradeEligibleSpawned: number;
  gradeEligibleKilled: number;
  escapedGradeEligible: number;
  shieldedEscapes: number;
  optionalKills: number;
  stageAccuracy: number;
  rawGradePercent: number;
  gradePercent: number;
  gradeBufferPercent: number;
  starCount: number;
  gradeLabel: StageGradeLabel;
}

export interface SaveData {
  version: 1;
  highScore: number;
  bestStage: number;
  bestCombo: number;
  lifetimeKills: number;
  bestRunStars: number;
  bestRunGradePercent: number;
  perfectStages: number;
  bestStageStars: Record<string, number>;
  coins: number;
  selectedWeapon: WeaponId;
  selectedCrosshair: CrosshairId;
  unlockedWeapons: WeaponId[];
  unlockedCrosshairs: CrosshairId[];
  upgrades: Partial<Record<UpgradeId, number>>;
  settings: GameSettings;
}

export interface GameSettings {
  musicVolume: number;
  sfxVolume: number;
  screenShake: boolean;
  reducedMotion: boolean;
}

export interface RunSnapshot {
  score: number;
  stageIndex: number;
  stageId: string;
  stageTitle: string;
  stagesCleared: number;
  stageKills: number;
  stageTargetKills: number;
  stageSpawns: number;
  stageShotsFired: number;
  stageHits: number;
  stageAccuracy: number;
  stageGrade: StageGrade;
  combo: number;
  comboMultiplier: number;
  comboTimerMs: number;
  comboWindowMs: number;
  shotsFired: number;
  hits: number;
  accuracy: number;
  kills: number;
  bestCombo: number;
  coinsEarned: number;
  totalStars: number;
  gradedStagesCleared: number;
  perfectStages: number;
  averageGradePercent: number;
  runStageStars: Record<string, number>;
  gradeShieldCharges: number;
  weaponName: string;
  crosshairName: string;
  activePowerups: ActivePowerupSnapshot[];
}

export interface ActivePowerupSnapshot {
  id: PowerupId;
  label: string;
  timeLeftMs: number;
  durationMs: number;
}

export interface RunRewards {
  scoreCoins: number;
  stageCoins: number;
  accuracyBonus: number;
  gradeBonus: number;
  bossBonus: number;
  totalCoins: number;
  newHighScore: boolean;
  newBestStage: boolean;
}

export interface StageClearSummary {
  snapshot: RunSnapshot;
  currentStage: StageDefinition;
  nextStage: StageDefinition;
  rewardCoins: number;
  baseRewardCoins: number;
  newEnemyLabels: string[];
  nextStageIsBonus: boolean;
}
