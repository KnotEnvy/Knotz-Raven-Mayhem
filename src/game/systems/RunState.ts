import type { EnemyDefinition, PlayerStats, PowerupId, RunSnapshot, WeaponDefinition, CrosshairDefinition, StageGrade } from '../types';
import { PLAYER_TUNING, POWERUP_TUNING } from '../data/tuning';
import { averageGradePercent, calculateStageGrade } from './grades';

interface ActivePowerup {
  id: PowerupId;
  label: string;
  durationMs: number;
  timeLeftMs: number;
}

interface StageRetryCheckpoint {
  score: number;
  combo: number;
  bestCombo: number;
  comboTimerMs: number;
  shotsFired: number;
  hits: number;
  kills: number;
  coinsEarned: number;
  totalStars: number;
  gradedStagesCleared: number;
  perfectStages: number;
  totalGradePercent: number;
  runStageStars: Record<string, number>;
  gradeShieldCharges: number;
  activePowerups: ActivePowerup[];
}

export class RunState {
  score = 0;
  stageIndex = 1;
  stageId = '';
  stageKills = 0;
  stageTargetKills = 0;
  stageSpawns = 0;
  stageShotsFired = 0;
  stageHits = 0;
  gradeEligibleSpawned = 0;
  gradeEligibleKilled = 0;
  escapedGradeEligible = 0;
  shieldedEscapes = 0;
  optionalKills = 0;
  combo = 0;
  bestCombo = 0;
  comboTimerMs = 0;
  shotsFired = 0;
  hits = 0;
  kills = 0;
  coinsEarned = 0;
  totalStars = 0;
  gradedStagesCleared = 0;
  perfectStages = 0;
  totalGradePercent = 0;
  runStageStars: Record<string, number> = {};
  gradeShieldCharges = 0;

  private readonly stats: PlayerStats;
  private readonly weapon: WeaponDefinition;
  private readonly crosshair: CrosshairDefinition;
  private activePowerups = new Map<PowerupId, ActivePowerup>();
  private stageRetryCheckpoint?: StageRetryCheckpoint;

