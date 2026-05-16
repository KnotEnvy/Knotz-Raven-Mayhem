import Phaser from 'phaser';
import { ENEMIES } from '../data/enemies';
import { SPRITE_KEYS } from '../data/assets';
import { CROSSHAIRS, WEAPONS } from '../data/weapons';
import { UPGRADES } from '../data/upgrades';
import {
  cycleSetting,
  loadSave,
  purchaseCrosshair,
  purchaseUpgrade,
  purchaseWeapon,
  resetSave,
  selectCrosshair,
  selectWeapon,
} from '../save';
import type { GameSettings, SaveData } from '../types';
import { arcadeAudio } from '../systems/ArcadeAudio';
import { dispatchUiState, onCommand } from '../../ui/events';

interface MenuRaven {
  sprite: Phaser.GameObjects.Sprite;
  velocityX: number;
  velocityY: number;
}

type AttractMode = 'home' | 'armory' | 'records' | 'options' | 'credits';
type AttractDemoMode = 'raven-guide' | 'field-guide' | 'upgrade-guide' | 'armory-guide';
type AttractUiMode = AttractMode | AttractDemoMode;

const ATTRACT_IDLE_MS = 15000;
const ATTRACT_DEMO_SLIDE_MS = 10000;
const ATTRACT_DEMO_SEQUENCE: AttractDemoMode[] = ['raven-guide', 'field-guide', 'upgrade-guide', 'armory-guide'];

export class AttractScene extends Phaser.Scene {
  private save!: SaveData;
  private mode: AttractUiMode = 'home';
  private ravens: MenuRaven[] = [];
  private unsubscribers: Array<() => void> = [];
  private spawnTimer = 0;
  private idleTimer = 0;
  private demoTimer = 0;
  private demoSlideIndex = 0;

  constructor() {
    super('AttractScene');
  }

