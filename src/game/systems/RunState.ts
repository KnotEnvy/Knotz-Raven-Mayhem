import type { EnemyDefinition, PlayerStats, PowerupId, RunSnapshot, WeaponDefinition, CrosshairDefinition } from '../types';
import { PLAYER_TUNING, POWERUP_TUNING } from '../data/tuning';

interface ActivePowerup {
  id: PowerupId;
  label: string;
  durationMs: number;
  timeLeftMs: number;
}

export class RunState {
  score = 0;
  lives: number;
  readonly maxLives: number;
  stageIndex = 1;
  stageKills = 0;
  stageTargetKills = 0;
  combo = 0;
  bestCombo = 0;
  comboTimerMs = 0;
  shotsFired = 0;
  hits = 0;
  kills = 0;
  coinsEarned = 0;

  private readonly stats: PlayerStats;
  private readonly weapon: WeaponDefinition;
  private readonly crosshair: CrosshairDefinition;
  private activePowerups = new Map<PowerupId, ActivePowerup>();

  constructor(stats: PlayerStats, weapon: WeaponDefinition, crosshair: CrosshairDefinition) {
    this.stats = stats;
    this.weapon = weapon;
    this.crosshair = crosshair;
    this.lives = stats.startingLives;
    this.maxLives = stats.startingLives;
  }

  update(deltaMs: number): void {
    if (this.comboTimerMs > 0) {
      this.comboTimerMs = Math.max(0, this.comboTimerMs - deltaMs);
      if (this.comboTimerMs === 0) this.combo = 0;
    }

    for (const powerup of this.activePowerups.values()) {
      powerup.timeLeftMs = Math.max(0, powerup.timeLeftMs - deltaMs);
      if (powerup.timeLeftMs <= 0) {
        this.activePowerups.delete(powerup.id);
      }
    }
  }

  startStage(stageIndex: number, targetKills: number): void {
    this.stageIndex = stageIndex;
    this.stageKills = 0;
    this.stageTargetKills = targetKills;
  }

  recordShot(): void {
    this.shotsFired++;
  }

  recordHit(): void {
    this.hits++;
  }

  recordMiss(): void {
    this.combo = 0;
    this.comboTimerMs = 0;
  }

  killEnemy(enemy: EnemyDefinition): number {
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.comboTimerMs = this.stats.comboWindowMs;
    this.kills++;
    this.stageKills++;
    this.coinsEarned += enemy.coinValue;

    const points = Math.round(enemy.points * this.comboMultiplier * this.stats.scoreMultiplier * this.powerupScoreMultiplier);
    this.score += points;
    return points;
  }

  loseLife(): boolean {
    this.lives = Math.max(0, this.lives - 1);
    this.combo = 0;
    this.comboTimerMs = 0;
    return this.lives <= 0;
  }

  addLife(): void {
    this.lives = Math.min(this.maxLives + PLAYER_TUNING.extraLifeOverflowCap, this.lives + 1);
  }

  activatePowerup(id: PowerupId): void {
    const durationMs = POWERUP_TUNING.durationsMs[id];
    this.activePowerups.set(id, {
      id,
      durationMs,
      timeLeftMs: durationMs,
      label: powerupLabel(id),
    });
  }

  isPowerupActive(id: PowerupId): boolean {
    return this.activePowerups.has(id);
  }

  get comboMultiplier(): number {
    return Math.min(
      PLAYER_TUNING.maxComboMultiplier,
      1 + Math.floor(Math.max(0, this.combo - 1) / PLAYER_TUNING.killsPerComboMultiplierStep),
    );
  }

  get accuracy(): number {
    if (this.shotsFired === 0) return 100;
    return Math.round((this.hits / this.shotsFired) * 100);
  }

  get powerupScoreMultiplier(): number {
    return this.isPowerupActive('scoreBoost') ? 2 : 1;
  }

  get weaponCooldownMs(): number {
    const overdrive = this.isPowerupActive('overdrive') ? PLAYER_TUNING.overdriveCooldownMultiplier : 1;
    return this.weapon.cooldownMs * this.stats.cooldownMultiplier * overdrive;
  }

  get activePowerupSnapshots() {
    return [...this.activePowerups.values()].map((powerup) => ({ ...powerup }));
  }

  snapshot(stageTitle: string): RunSnapshot {
    return {
      score: this.score,
      lives: this.lives,
      maxLives: Math.max(this.maxLives, this.lives),
      stageIndex: this.stageIndex,
      stageTitle,
      stageKills: this.stageKills,
      stageTargetKills: this.stageTargetKills,
      combo: this.combo,
      comboMultiplier: this.comboMultiplier,
      comboTimerMs: this.comboTimerMs,
      comboWindowMs: this.stats.comboWindowMs,
      shotsFired: this.shotsFired,
      hits: this.hits,
      accuracy: this.accuracy,
      kills: this.kills,
      bestCombo: this.bestCombo,
      coinsEarned: this.coinsEarned,
      weaponName: this.weapon.name,
      crosshairName: this.crosshair.name,
      activePowerups: this.activePowerupSnapshots,
    };
  }
}

export function powerupLabel(id: PowerupId): string {
  switch (id) {
    case 'slowmo':
      return 'Slow-Mo';
    case 'multishot':
      return 'Multi-Shot';
    case 'scoreBoost':
      return 'Score Boost';
    case 'extraLife':
      return 'Extra Life';
    case 'overdrive':
      return 'Overdrive';
  }
}
