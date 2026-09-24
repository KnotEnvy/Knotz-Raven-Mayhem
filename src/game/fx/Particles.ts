import Phaser from 'phaser';
import type { QualityProfile } from '../systems/Quality';
import { FX } from './TextureFactory';

type Particle = Phaser.GameObjects.Particles.Particle & Record<string, number>;
type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;

// Per-burst settings. Emitters read this object through onEmit callbacks, so a
// handful of long-lived emitters can serve every effect in the game instead of
// creating one tween per spark (which is what the previous VFX did).
interface BurstConfig {
  speedMin: number;
  speedMax: number;
  lifeMin: number;
  lifeMax: number;
  scaleMin: number;
  scaleMax: number;
  scaleEnd: number;
  alpha: number;
  tints: number[];
  angleMin: number;
  angleMax: number;
  align: boolean;
  spin: number;
  stretch: number;
  fixedRotation: boolean;
  thickness: number;
}

export interface BurstOptions {
  count: number;
  color?: number | number[];
  speed?: [number, number];
  life?: [number, number];
  scale?: [number, number];
  scaleEnd?: number;
  alpha?: number;
  angle?: [number, number];
  spin?: number;
  stretch?: number;
}

const DEFAULT_BURST: BurstConfig = {
  speedMin: 80,
  speedMax: 240,
  lifeMin: 300,
  lifeMax: 600,
  scaleMin: 0.4,
  scaleMax: 0.8,
  scaleEnd: 0.1,
  alpha: 1,
  tints: [0xffffff],
  angleMin: 0,
  angleMax: 360,
  align: false,
  spin: 0,
  stretch: 1,
  fixedRotation: false,
  thickness: 1,
};

class DragProcessor extends Phaser.GameObjects.Particles.ParticleProcessor {
  constructor(private readonly factor: number) {
    super(0, 0, true);
  }

  update(particle: Phaser.GameObjects.Particles.Particle, delta: number): void {
    const keep = Math.pow(this.factor, delta / 16.67);
    particle.velocityX *= keep;
    particle.velocityY *= keep;
  }
}

class FlutterProcessor extends Phaser.GameObjects.Particles.ParticleProcessor {
  constructor() {
    super(0, 0, true);
  }

  update(particle: Phaser.GameObjects.Particles.Particle, delta: number): void {
    const p = particle as Particle;
    const phase = p.flutterPhase ?? 0;
    particle.velocityX += Math.sin(particle.lifeT * 14 + phase) * 0.9 * delta;
    particle.velocityX *= Math.pow(0.94, delta / 16.67);
    if (particle.velocityY > 70) particle.velocityY = 70;
  }
}

// Flares stay a thin horizontal streak no matter how wide they are.
function flareHeight(p: Particle): number {
  return Phaser.Math.Clamp(p.s0 * 0.14, 0.45, 1.3) * (p.thick ?? 1);
}

export class FxParticles {
  private readonly scene: Phaser.Scene;
  private quality: QualityProfile;
  private reducedMotion: boolean;
  private emitters = new Map<string, { emitter: Emitter; cfg: BurstConfig }>();

  constructor(scene: Phaser.Scene, quality: QualityProfile, reducedMotion: boolean) {
    this.scene = scene;
    this.quality = quality;
    this.reducedMotion = reducedMotion;

    this.create('spark', FX.streak, { depth: 78, gravity: 260, add: true, drag: 0.93, max: 420 });
    this.create('ember', FX.dot, { depth: 79, gravity: 420, add: true, drag: 0.975, max: 300 });
    this.create('glint', FX.star, { depth: 81, gravity: 0, add: true, drag: 0.9, max: 120 });
    this.create('feather', FX.feather, { depth: 55, gravity: 150, add: false, flutter: true, max: 160 });
    this.create('smoke', FX.smoke, { depth: 58, gravity: -24, add: false, drag: 0.95, max: 90 });
    this.create('shard', FX.shard, { depth: 57, gravity: 720, add: false, drag: 0.985, max: 120 });
    this.create('coin', FX.coin, { depth: 80, gravity: 820, add: false, drag: 0.985, max: 120 });
    this.create('flash', FX.glow, { depth: 77, gravity: 0, add: true, max: 40 });
    this.create('ring', FX.ring, { depth: 76, gravity: 0, add: true, max: 40 });
    this.create('flare', FX.flare, { depth: 82, gravity: 0, add: true, max: 16, flare: true });
  }

