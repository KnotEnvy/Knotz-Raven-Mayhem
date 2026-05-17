import Phaser from 'phaser';
import { AUDIO_KEYS, SPRITE_KEYS } from '../data/assets';
import { ENEMIES } from '../data/enemies';
import { getNewEnemyLabelsForStage, getStage } from '../data/stages';
import { CROSSHAIRS, WEAPONS } from '../data/weapons';
import { INPUT_TUNING, POWERUP_TUNING, PRESENTATION_TUNING } from '../data/tuning';
import { applyRunRewards, calculateRunRewards, loadSave } from '../save';
import { getLoadout } from '../systems/progression';
import { RunState, powerupLabel } from '../systems/RunState';
import { WaveDirector } from '../systems/WaveDirector';
import { arcadeAudio } from '../systems/ArcadeAudio';
import type { EnemyDefinition, EnemyId, PowerupId, RunRewards, SaveData, StageClearSummary, StageDefinition, WeaponDefinition } from '../types';
import { dispatchUiState, onCommand } from '../../ui/events';

interface EnemyActor {
  sprite: Phaser.GameObjects.Sprite;
  healthBar?: Phaser.GameObjects.Graphics;
  def: EnemyDefinition;
  hp: number;
  velocityX: number;
  velocityY: number;
  bornMs: number;
  radius: number;
  boss: boolean;
  splitDepth: number;
}

