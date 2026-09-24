import Phaser from 'phaser';
import type { QualityProfile } from '../systems/Quality';
import { FX, createCanvas, replaceCanvasTexture, seededRandom } from './TextureFactory';
import {
  type AmbientKind,
  type LayerSpec,
  type ThemeSpec,
  getTheme,
  paintClockTower,
  paintFerrisWheel,
  paintStormTower,
  paintWheelStand,
  withAlpha,
} from './BackdropThemes';

export type BackdropEvent = 'thunder' | 'firework';

interface LayerRuntime {
  spec: LayerSpec;
  sprite: Phaser.GameObjects.TileSprite;
  glow?: Phaser.GameObjects.TileSprite;
  bake: number;
}

interface Twinkle {
  image: Phaser.GameObjects.Image;
  speed: number;
  phase: number;
  base: number;
}

const DEPTH = {
  sky: -100,
  celestial: -98,
  twinkle: -97,
  landmarkBack: -93,
  layer: -90,
  fog: -84,
  ground: -80,
  horizon: -79,
  landmarkFront: -76,
  near: -66,
  ambientBack: -60,
  ambientFront: 40,
  lightning: -70,
  vignette: 950,
};

// Owns every background object for one scene. Stage changes and resizes
// rebuild the baked textures; per-frame work is limited to scrolling tile
// offsets, a few alpha pulses and one Graphics redraw for the ground grid.
export class StageBackdrop {
  private readonly scene: Phaser.Scene;
  private quality: QualityProfile;
  private reducedMotion: boolean;
  private theme!: ThemeSpec;
  private themeKey = '';
  private objects: Phaser.GameObjects.GameObject[] = [];
  private textureKeys: string[] = [];
  private layers: LayerRuntime[] = [];
  private twinkles: Twinkle[] = [];
  private celestial?: Phaser.GameObjects.Image;
  private celestialBase = 1;
  private horizonGlow?: Phaser.GameObjects.Image;
  private fog?: Phaser.GameObjects.TileSprite;
  private ground?: Phaser.GameObjects.Graphics;
  private ambient?: Phaser.GameObjects.Particles.ParticleEmitter;
  private fireworks?: Phaser.GameObjects.Particles.ParticleEmitter;
  private lightningFlash?: Phaser.GameObjects.Rectangle;
  private lightningBolt?: Phaser.GameObjects.Graphics;
  private dynamicGfx?: Phaser.GameObjects.Graphics;
  private wheel?: Phaser.GameObjects.Image;
  private wheelLights?: Phaser.GameObjects.Image;
  private beacon?: Phaser.GameObjects.Image;
  private train?: Phaser.GameObjects.Image;
  private clockCenter?: { x: number; y: number; radius: number };
  private nextEventAt = 0;
  private trainActiveUntil = 0;
  private groundOffset = 0;
  private builtWidth = 0;
  private builtHeight = 0;
  private pendingResizeAt = 0;
  private elapsed = 0;
  onEvent?: (event: BackdropEvent) => void;

  constructor(scene: Phaser.Scene, quality: QualityProfile, reducedMotion: boolean) {
    this.scene = scene;
    this.quality = quality;
    this.reducedMotion = reducedMotion;
  }

  setTheme(stageId: string): void {
    const theme = getTheme(stageId);
    const key = `${theme.id}`;
    if (key === this.themeKey && this.builtWidth === this.scene.scale.width && this.builtHeight === this.scene.scale.height) return;
    this.theme = theme;
    this.themeKey = key;
    this.rebuild();
  }

  setQuality(quality: QualityProfile, reducedMotion: boolean): void {
    const changed = quality.tier !== this.quality.tier || reducedMotion !== this.reducedMotion;
    this.quality = quality;
    this.reducedMotion = reducedMotion;
    if (changed && this.theme) this.rebuild();
  }

  get horizonY(): number {
    return this.scene.scale.height * (this.theme?.horizon ?? 0.72);
  }

  requestResize(): void {
    this.pendingResizeAt = this.elapsed + 140;
  }

  // Resize rebuilds are debounced; this runs even while the game is paused so
  // a rotated phone never shows stale edges behind the pause menu.
  maintain(delta: number): boolean {
    this.elapsed += delta;
    if (this.pendingResizeAt && this.elapsed >= this.pendingResizeAt) {
      this.pendingResizeAt = 0;
      this.rebuild();
      return true;
    }
    return false;
  }

