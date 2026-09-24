import Phaser from 'phaser';
import { AUDIO_KEYS, SPRITE_KEYS } from '../data/assets';
import { ENEMIES } from '../data/enemies';
import { getNewEnemyLabelsForStage, getStage } from '../data/stages';
import { CROSSHAIRS, WEAPONS } from '../data/weapons';
import { INPUT_TUNING, POWERUP_TUNING, PRESENTATION_TUNING } from '../data/tuning';
import { applyRunRewards, calculateRunRewards, loadSave } from '../save';
import { getLoadout } from '../systems/progression';
import { RunState, powerupLabel } from '../systems/RunState';
import { calculateGradeAdjustedStageReward } from '../systems/grades';
import { WaveDirector } from '../systems/WaveDirector';
import { arcadeAudio } from '../systems/ArcadeAudio';
import { type QualityProfile, isAutoQuality, resolveQualityProfile, stepDownAutoQuality } from '../systems/Quality';
import { StageBackdrop } from '../fx/Backdrop';
import { type CabinetPipeline, attachCabinetPipeline } from '../fx/CabinetPipeline';
import { FxParticles } from '../fx/Particles';
import { FX, ravenAnimKey, ravenBakeScale, ravenTextureKey } from '../fx/TextureFactory';
import { DISPLAY_FONT, UI_FONT } from './BootScene';
import type { EnemyDefinition, EnemyId, PowerupId, RunRewards, SaveData, StageClearSummary, StageDefinition, WeaponDefinition } from '../types';
import { dispatchUiState, onCommand } from '../../ui/events';

interface EnemyActor {
  sprite: Phaser.GameObjects.Sprite;
  healthBar?: Phaser.GameObjects.Graphics;
  shield?: Phaser.GameObjects.Image;
  def: EnemyDefinition;
  hp: number;
  velocityX: number;
  velocityY: number;
  bornMs: number;
  nextSpitAtMs?: number;
  radius: number;
  visualRadius: number;
  visualScale: number;
  boss: boolean;
  splitDepth: number;
  gradeEligible: boolean;
  punch: number;
}

interface PowerupActor {
  id: PowerupId;
  label: string;
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Arc;
  glow: Phaser.GameObjects.Image;
  glyph: Phaser.GameObjects.Text;
  bornMs: number;
}

interface Corpse {
  sprite: Phaser.GameObjects.Sprite;
  vx: number;
  vy: number;
  spin: number;
  age: number;
}

interface BossBar {
  container: Phaser.GameObjects.Container;
  frame: Phaser.GameObjects.Graphics;
  fill: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  width: number;
  trail: number;
  shown: number;
  shake: number;
}

const ENEMY_SPRITE_POOL_LIMIT = 32;
const EXPLOSION_POOL_LIMIT = 18;
const TEXT_POOL_LIMIT = 32;
const GRAPHICS_POOL_LIMIT = 40;
const POWERUP_POOL_LIMIT = 12;
const BOSS_SPIT_FIRST_DELAY_MS = 1350;
const BOSS_SPIT_INTERVAL_MS = 2350;
const BOSS_SPIT_INTERVAL_VARIANCE_MS = 620;
const BOSS_SPIT_MINION_LIMIT = 4;
const BOSS_VERTICAL_SAFE_PADDING = 34;
const BOSS_MOUTH_SAFE_PADDING = 44;
const CORPSE_GRAVITY = 0.0016;
const LOW_FPS_THRESHOLDS: Record<QualityProfile['tier'], number> = { high: 46, balanced: 32, low: 0 };

export class GameScene extends Phaser.Scene {
  private save!: SaveData;
  private run!: RunState;
  private stage!: StageDefinition;
  private waveDirector = new WaveDirector();
  private enemies: EnemyActor[] = [];
  private powerups: PowerupActor[] = [];
  private unsubscribers: Array<() => void> = [];
  private weapon!: WeaponDefinition;
  private crosshairRadiusBonus = 0;
  private nextShotAt = 0;
  private lastCooldownFeedbackAt = 0;
  private pausedByUi = false;
  private stageTransition = false;
  private completedStageSummary?: StageClearSummary;
  private stageEnemiesSpawned = 0;
  private bossSpawned = false;
  private bossDefeated = false;
  private bossKills = 0;
  private stageStartBossKills = 0;
  private gameEnded = false;
  private crosshair!: Phaser.GameObjects.Graphics;
  private enemySpritePool: Phaser.GameObjects.Sprite[] = [];
  private explosionPool: Phaser.GameObjects.Sprite[] = [];
  private textPool: Phaser.GameObjects.Text[] = [];
  private graphicsPool: Phaser.GameObjects.Graphics[] = [];
  private powerupPool: PowerupActor[] = [];
  private screenPolishFx?: Phaser.GameObjects.Graphics;
  private powerupFieldFx?: Phaser.GameObjects.Graphics;
  private quality!: QualityProfile;
  private backdrop!: StageBackdrop;
  private fx!: FxParticles;
  private cabinet?: CabinetPipeline;
  private corpses: Corpse[] = [];
  private corpsePool: Phaser.GameObjects.Sprite[] = [];
  private shieldPool: Phaser.GameObjects.Image[] = [];
  private bossBar?: BossBar;
  private hitStopMs = 0;
  private pointerSeen = false;
  private reticleSpin = 0;
  private reticleLock = 0;
  private reticleKick = 0;
  private lockedActor?: EnemyActor;
  private lastComboTier = 1;
  private fpsLowSeconds = 0;
  private fpsCheckTimer = 0;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.save = loadSave();
    const loadout = getLoadout(this.save);
    this.weapon = loadout.weapon;
    this.crosshairRadiusBonus = loadout.crosshair.radiusBonus;
    this.run = new RunState(loadout.stats, loadout.weapon, loadout.crosshair);
    const startIndex = debugStartStageIndex();
    this.stage = getStage(startIndex);
    this.run.startStage(startIndex + 1, this.stage.id, this.stage.targetKills);
    this.nextShotAt = 0;
    this.gameEnded = false;
    this.bossKills = 0;
    this.stageStartBossKills = 0;
    this.bossSpawned = false;
    this.bossDefeated = false;
    this.stageEnemiesSpawned = 0;
    this.stageTransition = false;
    this.completedStageSummary = undefined;
    this.pausedByUi = false;
    this.enemies = [];
    this.powerups = [];
    this.enemySpritePool = [];
    this.explosionPool = [];
    this.textPool = [];
    this.graphicsPool = [];
    this.powerupPool = [];
    this.corpses = [];
    this.corpsePool = [];
    this.shieldPool = [];
    this.bossBar = undefined;
    this.hitStopMs = 0;
    this.pointerSeen = false;
    this.lockedActor = undefined;
    this.lastComboTier = 1;
    this.fpsLowSeconds = 0;
    this.fpsCheckTimer = 0;

