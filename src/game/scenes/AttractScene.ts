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
const MENU_RAVEN_POOL_LIMIT = 18;
const ARMORY_SPARK_POOL_LIMIT = 90;

export class AttractScene extends Phaser.Scene {
  private save!: SaveData;
  private mode: AttractUiMode = 'home';
  private ravens: MenuRaven[] = [];
  private ravenPool: Phaser.GameObjects.Sprite[] = [];
  private unsubscribers: Array<() => void> = [];
  private spawnTimer = 0;
  private idleTimer = 0;
  private demoTimer = 0;
  private demoSlideIndex = 0;
  private armorySparkPool: Phaser.GameObjects.Arc[] = [];

  constructor() {
    super('AttractScene');
  }

  create(data: { mode?: AttractMode } = {}): void {
    this.save = loadSave();
    this.mode = data.mode ?? 'home';
    this.ravens = [];
    this.ravenPool = [];
    this.armorySparkPool = [];
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
        this.releaseMenuRaven(raven.sprite);
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
        const previous = this.save;
        this.save = purchaseWeapon(this.save, id as SaveData['selectedWeapon']);
        this.playArmoryTransactionFx(this.save !== previous, this.loadoutFxColor(id), this.save !== previous ? 'Gun unlocked' : 'Need more coins', 'loadout');
        this.renderUi();
      }),
      onCommand('select-weapon', ({ id }) => {
        if (!id) return;
        this.resetAttractIdle();
        const previous = this.save;
        this.save = selectWeapon(this.save, id as SaveData['selectedWeapon']);
        this.playArmoryTransactionFx(this.save !== previous, this.loadoutFxColor(id), 'Gun equipped', 'loadout');
        this.renderUi();
      }),
      onCommand('purchase-crosshair', ({ id }) => {
        if (!id) return;
        this.resetAttractIdle();
        const previous = this.save;
        this.save = purchaseCrosshair(this.save, id as SaveData['selectedCrosshair']);
        this.playArmoryTransactionFx(this.save !== previous, this.loadoutFxColor(id), this.save !== previous ? 'Assist chip online' : 'Need more coins', 'loadout');
        this.renderUi();
      }),
      onCommand('select-crosshair', ({ id }) => {
        if (!id) return;
        this.resetAttractIdle();
        const previous = this.save;
        this.save = selectCrosshair(this.save, id as SaveData['selectedCrosshair']);
        this.playArmoryTransactionFx(this.save !== previous, this.loadoutFxColor(id), 'Assist chip installed', 'loadout');
        this.renderUi();
      }),
      onCommand('purchase-upgrade', ({ id }) => {
        if (!id) return;
        this.resetAttractIdle();
        const previousRank = this.save.upgrades[id as keyof SaveData['upgrades']] ?? 0;
        this.save = purchaseUpgrade(this.save, id as keyof SaveData['upgrades']);
        const nextRank = this.save.upgrades[id as keyof SaveData['upgrades']] ?? 0;
        this.playArmoryTransactionFx(nextRank > previousRank, upgradeFxColor(id), nextRank > previousRank ? `Upgrade rank ${nextRank}` : 'Need more coins', 'upgrade');
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

  private playArmoryTransactionFx(success: boolean, color: number, label: string, intensity: 'loadout' | 'upgrade'): void {
    const activeColor = success ? color : 0xff315a;
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height * 0.55;
    const radius = intensity === 'upgrade' ? 142 : 104;
    const ring = this.add.graphics().setDepth(8);

    ring.setPosition(centerX, centerY);
    ring.lineStyle(success ? 5 : 3, activeColor, success ? 0.86 : 0.7);
    ring.strokeCircle(0, 0, radius);
    ring.lineStyle(2, 0xffffff, success ? 0.38 : 0.22);
    ring.strokeCircle(0, 0, radius * 0.72);
    ring.lineStyle(2, activeColor, 0.44);

    const spokes = intensity === 'upgrade' ? 12 : 8;
    for (let index = 0; index < spokes; index++) {
      const angle = (Math.PI * 2 * index) / spokes;
      ring.lineBetween(Math.cos(angle) * radius * 0.42, Math.sin(angle) * radius * 0.42, Math.cos(angle) * radius * 1.08, Math.sin(angle) * radius * 1.08);
    }

    if (intensity === 'upgrade') {
      for (let index = 0; index < 4; index++) {
        const y = -64 + index * 42;
        ring.strokeRoundedRect(-170 + index * 12, y, 340 - index * 24, 18, 6);
      }
    }

    const text = this.add.text(centerX, centerY - radius - 28, label.toUpperCase(), {
      fontFamily: 'Impact, Haettenschweiler, sans-serif',
      fontSize: intensity === 'upgrade' ? '34px' : '26px',
      color: success ? '#ffe56a' : '#ff315a',
      stroke: '#070510',
      strokeThickness: 6,
      align: 'center',
    });
    text.setOrigin(0.5);
    text.setDepth(9);

    if (!this.save.settings.reducedMotion) {
      this.emitArmorySparks(centerX, centerY, activeColor, success ? (intensity === 'upgrade' ? 42 : 26) : 12, radius * 1.25);
    }

    this.tweens.add({
      targets: ring,
      alpha: 0,
      scale: success ? 1.22 : 0.86,
      duration: this.save.settings.reducedMotion ? 180 : 520,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });
    this.tweens.add({
      targets: text,
      y: text.y - 26,
      alpha: 0,
      duration: this.save.settings.reducedMotion ? 280 : 760,
      ease: 'Quad.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  private emitArmorySparks(x: number, y: number, color: number, count: number, spread: number): void {
    const capped = this.scale.width <= 860 ? Math.ceil(count * 0.62) : count;

    for (let index = 0; index < capped; index++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const distance = Phaser.Math.FloatBetween(spread * 0.34, spread);
      const spark = this.acquireArmorySpark(x, y, Phaser.Math.FloatBetween(3, 6), color);
      spark.setDepth(9);
      spark.setBlendMode(Phaser.BlendModes.ADD);

      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance * 0.74,
        alpha: 0,
        scale: 0.18,
        duration: Phaser.Math.Between(360, 720),
        ease: 'Cubic.easeOut',
        onComplete: () => this.releaseArmorySpark(spark),
      });
    }
  }

  private acquireArmorySpark(x: number, y: number, radius: number, color: number): Phaser.GameObjects.Arc {
    const spark = this.armorySparkPool.pop() ?? this.add.circle(0, 0, radius, color, 0.9);
    spark.setPosition(x, y);
    spark.setRadius(radius);
    spark.setFillStyle(color, 0.9);
    spark.setActive(true);
    spark.setVisible(true);
    spark.setAlpha(1);
    spark.setScale(1);
    return spark;
  }

  private releaseArmorySpark(spark: Phaser.GameObjects.Arc): void {
    this.tweens.killTweensOf(spark);
    spark.setActive(false);
    spark.setVisible(false);
    spark.setBlendMode(Phaser.BlendModes.NORMAL);
    if (this.armorySparkPool.length < ARMORY_SPARK_POOL_LIMIT) {
      this.armorySparkPool.push(spark);
    } else {
      spark.destroy();
    }
  }

  private loadoutFxColor(id: string): number {
    const weapon = WEAPONS.find((item) => item.id === id);
    if (weapon) return Phaser.Display.Color.HexStringToColor(weapon.color).color;

    const crosshair = CROSSHAIRS.find((item) => item.id === id);
    if (crosshair) return Phaser.Display.Color.HexStringToColor(crosshair.color).color;

    return 0xffe56a;
  }

  private spawnRaven(): void {
    const fromLeft = Math.random() > 0.5;
    const enemy = Math.random() > 0.82 ? ENEMIES.golden : Math.random() > 0.62 ? ENEMIES.fast : ENEMIES.normal;
    const sprite = this.acquireMenuRaven();
    sprite.setPosition(fromLeft ? -120 : this.scale.width + 120, Phaser.Math.Between(50, this.scale.height - 80));
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

  private acquireMenuRaven(): Phaser.GameObjects.Sprite {
    const sprite = this.ravenPool.pop() ?? this.add.sprite(0, 0, SPRITE_KEYS.raven);
    sprite.setActive(true);
    sprite.setVisible(true);
    sprite.clearTint();
    sprite.setBlendMode(Phaser.BlendModes.NORMAL);
    sprite.setAngle(0);
    sprite.setAlpha(1);
    sprite.setFlipX(false);
    return sprite;
  }

  private releaseMenuRaven(sprite: Phaser.GameObjects.Sprite): void {
    sprite.setActive(false);
    sprite.setVisible(false);
    sprite.stop();
    sprite.clearTint();
    if (this.ravenPool.length < MENU_RAVEN_POOL_LIMIT) {
      this.ravenPool.push(sprite);
    } else {
      sprite.destroy();
    }
  }
}

function upgradeFxColor(id: string): number {
  switch (id) {
    case 'steadyHands':
      return 0x20f2ff;
    case 'comboCore':
      return 0xff3fb4;
    case 'thickJacket':
      return 0xff315a;
    case 'bountyChip':
      return 0xffd447;
    default:
      return 0xffe56a;
  }
}