  update(time: number, delta: number, speedScale = 1): void {
    if (this.maintain(delta)) return;
    if (!this.theme) return;

    const motion = this.reducedMotion ? 0.25 : 1;
    const u = this.unit;
    const scroll = delta * speedScale * motion;

    for (const layer of this.layers) {
      const step = layer.spec.speed * u * scroll * layer.bake;
      layer.sprite.tilePositionX += step;
      if (layer.glow) {
        layer.glow.tilePositionX = layer.sprite.tilePositionX;
        layer.glow.setAlpha(this.glowAlpha(layer.spec.glowMode ?? 'steady', time, layer.spec.id));
      }
    }

    if (this.fog && this.theme.fog) {
      this.fog.tilePositionX += (this.theme.fog.speed * u * scroll) / this.fog.scaleX;
    }

    for (const twinkle of this.twinkles) {
      const value = Math.sin(time * twinkle.speed + twinkle.phase);
      twinkle.image.setAlpha(twinkle.base * (0.25 + Math.max(0, value) * 0.75));
    }

    if (this.celestial && this.theme.celestial) {
      const pulse = this.reducedMotion ? 0 : Math.sin(time / 1300) * this.theme.celestial.pulse;
      this.celestial.setScale(this.celestialBase * (1 + pulse));
    }

    if (this.horizonGlow) {
      this.horizonGlow.setAlpha(0.42 + Math.sin(time / 900) * 0.08);
    }

    this.groundOffset += scroll * 0.06 * u;
    this.drawGround(time);
    this.updateEvents(time, delta, speedScale);
  }

  destroy(): void {
    this.clear();
  }

  private get unit(): number {
    return Phaser.Math.Clamp(this.scene.scale.height / 900, 0.42, 1.25);
  }

  private glowAlpha(mode: NonNullable<LayerSpec['glowMode']>, time: number, id: string): number {
    if (this.reducedMotion) return 0.85;
    const seed = id.length * 1.7;
    switch (mode) {
      case 'flicker': {
        const noise = Math.sin(time / 97 + seed) * Math.sin(time / 43 + seed * 2);
        const dip = Math.sin(time / 1900 + seed) > 0.96 ? 0.35 : 0;
        return Phaser.Math.Clamp(0.86 + noise * 0.14 - dip, 0, 1);
      }
      case 'pulse':
        return 0.55 + (Math.sin(time / 640 + seed) + 1) * 0.22;
      case 'chase':
        return 0.62 + (Math.sin(time / 170 + seed) + 1) * 0.19;
      default:
        return 1;
    }
  }

  private clear(): void {
    for (const object of this.objects) object.destroy();
    this.objects = [];
    for (const key of this.textureKeys) {
      if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    }
    this.textureKeys = [];
    this.layers = [];
    this.twinkles = [];
    this.celestial = undefined;
    this.horizonGlow = undefined;
    this.fog = undefined;
    this.ground = undefined;
    this.ambient = undefined;
    this.fireworks = undefined;
    this.lightningFlash = undefined;
    this.lightningBolt = undefined;
    this.dynamicGfx = undefined;
    this.wheel = undefined;
    this.wheelLights = undefined;
    this.beacon = undefined;
    this.train = undefined;
    this.clockCenter = undefined;
  }

