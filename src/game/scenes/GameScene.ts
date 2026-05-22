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
  visualRadius: number;
  visualScale: number;
  boss: boolean;
  splitDepth: number;
}

interface PowerupActor {
  id: PowerupId;
  label: string;
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Rectangle;
  glyph: Phaser.GameObjects.Text;
  bornMs: number;
}

const ENEMY_SPRITE_POOL_LIMIT = 32;
const EXPLOSION_POOL_LIMIT = 18;
const FEATHER_POOL_LIMIT = 96;
const SPARK_POOL_LIMIT = 160;
const TEXT_POOL_LIMIT = 32;
const GRAPHICS_POOL_LIMIT = 40;
const POWERUP_POOL_LIMIT = 12;

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
  private enemySpritePool: Phaser.GameObjects.Sprite[] = [];
  private explosionPool: Phaser.GameObjects.Sprite[] = [];
  private featherPool: Phaser.GameObjects.Rectangle[] = [];
  private sparkPool: Phaser.GameObjects.Arc[] = [];
  private textPool: Phaser.GameObjects.Text[] = [];
  private graphicsPool: Phaser.GameObjects.Graphics[] = [];
  private powerupPool: PowerupActor[] = [];
  private jackpotFx?: Phaser.GameObjects.Graphics;
  private stageAtmosphereFx?: Phaser.GameObjects.Graphics;
  private screenPolishFx?: Phaser.GameObjects.Graphics;
  private powerupFieldFx?: Phaser.GameObjects.Graphics;

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
    this.enemySpritePool = [];
    this.explosionPool = [];
    this.featherPool = [];
    this.sparkPool = [];
    this.textPool = [];
    this.graphicsPool = [];
    this.powerupPool = [];

    this.cameras.main.setRoundPixels(false);
    this.createBackground();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.jackpotFx = this.add.graphics().setDepth(-5);
    this.stageAtmosphereFx = this.add.graphics().setDepth(-4);
    this.screenPolishFx = this.add.graphics().setDepth(96);
    this.powerupFieldFx = this.add.graphics().setDepth(97);
    this.createCrosshair();
    this.bindCommands();
    this.registerInput();
    this.renderHud();
    this.showStageBanner(this.stage.title, this.stage.subtitle);
    this.playStageIntroFx(this.stage);
    arcadeAudio.startMusic('run', this.save.settings, this.stage.id);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
      this.unsubscribers.forEach((unsubscribe) => unsubscribe());
      this.unsubscribers = [];
    });
  }

  update(time: number, delta: number): void {
    this.updateCrosshair();
    if (this.gameEnded || this.pausedByUi) return;

    this.run.update(delta);
    this.updateBackground(delta);
    this.updateStageAtmosphere(time);
    this.updateJackpotAmbience(time);
    this.updateEnemies(time, delta);
    this.updatePowerups(time, delta);
    this.updateScreenPolish(time);
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

  private handleResize(): void {
    this.drawBackground();

    for (const star of this.starfield) {
      star.x = Phaser.Math.Clamp(star.x, 0, this.scale.width);
      star.y = Phaser.Math.Clamp(star.y, 0, this.scale.height);
    }
  }

  private drawStageSetDressing(width: number, height: number): void {
    const baseId = this.stageBaseId;

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

    this.background.fillStyle(0xffd447, 0.09);
    for (let y = 48; y < horizon - 80; y += 72) {
      this.background.fillRect(0, y, width, 9);
    }

    this.background.fillStyle(0x09040d, 0.64);
    this.background.fillRoundedRect(width * 0.34, horizon - 244, width * 0.32, 82, 14);
    this.background.lineStyle(4, 0xffd447, 0.58);
    this.background.strokeRoundedRect(width * 0.34, horizon - 244, width * 0.32, 82, 14);
    this.background.lineStyle(3, 0xff7a1f, 0.46);
    this.background.strokeRoundedRect(width * 0.34 + 12, horizon - 232, width * 0.32 - 24, 58, 10);

    for (let index = 0; index < 3; index++) {
      const reelX = width * 0.4 + index * width * 0.1;
      this.background.fillStyle(index === 1 ? 0xff7a1f : 0xffd447, 0.38);
      this.background.fillRoundedRect(reelX, horizon - 219, 46, 34, 6);
      this.background.lineStyle(2, 0xffffff, 0.38);
      this.background.strokeCircle(reelX + 23, horizon - 202, 10);
    }

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

    this.background.lineStyle(2, 0xff7a1f, 0.28);
    for (let x = -40; x < width + 80; x += 118) {
      this.background.lineBetween(x, horizon - 12, x + 64, height);
      this.background.lineBetween(x + 64, horizon - 28, x + 24, height);
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

  private updateStageAtmosphere(time: number): void {
    if (!this.stageAtmosphereFx) return;

    const fx = this.stageAtmosphereFx;
    const width = this.scale.width;
    const height = this.scale.height;
    const horizon = height * 0.72;
    const pulse = (Math.sin(time / 420) + 1) / 2;
    const compact = this.isCompactPlayfield();
    const reducedMotion = this.save.settings.reducedMotion;
    const sweep = reducedMotion ? width * 0.62 : ((time * 0.09) % (width + 260)) - 130;
    const { neon, haze } = this.stage.palette;

    fx.clear();
    fx.setBlendMode(Phaser.BlendModes.ADD);
    fx.fillStyle(neon, compact ? 0.035 : 0.052);
    fx.fillRect(0, 0, width, height);
    fx.lineStyle(2, neon, 0.08 + pulse * 0.12);
    fx.lineBetween(0, horizon - 22, width, horizon - 62);
    fx.lineStyle(1, 0xffffff, 0.08);
    for (let y = horizon + 24; y < height; y += compact ? 58 : 42) {
      fx.lineBetween(0, y, width, y - 10);
    }

    if (!reducedMotion) {
      fx.fillStyle(0xffffff, 0.035);
      fx.fillTriangle(sweep - 38, 0, sweep + 62, 0, sweep + 210, horizon);
    }

    switch (this.stageBaseId) {
      case 'graveyard-dusk':
        this.drawGraveyardAtmosphere(fx, width, height, horizon, time, compact, reducedMotion);
        break;
      case 'neon-boardwalk':
        this.drawBoardwalkAtmosphere(fx, width, height, horizon, time, compact, reducedMotion);
        break;
      case 'storm-tower':
        this.drawStormAtmosphere(fx, width, height, horizon, time, compact, reducedMotion);
        break;
      case 'junkyard-moon':
        this.drawJunkyardAtmosphere(fx, width, height, horizon, time, compact, reducedMotion);
        break;
      case 'carnival-night':
        this.drawCarnivalAtmosphere(fx, width, height, horizon, time, compact, reducedMotion);
        break;
      case 'raven-kings-nest':
        this.drawRavenNestAtmosphere(fx, width, height, horizon, time, compact, reducedMotion);
        break;
      case 'jackpot-alley':
        this.drawJackpotAtmosphere(fx, width, height, horizon, time, compact, reducedMotion);
        break;
      case 'cinder-viaduct':
        this.drawCinderAtmosphere(fx, width, height, horizon, time, compact, reducedMotion);
        break;
      case 'clocktower-apex':
        this.drawClocktowerAtmosphere(fx, width, height, horizon, time, compact, reducedMotion);
        break;
      default:
        fx.lineStyle(2, haze, 0.12);
        fx.strokeCircle(width * 0.76, height * 0.22, Math.min(width, height) * 0.18);
    }
  }

  private drawGraveyardAtmosphere(
    fx: Phaser.GameObjects.Graphics,
    width: number,
    height: number,
    horizon: number,
    time: number,
    compact: boolean,
    reducedMotion: boolean,
  ): void {
    const bands = compact ? 3 : 5;
    for (let index = 0; index < bands; index++) {
      const offset = reducedMotion ? 0 : Math.sin(time / 900 + index) * 42;
      const y = horizon - 154 + index * 38;
      fx.fillStyle(index % 2 === 0 ? 0xff42f8 : 0x9c7cff, 0.055);
      fx.fillRoundedRect(-80 + offset, y, width + 160, 15, 8);
    }
    fx.lineStyle(2, 0xfff0a6, 0.18);
    fx.strokeCircle(width * 0.78, height * 0.18, Math.min(width, height) * (0.13 + Math.sin(time / 700) * 0.006));
  }

  private drawBoardwalkAtmosphere(
    fx: Phaser.GameObjects.Graphics,
    width: number,
    height: number,
    horizon: number,
    time: number,
    compact: boolean,
    reducedMotion: boolean,
  ): void {
    const signCount = compact ? 4 : 7;
    for (let index = 0; index < signCount; index++) {
      const x = width * 0.08 + index * width * 0.14;
      const phase = reducedMotion ? 0.5 : (Math.sin(time / 180 + index * 0.9) + 1) / 2;
      fx.fillStyle(index % 2 === 0 ? 0x20f2ff : 0xffb11f, 0.08 + phase * 0.12);
      fx.fillRoundedRect(x, horizon - 138 - (index % 3) * 18, 56, 14, 5);
      fx.lineStyle(2, 0xffffff, 0.08 + phase * 0.12);
      fx.lineBetween(x + 8, horizon - 96, x + 46, height);
    }
  }

  private drawStormAtmosphere(
    fx: Phaser.GameObjects.Graphics,
    width: number,
    height: number,
    horizon: number,
    time: number,
    compact: boolean,
    reducedMotion: boolean,
  ): void {
    const flash = reducedMotion ? 0 : Math.max(0, Math.sin(time / 310) - 0.82) * 3.8;
    if (flash > 0) {
      fx.fillStyle(0xd7f7ff, Math.min(0.14, flash * 0.12));
      fx.fillRect(0, 0, width, horizon);
      fx.lineStyle(compact ? 3 : 5, 0xd7f7ff, Math.min(0.58, flash));
      fx.lineBetween(width * 0.2, 0, width * 0.34, height * 0.18);
      fx.lineBetween(width * 0.34, height * 0.18, width * 0.28, height * 0.3);
      fx.lineBetween(width * 0.28, height * 0.3, width * 0.42, height * 0.46);
    }
    fx.lineStyle(2, 0x93ff29, 0.12);
    for (let y = height * 0.12; y < horizon; y += compact ? 86 : 64) {
      const drift = reducedMotion ? 0 : Math.sin(time / 520 + y) * 26;
      fx.lineBetween(0, y + drift, width, y + 18 + drift);
    }
  }

  private drawJunkyardAtmosphere(
    fx: Phaser.GameObjects.Graphics,
    width: number,
    height: number,
    horizon: number,
    time: number,
    compact: boolean,
    reducedMotion: boolean,
  ): void {
    const emberCount = compact ? 10 : 18;
    for (let index = 0; index < emberCount; index++) {
      const x = (index * 97 + (reducedMotion ? 0 : time * 0.025)) % (width + 80) - 40;
      const y = horizon - 18 - ((index * 43 + (reducedMotion ? 0 : time * 0.04)) % 190);
      fx.fillStyle(index % 2 === 0 ? 0xffe14b : 0xff6d2d, 0.12);
      fx.fillCircle(x, y, 2 + (index % 3));
    }
    fx.lineStyle(3, 0xff6d2d, 0.14);
    fx.lineBetween(width * 0.12, horizon - 152, width * 0.46, horizon - 42);
  }

  private drawCarnivalAtmosphere(
    fx: Phaser.GameObjects.Graphics,
    width: number,
    height: number,
    horizon: number,
    time: number,
    compact: boolean,
    reducedMotion: boolean,
  ): void {
    const wheelX = width * 0.76;
    const wheelY = horizon - 118;
    const wheelRadius = Math.min(width, height) * 0.17;
    const rotation = reducedMotion ? 0 : time / 900;
    fx.lineStyle(2, 0xff2f7f, 0.2);
    for (let index = 0; index < (compact ? 8 : 12); index++) {
      const angle = rotation + (Math.PI * 2 * index) / 12;
      fx.fillStyle(index % 2 === 0 ? 0xffdf4d : 0x2cffc8, 0.14);
      fx.fillCircle(wheelX + Math.cos(angle) * wheelRadius, wheelY + Math.sin(angle) * wheelRadius, 7);
    }
    fx.lineStyle(2, 0x2cffc8, 0.1);
    fx.strokeCircle(wheelX, wheelY, wheelRadius + 16);
  }

  private drawRavenNestAtmosphere(
    fx: Phaser.GameObjects.Graphics,
    width: number,
    height: number,
    horizon: number,
    time: number,
    compact: boolean,
    reducedMotion: boolean,
  ): void {
    const pulse = reducedMotion ? 0.5 : (Math.sin(time / 260) + 1) / 2;
    fx.fillStyle(0xff1e3d, 0.06 + pulse * 0.08);
    fx.fillCircle(width * 0.74, horizon - 148, compact ? 92 : 132);
    fx.lineStyle(3, 0x9c2dff, 0.18 + pulse * 0.16);
    fx.strokeCircle(width * 0.74, horizon - 148, compact ? 112 : 158);
    for (let index = 0; index < 5; index++) {
      const wing = reducedMotion ? 0 : Math.sin(time / 520 + index) * 12;
      fx.lineBetween(width * 0.18 + index * width * 0.12, horizon - 78 + wing, width * 0.32 + index * width * 0.12, horizon - 136 - wing);
    }
  }

  private drawJackpotAtmosphere(
    fx: Phaser.GameObjects.Graphics,
    width: number,
    height: number,
    horizon: number,
    time: number,
    compact: boolean,
    reducedMotion: boolean,
  ): void {
    const lightCount = compact ? 8 : 14;
    for (let index = 0; index < lightCount; index++) {
      const x = (width * index) / Math.max(1, lightCount - 1);
      const phase = reducedMotion ? 0.5 : (Math.sin(time / 120 + index) + 1) / 2;
      fx.fillStyle(0xffd447, 0.1 + phase * 0.16);
      fx.fillCircle(x, horizon - 44, 10);
      fx.fillStyle(0xffffff, 0.08 + phase * 0.14);
      fx.fillCircle(x, horizon - 44, 4);
    }
  }

  private drawCinderAtmosphere(
    fx: Phaser.GameObjects.Graphics,
    width: number,
    height: number,
    horizon: number,
    time: number,
    compact: boolean,
    reducedMotion: boolean,
  ): void {
    const railCount = compact ? 4 : 7;
    for (let index = 0; index < railCount; index++) {
      const y = horizon - 132 + index * 34;
      const offset = reducedMotion ? 0 : Math.sin(time / 480 + index) * 22;
      fx.lineStyle(3, index % 2 === 0 ? 0xff8738 : 0x49e7ff, 0.1);
      fx.lineBetween(-40, y + offset, width + 40, y + 18 - offset);
    }
    fx.fillStyle(0xffb35c, 0.075);
    fx.fillCircle(width * 0.18, height * 0.18, Math.min(width, height) * 0.16);
  }

  private drawClocktowerAtmosphere(
    fx: Phaser.GameObjects.Graphics,
    width: number,
    height: number,
    horizon: number,
    time: number,
    compact: boolean,
    reducedMotion: boolean,
  ): void {
    const x = width * 0.56 + 63;
    const y = horizon - 238;
    const radius = compact ? 56 : 74;
    const hand = reducedMotion ? -Math.PI / 3 : time / 640;
    fx.lineStyle(2, 0x5ee7ff, 0.2);
    fx.strokeCircle(x, y, radius);
    fx.strokeCircle(x, y, radius + 22);
    fx.lineStyle(4, 0xff3fb4, 0.22);
    fx.lineBetween(x, y, x + Math.cos(hand) * radius, y + Math.sin(hand) * radius);
    fx.lineStyle(2, 0xffffff, 0.12);
    fx.lineBetween(x, y, x + Math.cos(hand * 0.42) * (radius * 0.74), y + Math.sin(hand * 0.42) * (radius * 0.74));
  }

  private updateJackpotAmbience(time: number): void {
    if (!this.jackpotFx) return;

    this.jackpotFx.clear();
    if (!this.stage.bonus) return;

    const width = this.scale.width;
    const height = this.scale.height;
    const horizon = height * 0.72;
    const pulse = (Math.sin(time / 130) + 1) / 2;
    const sweepX = ((time * 0.16) % (width + 220)) - 110;

    this.jackpotFx.fillStyle(0xffd447, 0.08 + pulse * 0.06);
    this.jackpotFx.fillRect(0, 0, width, height);
    this.jackpotFx.lineStyle(3, 0xffd447, 0.2 + pulse * 0.36);
    this.jackpotFx.lineBetween(sweepX - 70, 0, sweepX + 90, horizon);
    this.jackpotFx.lineBetween(sweepX + 20, 0, sweepX + 180, horizon);

    for (let x = 28; x < width; x += 74) {
      const offset = (x / 74) % 2 === 0 ? 0 : Math.PI;
      const alpha = 0.32 + ((Math.sin(time / 160 + offset) + 1) / 2) * 0.48;
      this.jackpotFx.fillStyle(0xffffff, alpha);
      this.jackpotFx.fillCircle(x, horizon - 46, 6);
      this.jackpotFx.fillStyle(0xffd447, alpha * 0.65);
      this.jackpotFx.fillCircle(x, horizon - 46, 12);
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
    this.drawV1Vignette(this.screenPolishFx, width, height, compact);
    this.drawArcadeScanlines(this.screenPolishFx, width, height, time, compact, reducedMotion);
    if (boss) this.drawBossPressureOverlay(this.screenPolishFx, width, height, boss, time, compact, reducedMotion);
    if (this.run.lives <= 1 && !this.stage.bonus) this.drawLowLifeOverlay(this.screenPolishFx, width, height, time, reducedMotion);

    this.powerupFieldFx.clear();
    this.powerupFieldFx.setBlendMode(Phaser.BlendModes.ADD);
    this.drawActivePowerupField(this.powerupFieldFx, width, height, time, compact, reducedMotion);
  }

  private drawV1Vignette(graphics: Phaser.GameObjects.Graphics, width: number, height: number, compact: boolean): void {
    const layers = compact ? 4 : 6;
    for (let index = 0; index < layers; index++) {
      const inset = index * (compact ? 10 : 14);
      const alpha = 0.018 + index * (compact ? 0.014 : 0.016);
      graphics.fillStyle(0x02030a, alpha);
      graphics.fillRect(0, inset, width, compact ? 9 : 12);
      graphics.fillRect(0, height - inset - (compact ? 9 : 12), width, compact ? 9 : 12);
      graphics.fillRect(inset, 0, compact ? 9 : 12, height);
      graphics.fillRect(width - inset - (compact ? 9 : 12), 0, compact ? 9 : 12, height);
    }
  }

  private drawArcadeScanlines(
    graphics: Phaser.GameObjects.Graphics,
    width: number,
    height: number,
    time: number,
    compact: boolean,
    reducedMotion: boolean,
  ): void {
    const spacing = compact ? 24 : 18;
    const drift = reducedMotion ? 0 : Math.floor((time * 0.018) % spacing);
    graphics.lineStyle(1, 0xffffff, compact ? 0.025 : 0.035);
    for (let y = drift; y < height; y += spacing) {
      graphics.lineBetween(0, y, width, y);
    }

    graphics.lineStyle(1, this.stage.palette.neon, compact ? 0.028 : 0.045);
    const sweepY = reducedMotion ? height * 0.42 : (time * 0.04) % (height + 80) - 40;
    graphics.lineBetween(0, sweepY, width, sweepY + 14);
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

  private drawLowLifeOverlay(
    graphics: Phaser.GameObjects.Graphics,
    width: number,
    height: number,
    time: number,
    reducedMotion: boolean,
  ): void {
    const pulse = reducedMotion ? 0.45 : (Math.sin(time / 180) + 1) / 2;
    graphics.fillStyle(0xff315a, 0.045 + pulse * 0.035);
    graphics.fillRect(0, 0, width, 18);
    graphics.fillRect(0, height - 18, width, 18);
    graphics.lineStyle(2, 0xff315a, 0.18 + pulse * 0.24);
    graphics.lineBetween(0, height * 0.18, width * 0.16, 0);
    graphics.lineBetween(width, height * 0.82, width * 0.84, height);
  }

  private drawActivePowerupField(
    graphics: Phaser.GameObjects.Graphics,
    width: number,
    height: number,
    time: number,
    compact: boolean,
    reducedMotion: boolean,
  ): void {
    const centerX = width * 0.5;
    const centerY = height * 0.45;
    const pointer = this.input.activePointer;

    if (this.run.isPowerupActive('slowmo')) {
      const wave = reducedMotion ? 0 : Math.sin(time / 360) * 18;
      graphics.lineStyle(2, 0x31f4ff, compact ? 0.18 : 0.24);
      for (let index = 0; index < (compact ? 3 : 5); index++) {
        graphics.strokeCircle(centerX, centerY, 88 + index * 48 + wave);
      }
      graphics.lineStyle(1, 0xffffff, 0.16);
      for (let y = height * 0.18; y < height * 0.76; y += compact ? 68 : 48) {
        const offset = reducedMotion ? 0 : Math.sin(time / 240 + y) * 24;
        graphics.lineBetween(width * 0.1, y + offset, width * 0.9, y - offset);
      }
    }

    if (this.run.isPowerupActive('multishot')) {
      const orbit = reducedMotion ? 0 : time / 180;
      graphics.lineStyle(2, 0xff8a32, 0.26);
      for (let index = 0; index < 6; index++) {
        const angle = orbit + (Math.PI * 2 * index) / 6;
        const x = pointer.x + Math.cos(angle) * 42;
        const y = pointer.y + Math.sin(angle) * 28;
        graphics.strokeCircle(x, y, 6);
        graphics.lineBetween(pointer.x, pointer.y, x, y);
      }
    }

    if (this.run.isPowerupActive('scoreBoost')) {
      graphics.lineStyle(2, 0xffdf4d, compact ? 0.14 : 0.2);
      for (let index = 0; index < (compact ? 8 : 12); index++) {
        const angle = (Math.PI * 2 * index) / (compact ? 8 : 12) + (reducedMotion ? 0 : time / 1200);
        graphics.lineBetween(centerX + Math.cos(angle) * 72, centerY + Math.sin(angle) * 42, centerX + Math.cos(angle) * width * 0.45, centerY + Math.sin(angle) * height * 0.42);
      }
    }

    if (this.run.isPowerupActive('overdrive')) {
      const slide = reducedMotion ? 0 : (time * 0.16) % 92;
      graphics.lineStyle(3, 0xff5fbb, compact ? 0.16 : 0.24);
      for (let x = -120 + slide; x < width + 120; x += 92) {
        graphics.lineBetween(x, height, x + width * 0.22, 0);
      }
      graphics.lineStyle(1, 0xffffff, 0.18);
      graphics.strokeRect(pointer.x - 34, pointer.y - 18, 68, 36);
    }

    if (this.run.isPowerupActive('coinRush')) {
      const coins = compact ? 9 : 15;
      for (let index = 0; index < coins; index++) {
        const drift = reducedMotion ? index * 37 : time * 0.05 + index * 37;
        const x = (index * 71 + drift) % (width + 80) - 40;
        const y = height * 0.18 + ((index * 41 + drift * 0.7) % (height * 0.58));
        graphics.lineStyle(2, 0xffd447, 0.28);
        graphics.strokeCircle(x, y, 8 + (index % 3));
        graphics.lineStyle(1, 0xffffff, 0.16);
        graphics.lineBetween(x - 4, y, x + 4, y);
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
    const sprite = this.acquireEnemySprite(x, spawnY);
    const visualScaleMultiplier = this.enemyVisualScaleMultiplier;
    const visualScale = def.scale * visualScaleMultiplier;
    sprite.play('raven-flap');
    sprite.setScale(visualScale);
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
      visualRadius: def.radius * visualScaleMultiplier,
      visualScale,
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
      this.playBossEntryFx(actor);
    } else {
      this.playEnemySpawnTelegraph(actor);
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
        actor.sprite.scale = actor.visualScale + Math.sin(t * 4) * 0.035 * this.enemyVisualScaleMultiplier;
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
      this.playMissFeedback(x, y);
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
    this.playWeaponImpact(actor);
    actor.sprite.setTintFill(0xffffff);
    this.time.delayedCall(70, () => {
      if (!actor.sprite.active) return;
      actor.sprite.clearTint();
      if (actor.def.tint) actor.sprite.setTint(actor.def.tint);
    });

    if (actor.hp > 0) {
      this.floatText(actor.sprite.x, actor.sprite.y - actor.radius, 'HIT', '#ffe56a', 22);
      this.playEnemyWoundedFeedback(actor);
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
    const earnedCoins = actor.def.coinValue * (this.run.isPowerupActive('coinRush') ? 2 : 1);

    this.floatText(x, y - radius, `+${points}`, actor.def.tint ? `#${actor.def.tint.toString(16).padStart(6, '0')}` : '#ffe56a', 24 + Math.min(18, this.run.comboMultiplier * 2));
    this.playScoreBurst(x, y, actor, points);
    this.playEnemyDefeatSignature(actor, x, y);
    const isBonusStage = this.stage.bonus === true;
    if (earnedCoins > 1 || isBonusStage) {
      this.floatText(x + Math.min(72, radius), y + radius * 0.32, `+${earnedCoins} COIN`, '#ffd447', 19);
      this.playCoinBurst(x, y, earnedCoins, isBonusStage);
    }
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
      this.playBossDefeatSetPiece(x, y);
    }
  }

  private collectPowerupAt(x: number, y: number): boolean {
    const collectRadius = POWERUP_TUNING.collectRadius + this.touchAimBonus * POWERUP_TUNING.mobileCollectRadiusBonus;
    const powerup = this.powerups.find((item) => item.container.active && Phaser.Math.Distance.Between(x, y, item.container.x, item.container.y) < collectRadius);
    if (!powerup) return false;

    if (powerup.id === 'extraLife') {
      this.run.addLife();
    } else {
      this.run.activatePowerup(powerup.id);
    }

    this.floatText(powerup.container.x, powerup.container.y - 32, powerup.label, '#9dff57', 24);
    this.playPowerupCollectEffect(powerup);
    this.createFeathers(powerup.container.x, powerup.container.y, 0x9dff57, 16);
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
    powerup.body.setFillStyle(color, 0.92);
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
    const body = this.add.rectangle(0, 0, 42, 42, 0xffffff, 0.92).setStrokeStyle(2, 0xffffff, 0.9);
    const glyph = this.add.text(0, 1, '', {
      fontFamily: 'Impact, Haettenschweiler, sans-serif',
      fontSize: '24px',
      color: '#08101c',
    });
    glyph.setOrigin(0.5);

    const container = this.add.container(0, 0, [body, glyph]);
    container.setDepth(50);
    container.setActive(false);
    container.setVisible(false);
    return { id: 'slowmo', label: powerupLabel('slowmo'), container, body, glyph, bornMs: 0 };
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
    this.playStageClearSweep(currentStage);
    if (this.stage.bonus) {
      this.playJackpotStageClear();
    } else {
      this.playStageRewardBurst(this.scale.width / 2, this.scale.height * 0.42, this.stage.palette.neon);
    }
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
    this.playStageIntroFx(this.stage);
    if (this.stage.bonus) this.playJackpotIntro();
  }

  private clearActorsForStageAdvance(): void {
    for (const enemy of this.enemies) this.destroyEnemyActor(enemy);
    this.enemies = [];
    for (const powerup of this.powerups) this.releasePowerup(powerup);
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

    const width = actor.boss ? 220 * this.enemyVisualScaleMultiplier : actor.visualRadius * 1.7;
    const x = actor.sprite.x - width / 2;
    const y = actor.sprite.y - actor.visualRadius - 16;
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
    this.releaseEnemySprite(actor.sprite);
  }

  private acquireEnemySprite(x: number, y: number): Phaser.GameObjects.Sprite {
    const sprite = this.enemySpritePool.pop() ?? this.add.sprite(0, 0, SPRITE_KEYS.raven);
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

  private createExplosion(x: number, y: number, scale: number): void {
    const explosion = this.acquireExplosion(x, y);
    explosion.setScale(Math.max(0.55, scale * 1.05));
    explosion.setDepth(60);
    explosion.play('boom-pop');
    this.sound.play(AUDIO_KEYS.boom, { volume: 0.22 * this.save.settings.sfxVolume });
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
        collect.lineBetween(-34, 0, 34, 0);
        collect.lineBetween(0, -34, 0, 34);
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

  private emitSparkBurst(
    x: number,
    y: number,
    color: number,
    count: number,
    depth: number,
    spread: number,
    coinLike = false,
  ): void {
    const capped = this.save.settings.reducedMotion
      ? Math.min(count, 7)
      : this.isCompactPlayfield()
        ? Math.ceil(count * 0.58)
        : count;

    for (let index = 0; index < capped; index++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const distance = Phaser.Math.FloatBetween(spread * 0.24, spread);
      const radius = coinLike ? Phaser.Math.FloatBetween(3.4, 6.2) : Phaser.Math.FloatBetween(2.2, 4.8);
      const spark = this.acquireSpark(x, y, radius, color, coinLike ? 0.95 : 0.84);
      spark.setDepth(depth);
      spark.setBlendMode(Phaser.BlendModes.ADD);

      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance * 0.72,
        alpha: 0,
        scale: coinLike ? 0.22 : 0.08,
        duration: this.save.settings.reducedMotion ? 180 : Phaser.Math.Between(340, 680),
        ease: 'Cubic.easeOut',
        onComplete: () => this.releaseSpark(spark),
      });
    }
  }

  private acquireSpark(x: number, y: number, radius: number, color: number, alpha: number): Phaser.GameObjects.Arc {
    const spark = this.sparkPool.pop() ?? this.add.circle(0, 0, radius, color, alpha);
    spark.setPosition(x, y);
    spark.setRadius(radius);
    spark.setFillStyle(color, alpha);
    spark.setActive(true);
    spark.setVisible(true);
    spark.setAlpha(1);
    spark.setScale(1);
    return spark;
  }

  private releaseSpark(spark: Phaser.GameObjects.Arc): void {
    this.tweens.killTweensOf(spark);
    spark.setActive(false);
    spark.setVisible(false);
    spark.setBlendMode(Phaser.BlendModes.NORMAL);
    if (this.sparkPool.length < SPARK_POOL_LIMIT) {
      this.sparkPool.push(spark);
    } else {
      spark.destroy();
    }
  }

  private createFeathers(x: number, y: number, color: number, count: number): void {
    const cap = this.save.settings.reducedMotion
      ? PRESENTATION_TUNING.reducedMotionFeatherCap
      : this.isCompactPlayfield()
        ? PRESENTATION_TUNING.mobileFeatherCap
        : PRESENTATION_TUNING.desktopFeatherCap;

    for (let index = 0; index < Math.min(count, cap); index++) {
      const particle = this.acquireFeatherParticle(x, y, Phaser.Math.Between(4, 12), Phaser.Math.Between(2, 5), color);
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
        onComplete: () => this.releaseFeatherParticle(particle),
      });
    }
  }

  private acquireFeatherParticle(x: number, y: number, width: number, height: number, color: number): Phaser.GameObjects.Rectangle {
    const particle = this.featherPool.pop() ?? this.add.rectangle(0, 0, width, height, color, 0.88);
    particle.setPosition(x, y);
    particle.setSize(width, height);
    particle.setFillStyle(color, 0.88);
    particle.setActive(true);
    particle.setVisible(true);
    particle.setAlpha(1);
    particle.setScale(1);
    particle.setAngle(0);
    return particle;
  }

  private releaseFeatherParticle(particle: Phaser.GameObjects.Rectangle): void {
    this.tweens.killTweensOf(particle);
    particle.setActive(false);
    particle.setVisible(false);
    if (this.featherPool.length < FEATHER_POOL_LIMIT) {
      this.featherPool.push(particle);
    } else {
      particle.destroy();
    }
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
    if (now - this.lastCooldownFeedbackAt < 220) return;
    this.lastCooldownFeedbackAt = now;
    this.floatText(x, y - 22, 'RECHARGE', '#ff315a', 18);
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

  private floatText(x: number, y: number, text: string, color: string, size: number): void {
    const label = this.acquireFloatText(x, y, text, color, size);
    label.setOrigin(0.5);
    label.setDepth(120);
    this.tweens.add({
      targets: label,
      y: y - 46,
      alpha: 0,
      scale: 1.2,
      duration: 760,
      ease: 'Quad.easeOut',
      onComplete: () => this.releaseFloatText(label),
    });
  }

  private acquireFloatText(x: number, y: number, text: string, color: string, size: number): Phaser.GameObjects.Text {
    const label = this.textPool.pop() ?? this.add.text(0, 0, '', {
      fontFamily: 'Impact, Haettenschweiler, sans-serif',
      fontSize: `${size}px`,
      color,
      stroke: '#070510',
      strokeThickness: 5,
    });
    label.setText(text);
    label.setStyle({
      fontFamily: 'Impact, Haettenschweiler, sans-serif',
      fontSize: `${size}px`,
      color,
      stroke: '#070510',
      strokeThickness: 5,
    });
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
      return '+';
    case 'overdrive':
      return 'O';
    case 'coinRush':
      return '$';
  }
}