  setQuality(quality: QualityProfile, reducedMotion: boolean): void {
    this.quality = quality;
    this.reducedMotion = reducedMotion;
  }

  sparks(x: number, y: number, options: BurstOptions): void {
    this.burst('spark', x, y, { speed: [180, 520], life: [220, 520], scale: [0.35, 0.8], scaleEnd: 0.2, ...options }, { align: true });
  }

  embers(x: number, y: number, options: BurstOptions): void {
    this.burst('ember', x, y, { speed: [60, 300], life: [500, 1100], scale: [0.14, 0.34], scaleEnd: 0.1, angle: [200, 340], ...options });
  }

  glints(x: number, y: number, options: BurstOptions): void {
    this.burst('glint', x, y, { speed: [30, 160], life: [300, 700], scale: [0.25, 0.6], scaleEnd: 0, spin: 180, ...options });
  }

  feathers(x: number, y: number, options: BurstOptions): void {
    this.burst('feather', x, y, { speed: [60, 220], life: [900, 1700], scale: [0.5, 1.05], scaleEnd: 0.7, spin: 420, alpha: 0.95, ...options });
  }

  smoke(x: number, y: number, options: BurstOptions): void {
    this.burst('smoke', x, y, { speed: [10, 70], life: [600, 1200], scale: [0.5, 0.9], scaleEnd: 2.1, spin: 60, alpha: 0.55, ...options });
  }

  shards(x: number, y: number, options: BurstOptions): void {
    this.burst('shard', x, y, { speed: [160, 420], life: [500, 900], scale: [0.5, 1.1], scaleEnd: 0.6, spin: 900, angle: [190, 350], ...options });
  }

  coins(x: number, y: number, count: number): void {
    this.burst('coin', x, y, { count, speed: [180, 380], life: [700, 1100], scale: [0.55, 0.85], scaleEnd: 0.5, spin: 720, angle: [220, 320] });
  }

  flash(x: number, y: number, color: number, size: number, life = 180): void {
    this.burst('flash', x, y, { count: 1, color, speed: [0, 0], life: [life, life], scale: [size / 128, size / 128], scaleEnd: 1.35, alpha: 1 }, { force: true });
  }

  ring(x: number, y: number, color: number, size: number, life = 360, alpha = 0.9): void {
    this.burst('ring', x, y, { count: 1, color, speed: [0, 0], life: [life, life], scale: [size / 128 * 0.25, size / 128 * 0.25], scaleEnd: 4, alpha }, { force: true });
  }

  flare(x: number, y: number, color: number, width: number, life = 260, thickness = 1): void {
    if (this.quality.tier === 'low') return;
    this.burst('flare', x, y, { count: 1, color, speed: [0, 0], life: [life, life], scale: [width / 256, width / 256], scaleEnd: 1.3, alpha: 0.85 }, { force: true, fixed: true, thickness });
  }

  private count(requested: number, force = false): number {
    if (force) return requested;
    const scale = this.quality.particleScale * (this.reducedMotion ? 0.45 : 1);
    return Math.max(requested > 0 ? 1 : 0, Math.round(requested * scale));
  }

  private burst(
    name: string,
    x: number,
    y: number,
    options: BurstOptions,
    flags: { align?: boolean; force?: boolean; fixed?: boolean; thickness?: number } = {},
  ): void {
    const entry = this.emitters.get(name);
    if (!entry) return;
    const count = this.count(options.count, flags.force);
    if (count <= 0) return;

    const cfg = entry.cfg;
    const colors = options.color === undefined ? [0xffffff] : Array.isArray(options.color) ? options.color : [options.color];
    cfg.tints = colors;
    cfg.speedMin = options.speed?.[0] ?? DEFAULT_BURST.speedMin;
    cfg.speedMax = options.speed?.[1] ?? DEFAULT_BURST.speedMax;
    cfg.lifeMin = options.life?.[0] ?? DEFAULT_BURST.lifeMin;
    cfg.lifeMax = options.life?.[1] ?? DEFAULT_BURST.lifeMax;
    cfg.scaleMin = options.scale?.[0] ?? DEFAULT_BURST.scaleMin;
    cfg.scaleMax = options.scale?.[1] ?? DEFAULT_BURST.scaleMax;
    cfg.scaleEnd = options.scaleEnd ?? DEFAULT_BURST.scaleEnd;
    cfg.alpha = options.alpha ?? DEFAULT_BURST.alpha;
    cfg.angleMin = options.angle?.[0] ?? 0;
    cfg.angleMax = options.angle?.[1] ?? 360;
    cfg.align = flags.align ?? false;
    cfg.spin = options.spin ?? 0;
    cfg.stretch = options.stretch ?? 1;
    cfg.fixedRotation = flags.fixed ?? false;
    cfg.thickness = flags.thickness ?? 1;
    if (this.reducedMotion) {
      cfg.speedMax = cfg.speedMin + (cfg.speedMax - cfg.speedMin) * 0.5;
      cfg.lifeMax = Math.max(cfg.lifeMin, cfg.lifeMax * 0.7);
    }

    entry.emitter.explode(count, x, y);
  }