  create(data: { mode?: AttractMode } = {}): void {
    this.save = loadSave();
    this.mode = data.mode ?? 'home';
    this.cameras.main.setBackgroundColor(0x070510);
    this.createBackdrop();
    this.bindCommands();
    this.bindIdleInput();
    this.renderUi();
    arcadeAudio.startMusic('menu', this.save.settings, 'menu');

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribers.forEach((unsubscribe) => unsubscribe());
      this.unsubscribers = [];
    });
  }

  update(_time: number, delta: number): void {
    this.spawnTimer += delta;
    this.updateAttractDemo(delta);
    if (this.spawnTimer > 720) {
      this.spawnTimer = 0;
      this.spawnRaven();
    }

    for (const raven of this.ravens) {
      raven.sprite.x += raven.velocityX * delta;
      raven.sprite.y += raven.velocityY * delta;

      if (raven.sprite.y < 40 || raven.sprite.y > this.scale.height - 40) {
        raven.velocityY *= -1;
      }

      if (raven.sprite.x < -220 || raven.sprite.x > this.scale.width + 220) {
        raven.sprite.destroy();
      }
    }

    this.ravens = this.ravens.filter((raven) => raven.sprite.active);
  }

  private createBackdrop(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x070510, 0x130a2c, 0x241455, 0x071d35, 1);
    bg.fillRect(0, 0, width, height);

    const grid = this.add.graphics();
    grid.lineStyle(1, 0x24e6ff, 0.16);
    for (let x = 0; x < width; x += 70) {
      grid.lineBetween(x, height * 0.58, x - width * 0.24, height);
    }
    for (let y = height * 0.6; y < height; y += 34) {
      grid.lineBetween(0, y, width, y);
    }

    const neon = this.add.graphics();
    neon.lineStyle(6, 0xff3fb4, 0.4);
    neon.strokeCircle(width * 0.75, height * 0.25, Math.min(width, height) * 0.22);
    neon.lineStyle(3, 0xffd84d, 0.38);
    neon.strokeCircle(width * 0.75, height * 0.25, Math.min(width, height) * 0.28);
  }

  private bindCommands(): void {
    this.unsubscribers.push(
      onCommand('start-run', () => {
        this.resetAttractIdle();
        arcadeAudio.playMenuConfirm();
        dispatchUiState({ screen: 'blank' });
        this.scene.start('GameScene');
      }),
      onCommand('open-armory', () => {
        this.resetAttractIdle();
        arcadeAudio.playMenuConfirm();
        this.mode = 'armory';
        this.renderUi();
      }),
      onCommand('open-records', () => {
        this.resetAttractIdle();
        arcadeAudio.playMenuConfirm();
        this.mode = 'records';
        this.renderUi();
      }),
      onCommand('open-options', () => {
        this.resetAttractIdle();
        arcadeAudio.playMenuConfirm();
        this.mode = 'options';
        this.renderUi();
      }),
      onCommand('open-credits', () => {
        this.resetAttractIdle();
        arcadeAudio.playMenuConfirm();
        this.mode = 'credits';
        this.renderUi();
      }),
      onCommand('show-home', () => {
        this.resetAttractIdle();
        arcadeAudio.playMenuConfirm();
        this.mode = 'home';
        this.renderUi();
      }),
      onCommand('reset-save', () => {
        this.resetAttractIdle();
        this.save = resetSave();
        arcadeAudio.applySettings(this.save.settings);
        this.mode = 'records';
        this.renderUi();
      }),
      onCommand('purchase-weapon', ({ id }) => {
        if (!id) return;
        this.resetAttractIdle();
        this.save = purchaseWeapon(this.save, id as SaveData['selectedWeapon']);
        this.renderUi();
      }),
      onCommand('select-weapon', ({ id }) => {
        if (!id) return;
        this.resetAttractIdle();
        this.save = selectWeapon(this.save, id as SaveData['selectedWeapon']);
        this.renderUi();
      }),
      onCommand('purchase-crosshair', ({ id }) => {
        if (!id) return;
        this.resetAttractIdle();
        this.save = purchaseCrosshair(this.save, id as SaveData['selectedCrosshair']);
        this.renderUi();
      }),
      onCommand('select-crosshair', ({ id }) => {
        if (!id) return;
        this.resetAttractIdle();
        this.save = selectCrosshair(this.save, id as SaveData['selectedCrosshair']);
        this.renderUi();
      }),
      onCommand('purchase-upgrade', ({ id }) => {
        if (!id) return;
        this.resetAttractIdle();
        this.save = purchaseUpgrade(this.save, id as keyof SaveData['upgrades']);
        this.renderUi();
      }),
      onCommand('cycle-setting', ({ id }) => {
        if (!id) return;
        this.resetAttractIdle();
        this.save = cycleSetting(this.save, id as keyof GameSettings);
        arcadeAudio.startMusic('menu', this.save.settings, 'menu');
        arcadeAudio.playMenuConfirm();
        this.renderUi();
      }),
    );
  }

  private bindIdleInput(): void {
    this.input.on('pointerdown', () => this.resetAttractIdle());
    this.input.keyboard?.on('keydown', () => this.resetAttractIdle());
  }

  private updateAttractDemo(delta: number): void {
    if (this.isUtilityMode()) {
      this.idleTimer = 0;
      this.demoTimer = 0;
      return;
    }

    if (this.mode === 'home') {
      this.idleTimer += delta;
      if (this.idleTimer >= ATTRACT_IDLE_MS) {
        this.demoSlideIndex = 0;
        this.mode = ATTRACT_DEMO_SEQUENCE[this.demoSlideIndex];
        this.demoTimer = 0;
        this.renderUi();
      }
      return;
    }

    this.demoTimer += delta;
    if (this.demoTimer >= ATTRACT_DEMO_SLIDE_MS) {
      this.demoTimer = 0;
      this.demoSlideIndex = (this.demoSlideIndex + 1) % ATTRACT_DEMO_SEQUENCE.length;
      this.mode = ATTRACT_DEMO_SEQUENCE[this.demoSlideIndex];
      this.renderUi();
    }
  }

  private resetAttractIdle(): void {
    this.idleTimer = 0;
    this.demoTimer = 0;
    this.demoSlideIndex = 0;
    if (this.isDemoMode()) {
      this.mode = 'home';
      this.renderUi();
    }
  }

  private isUtilityMode(): boolean {
    return this.mode === 'armory' || this.mode === 'records' || this.mode === 'options' || this.mode === 'credits';
  }

  private isDemoMode(): boolean {
    return this.mode === 'raven-guide' || this.mode === 'field-guide' || this.mode === 'upgrade-guide' || this.mode === 'armory-guide';
  }

  private renderUi(): void {
    dispatchUiState({
      screen: 'attract',
      mode: this.mode,
      save: this.save,
      weapons: WEAPONS,
      crosshairs: CROSSHAIRS,
      upgrades: UPGRADES,
      enemies: Object.values(ENEMIES),
    });
  }

  private spawnRaven(): void {
    const fromLeft = Math.random() > 0.5;
    const enemy = Math.random() > 0.82 ? ENEMIES.golden : Math.random() > 0.62 ? ENEMIES.fast : ENEMIES.normal;
    const sprite = this.add.sprite(fromLeft ? -120 : this.scale.width + 120, Phaser.Math.Between(50, this.scale.height - 80), SPRITE_KEYS.raven);
    sprite.play('raven-flap');
    sprite.setScale(enemy.scale * Phaser.Math.FloatBetween(0.8, 1.25));
    sprite.setAlpha(0.5);
    sprite.setDepth(4);
    if (enemy.tint) sprite.setTint(enemy.tint);
    if (fromLeft) sprite.setFlipX(true);

    this.ravens.push({
      sprite,
      velocityX: (fromLeft ? 1 : -1) * Phaser.Math.FloatBetween(0.05, 0.16),
      velocityY: Phaser.Math.FloatBetween(-0.035, 0.035),
    });
  }
}