interface PowerupActor {
  id: PowerupId;
  label: string;
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Rectangle;
  bornMs: number;
}

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
  private gameEnded = false;
  private crosshair!: Phaser.GameObjects.Graphics;
  private background!: Phaser.GameObjects.Graphics;
  private starfield: Phaser.GameObjects.Arc[] = [];

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.save = loadSave();
    const loadout = getLoadout(this.save);
    this.weapon = loadout.weapon;
    this.crosshairRadiusBonus = loadout.crosshair.radiusBonus;
    this.run = new RunState(loadout.stats, loadout.weapon, loadout.crosshair);
    this.stage = getStage(0);
    this.run.startStage(1, this.stage.targetKills);
    this.nextShotAt = 0;
    this.gameEnded = false;
    this.bossKills = 0;
    this.bossSpawned = false;
    this.bossDefeated = false;
    this.stageEnemiesSpawned = 0;
    this.stageTransition = false;
    this.completedStageSummary = undefined;
    this.pausedByUi = false;

    this.cameras.main.setRoundPixels(false);
    this.createBackground();
    this.createCrosshair();
    this.bindCommands();
    this.registerInput();
    this.renderHud();
    this.showStageBanner(this.stage.title, this.stage.subtitle);
    arcadeAudio.startMusic('run', this.save.settings, this.stage.id);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribers.forEach((unsubscribe) => unsubscribe());
      this.unsubscribers = [];
    });
  }

  update(time: number, delta: number): void {
    this.updateCrosshair();
    if (this.gameEnded || this.pausedByUi) return;

    this.run.update(delta);
    this.updateBackground(delta);
    this.updateEnemies(time, delta);
    this.updatePowerups(time, delta);
    this.maybeSpawnEnemy(delta);
    this.checkStageFlow();
    this.renderHud();
  }

  private bindCommands(): void {
    this.unsubscribers.push(
      onCommand('pause', () => this.pauseRun()),
      onCommand('resume', () => this.resumeRun()),
      onCommand('continue-stage', () => this.continueToNextStage()),
      onCommand('open-armory', () => {
        dispatchUiState({ screen: 'blank' });
        this.scene.start('AttractScene', { mode: 'armory' });
      }),
      onCommand('return-menu', () => {
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
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
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

  private createBackground(): void {
    this.background = this.add.graphics().setDepth(-10);
    this.drawBackground();

    const starCount = this.isCompactPlayfield() ? PRESENTATION_TUNING.mobileStarCount : PRESENTATION_TUNING.desktopStarCount;
    this.starfield = Array.from({ length: starCount }, () => {
      const star = this.add.circle(
        Phaser.Math.Between(0, this.scale.width),
        Phaser.Math.Between(0, this.scale.height),
        Phaser.Math.FloatBetween(0.8, 2.4),
        Phaser.Math.RND.pick([0xffffff, this.stage.palette.neon, this.stage.palette.haze]),
        Phaser.Math.FloatBetween(0.2, 0.85),
      );
      star.setDepth(-6);
      return star;
    });
  }

  private drawBackground(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const { palette } = this.stage;

    this.background.clear();
    this.background.fillGradientStyle(palette.skyTop, palette.skyTop, palette.skyBottom, palette.haze, 1);
    this.background.fillRect(0, 0, width, height);
    this.background.fillStyle(0x070510, 0.55);
    this.background.fillRect(0, height * 0.72, width, height * 0.28);
    this.drawStageSetDressing(width, height);
    this.background.lineStyle(2, palette.neon, 0.3);

    for (let x = -80; x < width + 100; x += 96) {
      this.background.lineBetween(x, height * 0.72, x - width * 0.25, height);
    }

    for (let y = height * 0.74; y < height; y += 36) {
      this.background.lineBetween(0, y, width, y);
    }
  }

  private drawStageSetDressing(width: number, height: number): void {
    const baseId = this.stage.id.replace(/-\d+$/, '');

    switch (baseId) {
      case 'graveyard-dusk':
        this.drawGraveyardBackdrop(width, height);
        break;
      case 'neon-boardwalk':
        this.drawBoardwalkBackdrop(width, height);
        break;
      case 'storm-tower':
        this.drawStormTowerBackdrop(width, height);
        break;
      case 'junkyard-moon':
        this.drawJunkyardBackdrop(width, height);
        break;
      case 'carnival-night':
        this.drawCarnivalBackdrop(width, height);
        break;
      case 'raven-kings-nest':
        this.drawRavenNestBackdrop(width, height);
        break;
      case 'jackpot-alley':
        this.drawJackpotBackdrop(width, height);
        break;
      case 'cinder-viaduct':
        this.drawCinderBackdrop(width, height);
        break;
      case 'clocktower-apex':
        this.drawClocktowerBackdrop(width, height);
        break;
    }
  }

  private drawGraveyardBackdrop(width: number, height: number): void {
    const horizon = height * 0.72;

    this.background.fillStyle(0xfff0a6, 0.2);
    this.background.fillCircle(width * 0.78, height * 0.18, Math.min(width, height) * 0.11);
    this.background.fillStyle(0x06040c, 0.42);
    for (let index = 0; index < 9; index++) {
      const x = width * 0.04 + index * width * 0.11;
      const stoneHeight = 34 + (index % 3) * 18;
      this.background.fillRoundedRect(x, horizon - stoneHeight, 26 + (index % 2) * 14, stoneHeight, 6);
      if (index % 2 === 0) {
        this.background.fillRect(x - 9, horizon - stoneHeight + 15, 44, 7);
      }
    }

    this.background.lineStyle(3, 0xff42f8, 0.22);
    for (let x = 0; x < width; x += 92) {
      this.background.lineBetween(x, horizon - 22, x + 48, horizon - 44);
      this.background.lineBetween(x + 48, horizon - 44, x + 96, horizon - 18);
    }
  }

  private drawBoardwalkBackdrop(width: number, height: number): void {
    const horizon = height * 0.68;

    this.background.lineStyle(5, 0x20f2ff, 0.34);
    this.background.lineBetween(0, horizon, width, horizon - 18);
    this.background.lineStyle(2, 0xffb11f, 0.36);
    for (let x = -20; x < width + 60; x += 72) {
      this.background.lineBetween(x, horizon - 26, x + 24, height);
      this.background.fillStyle(0x06101b, 0.72);
      this.background.fillRect(x + 28, horizon - 118 - (x % 3) * 14, 46, 86);
      this.background.fillStyle(0x20f2ff, 0.28);
      this.background.fillRect(x + 34, horizon - 104 - (x % 3) * 14, 34, 9);
    }

    this.background.fillStyle(0xff3fb4, 0.2);
    this.background.fillRoundedRect(width * 0.62, horizon - 145, 170, 54, 10);
    this.background.lineStyle(3, 0xffb11f, 0.55);
    this.background.strokeRoundedRect(width * 0.62, horizon - 145, 170, 54, 10);
  }

  private drawStormTowerBackdrop(width: number, height: number): void {
    const horizon = height * 0.72;
    const towerX = width * 0.68;

    this.background.fillStyle(0x020812, 0.66);
    this.background.fillRect(towerX, horizon - 250, 92, 250);
    this.background.fillTriangle(towerX - 24, horizon - 250, towerX + 46, horizon - 330, towerX + 116, horizon - 250);
    this.background.fillRect(towerX + 28, horizon - 306, 36, 56);
    this.background.lineStyle(3, 0x93ff29, 0.28);
    for (let y = horizon - 225; y < horizon - 20; y += 42) {
      this.background.lineBetween(towerX + 12, y, towerX + 80, y + 22);
      this.background.lineBetween(towerX + 80, y, towerX + 12, y + 22);
    }

    this.background.lineStyle(4, 0xd7f7ff, 0.3);
    this.background.lineBetween(width * 0.18, 0, width * 0.32, height * 0.21);
    this.background.lineBetween(width * 0.32, height * 0.21, width * 0.26, height * 0.32);
    this.background.lineBetween(width * 0.26, height * 0.32, width * 0.42, height * 0.48);
  }

  private drawJunkyardBackdrop(width: number, height: number): void {
    const horizon = height * 0.72;

    this.background.fillStyle(0x080707, 0.62);
    for (let index = 0; index < 10; index++) {
      const x = index * width * 0.1 - 20;
      const pileHeight = 28 + (index % 4) * 19;
      this.background.fillTriangle(x, horizon, x + 66, horizon - pileHeight, x + 132, horizon);
      this.background.fillRect(x + 36, horizon - pileHeight - 16, 50, 16);
    }

    this.background.lineStyle(5, 0xffe14b, 0.22);
    this.background.lineBetween(width * 0.14, horizon - 168, width * 0.34, horizon - 252);
    this.background.lineBetween(width * 0.34, horizon - 252, width * 0.47, horizon - 98);
    this.background.lineStyle(3, 0xff6d2d, 0.3);
    this.background.strokeCircle(width * 0.78, horizon - 32, 36);
    this.background.strokeCircle(width * 0.84, horizon - 27, 27);
  }

  private drawCarnivalBackdrop(width: number, height: number): void {
    const horizon = height * 0.72;
    const wheelX = width * 0.76;
    const wheelY = horizon - 118;
    const wheelRadius = Math.min(width, height) * 0.15;

    this.background.lineStyle(4, 0x2cffc8, 0.28);
    this.background.strokeCircle(wheelX, wheelY, wheelRadius);
    for (let index = 0; index < 10; index++) {
      const angle = (Math.PI * 2 * index) / 10;
      this.background.lineBetween(wheelX, wheelY, wheelX + Math.cos(angle) * wheelRadius, wheelY + Math.sin(angle) * wheelRadius);
      this.background.fillStyle(index % 2 === 0 ? 0xff2f7f : 0xffdf4d, 0.45);
      this.background.fillCircle(wheelX + Math.cos(angle) * wheelRadius, wheelY + Math.sin(angle) * wheelRadius, 5);
    }

    this.background.fillStyle(0x09040c, 0.58);
    for (let x = width * 0.05; x < width * 0.58; x += 128) {
      this.background.fillTriangle(x, horizon, x + 64, horizon - 112, x + 128, horizon);
      this.background.lineStyle(2, 0xff2f7f, 0.38);
      this.background.lineBetween(x + 18, horizon - 24, x + 64, horizon - 96);
      this.background.lineBetween(x + 110, horizon - 24, x + 64, horizon - 96);
    }
  }

  private drawRavenNestBackdrop(width: number, height: number): void {
    const horizon = height * 0.72;

    this.background.fillStyle(0xff1e3d, 0.18);
    this.background.fillCircle(width * 0.24, height * 0.22, Math.min(width, height) * 0.14);
    this.background.lineStyle(8, 0x050307, 0.7);
    for (let index = 0; index < 12; index++) {
      const y = horizon - 28 - index * 8;
      this.background.lineBetween(width * 0.48 - index * 12, y, width * 0.98, y - 76 + index * 10);
      this.background.lineBetween(width * 0.52 + index * 6, y + 14, width * 0.12, y - 34 + index * 7);
    }

    this.background.lineStyle(3, 0x9c2dff, 0.32);
    this.background.strokeCircle(width * 0.72, horizon - 150, 72);
    this.background.lineBetween(width * 0.72, horizon - 218, width * 0.69, horizon - 250);
    this.background.lineBetween(width * 0.72, horizon - 218, width * 0.75, horizon - 250);
    this.background.lineBetween(width * 0.69, horizon - 250, width * 0.75, horizon - 250);
  }

  private drawJackpotBackdrop(width: number, height: number): void {
    const horizon = height * 0.72;

    this.background.fillStyle(0xffd447, 0.22);
    for (let index = 0; index < 7; index++) {
      const x = width * 0.08 + index * width * 0.13;
      this.background.fillRoundedRect(x, horizon - 118 - (index % 2) * 32, 62, 96, 10);
      this.background.fillStyle(index % 2 === 0 ? 0xffd447 : 0xff7a1f, 0.42);
      this.background.fillCircle(x + 31, horizon - 70 - (index % 2) * 32, 20);
      this.background.fillStyle(0xffd447, 0.22);
    }

    this.background.lineStyle(4, 0xffd447, 0.4);
    this.background.lineBetween(0, horizon - 18, width, horizon - 58);
    this.background.lineStyle(2, 0xffffff, 0.24);
    for (let x = 0; x < width; x += 84) {
      this.background.strokeCircle(x, horizon - 46, 12);
    }
  }

  private drawCinderBackdrop(width: number, height: number): void {
    const horizon = height * 0.72;

    this.background.lineStyle(7, 0xff8738, 0.28);
    this.background.lineBetween(0, horizon - 68, width, horizon - 22);
    this.background.lineStyle(3, 0x49e7ff, 0.28);
    for (let x = -60; x < width + 80; x += 92) {
      this.background.lineBetween(x, horizon - 120, x + 74, horizon + 20);
      this.background.fillStyle(0x06030a, 0.62);
      this.background.fillRect(x + 18, horizon - 185, 42, 134);
      this.background.fillStyle(0xff8738, 0.24);
      this.background.fillRect(x + 25, horizon - 170, 28, 8);
    }

    this.background.fillStyle(0xffb35c, 0.13);
    this.background.fillCircle(width * 0.18, height * 0.18, Math.min(width, height) * 0.13);
  }

  private drawClocktowerBackdrop(width: number, height: number): void {
    const horizon = height * 0.72;
    const towerX = width * 0.56;

    this.background.fillStyle(0x05030d, 0.72);
    this.background.fillRect(towerX, horizon - 330, 126, 330);
    this.background.fillTriangle(towerX - 28, horizon - 330, towerX + 63, horizon - 430, towerX + 154, horizon - 330);
    this.background.lineStyle(5, 0x5ee7ff, 0.35);
    this.background.strokeCircle(towerX + 63, horizon - 238, 46);
    this.background.lineBetween(towerX + 63, horizon - 238, towerX + 63, horizon - 268);
    this.background.lineBetween(towerX + 63, horizon - 238, towerX + 92, horizon - 224);

    this.background.lineStyle(2, 0xff3fb4, 0.26);
    for (let x = 0; x < width; x += 110) {
      this.background.lineBetween(x, horizon - 16, x + 68, horizon - 112);
    }
  }

  private updateBackground(delta: number): void {
    for (const star of this.starfield) {
      star.x -= delta * 0.018;
      if (star.x < -8) {
        star.x = this.scale.width + 8;
        star.y = Phaser.Math.Between(0, this.scale.height * 0.72);
      }
    }
  }

  private createCrosshair(): void {
    this.crosshair = this.add.graphics();
    this.crosshair.setDepth(1000);
    this.input.setDefaultCursor('none');
  }

  private updateCrosshair(): void {
    const pointer = this.input.activePointer;
    const cooldownMs = Math.max(1, this.run?.weaponCooldownMs ?? this.weapon.cooldownMs);
    const cooldownProgress = Phaser.Math.Clamp(1 - Math.max(0, this.nextShotAt - this.time.now) / cooldownMs, 0, 1);
    const radius = this.weaponCrosshairRadius + this.crosshairRadiusBonus * 0.25 + this.touchAimBonus * INPUT_TUNING.mobileCrosshairVisualBonus;
    const weaponColor = Phaser.Display.Color.HexStringToColor(this.weapon.color).color;
    const readyColor = cooldownProgress >= 1 ? weaponColor : 0xff315a;
    const alpha = cooldownProgress >= 1 ? 0.95 : 0.56;

    this.crosshair.clear();
    this.crosshair.lineStyle(2, readyColor, alpha);
    this.crosshair.strokeCircle(pointer.x, pointer.y, radius);

    if (cooldownProgress < 1) {
      this.crosshair.lineStyle(4, weaponColor, 0.86);
      this.crosshair.beginPath();
      this.crosshair.arc(pointer.x, pointer.y, radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cooldownProgress);
      this.crosshair.strokePath();
    }

    if (this.weapon.id === 'scattergun') {
      this.crosshair.lineBetween(pointer.x - radius - 10, pointer.y, pointer.x - 4, pointer.y);
      this.crosshair.lineBetween(pointer.x + 4, pointer.y, pointer.x + radius + 10, pointer.y);
      this.crosshair.lineBetween(pointer.x - radius * 0.7, pointer.y - radius * 0.7, pointer.x - 8, pointer.y - 8);
      this.crosshair.lineBetween(pointer.x + 8, pointer.y + 8, pointer.x + radius * 0.7, pointer.y + radius * 0.7);
      this.crosshair.lineBetween(pointer.x - radius * 0.7, pointer.y + radius * 0.7, pointer.x - 8, pointer.y + 8);
      this.crosshair.lineBetween(pointer.x + 8, pointer.y - 8, pointer.x + radius * 0.7, pointer.y - radius * 0.7);
    } else if (this.weapon.id === 'burstRifle') {
      this.crosshair.strokeCircle(pointer.x - 14, pointer.y, 5);
      this.crosshair.strokeCircle(pointer.x, pointer.y, 5);
      this.crosshair.strokeCircle(pointer.x + 14, pointer.y, 5);
    } else if (this.weapon.id === 'arcLaser') {
      this.crosshair.lineBetween(pointer.x - radius - 18, pointer.y, pointer.x + radius + 18, pointer.y);
      this.crosshair.lineBetween(pointer.x, pointer.y - radius * 0.55, pointer.x, pointer.y + radius * 0.55);
      this.crosshair.strokeRect(pointer.x - radius * 0.9, pointer.y - 5, radius * 1.8, 10);
    } else {
      this.crosshair.lineBetween(pointer.x - radius - 8, pointer.y, pointer.x - radius + 4, pointer.y);
      this.crosshair.lineBetween(pointer.x + radius - 4, pointer.y, pointer.x + radius + 8, pointer.y);
      this.crosshair.lineBetween(pointer.x, pointer.y - radius - 8, pointer.x, pointer.y - radius + 4);
      this.crosshair.lineBetween(pointer.x, pointer.y + radius - 4, pointer.x, pointer.y + radius + 8);
    }

    this.crosshair.fillStyle(readyColor, cooldownProgress >= 1 ? 0.8 : 0.38);
    this.crosshair.fillCircle(pointer.x, pointer.y, 2.5);
  }

  private maybeSpawnEnemy(delta: number): void {
    if (this.stageTransition || this.bossSpawned || this.stageEnemiesSpawned >= this.stage.targetKills) return;

    const enemyId = this.waveDirector.update(delta, this.stage);
    if (enemyId) {
      this.stageEnemiesSpawned++;
      this.spawnEnemy(enemyId);
    }
  }

  private spawnEnemy(enemyId: EnemyId, x = this.scale.width + 120, y?: number, splitDepth = 0): void {
    const def = ENEMIES[enemyId];
    const spawnY = y ?? Phaser.Math.Between(80, this.scale.height - 90);
    const sprite = this.add.sprite(x, spawnY, SPRITE_KEYS.raven);
    sprite.play('raven-flap');
    sprite.setScale(def.scale);
    sprite.setDepth(def.behavior === 'boss' ? 22 : 10);
    sprite.setFlipX(false);
    if (def.tint) sprite.setTint(def.tint);

    if (def.id === 'golden') {
      sprite.setBlendMode(Phaser.BlendModes.ADD);
    }

    const actor: EnemyActor = {
      sprite,
      def,
      hp: def.health,
      velocityX: (0.14 + Math.random() * 0.08) * def.speed * this.stage.speedMultiplier,
      velocityY: Phaser.Math.FloatBetween(-0.11, 0.11) * def.speed,
      bornMs: this.time.now,
      radius: def.radius,
      boss: def.behavior === 'boss',
      splitDepth,
    };

    if (actor.boss) {
      actor.velocityX = 0.04;
      actor.velocityY = 0.08;
      actor.sprite.x = this.scale.width + 180;
      actor.sprite.y = this.scale.height * 0.35;
      this.showStageBanner('Boss Warning', def.label);
      arcadeAudio.playBossWarning();
      arcadeAudio.startMusic('boss', this.save.settings, this.stage.id);
      this.shakeCamera(450, 0.008);
    }

    this.enemies.push(actor);
  }

  private updateEnemies(time: number, delta: number): void {
    for (const actor of this.enemies) {
      const t = (time - actor.bornMs) / 1000;
      const slow = this.run.isPowerupActive('slowmo') ? 0.42 : 1;

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

      if (actor.def.behavior === 'brute') {
        actor.sprite.scale = actor.def.scale + Math.sin(t * 4) * 0.035;
      }

      if (actor.boss) {
        actor.sprite.x = Math.max(this.scale.width - 260, actor.sprite.x);
        actor.sprite.y += Math.sin(t * 2) * 0.5 * delta;
      }

      if (actor.sprite.y < 50 || actor.sprite.y > this.scale.height - 50) {
        actor.velocityY *= -1;
      }

      if (!actor.boss && actor.sprite.x < -160) {
        this.destroyEnemyActor(actor);
        if (this.stage.bonus) {
          this.floatText(120, this.scale.height - 120, 'BONUS LOST', '#ffe56a', 30);
          arcadeAudio.playMiss();
        } else {
          this.floatText(120, this.scale.height - 120, 'MISSED', '#ff315a', 34);
          arcadeAudio.playMiss();
          this.shakeCamera(250, 0.01);
          if (this.run.loseLife()) this.endRun();
        }
        continue;
      }

      this.drawHealthBar(actor);
    }

    this.enemies = this.enemies.filter((actor) => actor.sprite.active);
  }

  private updatePowerups(time: number, delta: number): void {
    for (const powerup of this.powerups) {
      powerup.container.y += delta * POWERUP_TUNING.fallSpeedPerMs;
      powerup.container.x += Math.sin((time - powerup.bornMs) / 200) * POWERUP_TUNING.bobSpeedPerMs * delta;
      powerup.container.rotation += delta * POWERUP_TUNING.rotationSpeedPerMs;

      if (powerup.container.y > this.scale.height + 50) {
        powerup.container.destroy();
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
    arcadeAudio.playShot(this.weapon.id);
    this.drawMuzzleFlash(x, y);
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
      arcadeAudio.playMiss();
      this.floatText(x, y - 24, 'MISS', '#ff315a', 22);
      this.shakeCamera(90, 0.003);
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
    arcadeAudio.playHit(actor.def.id);
    actor.sprite.setTintFill(0xffffff);
    this.time.delayedCall(70, () => {
      if (!actor.sprite.active) return;
      actor.sprite.clearTint();
      if (actor.def.tint) actor.sprite.setTint(actor.def.tint);
    });

    if (actor.hp > 0) {
      this.floatText(actor.sprite.x, actor.sprite.y - actor.radius, 'HIT', '#ffe56a', 22);
      this.shakeCamera(80, 0.004);
      return;
    }

    this.killEnemy(actor);
  }

  private killEnemy(actor: EnemyActor): void {
    const points = this.run.killEnemy(actor.def);
    const x = actor.sprite.x;
    const y = actor.sprite.y;
    const radius = actor.radius;
    const bossKilled = actor.boss;

    this.floatText(x, y - radius, `+${points}`, actor.def.tint ? `#${actor.def.tint.toString(16).padStart(6, '0')}` : '#ffe56a', 24 + Math.min(18, this.run.comboMultiplier * 2));
    this.createExplosion(x, y, actor.def.scale);
    this.createFeathers(x, y, actor.def.tint ?? this.stage.palette.neon, actor.boss ? 44 : 18);
    this.shakeCamera(actor.boss ? 650 : 160, actor.boss ? 0.018 : 0.006);

    if (actor.def.id === 'golden') {
      this.time.timeScale = 0.25;
      this.time.delayedCall(120, () => {
        this.time.timeScale = 1;
      });
    }

    if (actor.def.behavior === 'splitter' && actor.splitDepth < 1) {
      this.spawnEnemy('mini', x + 34, y - 36, actor.splitDepth + 1);
      this.spawnEnemy('mini', x + 34, y + 36, actor.splitDepth + 1);
    }

    arcadeAudio.playEnemyDestroyed(actor.def.id, this.run.comboMultiplier);

    if (Math.random() < (actor.boss ? POWERUP_TUNING.bossDropChance : POWERUP_TUNING.dropChance)) {
      this.spawnPowerup(x, y);
    }

    this.destroyEnemyActor(actor);

    if (bossKilled) {
      this.bossKills++;
      this.bossDefeated = true;
      arcadeAudio.playBossDefeated();
    }
  }

  private collectPowerupAt(x: number, y: number): boolean {
    const collectRadius = POWERUP_TUNING.collectRadius + this.touchAimBonus * POWERUP_TUNING.mobileCollectRadiusBonus;
    const powerup = this.powerups.find((item) => Phaser.Math.Distance.Between(x, y, item.container.x, item.container.y) < collectRadius);
    if (!powerup) return false;

    if (powerup.id === 'extraLife') {
      this.run.addLife();
    } else {
      this.run.activatePowerup(powerup.id);
    }

    this.floatText(powerup.container.x, powerup.container.y - 32, powerup.label, '#9dff57', 24);
    this.createFeathers(powerup.container.x, powerup.container.y, 0x9dff57, 16);
    arcadeAudio.playPowerup(powerup.id);
    powerup.container.destroy();
    return true;
  }

  private spawnPowerup(x: number, y: number): void {
    const id = Phaser.Math.RND.pick<PowerupId>(['slowmo', 'multishot', 'scoreBoost', 'extraLife', 'overdrive', 'coinRush']);
    const label = powerupLabel(id);
    const color = powerupColor(id);
    const body = this.add.rectangle(0, 0, 42, 42, color, 0.92).setStrokeStyle(2, 0xffffff, 0.9);
    const text = this.add.text(0, 1, powerupGlyph(id), {
      fontFamily: 'Impact, Haettenschweiler, sans-serif',
      fontSize: '24px',
      color: '#08101c',
    });
    text.setOrigin(0.5);

    const container = this.add.container(x, y, [body, text]);
    container.setDepth(50);
    this.tweens.add({
      targets: container,
      scale: 1.12,
      duration: 260,
      yoyo: true,
      repeat: -1,
    });

    this.powerups.push({ id, label, container, body, bornMs: this.time.now });
  }

  private checkStageFlow(): void {
    if (this.stageTransition || this.gameEnded) return;
    if (this.stageEnemiesSpawned < this.stage.targetKills) return;

    const bossActive = this.enemies.some((enemy) => enemy.boss);
    const fieldClear = this.isStageFieldClear();

    if (this.stage.boss && !this.bossSpawned && !this.bossDefeated && fieldClear) {
      this.bossSpawned = true;
      this.spawnEnemy(this.stage.boss);
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
    this.run.coinsEarned += this.stage.rewardCoins;
    arcadeAudio.playStageClear(this.run.stageIndex);
    this.floatText(this.scale.width / 2, this.scale.height * 0.38, `STAGE CLEAR +${this.stage.rewardCoins}`, '#ffe56a', 36);
    if (!this.save.settings.reducedMotion) this.cameras.main.flash(220, 255, 225, 106, false);

    this.completedStageSummary = {
      snapshot: this.run.snapshot(this.stage.title),
      currentStage,
      nextStage,
      rewardCoins: currentStage.rewardCoins,
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
    this.run.startStage(this.run.stageIndex + 1, nextStage.targetKills);
    this.waveDirector.reset();
    this.stageEnemiesSpawned = 0;
    this.bossSpawned = false;
    this.bossDefeated = false;
    this.stageTransition = false;
    this.pausedByUi = false;
    this.completedStageSummary = undefined;
    this.clearActorsForStageAdvance();
    this.drawBackground();
    arcadeAudio.startMusic('run', this.save.settings, this.stage.id);
    this.renderHud();
    this.showStageBanner(this.stage.bonus ? 'Bonus Stage' : this.stage.title, this.stage.subtitle);
  }

  private clearActorsForStageAdvance(): void {
    for (const enemy of this.enemies) this.destroyEnemyActor(enemy);
    this.enemies = [];
    for (const powerup of this.powerups) powerup.container.destroy();
    this.powerups = [];
  }

  private pauseRun(): void {
    if (this.gameEnded || this.pausedByUi || this.stageTransition) return;
    this.pausedByUi = true;
    dispatchUiState({
      screen: 'pause',
      snapshot: this.run.snapshot(this.stage.title),
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
    const snapshot = this.run.snapshot(this.stage.title);
    const rewards: RunRewards = calculateRunRewards(this.save, snapshot, this.bossKills);
    this.save = applyRunRewards(this.save, snapshot, rewards);
    arcadeAudio.stopMusic();
    arcadeAudio.playGameOver();
    this.playDeathSequence(() => {
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
      snapshot: this.run.snapshot(this.stage.title),
      stage: this.stage,
      weapon: WEAPONS.find((item) => item.id === this.save.selectedWeapon) ?? WEAPONS[0],
      crosshair: CROSSHAIRS.find((item) => item.id === this.save.selectedCrosshair) ?? CROSSHAIRS[0],
    });
  }

  private showStageBanner(title: string, subtitle: string): void {
    const banner = this.add.container(this.scale.width / 2, this.scale.height * 0.28);
    const titleText = this.add.text(0, 0, title.toUpperCase(), {
      fontFamily: 'Impact, Haettenschweiler, sans-serif',
      fontSize: '48px',
      color: '#ffffff',
      stroke: '#090510',
      strokeThickness: 7,
      align: 'center',
    });
    titleText.setOrigin(0.5);
    const subtitleText = this.add.text(0, 48, subtitle, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '18px',
      color: '#ffe56a',
      align: 'center',
    });
    subtitleText.setOrigin(0.5);
    banner.add([titleText, subtitleText]);
    banner.setDepth(200);

    this.tweens.add({
      targets: banner,
      y: banner.y - 20,
      alpha: 0,
      ease: 'Quad.easeIn',
      duration: 850,
      delay: 1100,
      onComplete: () => banner.destroy(),
    });
  }

  private drawHealthBar(actor: EnemyActor): void {
    if (!actor.sprite.active || actor.hp <= 0) {
      actor.healthBar?.destroy();
      actor.healthBar = undefined;
      return;
    }

    if (actor.hp >= actor.def.health && !actor.boss) return;
    if (!actor.healthBar) {
      actor.healthBar = this.add.graphics().setDepth(actor.boss ? 80 : 40);
    }

    const width = actor.boss ? 220 : actor.radius * 1.7;
    const x = actor.sprite.x - width / 2;
    const y = actor.sprite.y - actor.radius - 18;
    const progress = Phaser.Math.Clamp(actor.hp / actor.def.health, 0, 1);

    actor.healthBar.clear();
    actor.healthBar.fillStyle(0x050711, 0.8);
    actor.healthBar.fillRect(x, y, width, 8);
    actor.healthBar.fillStyle(actor.boss ? 0xff214f : 0x9dff57, 1);
    actor.healthBar.fillRect(x, y, width * progress, 8);
  }

  private destroyEnemyActor(actor: EnemyActor): void {
    actor.healthBar?.destroy();
    actor.healthBar = undefined;
    actor.sprite.destroy();
  }

  private createExplosion(x: number, y: number, scale: number): void {
    const explosion = this.add.sprite(x, y, SPRITE_KEYS.explosion);
    explosion.setScale(Math.max(0.55, scale * 1.05));
    explosion.setDepth(60);
    explosion.play('boom-pop');
    this.sound.play(AUDIO_KEYS.boom, { volume: 0.22 * this.save.settings.sfxVolume });
    explosion.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => explosion.destroy());
  }

  private createFeathers(x: number, y: number, color: number, count: number): void {
    const cap = this.save.settings.reducedMotion
      ? PRESENTATION_TUNING.reducedMotionFeatherCap
      : this.isCompactPlayfield()
        ? PRESENTATION_TUNING.mobileFeatherCap
        : PRESENTATION_TUNING.desktopFeatherCap;

    for (let index = 0; index < Math.min(count, cap); index++) {
      const particle = this.add.rectangle(x, y, Phaser.Math.Between(4, 12), Phaser.Math.Between(2, 5), color, 0.88);
      particle.setDepth(55);
      particle.rotation = Phaser.Math.FloatBetween(0, Math.PI);
      this.tweens.add({
        targets: particle,
        x: x + Phaser.Math.Between(-130, 130),
        y: y + Phaser.Math.Between(-100, 110),
        alpha: 0,
        rotation: particle.rotation + Phaser.Math.FloatBetween(-2, 2),
        duration: Phaser.Math.Between(380, 780),
        ease: 'Cubic.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
  }

  private drawMuzzleFlash(x: number, y: number): void {
    const color = Phaser.Display.Color.HexStringToColor(this.weapon.color).color;
    const flash = this.add.circle(x, y, 10, color, 0.8).setDepth(70);
    const line = this.add.rectangle(x - 30, y, 54, 3, color, 0.55).setDepth(69);
    this.tweens.add({
      targets: [flash, line],
      alpha: 0,
      scale: 2.1,
      duration: 120,
      onComplete: () => {
        flash.destroy();
        line.destroy();
      },
    });
  }

  private drawWeaponTraces(x: number, y: number, probes: Array<{ x: number; y: number }>): void {
    const color = Phaser.Display.Color.HexStringToColor(this.weapon.color).color;
    const graphics = this.add.graphics().setDepth(68);
    graphics.lineStyle(this.weapon.id === 'scattergun' ? 3 : 2, color, this.weapon.id === 'arcLaser' ? 0.82 : 0.62);

    if (this.weapon.id === 'arcLaser') {
      graphics.lineStyle(5, color, 0.78);
      graphics.lineBetween(x - 80, y, this.scale.width + 80, y);
      graphics.lineStyle(1, 0xffffff, 0.7);
      graphics.lineBetween(x - 42, y - 6, this.scale.width + 40, y - 6);
      graphics.lineBetween(x - 42, y + 6, this.scale.width + 40, y + 6);
    } else {
      for (const probe of probes) {
        graphics.lineBetween(x, y, probe.x, probe.y);
        graphics.strokeCircle(probe.x, probe.y, this.weapon.id === 'scattergun' ? 10 : 6);
      }
    }

    this.tweens.add({
      targets: graphics,
      alpha: 0,
      duration: this.save.settings.reducedMotion ? 70 : 150,
      onComplete: () => graphics.destroy(),
    });
  }

  private drawChainTraces(x: number, y: number, actors: EnemyActor[]): void {
    if (actors.length === 0) return;
    const graphics = this.add.graphics().setDepth(67);
    graphics.lineStyle(2, 0xff8a32, 0.74);
    for (const actor of actors) {
      graphics.lineBetween(x, y, actor.sprite.x, actor.sprite.y);
      graphics.strokeCircle(actor.sprite.x, actor.sprite.y, actor.radius * 0.45);
    }
    this.tweens.add({
      targets: graphics,
      alpha: 0,
      duration: this.save.settings.reducedMotion ? 80 : 180,
      onComplete: () => graphics.destroy(),
    });
  }

  private showCooldownFeedback(x: number, y: number, now: number): void {
    if (now - this.lastCooldownFeedbackAt < 220) return;
    this.lastCooldownFeedbackAt = now;
    this.floatText(x, y - 22, 'RECHARGE', '#ff315a', 18);
    const color = Phaser.Display.Color.HexStringToColor(this.weapon.color).color;
    const ring = this.add.circle(x, y, this.weaponCrosshairRadius + 10).setStrokeStyle(2, color, 0.56).setDepth(75);
    this.tweens.add({
      targets: ring,
      alpha: 0,
      scale: 0.72,
      duration: 160,
      onComplete: () => ring.destroy(),
    });
  }

  private floatText(x: number, y: number, text: string, color: string, size: number): void {
    const label = this.add.text(x, y, text, {
      fontFamily: 'Impact, Haettenschweiler, sans-serif',
      fontSize: `${size}px`,
      color,
      stroke: '#070510',
      strokeThickness: 5,
    });
    label.setOrigin(0.5);
    label.setDepth(120);
    this.tweens.add({
      targets: label,
      y: y - 46,
      alpha: 0,
      scale: 1.2,
      duration: 760,
      ease: 'Quad.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  private playDeathSequence(onComplete: () => void): void {
    this.enemies.forEach((enemy) => {
      enemy.velocityX *= -0.25;
      enemy.velocityY *= 0.2;
      enemy.sprite.setTint(0xff315a);
    });

    const overlay = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x05030a, 0.1);
    overlay.setOrigin(0);
    overlay.setDepth(300);
    const title = this.add.text(this.scale.width / 2, this.scale.height * 0.42, 'SYSTEM FAILURE', {
      fontFamily: 'Impact, Haettenschweiler, sans-serif',
      fontSize: '64px',
      color: '#ff315a',
      stroke: '#05030a',
      strokeThickness: 8,
      align: 'center',
    });
    title.setOrigin(0.5);
    title.setDepth(310);
    const prompt = this.add.text(this.scale.width / 2, this.scale.height * 0.42 + 64, 'THE FLOCK CLAIMED THIS RUN', {
      fontFamily: 'Arial, sans-serif',
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

  private get touchAimBonus(): number {
    return this.isCompactPlayfield() || this.isCoarsePointer() ? 1 : 0;
  }

  private get weaponCrosshairRadius(): number {
    if (this.weapon.id === 'scattergun') return 28 + this.weapon.spread * 0.08;
    if (this.weapon.id === 'burstRifle') return 24;
    if (this.weapon.id === 'arcLaser') return 21;
    return 18;
  }

  private isCompactPlayfield(): boolean {
    return this.scale.width <= INPUT_TUNING.compactViewportWidth || this.scale.height <= INPUT_TUNING.compactViewportHeight;
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
      return '+';
    case 'overdrive':
      return 'O';
    case 'coinRush':
      return '$';
  }
}