  constructor(stats: PlayerStats, weapon: WeaponDefinition, crosshair: CrosshairDefinition) {
    this.stats = stats;
    this.weapon = weapon;
    this.crosshair = crosshair;
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

  startStage(stageIndex: number, stageId: string, targetKills: number): void {
    this.stageIndex = stageIndex;
    this.stageId = stageId;
    this.stageTargetKills = targetKills;
    this.resetStageAttempt();
    this.stageRetryCheckpoint = this.createStageRetryCheckpoint();
  }

  retryStage(): void {
    if (!this.stageRetryCheckpoint) return;

    const checkpoint = this.stageRetryCheckpoint;
    this.score = checkpoint.score;
    this.combo = checkpoint.combo;
    this.bestCombo = checkpoint.bestCombo;
    this.comboTimerMs = checkpoint.comboTimerMs;
    this.shotsFired = checkpoint.shotsFired;
    this.hits = checkpoint.hits;
    this.kills = checkpoint.kills;
    this.coinsEarned = checkpoint.coinsEarned;
    this.totalStars = checkpoint.totalStars;
    this.gradedStagesCleared = checkpoint.gradedStagesCleared;
    this.perfectStages = checkpoint.perfectStages;
    this.totalGradePercent = checkpoint.totalGradePercent;
    this.runStageStars = { ...checkpoint.runStageStars };
    this.gradeShieldCharges = checkpoint.gradeShieldCharges;
    this.activePowerups = new Map(checkpoint.activePowerups.map((powerup) => [powerup.id, { ...powerup }]));
    this.resetStageAttempt();
  }

  private resetStageAttempt(): void {
    this.stageKills = 0;
    this.stageSpawns = 0;
    this.stageShotsFired = 0;
    this.stageHits = 0;
    this.gradeEligibleSpawned = 0;
    this.gradeEligibleKilled = 0;
    this.escapedGradeEligible = 0;
    this.shieldedEscapes = 0;
    this.optionalKills = 0;
  }

  private createStageRetryCheckpoint(): StageRetryCheckpoint {
    return {
      score: this.score,
      combo: this.combo,
      bestCombo: this.bestCombo,
      comboTimerMs: this.comboTimerMs,
      shotsFired: this.shotsFired,
      hits: this.hits,
      kills: this.kills,
      coinsEarned: this.coinsEarned,
      totalStars: this.totalStars,
      gradedStagesCleared: this.gradedStagesCleared,
      perfectStages: this.perfectStages,
      totalGradePercent: this.totalGradePercent,
      runStageStars: { ...this.runStageStars },
      gradeShieldCharges: this.gradeShieldCharges,
      activePowerups: [...this.activePowerups.values()].map((powerup) => ({ ...powerup })),
    };
  }

  recordShot(): void {
    this.shotsFired++;
    this.stageShotsFired++;
  }

  recordHit(): void {
    this.hits++;
    this.stageHits++;
  }

  recordMiss(): void {
    this.combo = 0;
    this.comboTimerMs = 0;
  }

  recordStageSpawn(gradeEligible: boolean): void {
    this.stageSpawns++;
    if (gradeEligible) this.gradeEligibleSpawned++;
  }

  recordEnemyEscaped(gradeEligible: boolean): 'optional' | 'escaped' | 'shielded' {
    this.combo = 0;
    this.comboTimerMs = 0;

    if (!gradeEligible) return 'optional';

    if (this.gradeShieldCharges > 0) {
      this.gradeShieldCharges--;
      this.shieldedEscapes++;
      return 'shielded';
    }

    this.escapedGradeEligible++;
    return 'escaped';
  }

  killEnemy(enemy: EnemyDefinition, gradeEligible: boolean): number {
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.comboTimerMs = this.stats.comboWindowMs;
    this.kills++;
    this.stageKills++;
    if (gradeEligible) {
      this.gradeEligibleKilled++;
    } else {
      this.optionalKills++;
    }
    this.coinsEarned += enemy.coinValue * (this.isPowerupActive('coinRush') ? 2 : 1);

    const points = Math.round(enemy.points * this.comboMultiplier * this.stats.scoreMultiplier * this.powerupScoreMultiplier);
    this.score += points;
    return points;
  }

  addGradeShield(): void {
    this.gradeShieldCharges = Math.min(PLAYER_TUNING.maxGradeShieldCharges, this.gradeShieldCharges + 1);
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

  get stageAccuracy(): number {
    if (this.stageShotsFired === 0) return 100;
    return Math.round((this.stageHits / this.stageShotsFired) * 100);
  }

  get stageGrade(): StageGrade {
    return calculateStageGrade({
      gradeEligibleSpawned: this.gradeEligibleSpawned,
      gradeEligibleKilled: this.gradeEligibleKilled,
      escapedGradeEligible: this.escapedGradeEligible,
      shieldedEscapes: this.shieldedEscapes,
      optionalKills: this.optionalKills,
      stageAccuracy: this.stageAccuracy,
      gradeBufferPercent: this.stats.gradeBufferPercent,
    });
  }

  completeStage(stageId: string, bonusStage: boolean): StageGrade {
    const grade = calculateStageGrade({
      gradeEligibleSpawned: this.gradeEligibleSpawned,
      gradeEligibleKilled: this.gradeEligibleKilled,
      escapedGradeEligible: this.escapedGradeEligible,
      shieldedEscapes: this.shieldedEscapes,
      optionalKills: this.optionalKills,
      stageAccuracy: this.stageAccuracy,
      gradeBufferPercent: this.stats.gradeBufferPercent,
      bonusStage,
    });

    if (!bonusStage) {
      this.totalStars += grade.starCount;
      this.gradedStagesCleared++;
      this.totalGradePercent += grade.gradePercent;
      this.runStageStars[stageId] = Math.max(this.runStageStars[stageId] ?? 0, grade.starCount);
      if (grade.starCount === 5) this.perfectStages++;
    }

    return grade;
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

  snapshot(stageTitle: string, bonusStage = false): RunSnapshot {
    const stageGrade = calculateStageGrade({
      gradeEligibleSpawned: this.gradeEligibleSpawned,
      gradeEligibleKilled: this.gradeEligibleKilled,
      escapedGradeEligible: this.escapedGradeEligible,
      shieldedEscapes: this.shieldedEscapes,
      optionalKills: this.optionalKills,
      stageAccuracy: this.stageAccuracy,
      gradeBufferPercent: this.stats.gradeBufferPercent,
      bonusStage,
    });

    return {
      score: this.score,
      stageIndex: this.stageIndex,
      stageId: this.stageId,
      stageTitle,
      stagesCleared: this.gradedStagesCleared,
      stageKills: this.stageKills,
      stageTargetKills: this.stageTargetKills,
      stageSpawns: this.stageSpawns,
      stageShotsFired: this.stageShotsFired,
      stageHits: this.stageHits,
      stageAccuracy: this.stageAccuracy,
      stageGrade,
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
      totalStars: this.totalStars,
      gradedStagesCleared: this.gradedStagesCleared,
      perfectStages: this.perfectStages,
      averageGradePercent: averageGradePercent(this.totalGradePercent, this.gradedStagesCleared),
      runStageStars: { ...this.runStageStars },
      gradeShieldCharges: this.gradeShieldCharges,
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
      return 'Grade Shield';
    case 'overdrive':
      return 'Overdrive';
    case 'coinRush':
      return 'Coin Rush';
  }
}