  private create(
    name: string,
    texture: string,
    options: { depth: number; gravity: number; add: boolean; drag?: number; flutter?: boolean; max: number; flare?: boolean },
  ): void {
    const cfg: BurstConfig = { ...DEFAULT_BURST };
    const random = (min: number, max: number) => min + Math.random() * (max - min);
    const maxAlive = Math.round(options.max * Math.max(0.4, this.quality.particleScale));

    const emitter = this.scene.add.particles(0, 0, texture, {
      emitting: false,
      maxAliveParticles: maxAlive,
      gravityY: options.gravity,
      blendMode: options.add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL,
      lifespan: { onEmit: () => random(cfg.lifeMin, cfg.lifeMax) },
      speed: { onEmit: () => random(cfg.speedMin, cfg.speedMax) },
      rotate: {
        onEmit: (particle?: Phaser.GameObjects.Particles.Particle) => {
          const p = particle as Particle;
          const direction = random(cfg.angleMin, cfg.angleMax);
          p.dir = direction;
          p.spin = cfg.spin * (Math.random() < 0.5 ? -1 : 1) * random(0.5, 1);
          p.rot0 = cfg.fixedRotation ? 0 : cfg.align ? direction : random(0, 360);
          p.flutterPhase = random(0, Math.PI * 2);
          return p.rot0;
        },
        onUpdate: (particle: Phaser.GameObjects.Particles.Particle, _key: string, t: number) => {
          const p = particle as Particle;
          if (cfg.fixedRotation) return 0;
          if (cfg.align && p.spin === 0) {
            return Phaser.Math.RadToDeg(Math.atan2(particle.velocityY, particle.velocityX));
          }
          return p.rot0 + p.spin * t;
        },
      },
      angle: { onEmit: (particle?: Phaser.GameObjects.Particles.Particle) => (particle as Particle).dir },
      scaleX: {
        onEmit: (particle?: Phaser.GameObjects.Particles.Particle) => {
          const p = particle as Particle;
          const scale = random(cfg.scaleMin, cfg.scaleMax);
          p.s0 = scale;
          p.s1 = scale * cfg.scaleEnd;
          p.stretch = cfg.stretch;
          p.thick = cfg.thickness;
          return scale * (options.flare ? 1 : cfg.stretch);
        },
        onUpdate: (particle: Phaser.GameObjects.Particles.Particle, _key: string, t: number) => {
          const p = particle as Particle;
          return (p.s0 + (p.s1 - p.s0) * t) * (options.flare ? 1 : p.stretch);
        },
      },
      scaleY: {
        onEmit: (particle?: Phaser.GameObjects.Particles.Particle) => {
          const p = particle as Particle;
          return options.flare ? flareHeight(p) : p.s0;
        },
        onUpdate: (particle: Phaser.GameObjects.Particles.Particle, _key: string, t: number) => {
          const p = particle as Particle;
          const value = p.s0 + (p.s1 - p.s0) * t;
          return options.flare ? flareHeight(p) * (1 - t * 0.8) : value;
        },
      },
      alpha: {
        onEmit: (particle?: Phaser.GameObjects.Particles.Particle) => {
          (particle as Particle).a0 = cfg.alpha;
          return cfg.alpha;
        },
        onUpdate: (particle: Phaser.GameObjects.Particles.Particle, _key: string, t: number) => {
          const eased = 1 - t * t;
          return (particle as Particle).a0 * eased;
        },
      },
      tint: { onEmit: () => cfg.tints[Math.floor(Math.random() * cfg.tints.length)] ?? 0xffffff },
    });
    emitter.setDepth(options.depth);
    if (options.drag) emitter.addParticleProcessor(new DragProcessor(options.drag));
    if (options.flutter) emitter.addParticleProcessor(new FlutterProcessor());
    this.emitters.set(name, { emitter, cfg });
  }
}