  private track<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.objects.push(object);
    return object;
  }

  private bakeTexture(name: string, width: number, height: number, scale: number, painter: (ctx: CanvasRenderingContext2D) => void): string {
    const key = `bd-${this.theme.id}-${name}`;
    const canvas = createCanvas(width * scale, height * scale);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(scale, scale);
      painter(ctx);
    }
    replaceCanvasTexture(this.scene, key, canvas);
    this.textureKeys.push(key);
    return key;
  }

  private rebuild(): void {
    this.clear();
    const theme = this.theme;
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    this.builtWidth = width;
    this.builtHeight = height;
    const u = this.unit;
    const scale = this.quality.backdropScale;
    const horizon = height * theme.horizon;
    let seed = 1;
    for (const char of theme.id) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;

    const skyKey = this.bakeTexture('sky', width, height, scale, (ctx) => {
      theme.sky(ctx, { w: width, h: height, horizon, u, rand: seededRandom(seed) });
    });
    this.track(this.scene.add.image(0, 0, skyKey).setOrigin(0).setDisplaySize(width, height).setDepth(DEPTH.sky));

    if (theme.celestial && this.quality.glowSprites) {
      const radius = Math.min(width, height) * theme.celestial.radius;
      this.celestialBase = (radius * 2) / 128;
      this.celestial = this.track(
        this.scene.add
          .image(width * theme.celestial.x, height * theme.celestial.y, FX.glow)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(theme.celestial.color)
          .setAlpha(0.2)
          .setScale(this.celestialBase)
          .setDepth(DEPTH.celestial),
      );
    }

    if (this.quality.glowSprites) {
      const random = seededRandom(seed + 5);
      const count = Math.round(18 * this.quality.ambientParticles + 6);
      for (let index = 0; index < count; index++) {
        const image = this.track(
          this.scene.add
            .image(random() * width, random() * horizon * 0.7, FX.star)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setScale(0.16 + random() * 0.3)
            .setDepth(DEPTH.twinkle),
        );
        this.twinkles.push({ image, speed: 0.0008 + random() * 0.002, phase: random() * Math.PI * 2, base: 0.5 + random() * 0.5 });
      }
    }

    this.buildLandmarks(width, height, horizon, u, scale, 'back');

    let depth = DEPTH.layer;
    for (const spec of theme.layers) {
      if (spec.minLayers > this.quality.parallaxLayers) continue;
      const tileWidth = Math.round(spec.tileWidth * Math.max(u, 0.6));
      const layerHeight = Math.round(height * spec.heightFraction);
      const bottom = height * spec.bottomFraction;
      const layerSeed = seed + spec.id.length * 97;
      const layerKey = this.bakeTexture(spec.id, tileWidth, layerHeight, scale, (ctx) => {
        spec.paint(ctx, { width: tileWidth, height: layerHeight, u, rand: seededRandom(layerSeed) });
      });
      const isNear = spec.id === 'near';
      const sprite = this.track(
        this.scene.add
          .tileSprite(0, bottom - layerHeight, width * scale, layerHeight * scale, layerKey)
          .setOrigin(0)
          .setScale(1 / scale)
          .setDepth(isNear ? DEPTH.near : depth),
      );
      let glow: Phaser.GameObjects.TileSprite | undefined;
      if (spec.glow && this.quality.glowSprites) {
        const glowKey = this.bakeTexture(`${spec.id}-glow`, tileWidth, layerHeight, scale, (ctx) => {
          spec.glow?.(ctx, { width: tileWidth, height: layerHeight, u, rand: seededRandom(layerSeed + 13) });
        });
        glow = this.track(
          this.scene.add
            .tileSprite(0, bottom - layerHeight, width * scale, layerHeight * scale, glowKey)
            .setOrigin(0)
            .setScale(1 / scale)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setDepth((isNear ? DEPTH.near : depth) + 1),
        );
      }
      this.layers.push({ spec, sprite, glow, bake: scale });

      if (spec.id === 'far' && theme.fog) {
        const fogHeight = 128 * u * 1.6;
        this.fog = this.track(
          this.scene.add
            .tileSprite(0, height * theme.fog.y - fogHeight / 2, width / (u * 1.6), 128, FX.fog)
            .setOrigin(0)
            .setScale(u * 1.6)
            .setTint(theme.fog.color)
            .setAlpha(theme.fog.alpha * 2.6)
            .setDepth(DEPTH.fog),
        );
      }
      if (spec.id === 'far') {
        this.ground = this.track(this.scene.add.graphics().setDepth(DEPTH.ground));
        if (this.quality.glowSprites) {
          this.horizonGlow = this.track(
            this.scene.add
              .image(width / 2, horizon, FX.glow)
              .setBlendMode(Phaser.BlendModes.ADD)
              .setTint(theme.horizonGlow)
              .setDisplaySize(width * 1.4, 110 * u)
              .setDepth(DEPTH.horizon),
          );
        }
        this.buildLandmarks(width, height, horizon, u, scale, 'front');
        depth = DEPTH.landmarkFront + 2;
      } else {
        depth += 3;
      }
    }

    if (!this.ground) this.ground = this.track(this.scene.add.graphics().setDepth(DEPTH.ground));
    this.dynamicGfx = this.track(this.scene.add.graphics().setDepth(DEPTH.landmarkFront + 1).setBlendMode(Phaser.BlendModes.ADD));
    this.buildAmbient(width, height, horizon);
    this.buildEventObjects(width, height, horizon, u, scale);

    if (!this.quality.postFx) {
      this.track(this.scene.add.image(0, 0, FX.vignette).setOrigin(0).setDisplaySize(width, height).setDepth(DEPTH.vignette).setAlpha(0.9));
    }

    this.nextEventAt = this.elapsed + 2500;
  }

  private buildLandmarks(width: number, height: number, horizon: number, u: number, scale: number, pass: 'back' | 'front'): void {
    const events = this.theme.events ?? [];
    if (pass === 'back' && events.includes('beacon')) {
      const towerHeight = height * 0.5;
      const towerWidth = towerHeight * 0.26;
      const key = this.bakeTexture('tower', towerWidth, towerHeight, scale, (ctx) => paintStormTower(ctx, towerWidth, towerHeight));
      const x = width * 0.7;
      const top = horizon + 6 * u - towerHeight;
      this.track(this.scene.add.image(x, top, key).setOrigin(0.5, 0).setScale(1 / scale).setDepth(DEPTH.landmarkBack));
      this.beacon = this.track(
        this.scene.add.image(x, top + towerHeight * 0.04, FX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(0xff3b3b).setScale(0.5 * u).setDepth(DEPTH.landmarkBack + 1),
      );
    }

    if (pass === 'front' && events.includes('wheel')) {
      const radius = Math.min(height * 0.22, width * 0.17);
      const standHeight = radius * 1.25;
      const cx = width * 0.78;
      const cy = horizon + 10 * u - standHeight;
      const standKey = this.bakeTexture('wheel-stand', radius * 2, standHeight, scale, (ctx) => paintWheelStand(ctx, radius, standHeight));
      this.track(this.scene.add.image(cx, cy, standKey).setOrigin(0.5, 0).setScale(1 / scale).setDepth(DEPTH.landmarkFront - 1));
      const size = radius * 2 + 16;
      const wheelKey = this.bakeTexture('wheel', size, size, scale, (ctx) => paintFerrisWheel(ctx, radius, false));
      this.wheel = this.track(this.scene.add.image(cx, cy, wheelKey).setScale(1 / scale).setDepth(DEPTH.landmarkFront));
      if (this.quality.glowSprites) {
        const lightsKey = this.bakeTexture('wheel-lights', size, size, scale, (ctx) => paintFerrisWheel(ctx, radius, true));
        this.wheelLights = this.track(
          this.scene.add.image(cx, cy, lightsKey).setScale(1 / scale).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.landmarkFront + 0.5),
        );
      }
    }

    if (pass === 'front' && events.includes('clock')) {
      const towerHeight = height * 0.64;
      const towerWidth = towerHeight * 0.3;
      const faceRadius = towerWidth * 0.26;
      const key = this.bakeTexture('clocktower', towerWidth, towerHeight, scale, (ctx) => paintClockTower(ctx, towerWidth, towerHeight, faceRadius));
      const x = width * 0.72;
      const top = horizon + 4 * u - towerHeight;
      this.track(this.scene.add.image(x, top, key).setOrigin(0.5, 0).setScale(1 / scale).setDepth(DEPTH.landmarkFront - 1));
      this.clockCenter = { x, y: top + towerHeight * 0.38, radius: faceRadius };
    }
  }

  private buildEventObjects(width: number, height: number, horizon: number, u: number, scale: number): void {
    const events = this.theme.events ?? [];
    if (events.includes('lightning')) {
      this.lightningFlash = this.track(
        this.scene.add.rectangle(0, 0, width, horizon, 0xd7f7ff, 1).setOrigin(0).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.lightning),
      );
      this.lightningBolt = this.track(this.scene.add.graphics().setDepth(DEPTH.lightning + 1).setBlendMode(Phaser.BlendModes.ADD));
    }

    if (events.includes('fireworks') && !this.reducedMotion && this.quality.ambientParticles >= 0.5) {
      this.fireworks = this.track(
        this.scene.add.particles(0, 0, FX.dot, {
          emitting: false,
          lifespan: { min: 900, max: 1500 },
          speed: { min: 60, max: 190 },
          gravityY: 70,
          scale: { start: 0.32, end: 0.04 },
          alpha: { start: 1, end: 0 },
          blendMode: Phaser.BlendModes.ADD,
        }),
      ).setDepth(DEPTH.celestial + 1);
    }

    if (events.includes('train')) {
      const trainWidth = 900 * u;
      const trainHeight = 34 * u;
      const key = this.bakeTexture('train', trainWidth, trainHeight, scale, (ctx) => {
        const cars = 6;
        const carWidth = trainWidth / cars;
        for (let index = 0; index < cars; index++) {
          const x = index * carWidth;
          ctx.fillStyle = '#0a0304';
          ctx.fillRect(x + 3 * u, 4 * u, carWidth - 6 * u, trainHeight - 8 * u);
          if (index === 0) {
            ctx.beginPath();
            ctx.moveTo(x + 3 * u, 4 * u);
            ctx.lineTo(x - 18 * u, trainHeight - 8 * u);
            ctx.lineTo(x + 3 * u, trainHeight - 4 * u);
            ctx.fill();
          }
          for (let window = 0; window < 6; window++) {
            ctx.fillStyle = window % 3 === 0 ? 'rgba(73, 231, 255, 0.9)' : 'rgba(255, 196, 120, 0.9)';
            ctx.fillRect(x + (10 + window * (carWidth - 20) / 6) * 1, 9 * u, (carWidth - 30) / 8, 8 * u);
          }
          ctx.fillStyle = '#050102';
          ctx.fillRect(x + 8 * u, trainHeight - 6 * u, carWidth - 16 * u, 6 * u);
        }
      });
      const midLayer = this.theme.layers.find((layer) => layer.id === 'mid');
      const deckY = midLayer ? height * midLayer.bottomFraction - 120 * u - 2 * u : horizon;
      this.train = this.track(
        this.scene.add.image(width + 40, deckY, key).setOrigin(0, 1).setScale(1 / scale).setDepth(DEPTH.landmarkFront + 4).setVisible(false),
      );
    }
  }

  private buildAmbient(width: number, height: number, horizon: number): void {
    const kind = this.theme.ambient;
    if (!kind) return;
    const factor = this.quality.ambientParticles * (this.reducedMotion ? 0.35 : 1);
    if (factor <= 0.05) return;
    const colors = this.theme.ambientColors ?? [0xffffff];
    const config = ambientConfig(kind, width, height, horizon, colors, factor);
    this.ambient = this.track(this.scene.add.particles(0, 0, config.texture, config.config));
    this.ambient.setDepth(config.front ? DEPTH.ambientFront : DEPTH.ambientBack);
    this.ambient.fastForward(config.prewarm, 32);
  }

  private drawGround(time: number): void {
    const graphics = this.ground;
    if (!graphics) return;
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const horizon = this.horizonY;
    const u = this.unit;
    const color = this.theme.gridColor;
    graphics.clear();

    if (this.theme.ground === 'water') {
      const rows = this.quality.tier === 'high' ? 22 : 14;
      for (let row = 0; row < rows; row++) {
        const t = (row + 1) / rows;
        const y = horizon + (height - horizon) * Math.pow(t, 1.7);
        const drift = (this.groundOffset * (0.4 + t * 1.6) + row * 37) % (140 * u);
        graphics.lineStyle(Math.max(1, t * 3 * u), row % 3 === 0 ? 0xffb11f : color, 0.06 + t * 0.2 + Math.sin(time / 300 + row) * 0.04);
        for (let x = -drift; x < width; x += 140 * u) {
          const length = (26 + ((row * 13 + Math.floor(x)) % 40)) * u * (0.4 + t);
          graphics.lineBetween(x, y, x + length, y);
        }
      }
      return;
    }

    const depth = height - horizon;
    const lines = 12;
    for (let index = 1; index <= lines; index++) {
      const t = index / lines;
      const y = horizon + depth * Math.pow(t, 1.9);
      graphics.lineStyle(Math.max(1, t * 2.2 * u), color, 0.05 + t * 0.32);
      graphics.lineBetween(0, y, width, y);
    }

    const vanishX = width / 2;
    const vanishY = horizon - depth * 0.55;
    const spacing = 110 * u;
    const reach = width * 2.2;
    const offset = this.groundOffset % spacing;
    const k = (horizon - vanishY) / (height - vanishY);
    for (let bottomX = -reach / 2 - offset; bottomX < width + reach / 2; bottomX += spacing) {
      const topX = vanishX + (bottomX - vanishX) * k;
      const midX = (topX + bottomX) / 2;
      const midY = (horizon + height) / 2;
      graphics.lineStyle(1, color, 0.08);
      graphics.lineBetween(topX, horizon, midX, midY);
      graphics.lineStyle(Math.max(1, 1.8 * u), color, 0.26);
      graphics.lineBetween(midX, midY, bottomX, height);
    }
  }

  private updateEvents(time: number, delta: number, speedScale: number): void {
    const events = this.theme.events ?? [];
    const gfx = this.dynamicGfx;
    gfx?.clear();
    const width = this.scene.scale.width;
    const horizon = this.horizonY;
    const u = this.unit;
    const motion = this.reducedMotion ? 0.2 : 1;

    if (this.wheel) {
      this.wheel.rotation += delta * 0.00018 * speedScale * motion;
      if (this.wheelLights) {
        this.wheelLights.rotation = this.wheel.rotation;
        this.wheelLights.setAlpha(this.reducedMotion ? 0.9 : 0.7 + Math.sin(time / 180) * 0.3);
      }
    }

    if (this.beacon) {
      const on = this.reducedMotion ? 0.7 : Math.sin(time / 380) > 0.2 ? 1 : 0.15;
      this.beacon.setAlpha(on);
    }

    if (gfx && this.clockCenter) {
      const { x, y, radius } = this.clockCenter;
      const minute = (time / 9000) * Math.PI * 2 - Math.PI / 2;
      const hour = (time / 108000) * Math.PI * 2 - Math.PI / 2 + 1.2;
      gfx.setBlendMode(Phaser.BlendModes.NORMAL);
      gfx.lineStyle(radius * 0.1, 0x0a0c24, 1);
      gfx.lineBetween(x, y, x + Math.cos(hour) * radius * 0.5, y + Math.sin(hour) * radius * 0.5);
      gfx.lineStyle(radius * 0.06, 0x0a0c24, 1);
      gfx.lineBetween(x, y, x + Math.cos(minute) * radius * 0.78, y + Math.sin(minute) * radius * 0.78);
      gfx.lineStyle(radius * 0.03, 0xff3fb4, 1);
      const second = (time / 1000) * (Math.PI / 30) - Math.PI / 2;
      gfx.lineBetween(x, y, x + Math.cos(second) * radius * 0.82, y + Math.sin(second) * radius * 0.82);
      gfx.fillStyle(0xff3fb4, 1);
      gfx.fillCircle(x, y, radius * 0.07);
    }

    if (gfx && events.includes('searchlight') && this.quality.lightShafts) {
      gfx.setBlendMode(Phaser.BlendModes.ADD);
      for (let index = 0; index < 2; index++) {
        const baseX = width * (0.3 + index * 0.4);
        const baseY = horizon - 60 * u;
        const angle = -Math.PI / 2 + Math.sin(time / (2400 + index * 700) + index * 2) * 0.6;
        const length = horizon * 1.2;
        const spread = 0.06;
        gfx.fillStyle(index ? 0xff6ad5 : 0x20f2ff, 0.07);
        gfx.fillTriangle(
          baseX,
          baseY,
          baseX + Math.cos(angle - spread) * length,
          baseY + Math.sin(angle - spread) * length,
          baseX + Math.cos(angle + spread) * length,
          baseY + Math.sin(angle + spread) * length,
        );
      }
    }

    if (this.train) {
      if (this.train.visible) {
        this.train.x -= delta * 0.22 * u * speedScale * motion;
        if (this.train.x < -this.train.displayWidth - 40) this.train.setVisible(false);
      } else if (time > this.trainActiveUntil && !this.reducedMotion) {
        this.train.setPosition(width + 40, this.train.y).setVisible(true);
        this.trainActiveUntil = time + 14000 + Math.random() * 12000;
      }
    }

    if (this.elapsed < this.nextEventAt) return;

    if (this.lightningFlash && this.lightningBolt && !this.reducedMotion) {
      this.strikeLightning(width, horizon, u);
      this.nextEventAt = this.elapsed + 3800 + Math.random() * 5200;
      return;
    }

    if (this.fireworks) {
      const colors = this.theme.ambientColors ?? [0xffffff];
      const x = width * (0.15 + Math.random() * 0.7);
      const y = horizon * (0.15 + Math.random() * 0.35);
      this.fireworks.setParticleTint(colors[Math.floor(Math.random() * colors.length)]);
      this.fireworks.explode(Math.round(34 * Math.max(0.5, this.quality.particleScale)), x, y);
      this.onEvent?.('firework');
      this.nextEventAt = this.elapsed + 1800 + Math.random() * 3200;
      return;
    }

    this.nextEventAt = this.elapsed + 5000;
  }

  private strikeLightning(width: number, horizon: number, u: number): void {
    const flash = this.lightningFlash;
    const bolt = this.lightningBolt;
    if (!flash || !bolt) return;
    const x = width * (0.1 + Math.random() * 0.8);
    bolt.clear();
    const points: Array<[number, number]> = [[x, 0]];
    let cx = x;
    let cy = 0;
    const target = horizon * (0.55 + Math.random() * 0.35);
    while (cy < target) {
      cy += (18 + Math.random() * 34) * u;
      cx += (Math.random() - 0.5) * 60 * u;
      points.push([cx, Math.min(cy, target)]);
    }
    for (const [lineWidth, alpha] of [[10 * u, 0.18], [4 * u, 0.5], [1.6 * u, 1]] as const) {
      bolt.lineStyle(lineWidth, 0xe6f7ff, alpha);
      bolt.beginPath();
      bolt.moveTo(points[0][0], points[0][1]);
      for (const [px, py] of points.slice(1)) bolt.lineTo(px, py);
      bolt.strokePath();
    }
    bolt.setAlpha(1);
    flash.setAlpha(0.28);
    this.scene.tweens.add({ targets: flash, alpha: 0, duration: 90, yoyo: true, repeat: 1, onComplete: () => flash.setAlpha(0) });
    this.scene.tweens.add({ targets: bolt, alpha: 0, duration: 380, ease: 'Quad.easeIn' });
    this.onEvent?.('thunder');
  }
}