    this.quality = resolveQualityProfile(this.save.settings);
    this.cameras.main.setRoundPixels(false);
    this.cabinet = attachCabinetPipeline(this.cameras.main, this.quality.postFx);
    this.backdrop = new StageBackdrop(this, this.quality, this.save.settings.reducedMotion);
    this.backdrop.onEvent = (event) => {
      if (event === 'thunder') arcadeAudio.playThunder();
      if (event === 'firework') arcadeAudio.playFirework();
    };
    this.backdrop.setTheme(this.stage.id);
    this.fx = new FxParticles(this, this.quality, this.save.settings.reducedMotion);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.screenPolishFx = this.add.graphics().setDepth(96);
    this.powerupFieldFx = this.add.graphics().setDepth(97);
    this.createCrosshair();
    this.bindCommands();
    this.registerInput();
    this.renderHud();
    this.showStageBanner(this.stage.title, this.stage.subtitle, this.run.stageIndex);
    this.playStageIntroFx(this.stage);
    arcadeAudio.startMusic('run', this.save.settings, this.stage.id);
    arcadeAudio.setIntensity(1);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
      this.unsubscribers.forEach((unsubscribe) => unsubscribe());
      this.unsubscribers = [];
      this.backdrop.destroy();
      this.input.setDefaultCursor('auto');
    });
  }

  update(time: number, delta: number): void {
    this.updateCrosshair(delta);
    this.updateBossBar(delta);
    if (this.gameEnded || this.pausedByUi) return;

    // Hit-stop freezes the flock for a few frames on heavy impacts so kills
    // land with weight; timers, HUD and VFX keep running at full speed.
    let worldDelta = delta;
    if (this.hitStopMs > 0) {
      this.hitStopMs = Math.max(0, this.hitStopMs - delta);
      worldDelta = delta * 0.06;
    }

    const slow = this.run.isPowerupActive('slowmo') ? 0.42 : 1;
    this.run.update(delta);
    this.backdrop.update(time, delta, slow);
    this.updateEnemies(time, worldDelta);
    this.updateCorpses(delta);
    this.updatePowerups(time, delta);
    this.updateScreenPolish(time);
    this.maybeSpawnEnemy(worldDelta);
    this.checkStageFlow();
    this.updateComboTier();
    this.monitorFrameRate(delta);
    this.renderHud();
  }

  private bindCommands(): void {
    this.unsubscribers.push(
      onCommand('pause', () => this.pauseRun()),
      onCommand('resume', () => this.resumeRun()),
      onCommand('continue-stage', () => this.continueToNextStage()),
      onCommand('retry-stage', () => this.retryCurrentStage()),
      onCommand('open-armory', () => {
        dispatchUiState({ screen: 'blank' });
        this.scene.start('AttractScene', { mode: 'armory' });
      }),
      onCommand('return-menu', () => {
        if (!this.gameEnded && (this.pausedByUi || this.stageTransition)) {
          this.endRun();
          return;
        }

        dispatchUiState({ screen: 'blank' });
        this.scene.start('AttractScene');
      }),
      onCommand('restart-run', () => {
        dispatchUiState({ screen: 'blank' });
        this.scene.restart();
      }),
    );
  }

  private registerInput(): void {
    this.input.on('pointermove', () => {
      this.pointerSeen = true;
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.pointerSeen = true;
      if (this.pausedByUi || this.gameEnded) return;
      this.fireWeapon(pointer.x, pointer.y, this.time.now);
    });

    this.input.keyboard?.on('keydown-SPACE', () => {
      if (this.stageTransition) this.continueToNextStage();
      else if (this.pausedByUi) this.resumeRun();
      else this.pauseRun();
    });

    this.input.keyboard?.on('keydown-P', () => {
      if (this.stageTransition) this.continueToNextStage();
      else if (this.pausedByUi) this.resumeRun();
      else this.pauseRun();
    });

    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.pausedByUi) {
        dispatchUiState({ screen: 'blank' });
        this.scene.start('AttractScene');
      } else {
        this.pauseRun();
      }
    });
  }

  private handleResize(): void {
    this.backdrop.requestResize();
    if (this.bossBar) {
      this.bossBar.container.destroy();
      this.bossBar = undefined;
      const boss = this.enemies.find((enemy) => enemy.boss && enemy.sprite.active);
      if (boss) this.createBossBar(boss);
    }
  }

  private updateScreenPolish(time: number): void {
    if (!this.screenPolishFx || !this.powerupFieldFx) return;

    const width = this.scale.width;
    const height = this.scale.height;
    const compact = this.isCompactPlayfield();
    const reducedMotion = this.save.settings.reducedMotion;
    const boss = this.enemies.find((enemy) => enemy.boss && enemy.sprite.active);

    this.screenPolishFx.clear();
    this.screenPolishFx.setBlendMode(Phaser.BlendModes.NORMAL);
    this.drawEscapeWarnings(this.screenPolishFx, width, time, compact, reducedMotion);
    if (boss) this.drawBossPressureOverlay(this.screenPolishFx, width, height, boss, time, compact, reducedMotion);

    this.powerupFieldFx.clear();
    this.powerupFieldFx.setBlendMode(Phaser.BlendModes.ADD);
    this.drawActivePowerupField(this.powerupFieldFx, width, height, time, compact, reducedMotion);
  }

  // Ravens about to leave the left edge cost grade, so they get a pulsing
  // chevron on that edge at their altitude before they escape.
  private drawEscapeWarnings(
    graphics: Phaser.GameObjects.Graphics,
    width: number,
    time: number,
    compact: boolean,
    reducedMotion: boolean,
  ): void {
    if (this.stage.bonus) return;
    const zone = width * (compact ? 0.26 : 0.22);
    const pulse = reducedMotion ? 0.75 : 0.55 + Math.sin(time / 90) * 0.45;
    for (const actor of this.enemies) {
      if (!actor.gradeEligible || actor.boss || !actor.sprite.active) continue;
      const x = actor.sprite.x;
      if (x > zone || x < -140) continue;
      const danger = Phaser.Math.Clamp(1 - (x + 60) / (zone + 60), 0, 1);
      const y = Phaser.Math.Clamp(actor.sprite.y, 40, this.scale.height - 40);
      const size = (compact ? 10 : 14) + danger * 8;
      graphics.fillStyle(0xff214f, (0.25 + danger * 0.65) * pulse);
      graphics.fillTriangle(6, y, 6 + size, y - size, 6 + size, y + size);
      graphics.fillStyle(0xff214f, (0.12 + danger * 0.4) * pulse);
      graphics.fillTriangle(6 + size * 1.1, y, 6 + size * 2.1, y - size, 6 + size * 2.1, y + size);
      graphics.fillStyle(0xff214f, 0.05 + danger * 0.12);
      graphics.fillRect(0, y - size * 2.2, 4, size * 4.4);
    }
  }

  private drawBossPressureOverlay(
    graphics: Phaser.GameObjects.Graphics,
    width: number,
    height: number,
    boss: EnemyActor,
    time: number,
    compact: boolean,
    reducedMotion: boolean,
  ): void {
    const pulse = reducedMotion ? 0.65 : (Math.sin(time / 130) + 1) / 2;
    const border = compact ? 9 : 14;

    graphics.fillStyle(0xff214f, 0.035 + pulse * 0.035);
    graphics.fillRect(0, 0, width, border);
    graphics.fillRect(0, height - border, width, border);
    graphics.fillRect(0, 0, border, height);
    graphics.fillRect(width - border, 0, border, height);
    graphics.lineStyle(compact ? 2 : 3, 0xff214f, 0.22 + pulse * 0.24);
    graphics.strokeCircle(boss.sprite.x, boss.sprite.y, boss.visualRadius * (1.24 + pulse * 0.12));
    graphics.lineStyle(1, 0xffffff, 0.16);
    graphics.lineBetween(width, boss.sprite.y - boss.visualRadius * 0.8, Math.max(width * 0.62, boss.sprite.x), boss.sprite.y);
    graphics.lineBetween(width, boss.sprite.y + boss.visualRadius * 0.8, Math.max(width * 0.62, boss.sprite.x), boss.sprite.y);
  }

  // Active powerups tint the screen edges instead of covering the playfield,
  // so the effect reads at a glance without hiding ravens.
  private drawActivePowerupField(
    graphics: Phaser.GameObjects.Graphics,
    width: number,
    height: number,
    time: number,
    compact: boolean,
    reducedMotion: boolean,
  ): void {
    const pointer = this.input.activePointer;
    const pulse = reducedMotion ? 0.7 : 0.6 + Math.sin(time / 260) * 0.4;
    const edge = (color: number, strength: number) => {
      const layers = compact ? 3 : 5;
      for (let index = 0; index < layers; index++) {
        const inset = index * (compact ? 6 : 9);
        const size = compact ? 6 : 9;
        const alpha = strength * (1 - index / layers) * 0.16 * pulse;
        graphics.fillStyle(color, alpha);
        graphics.fillRect(0, inset, width, size);
        graphics.fillRect(0, height - inset - size, width, size);
        graphics.fillRect(inset, 0, size, height);
        graphics.fillRect(width - inset - size, 0, size, height);
      }
    };

    if (this.run.isPowerupActive('slowmo')) {
      edge(0x31f4ff, 1);
      if (!reducedMotion) {
        graphics.lineStyle(1, 0x31f4ff, 0.08);
        for (let y = (time * 0.02) % 36; y < height; y += 36) graphics.lineBetween(0, y, width, y);
      }
    }

    if (this.run.isPowerupActive('multishot') && this.pointerSeen) {
      const orbit = reducedMotion ? 0 : time / 180;
      graphics.lineStyle(2, 0xff8a32, 0.5);
      for (let index = 0; index < 6; index++) {
        const angle = orbit + (Math.PI * 2 * index) / 6;
        graphics.strokeCircle(pointer.x + Math.cos(angle) * 44, pointer.y + Math.sin(angle) * 44, 4);
      }
    }

    if (this.run.isPowerupActive('scoreBoost')) edge(0xffdf4d, 0.9);

    if (this.run.isPowerupActive('overdrive')) {
      edge(0xff5fbb, 0.9);
      if (!reducedMotion) {
        const slide = (time * 0.4) % 140;
        graphics.lineStyle(2, 0xff5fbb, compact ? 0.08 : 0.1);
        for (let x = -140 + slide; x < width + 140; x += 140) {
          graphics.lineBetween(x, height, x + 40, height - 60);
          graphics.lineBetween(x, 0, x + 40, 60);
        }
      }
    }

    if (this.run.isPowerupActive('coinRush')) edge(0xffd447, 0.8);
  }

  private createCrosshair(): void {
    this.crosshair = this.add.graphics();
    this.crosshair.setDepth(1000);
    this.input.setDefaultCursor('none');
  }

  // Reticle: rotating bracket ring in the gun color, a recharge arc, and a
  // lock-on state that snaps corner brackets around whatever the next shot
  // would hit. Hidden until the pointer has actually moved so it no longer
  // sits in the top-left corner at stage start.
  private updateCrosshair(delta = 16): void {
    const graphics = this.crosshair;
    graphics.clear();
    if (!this.pointerSeen || this.gameEnded) return;

    const pointer = this.input.activePointer;
    const x = pointer.x;
    const y = pointer.y;
    const now = this.time.now;
    const cooldownMs = Math.max(1, this.run?.weaponCooldownMs ?? this.weapon.cooldownMs);
    const cooldownProgress = Phaser.Math.Clamp(1 - Math.max(0, this.nextShotAt - now) / cooldownMs, 0, 1);
    const ready = cooldownProgress >= 1;
    const weaponColor = Phaser.Display.Color.HexStringToColor(this.weapon.color).color;
    const target = !this.pausedByUi && !this.stageTransition ? this.findLockTarget(x, y) : undefined;
    this.lockedActor = target;

    const lockGoal = target ? 1 : 0;
    this.reticleLock += (lockGoal - this.reticleLock) * Math.min(1, delta / 70);
    this.reticleKick = Math.max(0, this.reticleKick - delta / 140);
    this.reticleSpin += delta * (0.0012 + this.reticleLock * 0.004);

    const baseRadius = this.weaponCrosshairRadius + this.crosshairRadiusBonus * 0.25 + this.touchAimBonus * INPUT_TUNING.mobileCrosshairVisualBonus;
    const radius = baseRadius * (1 - this.reticleLock * 0.18) + this.reticleKick * 10;
    const lockColor = 0xff3b5c;
    const color = !ready ? 0x8a8fa8 : this.reticleLock > 0.5 ? lockColor : weaponColor;
    const alpha = ready ? 0.95 : 0.6;

    if (this.quality.tier !== 'low') {
      graphics.lineStyle(6, color, 0.12 * alpha);
      graphics.strokeCircle(x, y, radius);
    }

    graphics.lineStyle(2, color, alpha);
    for (let index = 0; index < 4; index++) {
      const start = this.reticleSpin + (Math.PI / 2) * index + 0.22;
      graphics.beginPath();
      graphics.arc(x, y, radius, start, start + Math.PI / 2 - 0.44);
      graphics.strokePath();
    }

    const tick = 7 + this.reticleLock * 3;
    for (let index = 0; index < 4; index++) {
      const angle = (Math.PI / 2) * index;
      const inner = radius - 3;
      graphics.lineBetween(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner, x + Math.cos(angle) * (inner + tick), y + Math.sin(angle) * (inner + tick));
    }

    if (!ready) {
      graphics.lineStyle(3, weaponColor, 0.9);
      graphics.beginPath();
      graphics.arc(x, y, radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cooldownProgress);
      graphics.strokePath();
    }

    if (this.weapon.id === 'scattergun') {
      graphics.lineStyle(1.5, color, alpha * 0.7);
      graphics.strokeCircle(x, y, this.weapon.spread * 0.42);
    } else if (this.weapon.id === 'burstRifle') {
      graphics.lineStyle(1.5, color, alpha * 0.8);
      graphics.strokeCircle(x - 14, y, 4);
      graphics.strokeCircle(x + 14, y, 4);
    } else if (this.weapon.id === 'arcLaser') {
      graphics.lineStyle(1, color, alpha * 0.45);
      graphics.lineBetween(x + radius + 10, y, this.scale.width, y);
      graphics.lineBetween(x - radius - 14, y, x - radius - 4, y);
    }

    graphics.fillStyle(color, ready ? 1 : 0.5);
    graphics.fillCircle(x, y, 2.4);

    if (target && this.reticleLock > 0.05) {
      const bx = target.sprite.x;
      const by = target.sprite.y;
      const half = target.visualRadius * (1.05 + (1 - this.reticleLock) * 0.6);
      const arm = Math.max(8, half * 0.38);
      graphics.lineStyle(2.5, lockColor, 0.9 * this.reticleLock);
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        const cx = bx + sx * half;
        const cy = by + sy * half * 0.78;
        graphics.lineBetween(cx, cy, cx - sx * arm, cy);
        graphics.lineBetween(cx, cy, cx, cy - sy * arm);
      }
    }
  }

  private findLockTarget(x: number, y: number): EnemyActor | undefined {
    const radius = this.weapon.radius + this.crosshairRadiusBonus + this.touchAimBonus * INPUT_TUNING.mobileHitRadiusBonus;
    let best: EnemyActor | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const actor of this.enemies) {
      if (!actor.sprite.active) continue;
      const distance = this.weapon.id === 'arcLaser'
        ? Math.abs(actor.sprite.y - y) + (actor.sprite.x < x - 90 ? 9999 : 0)
        : Phaser.Math.Distance.Between(x, y, actor.sprite.x, actor.sprite.y);
      if (distance <= actor.radius + radius && distance < bestDistance) {
        best = actor;
        bestDistance = distance;
      }
    }
    return best;
  }

  private maybeSpawnEnemy(delta: number): void {
    if (this.stageTransition || this.bossSpawned || this.stageEnemiesSpawned >= this.stage.targetKills) return;

    const enemyId = this.waveDirector.update(delta, this.stage);
    if (enemyId) {
      this.stageEnemiesSpawned++;
      this.run.recordStageSpawn(!this.stage.bonus);
      this.spawnEnemy(enemyId, undefined, undefined, 0, true, !this.stage.bonus);
    }
  }

  private spawnEnemy(enemyId: EnemyId, x = this.scale.width + 120, y?: number, splitDepth = 0, telegraph = true, gradeEligible = false): void {
    const def = ENEMIES[enemyId];
    const spawnY = y ?? Phaser.Math.Between(80, this.scale.height - 90);
    const sprite = this.acquireEnemySprite(x, spawnY, def.id);
    const visualScaleMultiplier = this.enemyVisualScaleMultiplier;
    const visualScale = (def.scale * visualScaleMultiplier) / ravenBakeScale(def.id);
    sprite.play({ key: ravenAnimKey(def.id), startFrame: Phaser.Math.Between(0, 5) });
    sprite.setScale(visualScale);
    sprite.setDepth(def.behavior === 'boss' ? 22 : 10);
    sprite.setFlipX(false);

    const actor: EnemyActor = {
      sprite,
      def,
      hp: def.health,
      velocityX: (0.14 + Math.random() * 0.08) * def.speed * this.stage.speedMultiplier,
      velocityY: Phaser.Math.FloatBetween(-0.11, 0.11) * def.speed,
      bornMs: this.time.now,
      nextSpitAtMs: undefined,
      radius: def.radius,
      visualRadius: def.radius * visualScaleMultiplier,
      visualScale,
      boss: def.behavior === 'boss',
      splitDepth,
      gradeEligible,
      punch: 0,
    };

    if (def.behavior === 'shield') {
      actor.shield = this.acquireShieldBubble(actor);
    }

    if (actor.boss) {
      actor.velocityX = 0.04;
      actor.velocityY = 0.08;
      actor.sprite.x = this.scale.width + 180;
      actor.sprite.y = this.clampBossY(this.scale.height * 0.35, actor);
      actor.nextSpitAtMs = this.time.now + BOSS_SPIT_FIRST_DELAY_MS;
      this.showStageBanner('Boss Warning', def.label, undefined, true);
      arcadeAudio.playBossWarning();
      arcadeAudio.startMusic('boss', this.save.settings, this.stage.id);
      this.shakeCamera(450, 0.008);
      this.playBossEntryFx(actor);
      this.createBossBar(actor);
    } else if (telegraph) {
      this.playEnemySpawnTelegraph(actor);
    }

    this.enemies.push(actor);
  }

  private acquireShieldBubble(actor: EnemyActor): Phaser.GameObjects.Image {
    const bubble = this.shieldPool.pop() ?? this.add.image(0, 0, FX.hex);
    bubble.setActive(true).setVisible(true);
    bubble.setTint(0x58ff9c);
    bubble.setBlendMode(Phaser.BlendModes.ADD);
    bubble.setAlpha(0.7);
    bubble.setDepth(actor.sprite.depth + 1);
    bubble.setScale((actor.visualRadius * 2.3) / 256);
    bubble.setPosition(actor.sprite.x, actor.sprite.y);
    return bubble;
  }

  private releaseShieldBubble(actor: EnemyActor): void {
    const bubble = actor.shield;
    if (!bubble) return;
    actor.shield = undefined;
    this.tweens.killTweensOf(bubble);
    bubble.setActive(false).setVisible(false);
    if (this.shieldPool.length < 12) this.shieldPool.push(bubble);
    else bubble.destroy();
  }

  private updateEnemies(time: number, delta: number): void {
    const slow = this.run.isPowerupActive('slowmo') ? 0.42 : 1;
    const punchDecay = Math.pow(0.8, delta / 16.67);

    for (const actor of this.enemies) {
      const t = (time - actor.bornMs) / 1000;

      actor.sprite.x -= actor.velocityX * delta * slow;
      actor.sprite.y += actor.velocityY * delta * slow;

      if (actor.def.behavior === 'zigzag') {
        actor.sprite.y += Math.sin(t * 6) * 0.6 * delta * slow;
      }

      if (actor.def.behavior === 'dive') {
        actor.sprite.y += Math.sin(t * 3.4) * 1.2 * delta * slow;
        actor.sprite.angle = Math.sin(t * 5) * 12;
      }

      if (actor.def.behavior === 'wraith') {
        actor.sprite.y += Math.sin(t * 7.2) * 0.78 * delta * slow;
        actor.sprite.alpha = 0.52 + Math.sin(t * 8) * 0.28;
      }

      let breathe = 1;
      if (actor.def.behavior === 'brute') breathe = 1 + Math.sin(t * 4) * 0.045;
      if (actor.boss) breathe = 1 + Math.sin(t * 2.6) * 0.02;
      actor.punch *= punchDecay;
      actor.sprite.setScale(
        actor.visualScale * breathe * (1 + actor.punch * 0.24),
        actor.visualScale * breathe * (1 - actor.punch * 0.16),
      );

      if (actor.def.behavior !== 'dive' && !actor.boss) {
        const tilt = Phaser.Math.Clamp(actor.velocityY * 70, -11, 11);
        actor.sprite.angle += (tilt - actor.sprite.angle) * Math.min(1, delta / 140);
      }

      if (actor.boss) {
        actor.sprite.x = Math.max(this.scale.width - 260, actor.sprite.x);
        actor.sprite.y += Math.sin(t * 2) * 0.5 * delta;
        this.constrainBossToArena(actor);
        this.updateBossSpit(actor, time);
      }

      if (!actor.boss && (actor.sprite.y < 50 || actor.sprite.y > this.scale.height - 50)) {
        actor.velocityY *= -1;
      }

      if (actor.shield) {
        actor.shield.setPosition(actor.sprite.x - actor.visualRadius * 0.08, actor.sprite.y);
        actor.shield.rotation += delta * 0.0009;
        actor.shield.setAlpha(0.45 + Math.sin(time / 180) * 0.12 + actor.punch * 0.5);
      }

      if (!actor.boss && actor.sprite.x < -160) {
        const escapeY = Phaser.Math.Clamp(actor.sprite.y, 60, this.scale.height - 60);
        this.destroyEnemyActor(actor);
        if (this.stage.bonus) {
          this.floatText(96, escapeY, 'BONUS LOST', '#ffe56a', 24);
          arcadeAudio.playMiss();
        } else {
          const escapeResult = this.run.recordEnemyEscaped(actor.gradeEligible);
          const shielded = escapeResult === 'shielded';
          const label = shielded ? 'GRADE SHIELD' : 'ESCAPED';
          const color = shielded ? '#9dff57' : '#ff315a';
          this.floatText(104, escapeY, label, color, 28, true);
          this.fx.flash(0, escapeY, shielded ? 0x9dff57 : 0xff214f, 300, 320);
          this.cabinet?.flashScreen(shielded ? 0x9dff57 : 0xff214f, shielded ? 0.06 : 0.12);
          if (shielded) arcadeAudio.playPowerup('extraLife');
          else arcadeAudio.playEscape();
          this.shakeCamera(shielded ? 120 : 250, shielded ? 0.004 : 0.01);
        }
        continue;
      }

      this.drawHealthBar(actor);
    }

    this.enemies = this.enemies.filter((actor) => actor.sprite.active);
  }

  private constrainBossToArena(actor: EnemyActor): void {
    const minY = this.bossMinY(actor);
    const maxY = this.bossMaxY(actor);
    const clampedY = Phaser.Math.Clamp(actor.sprite.y, minY, maxY);

    if (clampedY !== actor.sprite.y) {
      actor.sprite.y = clampedY;
      actor.velocityY = Math.abs(actor.velocityY) * (clampedY === minY ? 1 : -1);
    }
  }

  private updateBossSpit(actor: EnemyActor, time: number): void {
    if (this.stageTransition || this.gameEnded || !actor.sprite.active) return;
    if (time < (actor.nextSpitAtMs ?? 0)) return;

    actor.nextSpitAtMs = time + this.nextBossSpitDelay();

    const activeBossMinions = this.enemies.filter((enemy) => enemy.def.id === 'mini' && enemy.splitDepth >= 2 && enemy.sprite.active).length;
    if (activeBossMinions >= this.bossSpitMinionLimit) return;

    this.spitMiniRaven(actor, activeBossMinions);
  }

  private spitMiniRaven(actor: EnemyActor, activeBossMinions: number): void {
    const mouth = this.bossMouthPosition(actor);
    const count = activeBossMinions <= 1 && actor.hp <= actor.def.health * 0.42 && !this.isCompactPlayfield() ? 2 : 1;

    this.playBossSpitWarning(actor, mouth.x, mouth.y);

    for (let index = 0; index < count; index++) {
      const minionY = Phaser.Math.Clamp(
        mouth.y + (count === 1 ? 0 : index === 0 ? -26 : 26),
        BOSS_MOUTH_SAFE_PADDING,
        this.scale.height - BOSS_MOUTH_SAFE_PADDING,
      );
      const minionX = Phaser.Math.Clamp(mouth.x - index * 14, 116, this.scale.width - 108);
      this.spawnEnemy('mini', minionX, minionY, 2, false, false);
      const minion = this.enemies[this.enemies.length - 1];
      if (minion?.def.id === 'mini') {
        minion.velocityX = (0.19 + index * 0.025) * minion.def.speed * this.stage.speedMultiplier;
        minion.velocityY = Phaser.Math.FloatBetween(-0.045, 0.045) * minion.def.speed;
        minion.sprite.setDepth(24);
        minion.sprite.setAlpha(0.96);
      }
    }
  }

  private bossMouthPosition(actor: EnemyActor): { x: number; y: number } {
    const x = Phaser.Math.Clamp(actor.sprite.x - actor.visualRadius * 0.72, 116, this.scale.width - 108);
    const y = Phaser.Math.Clamp(actor.sprite.y + actor.visualRadius * 0.08, BOSS_MOUTH_SAFE_PADDING, this.scale.height - BOSS_MOUTH_SAFE_PADDING);
    return { x, y };
  }

  private nextBossSpitDelay(): number {
    const compactMultiplier = this.isCompactPlayfield() ? 1.18 : 1;
    const lowHealthMultiplier = this.enemies.some((enemy) => enemy.boss && enemy.hp <= enemy.def.health * 0.42) ? 0.78 : 1;
    return (
      (BOSS_SPIT_INTERVAL_MS + Phaser.Math.Between(-BOSS_SPIT_INTERVAL_VARIANCE_MS, BOSS_SPIT_INTERVAL_VARIANCE_MS)) *
      compactMultiplier *
      lowHealthMultiplier
    );
  }

  private get bossSpitMinionLimit(): number {
    return this.isCompactPlayfield() ? Math.max(2, BOSS_SPIT_MINION_LIMIT - 1) : BOSS_SPIT_MINION_LIMIT;
  }

  private updatePowerups(time: number, delta: number): void {
    for (const powerup of this.powerups) {
      const age = time - powerup.bornMs;
      powerup.container.y += delta * POWERUP_TUNING.fallSpeedPerMs;
      powerup.container.x += Math.sin(age / 200) * POWERUP_TUNING.bobSpeedPerMs * delta;
      powerup.container.angle = Math.sin(age / 260) * 10;
      powerup.glow.rotation += delta * POWERUP_TUNING.rotationSpeedPerMs;
      powerup.glow.setAlpha(0.6 + Math.sin(age / 120) * 0.25);

      if (powerup.container.y > this.scale.height + 50) {
        this.releasePowerup(powerup);
      }
    }

    this.powerups = this.powerups.filter((powerup) => powerup.container.active);
  }

  private fireWeapon(x: number, y: number, now: number): void {
    if (now < this.nextShotAt) {
      this.showCooldownFeedback(x, y, now);
      return;
    }

    this.nextShotAt = now + this.run.weaponCooldownMs;
    this.run.recordShot();
    this.reticleKick = 1;
    const weaponColor = Phaser.Display.Color.HexStringToColor(this.weapon.color).color;
    arcadeAudio.playShot(this.weapon.id, this.panFor(x));
    this.drawMuzzleFlash(x, y);
    this.fx.flash(x, y, weaponColor, this.weapon.id === 'scattergun' ? 130 : 90, 120);
    this.cabinet?.kick(this.weapon.id === 'scattergun' ? 0.12 : 0.05);
    const probes = this.createShotProbes(x, y);
    this.drawWeaponTraces(x, y, probes);

    const powerupHit = this.collectPowerupAt(x, y);
    const hitActors = this.resolveWeaponHits(x, y, probes);

    if (this.run.isPowerupActive('multishot') && hitActors.length > 0) {
      const anchor = hitActors[0].sprite;
      const chained: EnemyActor[] = [];
      for (const actor of this.enemies) {
        const distance = Phaser.Math.Distance.Between(anchor.x, anchor.y, actor.sprite.x, actor.sprite.y);
        if (!hitActors.includes(actor) && distance < POWERUP_TUNING.multishotChainRadius) {
          hitActors.push(actor);
          chained.push(actor);
        }
      }
      this.drawChainTraces(anchor.x, anchor.y, chained);
    }

    if (hitActors.length === 0 && !powerupHit) {
      this.run.recordMiss();
      arcadeAudio.playMiss(this.panFor(x));
      this.floatText(x, y - 26, 'MISS', '#ff315a', 18, true);
      this.playMissFeedback(x, y);
      this.fx.smoke(x, y, { count: 3, color: 0x9a8fb8, scale: [0.22, 0.36], scaleEnd: 1.8, alpha: 0.32 });
      this.shakeCamera(60, 0.002);
      return;
    }

    for (const actor of hitActors) {
      this.damageEnemy(actor, this.weapon.damage);
      this.run.recordHit();
    }
  }

  private resolveWeaponHits(x: number, y: number, probes: Array<{ x: number; y: number }>): EnemyActor[] {
    const hitActors: EnemyActor[] = [];
    const radius = this.weapon.radius + this.crosshairRadiusBonus + this.touchAimBonus * INPUT_TUNING.mobileHitRadiusBonus;

    if (this.weapon.id === 'arcLaser') {
      return this.enemies
        .filter((actor) => Math.abs(actor.sprite.y - y) <= actor.radius + radius && actor.sprite.x >= x - 90)
        .sort((a, b) => a.sprite.x - b.sprite.x)
        .slice(0, this.weapon.pierce);
    }

    for (const probe of probes) {
      const candidates = this.enemies
        .filter((actor) => Phaser.Math.Distance.Between(probe.x, probe.y, actor.sprite.x, actor.sprite.y) <= actor.radius + radius)
        .sort((a, b) => Phaser.Math.Distance.Between(probe.x, probe.y, a.sprite.x, a.sprite.y) - Phaser.Math.Distance.Between(probe.x, probe.y, b.sprite.x, b.sprite.y));

      for (const actor of candidates.slice(0, 1)) {
        if (!hitActors.includes(actor)) hitActors.push(actor);
      }
    }

    return hitActors;
  }

  private createShotProbes(x: number, y: number): Array<{ x: number; y: number }> {
    if (this.weapon.pellets <= 1) return [{ x, y }];

    if (this.weapon.id === 'burstRifle') {
      return [
        { x: x - this.weapon.spread * 0.45, y: y - 8 },
        { x, y },
        { x: x + this.weapon.spread * 0.45, y: y + 8 },
      ];
    }

    const probes: Array<{ x: number; y: number }> = [];
    for (let index = 0; index < this.weapon.pellets; index++) {
      const angle = (Math.PI * 2 * index) / this.weapon.pellets + Math.random() * 0.24;
      const distance = Phaser.Math.FloatBetween(this.weapon.spread * 0.18, this.weapon.spread);
      probes.push({
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
      });
    }
    probes.push({ x, y });
    return probes;
  }

  private damageEnemy(actor: EnemyActor, damage: number): void {
    actor.hp -= damage;
    const pan = this.panFor(actor.sprite.x);
    arcadeAudio.playHit(actor.def.id, pan);
    this.playWeaponImpact(actor);
    actor.punch = 1;
    actor.sprite.setTintFill(0xffffff);
    this.time.delayedCall(60, () => {
      if (!actor.sprite.active) return;
      actor.sprite.clearTint();
    });

    if (actor.hp > 0) {
      const x = actor.sprite.x;
      const y = actor.sprite.y;
      this.floatText(x, y - actor.visualRadius, 'HIT', '#ffe56a', 18, true);
      this.playEnemyWoundedFeedback(actor);

      if (actor.shield) {
        this.fx.shards(x, y, { count: 12, color: [0x58ff9c, 0xb7ffd6, 0xffffff], speed: [160, 380], angle: [0, 360] });
        this.fx.ring(x, y, 0x58ff9c, actor.visualRadius * 2.4, 300);
        arcadeAudio.playShieldBreak(pan);
        this.releaseShieldBubble(actor);
      } else if (actor.def.behavior === 'armored' || actor.def.behavior === 'brute') {
        this.fx.shards(x, y, { count: 5, color: [0xd8e2ef, 0x9aa6ba, 0xffb35c], speed: [120, 300] });
      }

      if (actor.boss) {
        if (this.bossBar) this.bossBar.shake = 1;
        this.hitStop(32);
        this.cabinet?.kick(0.16);
      } else if (actor.def.behavior === 'armored' || actor.def.behavior === 'brute') {
        this.hitStop(24);
      }
      this.shakeCamera(80, 0.004);
      return;
    }

    this.killEnemy(actor);
  }

  private killEnemy(actor: EnemyActor): void {
    const points = this.run.killEnemy(actor.def, actor.gradeEligible);
    const x = actor.sprite.x;
    const y = actor.sprite.y;
    const radius = actor.radius;
    const bossKilled = actor.boss;
    const earnedCoins = actor.def.coinValue * (this.run.isPowerupActive('coinRush') ? 2 : 1);
    const color = actor.def.tint ?? this.stage.palette.neon;
    const combo = this.run.comboMultiplier;
    const pan = this.panFor(x);

    this.floatScore(x, y - actor.visualRadius * 0.8, points, color, combo);
    this.playScoreBurst(x, y, actor, points);
    this.playEnemyDefeatSignature(actor, x, y);
    const isBonusStage = this.stage.bonus === true;
    if (earnedCoins > 1 || isBonusStage) {
      this.floatText(x + Math.min(72, radius), y + radius * 0.32, `+${earnedCoins} COIN`, '#ffd447', 17, true);
      this.playCoinBurst(x, y, earnedCoins, isBonusStage);
      arcadeAudio.playCoin(pan);
    }
    this.createExplosion(x, y, actor.def.scale, color);
    this.fx.flash(x, y, color, actor.visualRadius * 3.6, 220);
    this.fx.flash(x, y, 0xffffff, actor.visualRadius * 1.5, 120);
    this.fx.ring(x, y, color, actor.visualRadius * 2.6, 380);
    this.fx.embers(x, y, { count: actor.boss ? 40 : 12, color: [color, 0xffffff, 0xffe56a] });
    this.createFeathers(x, y, color, actor.boss ? 44 : 14);
    if (actor.def.behavior === 'armored' || actor.def.behavior === 'brute') {
      this.fx.shards(x, y, { count: 10, color: [0xd8e2ef, 0x9aa6ba, 0xffffff], speed: [180, 460] });
    }
    if (actor.def.id === 'golden') {
      this.fx.glints(x, y, { count: 14, color: [0xffe9a0, 0xffffff], speed: [60, 220] });
      this.fx.flare(x, y, 0xffd447, actor.visualRadius * 7, 320);
    }
    this.spawnCorpse(actor);
    this.shakeCamera(actor.boss ? 650 : 160, actor.boss ? 0.018 : 0.006);
    this.cabinet?.kick(actor.boss ? 1 : 0.16 + Math.min(combo, 6) * 0.03);

    if (actor.def.id === 'golden') this.hitStop(110);
    else if (actor.def.behavior === 'armored' || actor.def.behavior === 'brute') this.hitStop(55);
    else if (combo >= 4) this.hitStop(18);

    if (actor.def.behavior === 'splitter' && actor.splitDepth < 1) {
      this.spawnEnemy('mini', x + 34, y - 36, actor.splitDepth + 1, false, false);
      this.spawnEnemy('mini', x + 34, y + 36, actor.splitDepth + 1, false, false);
    }

    arcadeAudio.playEnemyDestroyed(actor.def.id, combo, pan);

    if (Math.random() < (actor.boss ? POWERUP_TUNING.bossDropChance : POWERUP_TUNING.dropChance)) {
      this.spawnPowerup(x, y);
    }

    this.destroyEnemyActor(actor);

    if (bossKilled) {
      this.bossKills++;
      this.bossDefeated = true;
      arcadeAudio.playBossDefeated();
      this.playBossDefeatSetPiece(x, y);
      this.hitStop(280);
      this.dismissBossBar();
    }
  }

  private collectPowerupAt(x: number, y: number): boolean {
    const collectRadius = POWERUP_TUNING.collectRadius + this.touchAimBonus * POWERUP_TUNING.mobileCollectRadiusBonus;
    const powerup = this.powerups.find((item) => item.container.active && Phaser.Math.Distance.Between(x, y, item.container.x, item.container.y) < collectRadius);
    if (!powerup) return false;

    if (powerup.id === 'extraLife') {
      this.run.addGradeShield();
    } else {
      this.run.activatePowerup(powerup.id);
    }

    const color = powerupColor(powerup.id);
    this.floatText(powerup.container.x, powerup.container.y - 34, powerup.label.toUpperCase(), '#9dff57', 22);
    this.playPowerupCollectEffect(powerup);
    this.fx.flash(powerup.container.x, powerup.container.y, color, 220, 260);
    this.fx.ring(powerup.container.x, powerup.container.y, color, 160, 420);
    this.fx.glints(powerup.container.x, powerup.container.y, { count: 12, color: [color, 0xffffff], speed: [80, 240] });
    this.cabinet?.flashScreen(color, 0.08);
    arcadeAudio.playPowerup(powerup.id);
    this.releasePowerup(powerup);
    return true;
  }

  private spawnPowerup(x: number, y: number): void {
    const id = Phaser.Math.RND.pick<PowerupId>(['slowmo', 'multishot', 'scoreBoost', 'extraLife', 'overdrive', 'coinRush']);
    const label = powerupLabel(id);
    const color = powerupColor(id);
    const powerup = this.acquirePowerup(x, y, id, label, color);
    this.tweens.add({
      targets: powerup.container,
      scale: 1.12,
      duration: 260,
      yoyo: true,
      repeat: -1,
    });
    this.playPowerupSpawnEffect(x, y, color);

    this.powerups.push(powerup);
  }

  private acquirePowerup(x: number, y: number, id: PowerupId, label: string, color: number): PowerupActor {
    const powerup = this.powerupPool.pop() ?? this.createPowerupActor();
    powerup.id = id;
    powerup.label = label;
    powerup.bornMs = this.time.now;
    powerup.body.setFillStyle(color, 0.95);
    powerup.glow.setTint(color);
    powerup.glyph.setText(powerupGlyph(id));
    powerup.container.setPosition(x, y);
    powerup.container.setRotation(0);
    powerup.container.setScale(1);
    powerup.container.setAlpha(1);
    powerup.container.setDepth(50);
    powerup.container.setActive(true);
    powerup.container.setVisible(true);
    return powerup;
  }

  private createPowerupActor(): PowerupActor {
    const glow = this.add.image(0, 0, FX.glow).setBlendMode(Phaser.BlendModes.ADD).setScale(1.05);
    const body = this.add.circle(0, 0, 21, 0xffffff, 0.95).setStrokeStyle(3, 0xffffff, 0.95);
    const glyph = this.add.text(0, 1, '', {
      fontFamily: DISPLAY_FONT,
      fontSize: '17px',
      color: '#08101c',
    });
    glyph.setOrigin(0.5);

    const container = this.add.container(0, 0, [glow, body, glyph]);
    container.setDepth(50);
    container.setActive(false);
    container.setVisible(false);
    return { id: 'slowmo', label: powerupLabel('slowmo'), container, body, glow, glyph, bornMs: 0 };
  }

  private releasePowerup(powerup: PowerupActor): void {
    this.tweens.killTweensOf(powerup.container);
    powerup.container.setActive(false);
    powerup.container.setVisible(false);
    if (this.powerupPool.length < POWERUP_POOL_LIMIT) {
      this.powerupPool.push(powerup);
    } else {
      powerup.container.destroy();
    }
  }

  private checkStageFlow(): void {
    if (this.stageTransition || this.gameEnded) return;
    if (this.stageEnemiesSpawned < this.stage.targetKills) return;

    const bossActive = this.enemies.some((enemy) => enemy.boss);
    const fieldClear = this.isStageFieldClear();

    if (this.stage.boss && !this.bossSpawned && !this.bossDefeated && fieldClear) {
      this.bossSpawned = true;
      this.spawnEnemy(this.stage.boss, undefined, undefined, 0, true, false);
      return;
    }

    if (this.stage.boss && (!this.bossDefeated || bossActive)) return;

    if (fieldClear) {
      this.clearStage();
    }
  }

  private isStageFieldClear(): boolean {
    return this.enemies.length === 0 && this.powerups.length === 0;
  }

  private clearStage(): void {
    if (this.stageTransition || this.gameEnded) return;

    this.stageTransition = true;
    const clearedStageIndex = this.run.stageIndex;
    const currentStage = this.stage;
    const nextStage = getStage(clearedStageIndex);
    const stageGrade = this.run.completeStage(this.stage.id, this.stage.bonus === true);
    const rewardCoins = this.stage.bonus
      ? this.stage.rewardCoins
      : calculateGradeAdjustedStageReward(this.stage.rewardCoins, stageGrade.starCount);
    this.run.coinsEarned += rewardCoins;
    arcadeAudio.playStageClear(this.run.stageIndex);
    this.floatText(this.scale.width / 2, this.scale.height * 0.38, `STAGE CLEAR +${rewardCoins}`, '#ffe56a', 36);
    this.playStageClearSweep(currentStage);
    if (this.stage.bonus) {
      this.playJackpotStageClear();
    } else {
      this.playStageRewardBurst(this.scale.width / 2, this.scale.height * 0.42, this.stage.palette.neon);
    }
    if (!this.save.settings.reducedMotion) this.cameras.main.flash(220, 255, 225, 106, false);
    this.fx.flare(this.scale.width / 2, this.scale.height * 0.4, this.stage.palette.neon, this.scale.width * 1.2, 520);
    arcadeAudio.setIntensity(0);

    this.completedStageSummary = {
      snapshot: this.run.snapshot(this.stage.title, this.stage.bonus === true),
      currentStage,
      nextStage,
      rewardCoins,
      baseRewardCoins: currentStage.rewardCoins,
      newEnemyLabels: getNewEnemyLabelsForStage(clearedStageIndex),
      nextStageIsBonus: nextStage.bonus === true,
    };

    this.time.delayedCall(900, () => {
      if (this.gameEnded || !this.completedStageSummary) return;
      this.pausedByUi = true;
      dispatchUiState({ screen: 'stage-clear', summary: this.completedStageSummary });
    });
  }

  private continueToNextStage(): void {
    if (!this.stageTransition || !this.completedStageSummary || this.gameEnded) return;

    const nextStage = this.completedStageSummary.nextStage;
    this.stage = nextStage;
    this.run.startStage(this.run.stageIndex + 1, nextStage.id, nextStage.targetKills);
    this.stageStartBossKills = this.bossKills;
    this.waveDirector.reset();
    this.stageEnemiesSpawned = 0;
    this.bossSpawned = false;
    this.bossDefeated = false;
    this.stageTransition = false;
    this.pausedByUi = false;
    this.completedStageSummary = undefined;
    this.clearActorsForStageAdvance();
    this.backdrop.setTheme(this.stage.id);
    arcadeAudio.startMusic('run', this.save.settings, this.stage.id);
    arcadeAudio.setIntensity(1);
    this.lastComboTier = this.run.comboMultiplier;
    this.renderHud();
    this.showStageBanner(this.stage.bonus ? 'Bonus Stage' : this.stage.title, this.stage.subtitle, this.run.stageIndex);
    this.playStageIntroFx(this.stage);
    if (this.stage.bonus) this.playJackpotIntro();
  }

  private retryCurrentStage(): void {
    if (!this.stageTransition || !this.completedStageSummary || this.gameEnded) return;

    const currentStage = this.completedStageSummary.currentStage;
    this.stage = currentStage;
    this.run.retryStage();
    this.bossKills = this.stageStartBossKills;
    this.waveDirector.reset();
    this.stageEnemiesSpawned = 0;
    this.bossSpawned = false;
    this.bossDefeated = false;
    this.stageTransition = false;
    this.pausedByUi = false;
    this.completedStageSummary = undefined;
    this.nextShotAt = 0;
    this.clearActorsForStageAdvance();
    this.backdrop.setTheme(this.stage.id);
    arcadeAudio.startMusic('run', this.save.settings, this.stage.id);
    arcadeAudio.setIntensity(1);
    this.lastComboTier = this.run.comboMultiplier;
    this.renderHud();
    this.showStageBanner('Retry Stage', `${this.stage.title} / chase a better grade`, this.run.stageIndex);
    this.playStageIntroFx(this.stage);
    if (this.stage.bonus) this.playJackpotIntro();
  }

  private clearActorsForStageAdvance(): void {
    for (const enemy of this.enemies) this.destroyEnemyActor(enemy);
    this.enemies = [];
    for (const powerup of this.powerups) this.releasePowerup(powerup);
    this.powerups = [];
    for (const corpse of this.corpses) this.releaseCorpse(corpse.sprite);
    this.corpses = [];
    this.hitStopMs = 0;
    this.dismissBossBar(true);
  }

  private pauseRun(): void {
    if (this.gameEnded || this.pausedByUi || this.stageTransition) return;
    this.pausedByUi = true;
    dispatchUiState({
      screen: 'pause',
      snapshot: this.run.snapshot(this.stage.title, this.stage.bonus === true),
      stage: this.stage,
    });
  }

  private resumeRun(): void {
    if (this.gameEnded) return;
    this.pausedByUi = false;
    this.renderHud();
  }

  private endRun(): void {
    if (this.gameEnded) return;

    this.gameEnded = true;
    this.input.setDefaultCursor('auto');
    const snapshot = this.run.snapshot(this.stage.title, this.stage.bonus === true);
    const rewards: RunRewards = calculateRunRewards(this.save, snapshot, this.bossKills);
    this.save = applyRunRewards(this.save, snapshot, rewards);
    arcadeAudio.stopMusic();
    arcadeAudio.playStageClear(snapshot.stageIndex);
    this.playRunSummarySequence(() => {
      dispatchUiState({
        screen: 'gameover',
        snapshot,
        rewards,
        save: this.save,
      });
    });
  }

  private renderHud(): void {
    dispatchUiState({
      screen: 'hud',
      snapshot: this.run.snapshot(this.stage.title, this.stage.bonus === true),
      stage: this.stage,
      weapon: WEAPONS.find((item) => item.id === this.save.selectedWeapon) ?? WEAPONS[0],
      crosshair: CROSSHAIRS.find((item) => item.id === this.save.selectedCrosshair) ?? CROSSHAIRS[0],
    });
  }

  // Stage title card: kicker, big display title with neon glow and a light
  // sweep, then the subtitle. Boss warnings get hazard styling instead.
  private showStageBanner(title: string, subtitle: string, stageNumber?: number, warning = false): void {
    const width = this.scale.width;
    const compact = this.isCompactPlayfield();
    const reducedMotion = this.save.settings.reducedMotion;
    const accentColor = warning ? 0xff315a : this.stage.palette.neon;
    const accent = Phaser.Display.Color.IntegerToColor(accentColor).rgba;
    const titleSize = Math.round(Phaser.Math.Clamp(width * 0.052, 28, 64));
    const banner = this.add.container(width / 2, this.scale.height * (compact ? 0.34 : 0.3));
    banner.setDepth(200);

    const plate = this.add.graphics();
    const plateHeight = titleSize * 2.3;
    plate.fillStyle(0x05030a, 0.55);
    plate.fillRect(-width / 2, -plateHeight * 0.52, width, plateHeight);
    plate.lineStyle(2, accentColor, 0.7);
    plate.lineBetween(-width / 2, -plateHeight * 0.52, width / 2, -plateHeight * 0.52);
    plate.lineBetween(-width / 2, plateHeight * 0.48, width / 2, plateHeight * 0.48);
    if (warning) {
      plate.fillStyle(0xff214f, 0.8);
      for (let x = -width / 2; x < width / 2; x += 36) {
        plate.fillTriangle(x, -plateHeight * 0.52, x + 18, -plateHeight * 0.52, x + 8, -plateHeight * 0.52 - 10);
        plate.fillTriangle(x, plateHeight * 0.48, x + 18, plateHeight * 0.48, x + 8, plateHeight * 0.48 + 10);
      }
    }

    const kickerText = warning ? '!! WARNING !!' : stageNumber ? `STAGE ${stageNumber}` : '';
    const kicker = this.add.text(0, -titleSize * 0.95, kickerText, {
      fontFamily: UI_FONT,
      fontStyle: '700',
      fontSize: `${Math.round(titleSize * 0.32)}px`,
      color: warning ? '#ff315a' : '#ffe56a',
      letterSpacing: 6,
    });
    kicker.setOrigin(0.5);

    const titleText = this.add.text(0, 0, title.toUpperCase(), {
      fontFamily: DISPLAY_FONT,
      fontSize: `${titleSize}px`,
      color: '#ffffff',
      stroke: warning ? '#3a0010' : '#090510',
      strokeThickness: Math.max(4, titleSize * 0.12),
      align: 'center',
    });
    titleText.setOrigin(0.5);
    titleText.setShadow(0, 0, accent, titleSize * 0.4, true, true);

    const subtitleText = this.add.text(0, titleSize * 0.82, subtitle, {
      fontFamily: UI_FONT,
      fontStyle: '700',
      fontSize: `${Math.round(Phaser.Math.Clamp(titleSize * 0.34, 13, 20))}px`,
      color: warning ? '#ffb3c0' : '#ffe56a',
      align: 'center',
    });
    subtitleText.setOrigin(0.5);

    banner.add([plate, kicker, titleText, subtitleText]);
    this.fx.flare(width / 2, banner.y, warning ? 0xff214f : this.stage.palette.neon, width * 0.9, 600);

    if (reducedMotion) {
      banner.setAlpha(1);
    } else {
      banner.setAlpha(0);
      titleText.setScale(1.6, 0.4);
      this.tweens.add({ targets: banner, alpha: 1, duration: 140 });
      this.tweens.add({ targets: titleText, scaleX: 1, scaleY: 1, duration: 420, ease: 'Back.easeOut' });
      kicker.setX(-40);
      this.tweens.add({ targets: kicker, x: 0, duration: 380, ease: 'Cubic.easeOut' });
    }

    this.tweens.add({
      targets: banner,
      y: banner.y - 20,
      alpha: 0,
      ease: 'Quad.easeIn',
      duration: 600,
      delay: warning ? 1500 : 1300,
      onComplete: () => banner.destroy(),
    });
  }

  private drawHealthBar(actor: EnemyActor): void {
    if (!actor.sprite.active || actor.hp <= 0 || actor.boss) {
      actor.healthBar?.destroy();
      actor.healthBar = undefined;
      return;
    }

    if (actor.hp >= actor.def.health) return;
    if (!actor.healthBar) {
      actor.healthBar = this.add.graphics().setDepth(40);
    }

    // Segmented pips read faster than a thin bar at a glance.
    const pips = actor.def.health;
    const pipWidth = Phaser.Math.Clamp((actor.visualRadius * 1.5) / pips, 6, 16);
    const gap = 3;
    const total = pips * pipWidth + (pips - 1) * gap;
    const x = actor.sprite.x - total / 2;
    const y = actor.sprite.y - actor.visualRadius - 14;
    const color = actor.def.tint ?? 0x9dff57;

    actor.healthBar.clear();
    actor.healthBar.fillStyle(0x050711, 0.75);
    actor.healthBar.fillRoundedRect(x - 3, y - 3, total + 6, 12, 4);
    for (let index = 0; index < pips; index++) {
      const filled = index < actor.hp;
      actor.healthBar.fillStyle(filled ? color : 0x2a2438, filled ? 1 : 0.9);
      actor.healthBar.fillRect(x + index * (pipWidth + gap), y, pipWidth, 6);
    }
  }

  private destroyEnemyActor(actor: EnemyActor): void {
    actor.healthBar?.destroy();
    actor.healthBar = undefined;
    this.releaseShieldBubble(actor);
    if (this.lockedActor === actor) this.lockedActor = undefined;
    this.releaseEnemySprite(actor.sprite);
  }

  private acquireEnemySprite(x: number, y: number, enemyId: EnemyId): Phaser.GameObjects.Sprite {
    const key = ravenTextureKey(enemyId);
    const sprite = this.enemySpritePool.pop() ?? this.add.sprite(0, 0, key, 0);
    sprite.setTexture(key, 0);
    sprite.setPosition(x, y);
    sprite.setActive(true);
    sprite.setVisible(true);
    sprite.clearTint();
    sprite.setBlendMode(Phaser.BlendModes.NORMAL);
    sprite.setAlpha(1);
    sprite.setAngle(0);
    sprite.setScale(1);
    sprite.setFlipX(false);
    return sprite;
  }

  private releaseEnemySprite(sprite: Phaser.GameObjects.Sprite): void {
    this.tweens.killTweensOf(sprite);
    sprite.stop();
    sprite.clearTint();
    sprite.setBlendMode(Phaser.BlendModes.NORMAL);
    sprite.setActive(false);
    sprite.setVisible(false);
    if (this.enemySpritePool.length < ENEMY_SPRITE_POOL_LIMIT) {
      this.enemySpritePool.push(sprite);
    } else {
      sprite.destroy();
    }
  }

  private createExplosion(x: number, y: number, scale: number, color = 0xffffff): void {
    const explosion = this.acquireExplosion(x, y);
    const tint = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(color),
      Phaser.Display.Color.ValueToColor(0xffffff),
      100,
      45,
    );
    explosion.setTint(Phaser.Display.Color.GetColor(tint.r, tint.g, tint.b));
    explosion.setScale(Math.max(0.55, scale * 1.1) * (0.9 + Math.random() * 0.25));
    explosion.setAngle(Math.random() * 360);
    explosion.setDepth(60);
    explosion.play('boom-pop');
    this.sound.play(AUDIO_KEYS.boom, { volume: 0.16 * this.save.settings.sfxVolume, rate: 0.85 + Math.random() * 0.3 });
    explosion.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.releaseExplosion(explosion));
  }

  private acquireExplosion(x: number, y: number): Phaser.GameObjects.Sprite {
    const explosion = this.explosionPool.pop() ?? this.add.sprite(0, 0, SPRITE_KEYS.explosion);
    explosion.setPosition(x, y);
    explosion.setActive(true);
    explosion.setVisible(true);
    explosion.setAlpha(1);
    explosion.setAngle(0);
    explosion.clearTint();
    return explosion;
  }

  private releaseExplosion(explosion: Phaser.GameObjects.Sprite): void {
    explosion.stop();
    explosion.setActive(false);
    explosion.setVisible(false);
    if (this.explosionPool.length < EXPLOSION_POOL_LIMIT) {
      this.explosionPool.push(explosion);
    } else {
      explosion.destroy();
    }
  }

  private playScoreBurst(x: number, y: number, actor: EnemyActor, points: number): void {
    const color = actor.def.tint ?? this.stage.palette.neon;
    const combo = this.run.comboMultiplier;
    const radius = Math.max(28, actor.radius * (actor.boss ? 0.86 : 0.64));
    const ring = this.acquireTransientGraphics(76);
    const spokes = actor.boss ? 18 : Math.min(14, 6 + combo);

    ring.setPosition(x, y);
    ring.lineStyle(actor.boss ? 5 : 3, color, 0.88);
    ring.strokeCircle(0, 0, radius);
    ring.lineStyle(1, 0xffffff, 0.58);
    ring.strokeCircle(0, 0, radius * 0.58);

    for (let index = 0; index < spokes; index++) {
      const angle = (Math.PI * 2 * index) / spokes;
      const inner = radius * 0.72;
      const outer = radius * 1.22;
      ring.lineBetween(Math.cos(angle) * inner, Math.sin(angle) * inner, Math.cos(angle) * outer, Math.sin(angle) * outer);
    }

    if (this.stage.bonus) {
      ring.lineStyle(2, 0xffd447, 0.72);
      ring.strokeRoundedRect(-radius * 1.04, -radius * 0.52, radius * 2.08, radius * 1.04, 8);
    }

    this.tweens.add({
      targets: ring,
      alpha: 0,
      scale: actor.boss ? 1.65 : 1.35,
      duration: this.save.settings.reducedMotion ? 140 : 320,
      ease: 'Quad.easeOut',
      onComplete: () => this.releaseTransientGraphics(ring),
    });

    const sparkCount = actor.boss ? 36 : Math.min(22, 8 + combo + Math.floor(points / 90));
    this.emitSparkBurst(x, y, color, sparkCount, 78, actor.boss ? 180 : 118);

    if (combo >= 3) {
      this.floatText(x, y + radius * 0.55, `x${combo} CHAIN`, '#20f2ff', 18 + Math.min(combo, 10));
      if (combo >= 4) this.playComboSurge(x, y, combo, color);
    }
  }

  private playComboSurge(x: number, y: number, combo: number, color: number): void {
    const surge = this.acquireTransientGraphics(78);
    const radius = 42 + Math.min(combo, 8) * 8;
    surge.setPosition(x, y);
    surge.setBlendMode(Phaser.BlendModes.ADD);
    surge.lineStyle(3, 0x20f2ff, 0.72);
    surge.strokeCircle(0, 0, radius);
    surge.lineStyle(2, color, 0.48);
    surge.strokeCircle(0, 0, radius * 0.62);
    for (let index = 0; index < Math.min(16, combo * 2); index++) {
      const angle = (Math.PI * 2 * index) / Math.min(16, combo * 2);
      surge.lineBetween(
        Math.cos(angle) * radius * 0.82,
        Math.sin(angle) * radius * 0.82,
        Math.cos(angle) * radius * 1.12,
        Math.sin(angle) * radius * 1.12,
      );
    }

    this.tweens.add({
      targets: surge,
      alpha: 0,
      scale: this.save.settings.reducedMotion ? 1.05 : 1.35,
      duration: this.save.settings.reducedMotion ? 120 : 280,
      ease: 'Quad.easeOut',
      onComplete: () => this.releaseTransientGraphics(surge),
    });
  }

  private playCoinBurst(x: number, y: number, coins: number, jackpot: boolean): void {
    const burstCount = Math.min(jackpot ? 34 : 18, 6 + coins * 3);
    const ring = this.acquireTransientGraphics(77);

    ring.setPosition(x, y);
    ring.lineStyle(jackpot ? 4 : 2, 0xffd447, 0.86);
    ring.strokeCircle(0, 0, jackpot ? 54 : 34);
    ring.lineStyle(1, 0xffffff, 0.45);
    for (let index = 0; index < 8; index++) {
      const angle = (Math.PI * 2 * index) / 8;
      ring.strokeCircle(Math.cos(angle) * 31, Math.sin(angle) * 31, 7);
    }

    this.tweens.add({
      targets: ring,
      alpha: 0,
      scale: jackpot ? 1.9 : 1.45,
      duration: this.save.settings.reducedMotion ? 160 : 360,
      ease: 'Cubic.easeOut',
      onComplete: () => this.releaseTransientGraphics(ring),
    });

    this.emitSparkBurst(x, y, 0xffd447, burstCount, 79, jackpot ? 168 : 100, true);
  }

  private playStageIntroFx(stage: StageDefinition): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const compact = this.isCompactPlayfield();
    const reducedMotion = this.save.settings.reducedMotion;
    const intro = this.acquireTransientGraphics(63);
    const centerY = height * 0.42;

    intro.setBlendMode(Phaser.BlendModes.ADD);
    intro.fillStyle(stage.palette.neon, stage.bonus ? 0.12 : 0.07);
    intro.fillRect(0, centerY - 54, width, 108);
    intro.lineStyle(stage.bonus ? 5 : 3, stage.palette.neon, 0.58);
    intro.lineBetween(0, centerY - 54, width, centerY - 88);
    intro.lineBetween(0, centerY + 54, width, centerY + 88);
    intro.lineStyle(1, 0xffffff, 0.22);
    for (let index = 0; index < (compact ? 8 : 14); index++) {
      const x = (width * index) / Math.max(1, (compact ? 7 : 13));
      intro.strokeCircle(x, centerY + (index % 2 === 0 ? -62 : 62), stage.bonus ? 9 : 6);
    }

    if (!reducedMotion) {
      this.emitSparkBurst(width * 0.5, centerY, stage.palette.neon, stage.bonus ? 26 : 16, 64, compact ? 110 : 180, stage.bonus);
    }

    this.tweens.add({
      targets: intro,
      alpha: 0,
      scaleY: reducedMotion ? 1 : 1.22,
      duration: reducedMotion ? 220 : 620,
      ease: 'Quad.easeOut',
      onComplete: () => this.releaseTransientGraphics(intro),
    });
  }

  private playStageClearSweep(stage: StageDefinition): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const clear = this.acquireTransientGraphics(81);

    clear.setBlendMode(Phaser.BlendModes.ADD);
    clear.fillStyle(stage.palette.neon, stage.bonus ? 0.15 : 0.08);
    clear.fillRect(0, 0, width, height);
    clear.lineStyle(stage.bonus ? 6 : 4, stage.palette.neon, 0.62);
    clear.lineBetween(-80, height * 0.35, width + 80, height * 0.19);
    clear.lineBetween(-80, height * 0.62, width + 80, height * 0.78);
    clear.lineStyle(2, 0xffffff, 0.38);
    clear.strokeCircle(width * 0.5, height * 0.42, stage.bonus ? 128 : 92);
    clear.strokeCircle(width * 0.5, height * 0.42, stage.bonus ? 168 : 126);

    this.tweens.add({
      targets: clear,
      alpha: 0,
      scale: this.save.settings.reducedMotion ? 1 : 1.08,
      duration: this.save.settings.reducedMotion ? 220 : 560,
      ease: 'Quad.easeOut',
      onComplete: () => this.releaseTransientGraphics(clear),
    });
  }

  private playStageRewardBurst(x: number, y: number, color: number): void {
    const burst = this.acquireTransientGraphics(82);
    burst.setPosition(x, y);
    burst.lineStyle(4, color, 0.72);
    burst.strokeCircle(0, 0, 84);
    burst.lineStyle(2, 0xffe56a, 0.65);
    burst.strokeCircle(0, 0, 118);
    this.tweens.add({
      targets: burst,
      alpha: 0,
      scale: 1.35,
      duration: this.save.settings.reducedMotion ? 180 : 420,
      ease: 'Quad.easeOut',
      onComplete: () => this.releaseTransientGraphics(burst),
    });
    this.emitSparkBurst(x, y, color, 28, 83, 180);
  }

  private playJackpotIntro(): void {
    const x = this.scale.width / 2;
    const y = this.scale.height * 0.46;
    const marquee = this.acquireTransientGraphics(84);

    marquee.setPosition(x, y);
    marquee.fillStyle(0xffd447, 0.12);
    marquee.fillRoundedRect(-180, -54, 360, 108, 16);
    marquee.lineStyle(4, 0xffd447, 0.82);
    marquee.strokeRoundedRect(-180, -54, 360, 108, 16);
    marquee.lineStyle(2, 0xffffff, 0.58);
    for (let index = 0; index < 10; index++) {
      marquee.strokeCircle(-150 + index * 33, -36, 6);
      marquee.strokeCircle(-150 + index * 33, 36, 6);
    }

    this.floatText(x, y - 8, 'JACKPOT READY', '#ffd447', 36);
    this.emitSparkBurst(x, y, 0xffd447, 32, 85, 220, true);
    this.tweens.add({
      targets: marquee,
      alpha: 0,
      scale: 1.12,
      duration: this.save.settings.reducedMotion ? 220 : 620,
      ease: 'Quad.easeOut',
      onComplete: () => this.releaseTransientGraphics(marquee),
    });
  }

  private playJackpotStageClear(): void {
    const x = this.scale.width / 2;
    const y = this.scale.height * 0.4;
    const width = this.scale.width;
    const jackpot = this.acquireTransientGraphics(86);

    jackpot.setPosition(0, 0);
    jackpot.fillStyle(0xffd447, 0.12);
    jackpot.fillRect(0, 0, width, this.scale.height);
    jackpot.lineStyle(5, 0xffd447, 0.72);
    jackpot.lineBetween(0, y - 82, width, y - 122);
    jackpot.lineBetween(0, y + 82, width, y + 122);
    jackpot.lineStyle(2, 0xffffff, 0.5);
    for (let index = 0; index < 16; index++) {
      const coinX = (width * index) / 15;
      jackpot.strokeCircle(coinX, y - 102 + (index % 2) * 28, 10);
      jackpot.strokeCircle(coinX, y + 102 - (index % 2) * 28, 10);
    }

    this.floatText(x, y - 10, 'JACKPOT BANKED', '#ffd447', 40);
    this.emitSparkBurst(x, y, 0xffd447, 44, 87, 260, true);
    this.emitSparkBurst(width * 0.18, y + 42, 0xff7a1f, 22, 87, 180, true);
    this.emitSparkBurst(width * 0.82, y - 42, 0xff7a1f, 22, 87, 180, true);
    this.tweens.add({
      targets: jackpot,
      alpha: 0,
      duration: this.save.settings.reducedMotion ? 220 : 680,
      ease: 'Quad.easeOut',
      onComplete: () => this.releaseTransientGraphics(jackpot),
    });
  }

  private playMissFeedback(x: number, y: number): void {
    const miss = this.acquireTransientGraphics(72);
    miss.setPosition(x, y);
    miss.lineStyle(3, 0xff315a, 0.66);
    miss.strokeCircle(0, 0, this.weaponCrosshairRadius + 8);
    miss.lineBetween(-14, -14, 14, 14);
    miss.lineBetween(-14, 14, 14, -14);
    this.tweens.add({
      targets: miss,
      alpha: 0,
      scale: this.save.settings.reducedMotion ? 0.9 : 1.32,
      duration: this.save.settings.reducedMotion ? 90 : 210,
      ease: 'Quad.easeOut',
      onComplete: () => this.releaseTransientGraphics(miss),
    });
  }

  private playEnemySpawnTelegraph(actor: EnemyActor): void {
    const width = this.scale.width;
    const y = actor.sprite.y;
    const color = actor.def.tint ?? this.stage.palette.neon;
    const compact = this.isCompactPlayfield();
    const reducedMotion = this.save.settings.reducedMotion;
    const telegraph = this.acquireTransientGraphics(66);
    const strength = actor.def.id === 'normal' ? 0.34 : 0.58;
    const laneLength = compact ? 86 : 132;

    telegraph.setBlendMode(Phaser.BlendModes.ADD);
    telegraph.lineStyle(actor.def.id === 'normal' ? 2 : 3, color, strength);
    telegraph.lineBetween(width - 4, y, width - laneLength, y);
    telegraph.lineStyle(1, 0xffffff, strength * 0.52);
    telegraph.lineBetween(width - 18, y - 12, width - laneLength * 0.56, y - 12);
    telegraph.lineBetween(width - 18, y + 12, width - laneLength * 0.56, y + 12);

    switch (actor.def.behavior) {
      case 'zigzag':
        for (let index = 0; index < 3; index++) {
          const x = width - laneLength + index * 34;
          telegraph.lineBetween(x, y - 18, x + 18, y + 18);
          telegraph.lineBetween(x + 18, y + 18, x + 36, y - 18);
        }
        break;
      case 'shield':
        this.drawHexRing(telegraph, compact ? 18 : 24, width - laneLength * 0.38, y);
        break;
      case 'armored':
      case 'brute':
        telegraph.strokeRoundedRect(width - laneLength * 0.62, y - 20, compact ? 38 : 52, 40, 8);
        telegraph.lineBetween(width - laneLength * 0.58, y - 20, width - laneLength * 0.42, y + 20);
        break;
      case 'splitter':
        telegraph.lineBetween(width - laneLength * 0.58, y - 24, width - laneLength * 0.28, y + 24);
        telegraph.lineBetween(width - laneLength * 0.58, y + 24, width - laneLength * 0.28, y - 24);
        break;
      case 'dive':
        telegraph.lineBetween(width - laneLength * 0.68, y - 30, width - laneLength * 0.36, y);
        telegraph.lineBetween(width - laneLength * 0.36, y, width - laneLength * 0.68, y + 30);
        break;
      case 'wraith':
        telegraph.strokeCircle(width - laneLength * 0.42, y - 8, compact ? 18 : 24);
        telegraph.strokeCircle(width - laneLength * 0.54, y + 10, compact ? 13 : 18);
        break;
      case 'mini':
        telegraph.strokeCircle(width - laneLength * 0.42, y, compact ? 10 : 14);
        telegraph.strokeCircle(width - laneLength * 0.32, y - 8, compact ? 8 : 11);
        break;
      default:
        if (actor.def.id === 'golden') {
          telegraph.strokeRoundedRect(width - laneLength * 0.64, y - 20, compact ? 52 : 68, 40, 8);
          telegraph.strokeCircle(width - laneLength * 0.42, y, compact ? 12 : 16);
        } else {
          telegraph.strokeCircle(width - laneLength * 0.36, y, compact ? 13 : 18);
        }
    }

    this.tweens.add({
      targets: telegraph,
      alpha: 0,
      scaleX: reducedMotion ? 1 : 0.72,
      duration: reducedMotion ? 140 : 320,
      ease: 'Quad.easeOut',
      onComplete: () => this.releaseTransientGraphics(telegraph),
    });
  }

  private playWeaponImpact(actor: EnemyActor): void {
    const x = actor.sprite.x;
    const y = actor.sprite.y;
    const color = Phaser.Display.Color.HexStringToColor(this.weapon.color).color;
    const enemyColor = actor.def.tint ?? this.stage.palette.neon;
    const radius = Math.max(16, actor.visualRadius * 0.55);
    const impact = this.acquireTransientGraphics(actor.boss ? 89 : 74);

    impact.setPosition(x, y);
    impact.setBlendMode(Phaser.BlendModes.ADD);

    if (this.weapon.id === 'arcLaser') {
      impact.lineStyle(actor.boss ? 7 : 5, color, 0.76);
      impact.lineBetween(-radius * 1.4, 0, radius * 1.4, 0);
      impact.lineStyle(2, 0xffffff, 0.62);
      impact.lineBetween(-radius * 1.2, -8, radius * 1.2, -8);
      impact.lineBetween(-radius * 1.2, 8, radius * 1.2, 8);
      impact.strokeRect(-radius * 0.78, -radius * 0.22, radius * 1.56, radius * 0.44);
    } else if (this.weapon.id === 'scattergun') {
      impact.lineStyle(2, color, 0.68);
      for (let index = 0; index < 7; index++) {
        const angle = -0.9 + index * 0.3;
        impact.lineBetween(0, 0, Math.cos(angle) * radius * 1.15, Math.sin(angle) * radius * 1.15);
        impact.strokeCircle(Math.cos(angle) * radius * 0.66, Math.sin(angle) * radius * 0.66, 4);
      }
      impact.lineStyle(2, 0xffffff, 0.42);
      impact.strokeCircle(0, 0, radius * 0.62);
    } else if (this.weapon.id === 'burstRifle') {
      impact.lineStyle(2, color, 0.72);
      for (let index = -1; index <= 1; index++) {
        impact.strokeCircle(index * radius * 0.34, index * 4, radius * 0.3);
        impact.lineBetween(index * radius * 0.2, -radius * 0.44, index * radius * 0.44, radius * 0.44);
      }
    } else {
      impact.lineStyle(3, color, 0.76);
      impact.strokeCircle(0, 0, radius * 0.7);
      impact.lineBetween(-radius, 0, radius, 0);
      impact.lineBetween(0, -radius, 0, radius);
    }

    if (actor.def.behavior === 'shield') {
      impact.lineStyle(3, 0x58ff9c, 0.72);
      this.drawHexRing(impact, radius * 1.05);
    } else if (actor.def.behavior === 'armored' || actor.def.behavior === 'brute') {
      impact.lineStyle(actor.def.behavior === 'brute' ? 4 : 3, 0xd8e2ef, 0.72);
      impact.strokeRoundedRect(-radius * 0.72, -radius * 0.38, radius * 1.44, radius * 0.76, 6);
      impact.lineBetween(-radius * 0.4, -radius * 0.38, radius * 0.18, radius * 0.38);
      impact.lineBetween(radius * 0.12, -radius * 0.38, radius * 0.46, radius * 0.28);
    } else if (actor.def.behavior === 'wraith') {
      impact.lineStyle(2, 0xb58cff, 0.58);
      impact.strokeCircle(-radius * 0.28, -radius * 0.18, radius * 0.72);
      impact.strokeCircle(radius * 0.24, radius * 0.16, radius * 0.92);
    } else if (actor.boss) {
      impact.lineStyle(4, 0xff214f, 0.72);
      impact.strokeCircle(0, 0, radius * 1.18);
      impact.strokeCircle(0, 0, radius * 0.78);
      impact.lineStyle(2, 0xffffff, 0.42);
      impact.lineBetween(-radius * 0.42, -radius * 1.02, 0, -radius * 1.32);
      impact.lineBetween(0, -radius * 1.32, radius * 0.42, -radius * 1.02);
    }

    this.emitSparkBurst(x, y, enemyColor, actor.boss ? 18 : 7, actor.boss ? 90 : 75, actor.boss ? 108 : 52);
    this.tweens.add({
      targets: impact,
      alpha: 0,
      scale: actor.boss ? 1.16 : 1.28,
      duration: this.save.settings.reducedMotion ? 110 : 250,
      ease: 'Quad.easeOut',
      onComplete: () => this.releaseTransientGraphics(impact),
    });
  }

  private playEnemyWoundedFeedback(actor: EnemyActor): void {
    const x = actor.sprite.x;
    const y = actor.sprite.y;
    const radius = Math.max(18, actor.visualRadius * 0.7);
    const wounded = this.acquireTransientGraphics(actor.boss ? 88 : 73);
    const color = actor.def.tint ?? this.stage.palette.neon;

    wounded.setPosition(x, y);
    wounded.setBlendMode(Phaser.BlendModes.ADD);
    wounded.lineStyle(actor.boss ? 4 : 3, color, 0.56);

    switch (actor.def.behavior) {
      case 'shield':
        this.drawHexRing(wounded, radius);
        wounded.lineStyle(2, 0xffffff, 0.36);
        this.drawHexRing(wounded, radius * 0.72);
        break;
      case 'armored':
      case 'brute':
        wounded.strokeRoundedRect(-radius * 0.8, -radius * 0.45, radius * 1.6, radius * 0.9, 8);
        wounded.lineBetween(-radius * 0.46, -radius * 0.45, radius * 0.18, radius * 0.42);
        wounded.lineBetween(radius * 0.1, -radius * 0.44, radius * 0.62, radius * 0.32);
        break;
      case 'wraith':
        wounded.strokeCircle(-radius * 0.32, -radius * 0.18, radius * 0.86);
        wounded.strokeCircle(radius * 0.32, radius * 0.18, radius * 1.08);
        break;
      case 'boss':
        wounded.strokeCircle(0, 0, radius * 1.05);
        wounded.lineStyle(2, 0xffffff, 0.32);
        for (let index = 0; index < 10; index++) {
          const angle = (Math.PI * 2 * index) / 10;
          wounded.lineBetween(Math.cos(angle) * radius * 0.72, Math.sin(angle) * radius * 0.72, Math.cos(angle) * radius * 1.18, Math.sin(angle) * radius * 1.18);
        }
        break;
      default:
        wounded.strokeCircle(0, 0, radius);
    }

    this.tweens.add({
      targets: wounded,
      alpha: 0,
      scale: this.save.settings.reducedMotion ? 1 : 1.24,
      duration: this.save.settings.reducedMotion ? 100 : 240,
      ease: 'Quad.easeOut',
      onComplete: () => this.releaseTransientGraphics(wounded),
    });
  }

  private playEnemyDefeatSignature(actor: EnemyActor, x: number, y: number): void {
    const color = actor.def.tint ?? this.stage.palette.neon;
    const radius = Math.max(24, actor.visualRadius * 0.82);
    const defeat = this.acquireTransientGraphics(actor.boss ? 91 : 76);

    defeat.setPosition(x, y);
    defeat.setBlendMode(Phaser.BlendModes.ADD);
    defeat.lineStyle(actor.boss ? 5 : 3, color, 0.72);

    if (actor.def.id === 'golden') {
      defeat.lineStyle(4, 0xffd447, 0.78);
      defeat.strokeCircle(0, 0, radius);
      defeat.strokeRoundedRect(-radius, -radius * 0.52, radius * 2, radius * 1.04, 10);
      this.emitSparkBurst(x, y, 0xffd447, 18, 80, 122, true);
    } else {
      switch (actor.def.behavior) {
        case 'shield':
          this.drawHexRing(defeat, radius * 1.08);
          defeat.lineStyle(2, 0xffffff, 0.44);
          for (let index = 0; index < 6; index++) {
            const angle = (Math.PI * 2 * index) / 6;
            defeat.lineBetween(0, 0, Math.cos(angle) * radius * 1.28, Math.sin(angle) * radius * 1.28);
          }
          break;
        case 'splitter':
          defeat.lineStyle(4, 0xff6a3d, 0.78);
          defeat.lineBetween(-radius, -radius * 0.52, radius, radius * 0.52);
          defeat.lineBetween(-radius, radius * 0.52, radius, -radius * 0.52);
          defeat.strokeCircle(0, 0, radius * 0.84);
          break;
        case 'wraith':
          defeat.lineStyle(3, 0xb58cff, 0.62);
          defeat.strokeCircle(0, 0, radius * 1.22);
          defeat.strokeCircle(-radius * 0.3, 0, radius * 0.82);
          defeat.strokeCircle(radius * 0.3, 0, radius * 0.82);
          break;
        case 'brute':
        case 'armored':
          defeat.lineStyle(4, actor.def.behavior === 'brute' ? 0xffb35c : 0xd8e2ef, 0.74);
          for (let index = 0; index < 10; index++) {
            const angle = (Math.PI * 2 * index) / 10;
            defeat.lineBetween(Math.cos(angle) * radius * 0.45, Math.sin(angle) * radius * 0.45, Math.cos(angle) * radius * 1.34, Math.sin(angle) * radius * 1.34);
          }
          break;
        case 'boss':
          defeat.lineStyle(6, 0xff214f, 0.78);
          defeat.strokeCircle(0, 0, radius * 1.28);
          defeat.lineStyle(3, 0xffffff, 0.46);
          this.drawCrownBurst(defeat, radius);
          break;
        default:
          defeat.strokeCircle(0, 0, radius);
          defeat.lineStyle(2, 0xffffff, 0.4);
          defeat.strokeCircle(0, 0, radius * 0.56);
      }
    }

    this.tweens.add({
      targets: defeat,
      alpha: 0,
      scale: actor.boss ? 1.36 : 1.42,
      duration: this.save.settings.reducedMotion ? 140 : 340,
      ease: 'Cubic.easeOut',
      onComplete: () => this.releaseTransientGraphics(defeat),
    });
  }

  private playBossEntryFx(actor: EnemyActor): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const warning = this.acquireTransientGraphics(92);
    const y = actor.sprite.y;

    warning.setBlendMode(Phaser.BlendModes.ADD);
    warning.fillStyle(0xff214f, 0.12);
    warning.fillRect(0, 0, width, height);
    warning.lineStyle(6, 0xff214f, 0.78);
    warning.lineBetween(0, y - actor.visualRadius * 1.1, width, y - actor.visualRadius * 1.1);
    warning.lineBetween(0, y + actor.visualRadius * 1.1, width, y + actor.visualRadius * 1.1);
    warning.lineStyle(3, 0xffffff, 0.48);
    warning.strokeCircle(actor.sprite.x, y, actor.visualRadius * 1.28);
    this.drawCrownBurst(warning, actor.visualRadius, actor.sprite.x, y - actor.visualRadius * 0.15);
    this.emitSparkBurst(width * 0.5, y, 0xff214f, 28, 93, width * 0.26);

    this.tweens.add({
      targets: warning,
      alpha: 0,
      scaleY: this.save.settings.reducedMotion ? 1 : 1.16,
      duration: this.save.settings.reducedMotion ? 260 : 820,
      ease: 'Quad.easeOut',
      onComplete: () => this.releaseTransientGraphics(warning),
    });
  }

  private playBossSpitWarning(actor: EnemyActor, x: number, y: number): void {
    const warning = this.acquireTransientGraphics(94);
    const compact = this.isCompactPlayfield();
    const radius = Math.max(22, actor.visualRadius * (compact ? 0.22 : 0.28));

    warning.setPosition(x, y);
    warning.setBlendMode(Phaser.BlendModes.ADD);
    warning.fillStyle(0xff214f, 0.18);
    warning.fillCircle(0, 0, radius * 0.72);
    warning.lineStyle(4, 0xff214f, 0.78);
    warning.strokeCircle(0, 0, radius);
    warning.lineStyle(2, 0xffffff, 0.48);
    warning.lineBetween(-radius * 0.9, -radius * 0.32, radius * 1.1, 0);
    warning.lineBetween(-radius * 0.9, radius * 0.32, radius * 1.1, 0);
    warning.lineStyle(2, 0xffd447, 0.44);
    warning.lineBetween(0, 0, -radius * 1.7, -radius * 0.56);
    warning.lineBetween(0, 0, -radius * 1.7, radius * 0.56);
    this.emitSparkBurst(x, y, 0xff214f, compact ? 6 : 10, 94, compact ? 44 : 68);

    this.tweens.add({
      targets: warning,
      alpha: 0,
      scale: this.save.settings.reducedMotion ? 1 : 1.38,
      duration: this.save.settings.reducedMotion ? 120 : 260,
      ease: 'Quad.easeOut',
      onComplete: () => this.releaseTransientGraphics(warning),
    });
  }

  private playBossDefeatSetPiece(x: number, y: number): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const defeat = this.acquireTransientGraphics(95);

    defeat.setBlendMode(Phaser.BlendModes.ADD);
    defeat.fillStyle(0xff214f, 0.18);
    defeat.fillRect(0, 0, width, height);
    defeat.lineStyle(7, 0xff214f, 0.78);
    defeat.strokeCircle(x, y, 120);
    defeat.strokeCircle(x, y, 174);
    defeat.lineStyle(3, 0xffffff, 0.5);
    this.drawCrownBurst(defeat, 104, x, y - 16);
    defeat.lineStyle(3, this.stage.palette.neon, 0.44);
    defeat.lineBetween(0, y - 132, width, y - 184);
    defeat.lineBetween(0, y + 132, width, y + 184);

    if (!this.save.settings.reducedMotion) {
      this.cameras.main.flash(360, 255, 33, 79, false);
      this.shakeCamera(760, 0.02);
    }
    this.emitSparkBurst(x, y, 0xff214f, 48, 96, 280);
    this.emitSparkBurst(x, y, this.stage.palette.neon, 30, 96, 220);
    this.floatText(x, y - 134, 'RAVEN KING DOWN', '#ff315a', 34);

    this.tweens.add({
      targets: defeat,
      alpha: 0,
      scale: this.save.settings.reducedMotion ? 1 : 1.08,
      duration: this.save.settings.reducedMotion ? 280 : 860,
      ease: 'Quad.easeOut',
      onComplete: () => this.releaseTransientGraphics(defeat),
    });
  }

  private playPowerupSpawnEffect(x: number, y: number, color: number): void {
    const spawn = this.acquireTransientGraphics(69);
    spawn.setPosition(x, y);
    spawn.setBlendMode(Phaser.BlendModes.ADD);
    spawn.lineStyle(3, color, 0.64);
    spawn.strokeCircle(0, 0, 34);
    spawn.lineStyle(1, 0xffffff, 0.42);
    spawn.strokeCircle(0, 0, 48);
    this.tweens.add({
      targets: spawn,
      alpha: 0,
      scale: this.save.settings.reducedMotion ? 1 : 1.36,
      duration: this.save.settings.reducedMotion ? 120 : 300,
      ease: 'Quad.easeOut',
      onComplete: () => this.releaseTransientGraphics(spawn),
    });
  }

  private playPowerupCollectEffect(powerup: PowerupActor): void {
    const x = powerup.container.x;
    const y = powerup.container.y;
    const color = powerupColor(powerup.id);
    const collect = this.acquireTransientGraphics(79);

    collect.setPosition(x, y);
    collect.setBlendMode(Phaser.BlendModes.ADD);
    collect.lineStyle(4, color, 0.72);
    collect.strokeCircle(0, 0, 38);

    switch (powerup.id) {
      case 'slowmo':
        collect.lineStyle(2, 0x31f4ff, 0.68);
        collect.strokeCircle(0, 0, 58);
        collect.lineBetween(0, 0, 0, -44);
        collect.lineBetween(0, 0, 28, 20);
        break;
      case 'multishot':
        collect.lineStyle(3, 0xff8a32, 0.72);
        for (let index = 0; index < 8; index++) {
          const angle = (Math.PI * 2 * index) / 8;
          collect.lineBetween(Math.cos(angle) * 20, Math.sin(angle) * 20, Math.cos(angle) * 66, Math.sin(angle) * 66);
        }
        break;
      case 'scoreBoost':
      case 'coinRush':
        collect.lineStyle(3, 0xffd447, 0.78);
        collect.strokeRoundedRect(-42, -25, 84, 50, 10);
        collect.strokeCircle(-18, 0, 8);
        collect.strokeCircle(18, 0, 8);
        this.emitSparkBurst(x, y, 0xffd447, 20, 80, 118, true);
        break;
      case 'extraLife':
        collect.lineStyle(5, 0x9dff57, 0.78);
        collect.strokeRoundedRect(-28, -34, 56, 68, 10);
        collect.lineBetween(-20, -2, -4, 16);
        collect.lineBetween(-4, 16, 24, -18);
        break;
      case 'overdrive':
        collect.lineStyle(3, 0xff5fbb, 0.78);
        collect.lineBetween(-46, -26, -8, -6);
        collect.lineBetween(-8, -6, -30, 12);
        collect.lineBetween(-30, 12, 44, 30);
        collect.lineBetween(6, -34, 24, -6);
        collect.lineBetween(24, -6, 2, 10);
        break;
    }

    this.emitSparkBurst(x, y, color, 14, 80, 92, powerup.id === 'coinRush' || powerup.id === 'scoreBoost');
    this.tweens.add({
      targets: collect,
      alpha: 0,
      scale: this.save.settings.reducedMotion ? 1.05 : 1.48,
      duration: this.save.settings.reducedMotion ? 130 : 320,
      ease: 'Quad.easeOut',
      onComplete: () => this.releaseTransientGraphics(collect),
    });
  }

  private drawHexRing(graphics: Phaser.GameObjects.Graphics, radius: number, x = 0, y = 0): void {
    for (let index = 0; index < 6; index++) {
      const start = (Math.PI * 2 * index) / 6 - Math.PI / 6;
      const end = (Math.PI * 2 * (index + 1)) / 6 - Math.PI / 6;
      graphics.lineBetween(x + Math.cos(start) * radius, y + Math.sin(start) * radius, x + Math.cos(end) * radius, y + Math.sin(end) * radius);
    }
  }

  private drawCrownBurst(graphics: Phaser.GameObjects.Graphics, radius: number, x = 0, y = 0): void {
    graphics.lineBetween(x - radius * 0.78, y - radius * 0.28, x - radius * 0.42, y - radius * 0.84);
    graphics.lineBetween(x - radius * 0.42, y - radius * 0.84, x, y - radius * 0.42);
    graphics.lineBetween(x, y - radius * 0.42, x + radius * 0.42, y - radius * 0.84);
    graphics.lineBetween(x + radius * 0.42, y - radius * 0.84, x + radius * 0.78, y - radius * 0.28);
    graphics.lineBetween(x - radius * 0.78, y - radius * 0.28, x + radius * 0.78, y - radius * 0.28);
  }

  // Legacy call sites all funnel through here; the particle system scales the
  // count by quality tier so phones and reduced-motion stay light.
  private emitSparkBurst(
    x: number,
    y: number,
    color: number,
    count: number,
    _depth: number,
    spread: number,
    coinLike = false,
  ): void {
    if (coinLike) {
      this.fx.coins(x, y, Math.max(2, Math.round(count / 3)));
      this.fx.glints(x, y, { count: Math.max(3, Math.round(count / 3)), color: [color, 0xffffff], speed: [spread * 0.5, spread * 1.6] });
      return;
    }
    this.fx.sparks(x, y, { count, color: [color, color, 0xffffff], speed: [spread * 1.2, spread * 3.4] });
  }

  private createFeathers(x: number, y: number, color: number, count: number): void {
    const cap = this.save.settings.reducedMotion
      ? PRESENTATION_TUNING.reducedMotionFeatherCap
      : this.isCompactPlayfield()
        ? PRESENTATION_TUNING.mobileFeatherCap
        : PRESENTATION_TUNING.desktopFeatherCap;
    const dark = Phaser.Display.Color.ValueToColor(color).darken(45).color;
    this.fx.feathers(x, y, { count: Math.min(count, cap), color: [color, dark, 0x241a3a, 0x3a2f55] });
  }

  private drawMuzzleFlash(x: number, y: number): void {
    const color = Phaser.Display.Color.HexStringToColor(this.weapon.color).color;
    const flash = this.acquireTransientGraphics(70);
    flash.setPosition(x, y);
    flash.setBlendMode(Phaser.BlendModes.ADD);
    flash.fillStyle(color, 0.82);
    flash.fillCircle(0, 0, this.weapon.id === 'scattergun' ? 14 : 10);
    flash.lineStyle(2, 0xffffff, 0.44);
    flash.strokeCircle(0, 0, this.weaponCrosshairRadius * 0.82);

    if (this.weapon.id === 'arcLaser') {
      flash.fillStyle(color, 0.5);
      flash.fillRect(-74, -5, 148, 10);
      flash.lineStyle(2, 0xffffff, 0.46);
      flash.lineBetween(-88, 0, 88, 0);
    } else if (this.weapon.id === 'scattergun') {
      flash.lineStyle(3, color, 0.62);
      for (let index = 0; index < 7; index++) {
        const angle = -0.9 + index * 0.3;
        flash.lineBetween(0, 0, Math.cos(angle) * 72, Math.sin(angle) * 72);
      }
    } else if (this.weapon.id === 'burstRifle') {
      flash.lineStyle(3, color, 0.64);
      flash.strokeCircle(-18, -4, 7);
      flash.strokeCircle(0, 0, 9);
      flash.strokeCircle(18, 4, 7);
      flash.lineBetween(-58, -8, -18, -4);
      flash.lineBetween(-54, 0, 0, 0);
      flash.lineBetween(-50, 8, 18, 4);
    } else {
      flash.fillStyle(color, 0.55);
      flash.fillRect(-57, -1.5, 54, 3);
      flash.lineStyle(3, color, 0.58);
      flash.lineBetween(-30, -18, 30, 18);
      flash.lineBetween(-30, 18, 30, -18);
    }

    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 2.1,
      duration: this.save.settings.reducedMotion ? 70 : 130,
      onComplete: () => this.releaseTransientGraphics(flash),
    });
  }

  private drawWeaponTraces(x: number, y: number, probes: Array<{ x: number; y: number }>): void {
    const color = Phaser.Display.Color.HexStringToColor(this.weapon.color).color;
    const graphics = this.acquireTransientGraphics(68);
    graphics.setBlendMode(Phaser.BlendModes.ADD);
    graphics.lineStyle(this.weapon.id === 'scattergun' ? 3 : 2, color, this.weapon.id === 'arcLaser' ? 0.82 : 0.62);

    if (this.weapon.id === 'arcLaser') {
      graphics.fillStyle(color, 0.12);
      graphics.fillRect(x - 80, y - 12, this.scale.width - x + 160, 24);
      graphics.lineStyle(5, color, 0.78);
      graphics.lineBetween(x - 80, y, this.scale.width + 80, y);
      graphics.lineStyle(1, 0xffffff, 0.7);
      graphics.lineBetween(x - 42, y - 6, this.scale.width + 40, y - 6);
      graphics.lineBetween(x - 42, y + 6, this.scale.width + 40, y + 6);
      for (let lane = 0; lane < 4; lane++) {
        const laneY = y - 18 + lane * 12;
        graphics.lineStyle(1, color, 0.18);
        graphics.lineBetween(x - 68, laneY, this.scale.width + 30, laneY);
      }
    } else if (this.weapon.id === 'burstRifle') {
      graphics.lineStyle(2, color, 0.7);
      probes.forEach((probe, index) => {
        const stagger = index - 1;
        graphics.lineBetween(x - 24, y + stagger * 7, probe.x, probe.y);
        graphics.strokeCircle(probe.x, probe.y, 7 + index);
      });
      graphics.lineStyle(1, 0xffffff, 0.42);
      graphics.strokeCircle(x, y, 20);
    } else if (this.weapon.id === 'scattergun') {
      graphics.lineStyle(2, color, 0.48);
      probes.forEach((probe, index) => {
        graphics.lineBetween(x, y, probe.x, probe.y);
        graphics.strokeCircle(probe.x, probe.y, index % 2 === 0 ? 10 : 6);
      });
      graphics.lineStyle(2, 0xffffff, 0.22);
      graphics.strokeCircle(x, y, this.weapon.spread * 0.42);
    } else {
      for (const probe of probes) {
        graphics.lineBetween(x, y, probe.x, probe.y);
        graphics.strokeCircle(probe.x, probe.y, 6);
      }
    }

    this.tweens.add({
      targets: graphics,
      alpha: 0,
      duration: this.save.settings.reducedMotion ? 70 : 150,
      onComplete: () => this.releaseTransientGraphics(graphics),
    });
  }

  private drawChainTraces(x: number, y: number, actors: EnemyActor[]): void {
    if (actors.length === 0) return;
    const graphics = this.acquireTransientGraphics(67);
    graphics.setBlendMode(Phaser.BlendModes.ADD);
    graphics.lineStyle(2, 0xff8a32, 0.74);
    for (const actor of actors) {
      graphics.lineBetween(x, y, actor.sprite.x, actor.sprite.y);
      graphics.strokeCircle(actor.sprite.x, actor.sprite.y, actor.radius * 0.45);
    }
    this.tweens.add({
      targets: graphics,
      alpha: 0,
      duration: this.save.settings.reducedMotion ? 80 : 180,
      onComplete: () => this.releaseTransientGraphics(graphics),
    });
  }

  private showCooldownFeedback(x: number, y: number, now: number): void {
    if (now - this.lastCooldownFeedbackAt < 320) return;
    this.lastCooldownFeedbackAt = now;
    this.reticleKick = 0.6;
    arcadeAudio.playRecharge();
    const color = Phaser.Display.Color.HexStringToColor(this.weapon.color).color;
    const ring = this.acquireTransientGraphics(75);
    ring.setPosition(x, y);
    ring.lineStyle(2, color, 0.56);
    ring.strokeCircle(0, 0, this.weaponCrosshairRadius + 10);
    this.tweens.add({
      targets: ring,
      alpha: 0,
      scale: 0.72,
      duration: 160,
      onComplete: () => this.releaseTransientGraphics(ring),
    });
  }

  private acquireTransientGraphics(depth: number): Phaser.GameObjects.Graphics {
    const graphics = this.graphicsPool.pop() ?? this.add.graphics();
    graphics.clear();
    graphics.setDepth(depth);
    graphics.setActive(true);
    graphics.setVisible(true);
    graphics.setAlpha(1);
    graphics.setScale(1);
    graphics.setRotation(0);
    graphics.setBlendMode(Phaser.BlendModes.NORMAL);
    graphics.setPosition(0, 0);
    return graphics;
  }

  private releaseTransientGraphics(graphics: Phaser.GameObjects.Graphics): void {
    this.tweens.killTweensOf(graphics);
    graphics.clear();
    graphics.setActive(false);
    graphics.setVisible(false);
    graphics.setBlendMode(Phaser.BlendModes.NORMAL);
    if (this.graphicsPool.length < GRAPHICS_POOL_LIMIT) {
      this.graphicsPool.push(graphics);
    } else {
      graphics.destroy();
    }
  }

  private floatText(x: number, y: number, text: string, color: string, size: number, label = false): void {
    const item = this.acquireFloatText(x, y, text, color, size, label ? UI_FONT : DISPLAY_FONT);
    item.setOrigin(0.5);
    item.setDepth(120);
    item.setScale(0.6);
    this.tweens.add({ targets: item, scale: 1, duration: 140, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: item,
      y: y - 46,
      alpha: 0,
      duration: 700,
      delay: 120,
      ease: 'Quad.easeIn',
      onComplete: () => this.releaseFloatText(item),
    });
  }

  // Score popups scale with the combo multiplier and punch in before rising.
  private floatScore(x: number, y: number, points: number, color: number, combo: number): void {
    const hex = `#${Phaser.Display.Color.ValueToColor(color).lighten(25).color.toString(16).padStart(6, '0')}`;
    const size = 22 + Math.min(20, combo * 3);
    const item = this.acquireFloatText(x, y, `+${points}`, hex, size, DISPLAY_FONT);
    item.setOrigin(0.5);
    item.setDepth(121);
    item.setScale(1.7);
    item.setAngle(Phaser.Math.Between(-6, 6));
    this.tweens.add({ targets: item, scale: 1, duration: 180, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: item,
      y: y - 58,
      alpha: 0,
      duration: 760,
      delay: 260,
      ease: 'Cubic.easeIn',
      onComplete: () => this.releaseFloatText(item),
    });
  }

  private acquireFloatText(x: number, y: number, text: string, color: string, size: number, fontFamily: string): Phaser.GameObjects.Text {
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily,
      fontStyle: fontFamily === UI_FONT ? '700' : 'normal',
      fontSize: `${size}px`,
      color,
      stroke: '#070510',
      strokeThickness: Math.max(4, Math.round(size * 0.2)),
    };
    const label = this.textPool.pop() ?? this.add.text(0, 0, '', style);
    label.setStyle(style);
    label.setText(text);
    label.setShadow(0, 0, color, this.quality.tier === 'high' ? 10 : 0, false, true);
    label.setPosition(x, y);
    label.setActive(true);
    label.setVisible(true);
    label.setAlpha(1);
    label.setScale(1);
    label.setAngle(0);
    return label;
  }

  private releaseFloatText(label: Phaser.GameObjects.Text): void {
    this.tweens.killTweensOf(label);
    label.setActive(false);
    label.setVisible(false);
    if (this.textPool.length < TEXT_POOL_LIMIT) {
      this.textPool.push(label);
    } else {
      label.destroy();
    }
  }

  private playRunSummarySequence(onComplete: () => void): void {
    this.enemies.forEach((enemy) => {
      enemy.velocityX *= -0.25;
      enemy.velocityY *= 0.2;
      enemy.sprite.setTint(0xff315a);
    });
    this.dismissBossBar(true);

    const overlay = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x05030a, 0.1);
    overlay.setOrigin(0);
    overlay.setDepth(300);
    const titleSize = Math.round(Phaser.Math.Clamp(this.scale.width * 0.06, 34, 72));
    const title = this.add.text(this.scale.width / 2, this.scale.height * 0.42, 'RUN REPORT', {
      fontFamily: DISPLAY_FONT,
      fontSize: `${titleSize}px`,
      color: '#20f2ff',
      stroke: '#05030a',
      strokeThickness: 8,
      align: 'center',
    });
    title.setOrigin(0.5);
    title.setDepth(310);
    title.setShadow(0, 0, '#20f2ff', 24, true, true);
    const prompt = this.add.text(this.scale.width / 2, this.scale.height * 0.42 + titleSize, 'STARS BANKED / COINS PAID', {
      fontFamily: UI_FONT,
      fontStyle: '700',
      fontSize: '18px',
      color: '#ffe56a',
      align: 'center',
    });
    prompt.setOrigin(0.5);
    prompt.setDepth(310);

    if (!this.save.settings.reducedMotion) {
      this.cameras.main.flash(500, 255, 35, 80, false);
      this.shakeCamera(700, 0.018);
      this.tweens.add({
        targets: overlay,
        alpha: 0.82,
        duration: 700,
        ease: 'Quad.easeOut',
      });
      this.tweens.add({
        targets: title,
        scale: 1.08,
        duration: 120,
        yoyo: true,
        repeat: 4,
      });
    } else {
      overlay.setAlpha(0.82);
    }

    this.time.delayedCall(this.save.settings.reducedMotion ? 650 : 1450, onComplete);
  }

  private shakeCamera(duration: number, intensity: number): void {
    if (!this.save.settings.screenShake || this.save.settings.reducedMotion) return;
    this.cameras.main.shake(duration, intensity);
  }

  private hitStop(ms: number): void {
    if (this.save.settings.reducedMotion) return;
    this.hitStopMs = Math.max(this.hitStopMs, ms);
  }

  private panFor(x: number): number {
    return Phaser.Math.Clamp((x / Math.max(1, this.scale.width)) * 2 - 1, -1, 1) * 0.7;
  }

  // Falling ragdoll of the killed raven: inherits a little of its momentum,
  // pops upward, spins and drops out of frame while fading.
  private spawnCorpse(actor: EnemyActor): void {
    if (!this.quality.corpses || actor.boss || this.corpses.length >= this.quality.maxCorpses) return;
    const sprite = this.corpsePool.pop() ?? this.add.sprite(0, 0, actor.sprite.texture.key, 0);
    sprite.setTexture(actor.sprite.texture.key, actor.sprite.frame.name);
    sprite.setPosition(actor.sprite.x, actor.sprite.y);
    sprite.setScale(actor.visualScale * 0.92);
    sprite.setAngle(actor.sprite.angle);
    sprite.setTint(0x6a5a80);
    sprite.setAlpha(0.95);
    sprite.setDepth(9);
    sprite.setActive(true).setVisible(true);
    this.corpses.push({
      sprite,
      vx: -actor.velocityX * 0.35 + Phaser.Math.FloatBetween(-0.05, 0.12),
      vy: Phaser.Math.FloatBetween(-0.32, -0.16),
      spin: Phaser.Math.FloatBetween(0.18, 0.42) * (Math.random() < 0.5 ? -1 : 1),
      age: 0,
    });
  }

  private updateCorpses(delta: number): void {
    if (this.corpses.length === 0) return;
    const bottom = this.scale.height + 120;
    for (const corpse of this.corpses) {
      corpse.age += delta;
      corpse.vy += CORPSE_GRAVITY * delta;
      corpse.sprite.x += corpse.vx * delta;
      corpse.sprite.y += corpse.vy * delta;
      corpse.sprite.angle += corpse.spin * delta;
      if (corpse.age > 500) corpse.sprite.setAlpha(Math.max(0, 0.95 - (corpse.age - 500) / 900));
      if (corpse.sprite.y > bottom || corpse.sprite.alpha <= 0.01) this.releaseCorpse(corpse.sprite);
    }
    this.corpses = this.corpses.filter((corpse) => corpse.sprite.active);
  }

  private releaseCorpse(sprite: Phaser.GameObjects.Sprite): void {
    sprite.setActive(false).setVisible(false);
    if (this.corpsePool.length < 16) this.corpsePool.push(sprite);
    else sprite.destroy();
  }

  private createBossBar(actor: EnemyActor): void {
    this.dismissBossBar(true);
    const width = Math.round(Phaser.Math.Clamp(this.scale.width * 0.44, 240, 560));
    const hudTop = document.querySelector('.hud-top')?.getBoundingClientRect().bottom ?? 90;
    const y = Math.round(hudTop + 16);
    const container = this.add.container(this.scale.width / 2, y).setDepth(900);
    const frame = this.add.graphics();
    const fill = this.add.graphics();
    const label = this.add.text(-width / 2, -14, actor.def.label.toUpperCase(), {
      fontFamily: DISPLAY_FONT,
      fontSize: `${this.isCompactPlayfield() ? 11 : 14}px`,
      color: '#ff8fa3',
      stroke: '#1a0008',
      strokeThickness: 4,
    });
    label.setOrigin(0, 1);
    label.setShadow(0, 0, '#ff214f', 10, true, true);
    frame.fillStyle(0x0a0208, 0.82);
    frame.fillRoundedRect(-width / 2 - 4, -8, width + 8, 20, 6);
    frame.lineStyle(2, 0xff214f, 0.9);
    frame.strokeRoundedRect(-width / 2 - 4, -8, width + 8, 20, 6);
    container.add([frame, fill, label]);
    container.setAlpha(0);
    this.tweens.add({ targets: container, alpha: 1, duration: 400, delay: 500 });
    this.bossBar = { container, frame, fill, label, width, trail: 1, shown: 1, shake: 0 };
  }

  private updateBossBar(delta: number): void {
    const bar = this.bossBar;
    if (!bar) return;
    const boss = this.enemies.find((enemy) => enemy.boss && enemy.sprite.active);
    const target = boss ? Phaser.Math.Clamp(boss.hp / boss.def.health, 0, 1) : 0;
    bar.shown += (target - bar.shown) * Math.min(1, delta / 60);
    if (bar.trail > bar.shown) bar.trail = Math.max(bar.shown, bar.trail - delta * 0.00035);
    bar.shake = Math.max(0, bar.shake - delta / 220);
    const jitter = bar.shake * 4;
    bar.container.x = this.scale.width / 2 + (Math.random() - 0.5) * jitter;

    const half = bar.width / 2;
    const fill = bar.fill;
    fill.clear();
    fill.fillStyle(0xffe56a, 0.9);
    fill.fillRect(-half, -4, bar.width * bar.trail, 12);
    fill.fillStyle(0xff214f, 1);
    fill.fillRect(-half, -4, bar.width * bar.shown, 12);
    fill.fillStyle(0xffffff, 0.35);
    fill.fillRect(-half, -4, bar.width * bar.shown, 4);
    fill.lineStyle(1, 0x0a0208, 0.8);
    for (let index = 1; index < 10; index++) {
      const x = -half + (bar.width * index) / 10;
      fill.lineBetween(x, -4, x, 8);
    }
    const rage = -half + bar.width * 0.42;
    fill.lineStyle(2, 0xffe56a, 0.9);
    fill.lineBetween(rage, -8, rage, 12);
  }

  private dismissBossBar(immediate = false): void {
    const bar = this.bossBar;
    if (!bar) return;
    this.bossBar = undefined;
    if (immediate) {
      bar.container.destroy();
      return;
    }
    this.tweens.add({ targets: bar.container, alpha: 0, y: bar.container.y - 12, duration: 500, delay: 400, onComplete: () => bar.container.destroy() });
  }

  // Combo tiers get an announcer banner, a stinger and push music intensity.
  private updateComboTier(): void {
    const tier = this.run.comboMultiplier;
    if (tier === this.lastComboTier) return;
    const rising = tier > this.lastComboTier;
    this.lastComboTier = tier;
    arcadeAudio.setIntensity(tier);
    if (!rising || tier < 2) return;

    arcadeAudio.playComboTier(tier);
    const colors = ['#ffffff', '#20f2ff', '#9dff57', '#ffe56a', '#ff8a32', '#ff3fb4'];
    const color = colors[Math.min(colors.length - 1, tier - 1)];
    const size = Math.round(Phaser.Math.Clamp(this.scale.width * 0.04, 26, 52)) + tier * 3;
    const text = this.add.text(this.scale.width / 2, this.scale.height * 0.18, `COMBO x${tier}`, {
      fontFamily: DISPLAY_FONT,
      fontSize: `${size}px`,
      color,
      stroke: '#070510',
      strokeThickness: 7,
    });
    text.setOrigin(0.5).setDepth(205).setScale(2.2).setAlpha(0);
    text.setShadow(0, 0, color, 18, true, true);
    this.tweens.add({ targets: text, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: text, alpha: 0, y: text.y - 24, delay: 700, duration: 380, onComplete: () => text.destroy() });
    this.fx.flare(this.scale.width / 2, this.scale.height * 0.18, Phaser.Display.Color.HexStringToColor(color).color, this.scale.width * 0.6, 420);
    this.cabinet?.kick(0.25);
  }

  // "Auto" graphics quietly steps down a tier if the frame rate stays low,
  // e.g. an older laptop GPU that cannot keep up with the bloom pass.
  private monitorFrameRate(delta: number): void {
    if (!isAutoQuality(this.save.settings) || this.quality.tier === 'low') return;
    this.fpsCheckTimer += delta;
    if (this.fpsCheckTimer < 1000) return;
    this.fpsCheckTimer = 0;
    const fps = this.game.loop.actualFps;
    if (fps < LOW_FPS_THRESHOLDS[this.quality.tier]) this.fpsLowSeconds++;
    else this.fpsLowSeconds = Math.max(0, this.fpsLowSeconds - 1);
    if (this.fpsLowSeconds < 4) return;

    this.fpsLowSeconds = 0;
    const next = stepDownAutoQuality(this.quality.tier);
    if (!next) return;
    this.quality = resolveQualityProfile(this.save.settings);
    this.cabinet = attachCabinetPipeline(this.cameras.main, this.quality.postFx);
    this.fx.setQuality(this.quality, this.save.settings.reducedMotion);
    this.backdrop.setQuality(this.quality, this.save.settings.reducedMotion);
    console.info(`[knotz] auto graphics stepped down to ${next} (fps ${Math.round(fps)})`);
  }

  private get touchAimBonus(): number {
    return this.isCompactPlayfield() || this.isCoarsePointer() ? 1 : 0;
  }

  private get enemyVisualScaleMultiplier(): number {
    if (this.isPhoneLandscapePlayfield()) return 0.76;
    if (this.isCompactPlayfield()) return 0.86;
    return 1;
  }

  private get weaponCrosshairRadius(): number {
    if (this.weapon.id === 'scattergun') return 28 + this.weapon.spread * 0.08;
    if (this.weapon.id === 'burstRifle') return 24;
    if (this.weapon.id === 'arcLaser') return 21;
    return 18;
  }

  private bossMinY(actor: EnemyActor): number {
    return Math.max(84, actor.visualRadius + BOSS_VERTICAL_SAFE_PADDING);
  }

  private bossMaxY(actor: EnemyActor): number {
    return Math.max(this.bossMinY(actor) + 32, this.scale.height - actor.visualRadius - BOSS_VERTICAL_SAFE_PADDING);
  }

  private clampBossY(y: number, actor: EnemyActor): number {
    return Phaser.Math.Clamp(y, this.bossMinY(actor), this.bossMaxY(actor));
  }

  private get stageBaseId(): string {
    return this.stage.id.replace(/-\d+$/, '');
  }

  private isCompactPlayfield(): boolean {
    return this.scale.width <= INPUT_TUNING.compactViewportWidth || this.scale.height <= INPUT_TUNING.compactViewportHeight;
  }

  private isPhoneLandscapePlayfield(): boolean {
    return this.scale.width > this.scale.height && this.scale.height <= INPUT_TUNING.compactViewportHeight && (this.isCoarsePointer() || this.scale.width <= 940);
  }

  private isCoarsePointer(): boolean {
    return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  }
}

function powerupColor(id: PowerupId): number {
  switch (id) {
    case 'slowmo':
      return 0x31f4ff;
    case 'multishot':
      return 0xff8a32;
    case 'scoreBoost':
      return 0xffdf4d;
    case 'extraLife':
      return 0x9dff57;
    case 'overdrive':
      return 0xff5fbb;
    case 'coinRush':
      return 0xffd447;
  }
}

function powerupGlyph(id: PowerupId): string {
  switch (id) {
    case 'slowmo':
      return 'S';
    case 'multishot':
      return 'M';
    case 'scoreBoost':
      return '2X';
    case 'extraLife':
      return 'G';
    case 'overdrive':
      return 'O';
    case 'coinRush':
      return '$';
  }
}

// Dev-only QA hook: ?stage=N starts the run on stage N (1-based).
function debugStartStageIndex(): number {
  if (!import.meta.env.DEV) return 0;
  const value = Number(new URLSearchParams(window.location.search).get('stage'));
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) - 1 : 0;
}
