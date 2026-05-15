import Phaser from 'phaser';
import { AUDIO_KEYS, SPRITE_KEYS } from '../data/assets';
import { ENEMIES } from '../data/enemies';
import { getStage } from '../data/stages';
import { CROSSHAIRS, WEAPONS } from '../data/weapons';
import { applyRunRewards, calculateRunRewards, loadSave } from '../save';
import { getLoadout } from '../systems/progression';
import { RunState, powerupLabel } from '../systems/RunState';
import { WaveDirector } from '../systems/WaveDirector';
import { arcadeAudio } from '../systems/ArcadeAudio';
import type { EnemyDefinition, EnemyId, PowerupId, RunRewards, SaveData, StageDefinition, WeaponDefinition } from '../types';
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
  private crosshairColor = '#ffffff';
  private crosshairRadiusBonus = 0;
  private nextShotAt = 0;
  private pausedByUi = false;
  private stageTransition = false;
  private bossSpawned = false;
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
    this.crosshairColor = loadout.crosshair.color;
    this.crosshairRadiusBonus = loadout.crosshair.radiusBonus;
    this.run = new RunState(loadout.stats, loadout.weapon, loadout.crosshair);
    this.stage = getStage(0);
    this.run.startStage(1, this.stage.targetKills);
    this.nextShotAt = 0;
    this.gameEnded = false;
    this.bossKills = 0;
    this.bossSpawned = false;
    this.stageTransition = false;
    this.pausedByUi = false;

    this.cameras.main.setRoundPixels(false);
    this.createBackground();
    this.createCrosshair();
    this.bindCommands();
    this.registerInput();
    this.renderHud();
    this.showStageBanner(this.stage.title, this.stage.subtitle);
    arcadeAudio.startMusic('run', this.save.settings);

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
      if (this.pausedByUi) this.resumeRun();
      else this.pauseRun();
    });

    this.input.keyboard?.on('keydown-P', () => {
      if (this.pausedByUi) this.resumeRun();
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

    this.starfield = Array.from({ length: 70 }, () => {
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
    this.background.lineStyle(2, palette.neon, 0.3);

    for (let x = -80; x < width + 100; x += 96) {
      this.background.lineBetween(x, height * 0.72, x - width * 0.25, height);
    }

    for (let y = height * 0.74; y < height; y += 36) {
      this.background.lineBetween(0, y, width, y);
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
    const radius = 18 + this.crosshairRadiusBonus * 0.4;
    const color = Phaser.Display.Color.HexStringToColor(this.crosshairColor).color;

    this.crosshair.clear();
    this.crosshair.lineStyle(2, color, 0.95);
    this.crosshair.strokeCircle(pointer.x, pointer.y, radius);
    this.crosshair.lineBetween(pointer.x - radius - 8, pointer.y, pointer.x - radius + 4, pointer.y);
    this.crosshair.lineBetween(pointer.x + radius - 4, pointer.y, pointer.x + radius + 8, pointer.y);
    this.crosshair.lineBetween(pointer.x, pointer.y - radius - 8, pointer.x, pointer.y - radius + 4);
    this.crosshair.lineBetween(pointer.x, pointer.y + radius - 4, pointer.x, pointer.y + radius + 8);
    this.crosshair.fillStyle(color, 0.8);
    this.crosshair.fillCircle(pointer.x, pointer.y, 2.5);
  }

  private maybeSpawnEnemy(delta: number): void {
    if (this.stageTransition || this.bossSpawned || this.run.stageKills >= this.stage.targetKills) return;

    const enemyId = this.waveDirector.update(delta, this.stage);
    if (enemyId) this.spawnEnemy(enemyId);
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
      arcadeAudio.startMusic('boss', this.save.settings);
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

      if (actor.boss) {
        actor.sprite.x = Math.max(this.scale.width - 260, actor.sprite.x);
        actor.sprite.y += Math.sin(t * 2) * 0.5 * delta;
      }

      if (actor.sprite.y < 50 || actor.sprite.y > this.scale.height - 50) {
        actor.velocityY *= -1;
      }

      if (!actor.boss && actor.sprite.x < -160) {
        actor.sprite.destroy();
        actor.healthBar?.destroy();
        this.floatText(120, this.scale.height - 120, 'MISSED', '#ff315a', 34);
        arcadeAudio.playMiss();
        this.shakeCamera(250, 0.01);
        if (this.run.loseLife()) this.endRun();
      }

      this.drawHealthBar(actor);
    }

    this.enemies = this.enemies.filter((actor) => actor.sprite.active);
  }

  private updatePowerups(time: number, delta: number): void {
    for (const powerup of this.powerups) {
      powerup.container.y += delta * 0.06;
      powerup.container.x += Math.sin((time - powerup.bornMs) / 200) * 0.18 * delta;
      powerup.container.rotation += delta * 0.0025;

      if (powerup.container.y > this.scale.height + 50) {
        powerup.container.destroy();
      }
    }

    this.powerups = this.powerups.filter((powerup) => powerup.container.active);
  }

  private fireWeapon(x: number, y: number, now: number): void {
    if (now < this.nextShotAt) return;

    this.nextShotAt = now + this.run.weaponCooldownMs;
    this.run.recordShot();
    arcadeAudio.playShot(this.weapon.id);
    this.drawMuzzleFlash(x, y);

    const powerupHit = this.collectPowerupAt(x, y);
    const hitActors = this.resolveWeaponHits(x, y);

    if (this.run.isPowerupActive('multishot') && hitActors.length > 0) {
      const anchor = hitActors[0].sprite;
      for (const actor of this.enemies) {
        const distance = Phaser.Math.Distance.Between(anchor.x, anchor.y, actor.sprite.x, actor.sprite.y);
        if (!hitActors.includes(actor) && distance < 190) hitActors.push(actor);
      }
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

  private resolveWeaponHits(x: number, y: number): EnemyActor[] {
    const hitActors: EnemyActor[] = [];
    const probes = this.weapon.pellets <= 1 ? [{ x, y }] : this.createSpreadProbes(x, y);
    const radius = this.weapon.radius + this.crosshairRadiusBonus;

    for (const probe of probes) {
      const candidates = this.enemies
        .filter((actor) => Phaser.Math.Distance.Between(probe.x, probe.y, actor.sprite.x, actor.sprite.y) <= actor.radius + radius)
        .sort((a, b) => Phaser.Math.Distance.Between(probe.x, probe.y, a.sprite.x, a.sprite.y) - Phaser.Math.Distance.Between(probe.x, probe.y, b.sprite.x, b.sprite.y));

      const pierceCount = this.weapon.id === 'arcLaser' ? this.weapon.pierce : 1;
      for (const actor of candidates.slice(0, pierceCount)) {
        if (!hitActors.includes(actor)) hitActors.push(actor);
      }
    }

    return hitActors;
  }

  private createSpreadProbes(x: number, y: number): Array<{ x: number; y: number }> {
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
    arcadeAudio.playHit();
    actor.sprite.setTintFill(0xffffff);
    this.time.delayedCall(70, () => {
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

    if (Math.random() < (actor.boss ? 1 : 0.16)) {
      this.spawnPowerup(x, y);
    }

    actor.sprite.destroy();
    actor.healthBar?.destroy();

    if (bossKilled) {
      this.bossKills++;
      this.bossSpawned = false;
      this.clearStage();
    }
  }

  private collectPowerupAt(x: number, y: number): boolean {
    const powerup = this.powerups.find((item) => Phaser.Math.Distance.Between(x, y, item.container.x, item.container.y) < 42);
    if (!powerup) return false;

    if (powerup.id === 'extraLife') {
      this.run.addLife();
    } else {
      this.run.activatePowerup(powerup.id);
    }

    this.floatText(powerup.container.x, powerup.container.y - 32, powerup.label, '#9dff57', 24);
    this.createFeathers(powerup.container.x, powerup.container.y, 0x9dff57, 16);
    arcadeAudio.playPowerup();
    powerup.container.destroy();
    return true;
  }

  private spawnPowerup(x: number, y: number): void {
    const id = Phaser.Math.RND.pick<PowerupId>(['slowmo', 'multishot', 'scoreBoost', 'extraLife', 'overdrive']);
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
    if (this.run.stageKills < this.stage.targetKills) return;

    const bossActive = this.enemies.some((enemy) => enemy.boss);
    if (this.stage.boss && !this.bossSpawned && !bossActive) {
      this.bossSpawned = true;
      this.spawnEnemy(this.stage.boss);
      return;
    }

    if (!this.stage.boss && !bossActive) {
      this.clearStage();
    }
  }

  private clearStage(): void {
    if (this.stageTransition || this.gameEnded) return;

    this.stageTransition = true;
    this.run.coinsEarned += this.stage.rewardCoins;
    arcadeAudio.playStageClear();
    this.floatText(this.scale.width / 2, this.scale.height * 0.38, `STAGE CLEAR +${this.stage.rewardCoins}`, '#ffe56a', 36);
    if (!this.save.settings.reducedMotion) this.cameras.main.flash(220, 255, 225, 106, false);

    this.time.delayedCall(1800, () => {
      this.stage = getStage(this.run.stageIndex);
      this.run.startStage(this.run.stageIndex + 1, this.stage.targetKills);
      this.waveDirector.reset();
      this.bossSpawned = false;
      this.stageTransition = false;
      this.drawBackground();
      arcadeAudio.startMusic('run', this.save.settings);
      this.showStageBanner(this.stage.title, this.stage.subtitle);
    });
  }

  private pauseRun(): void {
    if (this.gameEnded || this.pausedByUi) return;
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

  private createExplosion(x: number, y: number, scale: number): void {
    const explosion = this.add.sprite(x, y, SPRITE_KEYS.explosion);
    explosion.setScale(Math.max(0.55, scale * 1.05));
    explosion.setDepth(60);
    explosion.play('boom-pop');
    this.sound.play(AUDIO_KEYS.boom, { volume: 0.22 * this.save.settings.sfxVolume });
    explosion.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => explosion.destroy());
  }

  private createFeathers(x: number, y: number, color: number, count: number): void {
    for (let index = 0; index < count; index++) {
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
  }
}