interface AmbientBuild {
  texture: string;
  front: boolean;
  prewarm: number;
  config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;
}

function ambientConfig(kind: AmbientKind, width: number, height: number, horizon: number, colors: number[], factor: number): AmbientBuild {
  const zone = (x: number, y: number, w: number, h: number) => ({
    type: 'random' as const,
    source: new Phaser.Geom.Rectangle(x, y, w, h) as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource,
  });
  const blink = { onEmit: () => 0, onUpdate: (_p: Phaser.GameObjects.Particles.Particle, _k: string, t: number) => Math.sin(t * Math.PI) * (0.5 + Math.sin(t * 40) * 0.5) };
  const fadeInOut = { onEmit: () => 0, onUpdate: (_p: Phaser.GameObjects.Particles.Particle, _k: string, t: number) => Math.sin(t * Math.PI) };
  const area = (width * height) / (1280 * 800);

  switch (kind) {
    case 'fireflies':
      return {
        texture: FX.dot,
        front: false,
        prewarm: 5000,
        config: {
          emitZone: zone(0, horizon - height * 0.34, width, height * 0.42),
          lifespan: { min: 3500, max: 6500 },
          speed: { min: 6, max: 26 },
          scale: { min: 0.14, max: 0.3 },
          alpha: blink,
          tint: colors,
          blendMode: Phaser.BlendModes.ADD,
          frequency: 220 / factor / area,
          maxAliveParticles: Math.round(46 * factor * area) + 6,
        },
      };
    case 'rain':
      return {
        texture: FX.rain,
        front: true,
        prewarm: 1200,
        config: {
          emitZone: zone(-width * 0.1, -60, width * 1.3, 10),
          lifespan: 1100,
          speed: { min: 900, max: 1250 },
          angle: { min: 101, max: 104 },
          rotate: 12,
          scaleY: { min: 0.5, max: 1.1 },
          scaleX: 1,
          alpha: { min: 0.18, max: 0.4 },
          tint: colors,
          frequency: 14 / factor,
          quantity: Math.max(1, Math.round(2 * area)),
          maxAliveParticles: Math.round(240 * factor * area) + 20,
        },
      };
    case 'embers':
      return {
        texture: FX.dot,
        front: false,
        prewarm: 5000,
        config: {
          emitZone: zone(0, horizon - height * 0.05, width, height * 0.35),
          lifespan: { min: 2600, max: 5200 },
          speed: { min: 18, max: 64 },
          angle: { min: 240, max: 300 },
          gravityY: -6,
          scale: { start: 0.24, end: 0.04 },
          alpha: fadeInOut,
          tint: colors,
          blendMode: Phaser.BlendModes.ADD,
          frequency: 120 / factor / area,
          maxAliveParticles: Math.round(70 * factor * area) + 8,
        },
      };
    case 'confetti':
      return {
        texture: FX.shard,
        front: false,
        prewarm: 7000,
        config: {
          emitZone: zone(0, -30, width, 10),
          lifespan: { min: 6000, max: 9000 },
          speed: { min: 30, max: 70 },
          angle: { min: 70, max: 110 },
          gravityY: 10,
          rotate: { start: 0, end: 720 },
          scale: { min: 0.35, max: 0.7 },
          alpha: 0.75,
          tint: colors,
          frequency: 260 / factor / area,
          maxAliveParticles: Math.round(40 * factor * area) + 6,
        },
      };
    case 'ash':
      return {
        texture: FX.dot,
        front: false,
        prewarm: 7000,
        config: {
          emitZone: zone(0, -20, width, height * 0.5),
          lifespan: { min: 5000, max: 8000 },
          speed: { min: 14, max: 42 },
          angle: { min: 95, max: 125 },
          scale: { min: 0.08, max: 0.2 },
          alpha: fadeInOut,
          tint: colors,
          frequency: 90 / factor / area,
          maxAliveParticles: Math.round(90 * factor * area) + 8,
        },
      };
    case 'coins':
      return {
        texture: FX.coin,
        front: false,
        prewarm: 5000,
        config: {
          emitZone: zone(0, -30, width, 10),
          lifespan: { min: 4200, max: 6000 },
          speed: { min: 50, max: 110 },
          angle: { min: 82, max: 98 },
          gravityY: 30,
          rotate: { start: 0, end: 540 },
          scaleX: { onEmit: () => 0.45 + Math.random() * 0.3, onUpdate: (p, _k, t) => (p as Phaser.GameObjects.Particles.Particle & { scaleY: number }).scaleY * Math.cos(t * 18) },
          scaleY: { min: 0.45, max: 0.75 },
          alpha: 0.85,
          frequency: 240 / factor / area,
          maxAliveParticles: Math.round(30 * factor * area) + 4,
        },
      };
    case 'snow':
      return {
        texture: FX.dot,
        front: false,
        prewarm: 9000,
        config: {
          emitZone: zone(-40, -20, width + 80, 10),
          lifespan: { min: 8000, max: 12000 },
          speed: { min: 14, max: 36 },
          angle: { min: 95, max: 120 },
          scale: { min: 0.07, max: 0.18 },
          alpha: { min: 0.35, max: 0.8 },
          tint: colors,
          frequency: 110 / factor / area,
          maxAliveParticles: Math.round(90 * factor * area) + 10,
        },
      };
    case 'motes':
    default:
      return {
        texture: FX.dot,
        front: false,
        prewarm: 6000,
        config: {
          emitZone: zone(0, height * 0.1, width, height * 0.85),
          lifespan: { min: 4000, max: 7000 },
          speed: { min: 6, max: 20 },
          angle: { min: 240, max: 300 },
          scale: { min: 0.08, max: 0.2 },
          alpha: fadeInOut,
          tint: colors,
          blendMode: Phaser.BlendModes.ADD,
          frequency: 200 / factor / area,
          maxAliveParticles: Math.round(40 * factor * area) + 6,
        },
      };
  }
}

export { withAlpha };
