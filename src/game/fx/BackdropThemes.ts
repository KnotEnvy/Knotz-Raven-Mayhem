// Canvas painters for every stage backdrop. Each theme is split into layers
// that the runtime (Backdrop.ts) bakes into textures once per stage/size and
// scrolls at different speeds for parallax. Painters work in display pixels;
// `u` is a size unit (1 at a 900px-tall screen) so props scale with the
// viewport instead of dwarfing a phone screen. Layer painters must be
// horizontally tileable: anything crossing an edge is drawn with `tiled()`.

export type Rand = () => number;
type Ctx = CanvasRenderingContext2D;

export interface SkyPaint {
  w: number;
  h: number;
  horizon: number;
  u: number;
  rand: Rand;
}

export interface LayerPaint {
  width: number;
  height: number;
  u: number;
  rand: Rand;
}

export interface LayerSpec {
  id: string;
  tileWidth: number;
  heightFraction: number;
  bottomFraction: number;
  speed: number;
  minLayers: number;
  paint: (ctx: Ctx, p: LayerPaint) => void;
  glow?: (ctx: Ctx, p: LayerPaint) => void;
  glowMode?: 'flicker' | 'pulse' | 'chase' | 'steady';
}

export type AmbientKind = 'fireflies' | 'rain' | 'embers' | 'confetti' | 'ash' | 'coins' | 'snow' | 'motes';
export type ThemeEvent = 'lightning' | 'fireworks' | 'train' | 'searchlight' | 'clock' | 'wheel' | 'beacon';

export interface CelestialGlow {
  x: number;
  y: number;
  radius: number;
  color: number;
  pulse: number;
}

export interface ThemeSpec {
  id: string;
  horizon: number;
  sky: (ctx: Ctx, p: SkyPaint) => void;
  layers: LayerSpec[];
  ground: 'grid' | 'water';
  gridColor: number;
  horizonGlow: number;
  fog?: { color: number; alpha: number; y: number; speed: number };
  ambient?: AmbientKind;
  ambientColors?: number[];
  events?: ThemeEvent[];
  celestial?: CelestialGlow;
}

// ---------------------------------------------------------------- helpers

export function tiled(width: number, draw: (offset: number) => void): void {
  draw(-width);
  draw(0);
  draw(width);
}

function verticalGradient(ctx: Ctx, x: number, y0: number, width: number, y1: number, stops: Array<[number, string]>): void {
  const gradient = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y0, width, y1 - y0);
}

function radialGlow(ctx: Ctx, x: number, y: number, radius: number, color: string, alpha = 1): void {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, withAlpha(color, alpha));
  gradient.addColorStop(0.35, withAlpha(color, alpha * 0.45));
  gradient.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function drawStars(ctx: Ctx, width: number, maxY: number, count: number, rand: Rand, colors = ['#ffffff', '#cfe8ff', '#ffe9c4']): void {
  for (let index = 0; index < count; index++) {
    const x = rand() * width;
    const y = Math.pow(rand(), 1.4) * maxY;
    const size = rand() < 0.08 ? 1.6 + rand() * 1.2 : 0.5 + rand() * 0.9;
    const alpha = 0.35 + rand() * 0.65;
    ctx.fillStyle = withAlpha(colors[index % colors.length], alpha * (1 - (y / maxY) * 0.6));
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    if (size > 1.8) {
      ctx.fillStyle = withAlpha('#ffffff', 0.15);
      ctx.fillRect(x - size * 3, y - 0.4, size * 6, 0.8);
      ctx.fillRect(x - 0.4, y - size * 3, 0.8, size * 6);
    }
  }
}

function drawMoon(ctx: Ctx, x: number, y: number, radius: number, light: string, shadow: string, rand: Rand): void {
  radialGlow(ctx, x, y, radius * 3.2, light, 0.22);
  const body = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.35, radius * 0.1, x, y, radius);
  body.addColorStop(0, light);
  body.addColorStop(1, shadow);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();
  for (let index = 0; index < 9; index++) {
    const cx = x + (rand() - 0.5) * radius * 1.5;
    const cy = y + (rand() - 0.5) * radius * 1.5;
    const cr = radius * (0.06 + rand() * 0.14);
    ctx.fillStyle = withAlpha(shadow, 0.35);
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = withAlpha(light, 0.25);
    ctx.lineWidth = Math.max(1, cr * 0.18);
    ctx.beginPath();
    ctx.arc(cx - cr * 0.15, cy - cr * 0.15, cr, Math.PI * 0.9, Math.PI * 1.9);
    ctx.stroke();
  }
  const terminator = ctx.createLinearGradient(x - radius, y, x + radius, y);
  terminator.addColorStop(0, 'rgba(0,0,0,0)');
  terminator.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = terminator;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  ctx.restore();
}

function drawCloudBand(ctx: Ctx, width: number, y: number, thickness: number, color: string, rand: Rand, puffs: number, alpha: number): void {
  for (let index = 0; index < puffs; index++) {
    const x = rand() * width;
    const cy = y + (rand() - 0.5) * thickness;
    const rx = thickness * (0.9 + rand() * 1.6);
    const ry = thickness * (0.35 + rand() * 0.35);
    tiled(width, (offset) => {
      const gradient = ctx.createRadialGradient(x + offset, cy, 0, x + offset, cy, rx);
      gradient.addColorStop(0, withAlpha(color, alpha));
      gradient.addColorStop(1, withAlpha(color, 0));
      ctx.save();
      ctx.translate(x + offset, cy);
      ctx.scale(1, ry / rx);
      ctx.translate(-(x + offset), -cy);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x + offset, cy, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }
}

// Periodic ridge line: integer frequencies over the tile width make it tile.
function ridge(ctx: Ctx, width: number, height: number, base: number, waves: Array<[number, number, number]>, fill: string | CanvasGradient, jagged = 0, rand?: Rand): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(0, height);
  const step = Math.max(4, width / 220);
  for (let x = 0; x <= width + 0.5; x += step) {
    let y = base;
    for (const [frequency, amplitude, phase] of waves) {
      y -= Math.sin((x / width) * Math.PI * 2 * frequency + phase) * amplitude;
    }
    if (jagged && rand && x > 0 && x < width) y -= (rand() - 0.5) * jagged;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();
}

function rimLine(ctx: Ctx, width: number, base: number, waves: Array<[number, number, number]>, color: string, lineWidth: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  const step = Math.max(4, width / 220);
  for (let x = 0; x <= width + 0.5; x += step) {
    let y = base;
    for (const [frequency, amplitude, phase] of waves) {
      y -= Math.sin((x / width) * Math.PI * 2 * frequency + phase) * amplitude;
    }
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function deadTree(ctx: Ctx, x: number, baseY: number, height: number, rand: Rand, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  const branch = (bx: number, by: number, length: number, angle: number, thickness: number, depth: number) => {
    const ex = bx + Math.cos(angle) * length;
    const ey = by + Math.sin(angle) * length;
    ctx.lineWidth = thickness;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx + (ex - bx) * 0.5 + (rand() - 0.5) * length * 0.3, by + (ey - by) * 0.5, ex, ey);
    ctx.stroke();
    if (depth <= 0 || thickness < 0.8) return;
    const splits = 2 + (rand() < 0.35 ? 1 : 0);
    for (let index = 0; index < splits; index++) {
      branch(ex, ey, length * (0.55 + rand() * 0.2), angle + (rand() - 0.5) * 1.3, thickness * 0.62, depth - 1);
    }
  };
  branch(x, baseY, height * 0.42, -Math.PI / 2 + (rand() - 0.5) * 0.2, Math.max(2, height * 0.06), 4);
}

function windows(ctx: Ctx, x: number, y: number, width: number, height: number, cell: number, rand: Rand, color: string, chance: number): void {
  const columns = Math.max(1, Math.floor(width / cell));
  const rows = Math.max(1, Math.floor(height / cell));
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      if (rand() > chance) continue;
      ctx.fillStyle = withAlpha(color, 0.55 + rand() * 0.45);
      ctx.fillRect(x + column * cell + cell * 0.25, y + row * cell + cell * 0.25, cell * 0.5, cell * 0.55);
    }
  }
}

function neonText(ctx: Ctx, text: string, x: number, y: number, size: number, color: string, glowOnly = false): void {
  ctx.save();
  ctx.font = `${Math.round(size)}px "Bungee", Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = size * 0.6;
  ctx.fillStyle = glowOnly ? color : withAlpha(color, 0.9);
  ctx.fillText(text, x, y);
  if (!glowOnly) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = withAlpha('#ffffff', 0.55);
    ctx.fillText(text, x, y);
  }
  ctx.restore();
}

function bulbString(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, sag: number, count: number, colors: string[], radius: number): void {
  for (let index = 0; index <= count; index++) {
    const t = index / count;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag;
    radialGlow(ctx, x, y, radius * 3.2, colors[index % colors.length], 0.7);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
}

function wire(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, sag: number, color: string, lineWidth: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag * 2, x1, y1);
  ctx.stroke();
}

function groundFill(ctx: Ctx, p: SkyPaint, top: string, bottom: string, glow: string): void {
  verticalGradient(ctx, 0, p.horizon, p.w, p.h, [[0, top], [1, bottom]]);
  const band = ctx.createLinearGradient(0, p.horizon - 40 * p.u, 0, p.horizon + 26 * p.u);
  band.addColorStop(0, withAlpha(glow, 0));
  band.addColorStop(0.6, withAlpha(glow, 0.35));
  band.addColorStop(1, withAlpha(glow, 0));
  ctx.fillStyle = band;
  ctx.fillRect(0, p.horizon - 40 * p.u, p.w, 66 * p.u);
}

export function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('rgba')) return color;
  const hex = color.replace('#', '');
  const value = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

// ------------------------------------------------------------------ themes

const graveyard: ThemeSpec = {
  id: 'graveyard-dusk',
  horizon: 0.72,
  ground: 'grid',
  gridColor: 0xff42f8,
  horizonGlow: 0xff5ce1,
  ambient: 'fireflies',
  ambientColors: [0xd8ff6a, 0xfff08a, 0x9dff57],
  fog: { color: 0xb68cff, alpha: 0.2, y: 0.66, speed: 0.012 },
  celestial: { x: 0.78, y: 0.2, radius: 0.34, color: 0xc89cff, pulse: 0.08 },
  sky: (ctx, p) => {
    verticalGradient(ctx, 0, 0, p.w, p.horizon, [[0, '#0b0518'], [0.45, '#1d0c36'], [0.8, '#43175e'], [1, '#7a2a7d']]);
    drawStars(ctx, p.w, p.horizon * 0.8, Math.round((p.w * p.h) / 3200), p.rand);
    drawCloudBand(ctx, p.w, p.h * 0.34, 60 * p.u, '#6a3c9c', p.rand, 14, 0.18);
    drawMoon(ctx, p.w * 0.78, p.h * 0.2, Math.min(p.w, p.h) * 0.11, '#c9b2dc', '#6a5188', p.rand);
    drawCloudBand(ctx, p.w, p.h * 0.24, 22 * p.u, '#2a1440', p.rand, 8, 0.55);
    groundFill(ctx, p, '#1a0a26', '#07030d', '#ff5ce1');
  },
  layers: [
    {
      id: 'far',
      tileWidth: 1300,
      heightFraction: 0.32,
      bottomFraction: 0.735,
      speed: 0.005,
      minLayers: 2,
      paint: (ctx, p) => {
        const waves: Array<[number, number, number]> = [[1, 18 * p.u, 0.4], [3, 10 * p.u, 1.1], [5, 5 * p.u, 2]];
        const base = p.height - 46 * p.u;
        ridge(ctx, p.width, p.height, base, waves, '#1c0b2e');
        rimLine(ctx, p.width, base, waves, 'rgba(255, 120, 230, 0.35)', 1.5);
        const chapelX = p.width * 0.3;
        const chapelBase = base + 6 * p.u;
        tiled(p.width, (o) => {
          const x = chapelX + o;
          ctx.fillStyle = '#120720';
          ctx.fillRect(x, chapelBase - 70 * p.u, 90 * p.u, 70 * p.u);
          ctx.beginPath();
          ctx.moveTo(x - 6 * p.u, chapelBase - 70 * p.u);
          ctx.lineTo(x + 45 * p.u, chapelBase - 108 * p.u);
          ctx.lineTo(x + 96 * p.u, chapelBase - 70 * p.u);
          ctx.fill();
          ctx.fillRect(x + 60 * p.u, chapelBase - 150 * p.u, 22 * p.u, 90 * p.u);
          ctx.beginPath();
          ctx.moveTo(x + 56 * p.u, chapelBase - 150 * p.u);
          ctx.lineTo(x + 71 * p.u, chapelBase - 196 * p.u);
          ctx.lineTo(x + 86 * p.u, chapelBase - 150 * p.u);
          ctx.fill();
          ctx.fillRect(x + 69.5 * p.u, chapelBase - 214 * p.u, 3 * p.u, 20 * p.u);
          ctx.fillRect(x + 64 * p.u, chapelBase - 208 * p.u, 14 * p.u, 3 * p.u);
        });
        for (let index = 0; index < 5; index++) {
          const x = p.rand() * p.width;
          tiled(p.width, (o) => deadTree(ctx, x + o, base + 8 * p.u, (70 + p.rand() * 60) * p.u, p.rand, '#170926'));
        }
      },
      glow: (ctx, p) => {
        const base = p.height - 40 * p.u;
        tiled(p.width, (o) => {
          const x = p.width * 0.3 + o;
          radialGlow(ctx, x + 30 * p.u, base - 44 * p.u, 26 * p.u, '#ffb347', 0.8);
          ctx.fillStyle = '#ffd27a';
          ctx.fillRect(x + 24 * p.u, base - 54 * p.u, 12 * p.u, 18 * p.u);
          ctx.fillRect(x + 66 * p.u, base - 128 * p.u, 9 * p.u, 14 * p.u);
        });
      },
      glowMode: 'flicker',
    },
    {
      id: 'mid',
      tileWidth: 1500,
      heightFraction: 0.26,
      bottomFraction: 0.78,
      speed: 0.016,
      minLayers: 1,
      paint: (ctx, p) => {
        const ground = p.height - 16 * p.u;
        ctx.fillStyle = '#0c0514';
        ctx.fillRect(0, ground, p.width, p.height - ground);
        for (let index = 0; index < 16; index++) {
          const x = (index / 16) * p.width + p.rand() * 40 * p.u;
          const kind = Math.floor(p.rand() * 4);
          const height = (34 + p.rand() * 38) * p.u;
          const width = (24 + p.rand() * 18) * p.u;
          tiled(p.width, (o) => {
            const sx = x + o;
            ctx.fillStyle = '#140922';
            ctx.strokeStyle = 'rgba(255, 110, 230, 0.4)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            if (kind === 0) {
              ctx.moveTo(sx, ground);
              ctx.lineTo(sx, ground - height + width / 2);
              ctx.arc(sx + width / 2, ground - height + width / 2, width / 2, Math.PI, 0);
              ctx.lineTo(sx + width, ground);
            } else if (kind === 1) {
              ctx.rect(sx + width * 0.38, ground - height * 1.2, width * 0.24, height * 1.2);
              ctx.rect(sx, ground - height * 0.9, width, width * 0.24);
            } else if (kind === 2) {
              ctx.moveTo(sx + width * 0.2, ground);
              ctx.lineTo(sx + width * 0.3, ground - height * 1.4);
              ctx.lineTo(sx + width * 0.5, ground - height * 1.6);
              ctx.lineTo(sx + width * 0.7, ground - height * 1.4);
              ctx.lineTo(sx + width * 0.8, ground);
            } else {
              ctx.rect(sx, ground - height * 0.7, width * 1.3, height * 0.7);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          });
        }
        ctx.strokeStyle = '#0e0618';
        ctx.lineWidth = 2 * p.u;
        const fenceY = ground - 30 * p.u;
        ctx.beginPath();
        ctx.moveTo(0, fenceY);
        ctx.lineTo(p.width, fenceY);
        ctx.moveTo(0, fenceY + 12 * p.u);
        ctx.lineTo(p.width, fenceY + 12 * p.u);
        ctx.stroke();
        for (let x = 0; x < p.width; x += 14 * p.u) {
          ctx.beginPath();
          ctx.moveTo(x, ground);
          ctx.lineTo(x, fenceY - 10 * p.u);
          ctx.lineTo(x + 3 * p.u, fenceY - 16 * p.u);
          ctx.lineTo(x + 6 * p.u, fenceY - 10 * p.u);
          ctx.stroke();
        }
      },
    },
    {
      id: 'near',
      tileWidth: 1100,
      heightFraction: 0.12,
      bottomFraction: 1,
      speed: 0.05,
      minLayers: 4,
      paint: (ctx, p) => grassTufts(ctx, p, '#05020a'),
    },
  ],
};

function grassTufts(ctx: Ctx, p: LayerPaint, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, p.height - 10 * p.u, p.width, 10 * p.u);
  for (let index = 0; index < 90; index++) {
    const x = p.rand() * p.width;
    const height = (10 + p.rand() * 34) * p.u;
    const lean = (p.rand() - 0.5) * 16 * p.u;
    tiled(p.width, (o) => {
      ctx.beginPath();
      ctx.moveTo(x + o - 3 * p.u, p.height);
      ctx.quadraticCurveTo(x + o + lean * 0.3, p.height - height * 0.6, x + o + lean, p.height - height);
      ctx.quadraticCurveTo(x + o + lean * 0.2, p.height - height * 0.5, x + o + 3 * p.u, p.height);
      ctx.fill();
    });
  }
}

const boardwalk: ThemeSpec = {
  id: 'neon-boardwalk',
  horizon: 0.7,
  ground: 'water',
  gridColor: 0x20f2ff,
  horizonGlow: 0x20f2ff,
  ambient: 'motes',
  ambientColors: [0x20f2ff, 0xffb11f, 0xff6ad5],
  events: ['searchlight'],
  celestial: { x: 0.2, y: 0.16, radius: 0.18, color: 0x9fe8ff, pulse: 0.05 },
  sky: (ctx, p) => {
    verticalGradient(ctx, 0, 0, p.w, p.horizon, [[0, '#010a18'], [0.55, '#06243f'], [0.85, '#0d4a66'], [1, '#1f7f8f']]);
    drawStars(ctx, p.w, p.horizon * 0.6, Math.round((p.w * p.h) / 5200), p.rand);
    drawMoon(ctx, p.w * 0.2, p.h * 0.16, Math.min(p.w, p.h) * 0.05, '#d4eef8', '#7ea4b8', p.rand);
    drawCloudBand(ctx, p.w, p.h * 0.42, 40 * p.u, '#1a6c86', p.rand, 12, 0.22);
    verticalGradient(ctx, 0, p.horizon, p.w, p.h, [[0, '#0a3346'], [0.35, '#04182a'], [1, '#010812']]);
    // Baked city light reflections, animated shimmer is drawn at runtime.
    for (let index = 0; index < 60; index++) {
      const x = p.rand() * p.w;
      const color = ['#20f2ff', '#ffb11f', '#ff6ad5', '#ffffff'][index % 4];
      const length = (20 + p.rand() * 90) * p.u;
      const gradient = ctx.createLinearGradient(0, p.horizon, 0, p.horizon + length);
      gradient.addColorStop(0, withAlpha(color, 0.4));
      gradient.addColorStop(1, withAlpha(color, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(x, p.horizon, (1.5 + p.rand() * 3) * p.u, length);
    }
  },
  layers: [
    {
      id: 'far',
      tileWidth: 1400,
      heightFraction: 0.34,
      bottomFraction: 0.705,
      speed: 0.004,
      minLayers: 2,
      paint: (ctx, p) => {
        let x = 0;
        while (x < p.width) {
          const width = (26 + p.rand() * 54) * p.u;
          const height = (40 + p.rand() * 170) * p.u;
          ctx.fillStyle = p.rand() < 0.5 ? '#041527' : '#06203a';
          ctx.fillRect(x, p.height - height, width, height);
          if (p.rand() < 0.25) ctx.fillRect(x + width * 0.45, p.height - height - 24 * p.u, 2 * p.u, 24 * p.u);
          windows(ctx, x + 2, p.height - height + 6, width - 4, height - 10, 7 * p.u, p.rand, p.rand() < 0.6 ? '#7fe9ff' : '#ffd08a', 0.28);
          x += width + p.rand() * 6 * p.u;
        }
      },
      glow: (ctx, p) => {
        for (let index = 0; index < 5; index++) {
          const x = (index + 0.5) * (p.width / 5) + (p.rand() - 0.5) * 80 * p.u;
          radialGlow(ctx, x, p.height - (90 + p.rand() * 90) * p.u, 60 * p.u, index % 2 ? '#20f2ff' : '#ff6ad5', 0.35);
        }
      },
      glowMode: 'pulse',
    },
    {
      id: 'mid',
      tileWidth: 1600,
      heightFraction: 0.3,
      bottomFraction: 0.745,
      speed: 0.014,
      minLayers: 1,
      paint: (ctx, p) => {
        const deck = p.height - 26 * p.u;
        ctx.fillStyle = '#03101c';
        ctx.fillRect(0, deck, p.width, 10 * p.u);
        for (let x = 0; x < p.width; x += 46 * p.u) {
          ctx.fillRect(x, deck, 5 * p.u, p.height - deck);
        }
        ctx.strokeStyle = '#051a2a';
        ctx.lineWidth = 3 * p.u;
        ctx.beginPath();
        ctx.moveTo(0, deck - 22 * p.u);
        ctx.lineTo(p.width, deck - 22 * p.u);
        ctx.stroke();
        const posts = 8;
        for (let index = 0; index < posts; index++) {
          const x = (index / posts) * p.width;
          ctx.fillStyle = '#041422';
          ctx.fillRect(x, deck - 120 * p.u, 5 * p.u, 120 * p.u);
          ctx.fillRect(x - 8 * p.u, deck - 124 * p.u, 21 * p.u, 6 * p.u);
          wire(ctx, x + 2 * p.u, deck - 118 * p.u, x + p.width / posts + 2 * p.u, deck - 118 * p.u, 10 * p.u, '#0a2a3c', 1.5);
        }
        const signs: Array<[string, string, number]> = [['ARCADE', '#20f2ff', 0.18], ['HOT DOGS', '#ffb11f', 0.5], ['PIER 96', '#ff6ad5', 0.8]];
        for (const [text, color, t] of signs) {
          const x = p.width * t;
          ctx.fillStyle = '#020b14';
          ctx.fillRect(x - 70 * p.u, deck - 96 * p.u, 140 * p.u, 44 * p.u);
          ctx.strokeStyle = withAlpha(color, 0.4);
          ctx.lineWidth = 2;
          ctx.strokeRect(x - 70 * p.u, deck - 96 * p.u, 140 * p.u, 44 * p.u);
          neonText(ctx, text, x, deck - 74 * p.u, 20 * p.u, withAlpha(color, 0.5));
        }
      },
      glow: (ctx, p) => {
        const deck = p.height - 26 * p.u;
        const posts = 8;
        for (let index = 0; index < posts; index++) {
          const x = (index / posts) * p.width;
          bulbString(ctx, x + 2 * p.u, deck - 118 * p.u, x + p.width / posts + 2 * p.u, deck - 118 * p.u, 10 * p.u, 7, ['#ffd08a', '#20f2ff', '#ff6ad5'], 4 * p.u);
        }
        const signs: Array<[string, string, number]> = [['ARCADE', '#20f2ff', 0.18], ['HOT DOGS', '#ffb11f', 0.5], ['PIER 96', '#ff6ad5', 0.8]];
        for (const [text, color, t] of signs) neonText(ctx, text, p.width * t, deck - 74 * p.u, 20 * p.u, color);
      },
      glowMode: 'flicker',
    },
  ],
};

const storm: ThemeSpec = {
  id: 'storm-tower',
  horizon: 0.72,
  ground: 'grid',
  gridColor: 0x93ff29,
  horizonGlow: 0x27a8ff,
  ambient: 'rain',
  ambientColors: [0xbfe6ff],
  events: ['lightning', 'beacon'],
  fog: { color: 0x7fb8ff, alpha: 0.16, y: 0.6, speed: 0.03 },
  sky: (ctx, p) => {
    verticalGradient(ctx, 0, 0, p.w, p.horizon, [[0, '#040b16'], [0.5, '#0b2233'], [0.85, '#2a1d48'], [1, '#3b2a5c']]);
    for (let band = 0; band < 5; band++) {
      drawCloudBand(ctx, p.w, p.h * (0.08 + band * 0.12), (50 + band * 10) * p.u, band % 2 ? '#1b3346' : '#0e1c2c', p.rand, 16, 0.7);
    }
    drawCloudBand(ctx, p.w, p.h * 0.3, 70 * p.u, '#3a5c7a', p.rand, 8, 0.12);
    groundFill(ctx, p, '#0d1a1c', '#030708', '#5fd0ff');
  },
  layers: [
    {
      id: 'far',
      tileWidth: 1500,
      heightFraction: 0.4,
      bottomFraction: 0.73,
      speed: 0.004,
      minLayers: 2,
      paint: (ctx, p) => {
        const waves: Array<[number, number, number]> = [[1, 40 * p.u, 0.2], [2, 26 * p.u, 1.4], [5, 10 * p.u, 0.6]];
        ridge(ctx, p.width, p.height, p.height - 80 * p.u, waves, '#0a1520', 8 * p.u, p.rand);
        const waves2: Array<[number, number, number]> = [[2, 20 * p.u, 2.2], [3, 12 * p.u, 0.3]];
        ridge(ctx, p.width, p.height, p.height - 34 * p.u, waves2, '#060d15');
        rimLine(ctx, p.width, p.height - 34 * p.u, waves2, 'rgba(147, 255, 41, 0.25)', 1.2);
      },
    },
    {
      id: 'mid',
      tileWidth: 1400,
      heightFraction: 0.3,
      bottomFraction: 0.77,
      speed: 0.018,
      minLayers: 1,
      paint: (ctx, p) => {
        const ground = p.height - 12 * p.u;
        ctx.fillStyle = '#04090d';
        ctx.fillRect(0, ground, p.width, p.height - ground);
        const poles = 5;
        for (let index = 0; index < poles; index++) {
          const x = (index / poles) * p.width + 30 * p.u;
          const top = ground - 150 * p.u;
          ctx.fillStyle = '#060e14';
          ctx.fillRect(x, top, 6 * p.u, ground - top);
          ctx.fillRect(x - 26 * p.u, top + 8 * p.u, 58 * p.u, 5 * p.u);
          ctx.fillRect(x - 18 * p.u, top + 26 * p.u, 42 * p.u, 4 * p.u);
          const next = ((index + 1) / poles) * p.width + 30 * p.u;
          for (const [dy, dx] of [[10, -24], [10, 28], [28, -16], [28, 20]] as const) {
            wire(ctx, x + dx * p.u, top + dy * p.u, next + dx * p.u, top + dy * p.u, 12 * p.u, 'rgba(20, 40, 52, 0.9)', 1.2);
          }
        }
        for (let index = 0; index < 22; index++) {
          const x = p.rand() * p.width;
          const height = (20 + p.rand() * 40) * p.u;
          tiled(p.width, (o) => {
            ctx.fillStyle = '#050b10';
            ctx.beginPath();
            ctx.moveTo(x + o - 18 * p.u, ground);
            ctx.lineTo(x + o, ground - height);
            ctx.lineTo(x + o + 18 * p.u, ground);
            ctx.fill();
          });
        }
      },
    },
    {
      id: 'near',
      tileWidth: 1000,
      heightFraction: 0.1,
      bottomFraction: 1,
      speed: 0.055,
      minLayers: 4,
      paint: (ctx, p) => grassTufts(ctx, p, '#020507'),
    },
  ],
};

const junkyard: ThemeSpec = {
  id: 'junkyard-moon',
  horizon: 0.72,
  ground: 'grid',
  gridColor: 0xffe14b,
  horizonGlow: 0xff6d2d,
  ambient: 'embers',
  ambientColors: [0xffb347, 0xff6d2d, 0xffe14b],
  fog: { color: 0xc7863f, alpha: 0.14, y: 0.64, speed: 0.01 },
  celestial: { x: 0.64, y: 0.5, radius: 0.5, color: 0xffb44d, pulse: 0.06 },
  sky: (ctx, p) => {
    verticalGradient(ctx, 0, 0, p.w, p.horizon, [[0, '#0d0714'], [0.4, '#2a1428'], [0.8, '#6b3a1c'], [1, '#a8602a']]);
    drawStars(ctx, p.w, p.horizon * 0.45, Math.round((p.w * p.h) / 7000), p.rand);
    drawMoon(ctx, p.w * 0.64, p.h * 0.5, Math.min(p.w, p.h) * 0.2, '#f2b872', '#9a4a22', p.rand);
    drawCloudBand(ctx, p.w, p.h * 0.46, 26 * p.u, '#3a1a14', p.rand, 10, 0.6);
    groundFill(ctx, p, '#1a120a', '#060402', '#ff9b3d');
  },
  layers: [
    {
      id: 'far',
      tileWidth: 1400,
      heightFraction: 0.36,
      bottomFraction: 0.735,
      speed: 0.005,
      minLayers: 2,
      paint: (ctx, p) => {
        const waves: Array<[number, number, number]> = [[2, 22 * p.u, 0.7], [5, 14 * p.u, 1.9], [9, 6 * p.u, 0.4]];
        ridge(ctx, p.width, p.height, p.height - 50 * p.u, waves, '#140b08', 10 * p.u, p.rand);
        const craneX = p.width * 0.35;
        tiled(p.width, (o) => {
          const x = craneX + o;
          const base = p.height - 40 * p.u;
          ctx.strokeStyle = '#120a06';
          ctx.lineWidth = 7 * p.u;
          ctx.beginPath();
          ctx.moveTo(x, base);
          ctx.lineTo(x, base - 200 * p.u);
          ctx.lineTo(x + 180 * p.u, base - 170 * p.u);
          ctx.moveTo(x, base - 200 * p.u);
          ctx.lineTo(x - 50 * p.u, base - 180 * p.u);
          ctx.stroke();
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x + 160 * p.u, base - 172 * p.u);
          ctx.lineTo(x + 160 * p.u, base - 90 * p.u);
          ctx.stroke();
          ctx.fillStyle = '#120a06';
          ctx.fillRect(x + 150 * p.u, base - 92 * p.u, 20 * p.u, 16 * p.u);
          ctx.strokeStyle = 'rgba(255, 180, 90, 0.35)';
          ctx.lineWidth = 1.5;
          for (let y = base - 190 * p.u; y < base; y += 18 * p.u) {
            ctx.beginPath();
            ctx.moveTo(x - 3 * p.u, y);
            ctx.lineTo(x + 3 * p.u, y + 9 * p.u);
            ctx.stroke();
          }
        });
      },
      glow: (ctx, p) => {
        tiled(p.width, (o) => radialGlow(ctx, p.width * 0.35 + o, p.height - 242 * p.u, 16 * p.u, '#ff3b2d', 1));
      },
      glowMode: 'pulse',
    },
    {
      id: 'mid',
      tileWidth: 1500,
      heightFraction: 0.28,
      bottomFraction: 0.78,
      speed: 0.017,
      minLayers: 1,
      paint: (ctx, p) => {
        const ground = p.height - 14 * p.u;
        ctx.fillStyle = '#0a0604';
        ctx.fillRect(0, ground, p.width, p.height - ground);
        for (let index = 0; index < 7; index++) {
          const x = (index / 7) * p.width + p.rand() * 60 * p.u;
          const stack = 1 + Math.floor(p.rand() * 3);
          tiled(p.width, (o) => {
            for (let level = 0; level < stack; level++) {
              const y = ground - (level + 1) * 28 * p.u;
              const width = (86 - level * 10) * p.u;
              ctx.fillStyle = level % 2 ? '#1a0f08' : '#140b06';
              ctx.beginPath();
              ctx.moveTo(x + o + level * 6 * p.u, y + 28 * p.u);
              ctx.lineTo(x + o + level * 6 * p.u + 10 * p.u, y + 6 * p.u);
              ctx.lineTo(x + o + level * 6 * p.u + width * 0.35, y);
              ctx.lineTo(x + o + level * 6 * p.u + width * 0.75, y);
              ctx.lineTo(x + o + level * 6 * p.u + width, y + 12 * p.u);
              ctx.lineTo(x + o + level * 6 * p.u + width, y + 28 * p.u);
              ctx.fill();
              ctx.strokeStyle = 'rgba(255, 225, 75, 0.25)';
              ctx.lineWidth = 1;
              ctx.stroke();
            }
          });
        }
        for (let index = 0; index < 4; index++) {
          const x = ((index + 0.5) / 4) * p.width;
          ctx.fillStyle = '#1c120a';
          ctx.fillRect(x - 12 * p.u, ground - 34 * p.u, 24 * p.u, 34 * p.u);
          ctx.strokeStyle = '#2d1c0e';
          ctx.lineWidth = 2;
          ctx.strokeRect(x - 12 * p.u, ground - 34 * p.u, 24 * p.u, 34 * p.u);
        }
      },
      glow: (ctx, p) => {
        const ground = p.height - 14 * p.u;
        for (let index = 0; index < 4; index++) {
          const x = ((index + 0.5) / 4) * p.width;
          radialGlow(ctx, x, ground - 40 * p.u, 60 * p.u, '#ff7a1f', 0.8);
          radialGlow(ctx, x, ground - 38 * p.u, 16 * p.u, '#ffe14b', 1);
        }
      },
      glowMode: 'flicker',
    },
    {
      id: 'near',
      tileWidth: 1000,
      heightFraction: 0.12,
      bottomFraction: 1,
      speed: 0.05,
      minLayers: 4,
      paint: (ctx, p) => {
        ctx.fillStyle = '#040201';
        for (let index = 0; index < 12; index++) {
          const x = p.rand() * p.width;
          const radius = (14 + p.rand() * 18) * p.u;
          tiled(p.width, (o) => {
            ctx.beginPath();
            ctx.arc(x + o, p.height - radius * 0.4, radius, 0, Math.PI * 2);
            ctx.fill();
          });
        }
        ctx.fillRect(0, p.height - 8 * p.u, p.width, 8 * p.u);
      },
    },
  ],
};

const carnival: ThemeSpec = {
  id: 'carnival-night',
  horizon: 0.72,
  ground: 'grid',
  gridColor: 0xff2f7f,
  horizonGlow: 0x2cffc8,
  ambient: 'confetti',
  ambientColors: [0xff2f7f, 0x2cffc8, 0xffdf4d, 0x9d7bff],
  events: ['wheel', 'fireworks'],
  sky: (ctx, p) => {
    verticalGradient(ctx, 0, 0, p.w, p.horizon, [[0, '#12031a'], [0.45, '#2c0632'], [0.8, '#0e3c46'], [1, '#1f6b64']]);
    drawStars(ctx, p.w, p.horizon * 0.7, Math.round((p.w * p.h) / 4200), p.rand, ['#ffffff', '#ffd6f0', '#c8fff1']);
    drawCloudBand(ctx, p.w, p.h * 0.52, 36 * p.u, '#4a1450', p.rand, 10, 0.3);
    groundFill(ctx, p, '#1a0a1c', '#060207', '#2cffc8');
  },
  layers: [
    {
      id: 'far',
      tileWidth: 1500,
      heightFraction: 0.34,
      bottomFraction: 0.735,
      speed: 0.005,
      minLayers: 2,
      paint: (ctx, p) => {
        const base = p.height - 10 * p.u;
        ctx.strokeStyle = '#16061a';
        ctx.lineWidth = 3 * p.u;
        ctx.beginPath();
        for (let x = 0; x <= p.width; x += 6) {
          const y = base - 90 * p.u - Math.sin((x / p.width) * Math.PI * 4) * 60 * p.u - Math.sin((x / p.width) * Math.PI * 2 + 1) * 26 * p.u;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        for (let x = 0; x < p.width; x += 40 * p.u) {
          const y = base - 90 * p.u - Math.sin((x / p.width) * Math.PI * 4) * 60 * p.u - Math.sin((x / p.width) * Math.PI * 2 + 1) * 26 * p.u;
          ctx.lineWidth = 2 * p.u;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, base);
          ctx.stroke();
        }
      },
    },
    {
      id: 'mid',
      tileWidth: 1400,
      heightFraction: 0.3,
      bottomFraction: 0.775,
      speed: 0.015,
      minLayers: 1,
      paint: (ctx, p) => {
        const ground = p.height - 12 * p.u;
        ctx.fillStyle = '#0b030c';
        ctx.fillRect(0, ground, p.width, p.height - ground);
        for (let index = 0; index < 4; index++) {
          const x = (index / 4) * p.width + 40 * p.u;
          const width = (130 + p.rand() * 60) * p.u;
          const height = (90 + p.rand() * 40) * p.u;
          tiled(p.width, (o) => {
            const left = x + o;
            const stripes = 8;
            for (let stripe = 0; stripe < stripes; stripe++) {
              ctx.fillStyle = stripe % 2 ? '#3a0a2a' : '#1c0616';
              ctx.beginPath();
              ctx.moveTo(left + width / 2, ground - height);
              ctx.lineTo(left + (stripe / stripes) * width, ground - height * 0.45);
              ctx.lineTo(left + ((stripe + 1) / stripes) * width, ground - height * 0.45);
              ctx.fill();
            }
            ctx.fillStyle = '#170414';
            ctx.fillRect(left + width * 0.06, ground - height * 0.45, width * 0.88, height * 0.45);
            ctx.fillStyle = '#050106';
            ctx.beginPath();
            ctx.moveTo(left + width * 0.38, ground);
            ctx.lineTo(left + width * 0.5, ground - height * 0.34);
            ctx.lineTo(left + width * 0.62, ground);
            ctx.fill();
            ctx.fillStyle = '#ff2f7f';
            ctx.beginPath();
            ctx.moveTo(left + width / 2, ground - height - 18 * p.u);
            ctx.lineTo(left + width / 2 + 16 * p.u, ground - height - 12 * p.u);
            ctx.lineTo(left + width / 2, ground - height - 6 * p.u);
            ctx.fill();
          });
        }
      },
      glow: (ctx, p) => {
        const ground = p.height - 12 * p.u;
        bulbString(ctx, 0, ground - 150 * p.u, p.width / 2, ground - 150 * p.u, 26 * p.u, 16, ['#ffdf4d', '#ff2f7f', '#2cffc8'], 3.5 * p.u);
        bulbString(ctx, p.width / 2, ground - 150 * p.u, p.width, ground - 150 * p.u, 26 * p.u, 16, ['#ffdf4d', '#ff2f7f', '#2cffc8'], 3.5 * p.u);
      },
      glowMode: 'chase',
    },
    {
      id: 'near',
      tileWidth: 1100,
      heightFraction: 0.1,
      bottomFraction: 1,
      speed: 0.05,
      minLayers: 4,
      paint: (ctx, p) => grassTufts(ctx, p, '#040104'),
    },
  ],
};

const nest: ThemeSpec = {
  id: 'raven-kings-nest',
  horizon: 0.72,
  ground: 'grid',
  gridColor: 0xff1e3d,
  horizonGlow: 0xff1e3d,
  ambient: 'ash',
  ambientColors: [0xff5a6e, 0x9c2dff, 0x5a3a4a],
  fog: { color: 0xa0142e, alpha: 0.2, y: 0.62, speed: 0.016 },
  celestial: { x: 0.24, y: 0.22, radius: 0.5, color: 0xff1e3d, pulse: 0.22 },
  sky: (ctx, p) => {
    verticalGradient(ctx, 0, 0, p.w, p.horizon, [[0, '#040208'], [0.5, '#1a0410'], [0.85, '#4a0818'], [1, '#6b0c22']]);
    drawStars(ctx, p.w, p.horizon * 0.5, Math.round((p.w * p.h) / 6000), p.rand, ['#ffd0d6', '#ffffff']);
    const x = p.w * 0.24;
    const y = p.h * 0.22;
    const radius = Math.min(p.w, p.h) * 0.1;
    radialGlow(ctx, x, y, radius * 3.6, '#ff1e3d', 0.45);
    radialGlow(ctx, x, y, radius * 1.6, '#ffb0a0', 0.6);
    ctx.fillStyle = '#050106';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 190, 170, 0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
    drawCloudBand(ctx, p.w, p.h * 0.36, 40 * p.u, '#2a0610', p.rand, 14, 0.7);
    drawCloudBand(ctx, p.w, p.h * 0.5, 30 * p.u, '#5a0a1e', p.rand, 10, 0.35);
    groundFill(ctx, p, '#180408', '#050103', '#ff1e3d');
  },
  layers: [
    {
      id: 'far',
      tileWidth: 1500,
      heightFraction: 0.44,
      bottomFraction: 0.735,
      speed: 0.004,
      minLayers: 2,
      paint: (ctx, p) => {
        const base = p.height - 30 * p.u;
        for (let index = 0; index < 11; index++) {
          const x = p.rand() * p.width;
          const height = (80 + p.rand() * 200) * p.u;
          const width = (16 + p.rand() * 26) * p.u;
          tiled(p.width, (o) => {
            ctx.fillStyle = '#0c0206';
            ctx.beginPath();
            ctx.moveTo(x + o - width, base + 30 * p.u);
            ctx.lineTo(x + o - width * 0.3, base - height * 0.6);
            ctx.lineTo(x + o, base - height);
            ctx.lineTo(x + o + width * 0.4, base - height * 0.55);
            ctx.lineTo(x + o + width, base + 30 * p.u);
            ctx.fill();
          });
        }
        const nestX = p.width * 0.7;
        tiled(p.width, (o) => {
          const x = nestX + o;
          const y = base - 150 * p.u;
          ctx.fillStyle = '#0a0205';
          ctx.beginPath();
          ctx.moveTo(x - 60 * p.u, base + 30 * p.u);
          ctx.lineTo(x - 30 * p.u, y + 40 * p.u);
          ctx.lineTo(x + 40 * p.u, y + 40 * p.u);
          ctx.lineTo(x + 70 * p.u, base + 30 * p.u);
          ctx.fill();
          ctx.strokeStyle = '#1a0409';
          ctx.lineWidth = 3 * p.u;
          for (let index = 0; index < 26; index++) {
            const angle = (p.rand() - 0.5) * 0.5;
            const length = (60 + p.rand() * 70) * p.u;
            const cy = y + 20 * p.u + (p.rand() - 0.5) * 34 * p.u;
            ctx.beginPath();
            ctx.moveTo(x - length * Math.cos(angle), cy - length * Math.sin(angle));
            ctx.lineTo(x + length * Math.cos(angle), cy + length * Math.sin(angle));
            ctx.stroke();
          }
        });
      },
      glow: (ctx, p) => {
        const base = p.height - 30 * p.u;
        tiled(p.width, (o) => {
          radialGlow(ctx, p.width * 0.7 + o - 14 * p.u, base - 136 * p.u, 10 * p.u, '#ff1e3d', 1);
          radialGlow(ctx, p.width * 0.7 + o + 14 * p.u, base - 136 * p.u, 10 * p.u, '#ff1e3d', 1);
        });
      },
      glowMode: 'pulse',
    },
    {
      id: 'mid',
      tileWidth: 1400,
      heightFraction: 0.3,
      bottomFraction: 0.78,
      speed: 0.017,
      minLayers: 1,
      paint: (ctx, p) => {
        const ground = p.height - 14 * p.u;
        ctx.fillStyle = '#070104';
        ctx.fillRect(0, ground, p.width, p.height - ground);
        for (let index = 0; index < 6; index++) {
          const x = p.rand() * p.width;
          tiled(p.width, (o) => deadTree(ctx, x + o, ground + 4 * p.u, (90 + p.rand() * 80) * p.u, p.rand, '#0d0206'));
        }
        ctx.strokeStyle = '#0a0104';
        ctx.lineWidth = 2 * p.u;
        for (let index = 0; index < 30; index++) {
          const x = p.rand() * p.width;
          tiled(p.width, (o) => {
            ctx.beginPath();
            ctx.moveTo(x + o, ground);
            ctx.lineTo(x + o + (p.rand() - 0.5) * 30 * p.u, ground - (14 + p.rand() * 30) * p.u);
            ctx.stroke();
          });
        }
      },
    },
    {
      id: 'near',
      tileWidth: 1000,
      heightFraction: 0.12,
      bottomFraction: 1,
      speed: 0.05,
      minLayers: 4,
      paint: (ctx, p) => grassTufts(ctx, p, '#030002'),
    },
  ],
};

const jackpot: ThemeSpec = {
  id: 'jackpot-alley',
  horizon: 0.72,
  ground: 'grid',
  gridColor: 0xffd447,
  horizonGlow: 0xff7a1f,
  ambient: 'coins',
  ambientColors: [0xffd447, 0xffffff],
  sky: (ctx, p) => {
    verticalGradient(ctx, 0, 0, p.w, p.horizon, [[0, '#12051e'], [0.5, '#2e0c34'], [0.85, '#6a2a1c'], [1, '#b2561c']]);
    drawStars(ctx, p.w, p.horizon * 0.5, Math.round((p.w * p.h) / 5000), p.rand, ['#ffe9a0', '#ffffff']);
    for (let index = 0; index < 5; index++) {
      const x = p.w * (0.1 + index * 0.2);
      const beam = ctx.createLinearGradient(x, p.horizon, x + (index - 2) * 80 * p.u, 0);
      beam.addColorStop(0, 'rgba(255, 212, 71, 0.22)');
      beam.addColorStop(1, 'rgba(255, 212, 71, 0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(x - 6 * p.u, p.horizon);
      ctx.lineTo(x + (index - 2) * 120 * p.u - 60 * p.u, 0);
      ctx.lineTo(x + (index - 2) * 120 * p.u + 60 * p.u, 0);
      ctx.lineTo(x + 6 * p.u, p.horizon);
      ctx.fill();
    }
    groundFill(ctx, p, '#1c0e06', '#070302', '#ffd447');
  },
  layers: [
    {
      id: 'far',
      tileWidth: 1600,
      heightFraction: 0.42,
      bottomFraction: 0.73,
      speed: 0.005,
      minLayers: 2,
      paint: (ctx, p) => {
        let x = 0;
        while (x < p.width) {
          const width = (80 + p.rand() * 90) * p.u;
          const height = (110 + p.rand() * 160) * p.u;
          ctx.fillStyle = p.rand() < 0.5 ? '#1a0a18' : '#140712';
          ctx.fillRect(x, p.height - height, width, height);
          ctx.fillStyle = '#0c040c';
          ctx.fillRect(x + width * 0.1, p.height - height - 12 * p.u, width * 0.8, 12 * p.u);
          windows(ctx, x + 6, p.height - height + 20 * p.u, width - 12, height - 40 * p.u, 12 * p.u, p.rand, '#ffc766', 0.22);
          x += width + 4 * p.u;
        }
      },
      glow: (ctx, p) => {
        const labels = ['777', 'JACKPOT', 'LUCKY', 'BAR', 'WIN'];
        labels.forEach((label, index) => {
          const x = ((index + 0.5) / labels.length) * p.width;
          neonText(ctx, label, x, p.height - (150 + (index % 2) * 60) * p.u, (index === 1 ? 34 : 24) * p.u, index % 2 ? '#ffd447' : '#ff7a1f');
        });
      },
      glowMode: 'flicker',
    },
    {
      id: 'mid',
      tileWidth: 1200,
      heightFraction: 0.24,
      bottomFraction: 0.78,
      speed: 0.016,
      minLayers: 1,
      paint: (ctx, p) => {
        const ground = p.height - 12 * p.u;
        ctx.fillStyle = '#0a0406';
        ctx.fillRect(0, ground, p.width, p.height - ground);
        const machines = 9;
        for (let index = 0; index < machines; index++) {
          const x = (index / machines) * p.width + 12 * p.u;
          const width = 64 * p.u;
          const height = 110 * p.u;
          const top = ground - height;
          ctx.fillStyle = '#1e0c10';
          ctx.fillRect(x, top, width, height);
          ctx.fillStyle = '#2c1016';
          ctx.fillRect(x + 6 * p.u, top + 8 * p.u, width - 12 * p.u, 20 * p.u);
          ctx.fillStyle = '#0c0408';
          ctx.fillRect(x + 8 * p.u, top + 36 * p.u, width - 16 * p.u, 30 * p.u);
          ctx.fillStyle = '#3a1a10';
          ctx.fillRect(x + width, top + 36 * p.u, 4 * p.u, 30 * p.u);
          ctx.beginPath();
          ctx.arc(x + width + 2 * p.u, top + 32 * p.u, 5 * p.u, 0, Math.PI * 2);
          ctx.fill();
        }
      },
      glow: (ctx, p) => {
        const ground = p.height - 12 * p.u;
        const machines = 9;
        for (let index = 0; index < machines; index++) {
          const x = (index / machines) * p.width + 12 * p.u;
          const top = ground - 110 * p.u;
          ctx.fillStyle = 'rgba(255, 220, 120, 0.9)';
          for (let reel = 0; reel < 3; reel++) {
            ctx.fillRect(x + (11 + reel * 15) * p.u, top + 40 * p.u, 12 * p.u, 22 * p.u);
          }
          radialGlow(ctx, x + 32 * p.u, top + 18 * p.u, 30 * p.u, index % 2 ? '#ff7a1f' : '#ffd447', 0.7);
        }
      },
      glowMode: 'chase',
    },
  ],
};

const cinder: ThemeSpec = {
  id: 'cinder-viaduct',
  horizon: 0.72,
  ground: 'grid',
  gridColor: 0xff8738,
  horizonGlow: 0xff8738,
  ambient: 'embers',
  ambientColors: [0xff8738, 0xffb35c, 0xff4a1a],
  events: ['train'],
  fog: { color: 0x6a2a1a, alpha: 0.24, y: 0.5, speed: 0.02 },
  celestial: { x: 0.18, y: 0.2, radius: 0.36, color: 0xffb35c, pulse: 0.05 },
  sky: (ctx, p) => {
    verticalGradient(ctx, 0, 0, p.w, p.horizon, [[0, '#0e0508'], [0.45, '#2a0c10'], [0.8, '#6a2410'], [1, '#a8441a']]);
    radialGlow(ctx, p.w * 0.18, p.h * 0.2, Math.min(p.w, p.h) * 0.3, '#ffb35c', 0.35);
    ctx.fillStyle = 'rgba(255, 210, 150, 0.9)';
    ctx.beginPath();
    ctx.arc(p.w * 0.18, p.h * 0.2, Math.min(p.w, p.h) * 0.07, 0, Math.PI * 2);
    ctx.fill();
    for (let band = 0; band < 3; band++) {
      drawCloudBand(ctx, p.w, p.h * (0.18 + band * 0.14), 44 * p.u, '#1a0808', p.rand, 12, 0.55);
    }
    groundFill(ctx, p, '#1a0806', '#060202', '#ff8738');
  },
  layers: [
    {
      id: 'far',
      tileWidth: 1500,
      heightFraction: 0.44,
      bottomFraction: 0.735,
      speed: 0.004,
      minLayers: 2,
      paint: (ctx, p) => {
        const base = p.height - 20 * p.u;
        let x = 0;
        while (x < p.width) {
          const width = (40 + p.rand() * 80) * p.u;
          const height = (40 + p.rand() * 90) * p.u;
          ctx.fillStyle = '#120608';
          ctx.fillRect(x, base - height, width, height + 20 * p.u);
          if (p.rand() < 0.45) {
            const stackX = x + width * 0.3;
            const stackHeight = height + (60 + p.rand() * 120) * p.u;
            ctx.fillRect(stackX, base - stackHeight, 12 * p.u, stackHeight);
            for (let puff = 0; puff < 6; puff++) {
              radialGlow(ctx, stackX + 6 * p.u + puff * 12 * p.u, base - stackHeight - puff * 18 * p.u, (16 + puff * 6) * p.u, '#2a1414', 0.7);
            }
          }
          x += width + p.rand() * 20 * p.u;
        }
      },
      glow: (ctx, p) => {
        for (let index = 0; index < 40; index++) {
          const x = p.rand() * p.width;
          const y = p.height - (30 + p.rand() * 100) * p.u;
          radialGlow(ctx, x, y, (3 + p.rand() * 5) * p.u, p.rand() < 0.5 ? '#ffb35c' : '#49e7ff', 1);
        }
      },
      glowMode: 'flicker',
    },
    {
      id: 'mid',
      tileWidth: 1200,
      heightFraction: 0.3,
      bottomFraction: 0.79,
      speed: 0.02,
      minLayers: 1,
      paint: (ctx, p) => {
        const deck = p.height - 120 * p.u;
        ctx.fillStyle = '#0c0405';
        ctx.fillRect(0, deck, p.width, 24 * p.u);
        const arches = 6;
        const span = p.width / arches;
        for (let index = 0; index < arches; index++) {
          const x = index * span;
          ctx.fillStyle = '#0c0405';
          ctx.fillRect(x, deck, 20 * p.u, p.height - deck);
          ctx.beginPath();
          ctx.moveTo(x + 20 * p.u, deck + 24 * p.u);
          ctx.quadraticCurveTo(x + span / 2 + 10 * p.u, deck + 110 * p.u, x + span, deck + 24 * p.u);
          ctx.lineTo(x + span, deck + 24 * p.u);
          ctx.lineTo(x + 20 * p.u, deck + 24 * p.u);
          ctx.fill();
        }
        ctx.strokeStyle = 'rgba(73, 231, 255, 0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, deck - 2 * p.u);
        ctx.lineTo(p.width, deck - 2 * p.u);
        ctx.stroke();
        ctx.fillStyle = '#0c0405';
        for (let x = 0; x < p.width; x += 18 * p.u) ctx.fillRect(x, deck - 8 * p.u, 3 * p.u, 8 * p.u);
      },
    },
  ],
};

const clocktower: ThemeSpec = {
  id: 'clocktower-apex',
  horizon: 0.72,
  ground: 'grid',
  gridColor: 0x5ee7ff,
  horizonGlow: 0xff3fb4,
  ambient: 'snow',
  ambientColors: [0xdff8ff, 0xffd6f0],
  events: ['clock'],
  sky: (ctx, p) => {
    verticalGradient(ctx, 0, 0, p.w, p.horizon, [[0, '#01040e'], [0.5, '#0a1036'], [0.85, '#2a1a64'], [1, '#4a2a7a']]);
    drawStars(ctx, p.w, p.horizon * 0.85, Math.round((p.w * p.h) / 2600), p.rand);
    for (let ribbon = 0; ribbon < 3; ribbon++) {
      const color = ribbon === 1 ? '#ff3fb4' : '#5ee7ff';
      for (let x = 0; x < p.w; x += 3) {
        const y = p.h * (0.12 + ribbon * 0.07) + Math.sin(x / (160 * p.u) + ribbon * 2) * 30 * p.u + Math.sin(x / (57 * p.u)) * 8 * p.u;
        const height = (60 + Math.sin(x / (90 * p.u) + ribbon) * 30) * p.u;
        const gradient = ctx.createLinearGradient(0, y, 0, y + height);
        gradient.addColorStop(0, withAlpha(color, 0));
        gradient.addColorStop(0.3, withAlpha(color, 0.12));
        gradient.addColorStop(1, withAlpha(color, 0));
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, 3, height);
      }
    }
    groundFill(ctx, p, '#0c0a24', '#030208', '#ff3fb4');
  },
  layers: [
    {
      id: 'far',
      tileWidth: 1500,
      heightFraction: 0.4,
      bottomFraction: 0.735,
      speed: 0.004,
      minLayers: 2,
      paint: (ctx, p) => {
        let x = 0;
        while (x < p.width) {
          const width = (36 + p.rand() * 60) * p.u;
          const height = (50 + p.rand() * 120) * p.u;
          ctx.fillStyle = p.rand() < 0.5 ? '#070a22' : '#0a0d2c';
          ctx.fillRect(x, p.height - height, width, height);
          ctx.beginPath();
          ctx.moveTo(x - 4 * p.u, p.height - height);
          ctx.lineTo(x + width / 2, p.height - height - (20 + p.rand() * 50) * p.u);
          ctx.lineTo(x + width + 4 * p.u, p.height - height);
          ctx.fill();
          windows(ctx, x + 4, p.height - height + 10 * p.u, width - 8, height - 20 * p.u, 10 * p.u, p.rand, '#9fdcff', 0.18);
          x += width + p.rand() * 10 * p.u;
        }
      },
    },
    {
      id: 'mid',
      tileWidth: 1400,
      heightFraction: 0.2,
      bottomFraction: 0.78,
      speed: 0.018,
      minLayers: 1,
      paint: (ctx, p) => {
        const ground = p.height - 12 * p.u;
        ctx.fillStyle = '#04050f';
        ctx.fillRect(0, ground - 30 * p.u, p.width, p.height);
        for (let index = 0; index < 6; index++) {
          const x = (index / 6) * p.width + 40 * p.u;
          ctx.fillStyle = '#04050f';
          ctx.beginPath();
          ctx.moveTo(x, ground - 30 * p.u);
          ctx.lineTo(x + 14 * p.u, ground - 64 * p.u);
          ctx.lineTo(x + 26 * p.u, ground - 58 * p.u);
          ctx.lineTo(x + 36 * p.u, ground - 72 * p.u);
          ctx.lineTo(x + 44 * p.u, ground - 50 * p.u);
          ctx.lineTo(x + 50 * p.u, ground - 30 * p.u);
          ctx.fill();
        }
        ctx.strokeStyle = 'rgba(94, 231, 255, 0.3)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, ground - 30 * p.u);
        ctx.lineTo(p.width, ground - 30 * p.u);
        ctx.stroke();
      },
    },
  ],
};

const attract: ThemeSpec = {
  id: 'attract',
  horizon: 0.74,
  ground: 'grid',
  gridColor: 0xff3fb4,
  horizonGlow: 0xff3fb4,
  ambient: 'motes',
  ambientColors: [0x20f2ff, 0xff3fb4, 0xffe56a],
  celestial: { x: 0.5, y: 0.66, radius: 0.42, color: 0xff6a3d, pulse: 0.1 },
  sky: (ctx, p) => {
    verticalGradient(ctx, 0, 0, p.w, p.horizon, [[0, '#05030c'], [0.4, '#1a0a38'], [0.75, '#4a0f5a'], [1, '#a0205f']]);
    drawStars(ctx, p.w, p.horizon * 0.7, Math.round((p.w * p.h) / 2600), p.rand);
    const sunX = p.w * 0.5;
    const sunY = p.horizon - Math.min(p.w, p.h) * 0.06;
    const radius = Math.min(p.w, p.h) * 0.17;
    radialGlow(ctx, sunX, sunY, radius * 2.4, '#ff3fb4', 0.3);
    ctx.save();
    ctx.beginPath();
    ctx.arc(sunX, sunY, radius, 0, Math.PI * 2);
    ctx.clip();
    verticalGradient(ctx, sunX - radius, sunY - radius, radius * 2, sunY + radius, [[0, '#ffe56a'], [0.5, '#ff8a32'], [1, '#ff2f7f']]);
    ctx.globalCompositeOperation = 'destination-out';
    for (let index = 0; index < 8; index++) {
      const t = index / 8;
      const y = sunY + radius * (0.05 + t * 0.95);
      ctx.fillRect(sunX - radius, y, radius * 2, 1.5 + t * radius * 0.08);
    }
    ctx.restore();
    groundFill(ctx, p, '#1a0624', '#05020a', '#ff3fb4');
  },
  layers: [
    {
      id: 'far',
      tileWidth: 1600,
      heightFraction: 0.3,
      bottomFraction: 0.745,
      speed: 0.006,
      minLayers: 2,
      paint: (ctx, p) => {
        const waves: Array<[number, number, number]> = [[1, 30 * p.u, 0.3], [3, 30 * p.u, 1.4], [7, 10 * p.u, 2.4]];
        const gradient = ctx.createLinearGradient(0, p.height - 120 * p.u, 0, p.height);
        gradient.addColorStop(0, '#2a0a3e');
        gradient.addColorStop(1, '#0a0314');
        ridge(ctx, p.width, p.height, p.height - 60 * p.u, waves, gradient);
        rimLine(ctx, p.width, p.height - 60 * p.u, waves, 'rgba(32, 242, 255, 0.7)', 2);
      },
    },
  ],
};

export const THEMES: Record<string, ThemeSpec> = {
  'graveyard-dusk': graveyard,
  'neon-boardwalk': boardwalk,
  'storm-tower': storm,
  'junkyard-moon': junkyard,
  'carnival-night': carnival,
  'raven-kings-nest': nest,
  'jackpot-alley': jackpot,
  'cinder-viaduct': cinder,
  'clocktower-apex': clocktower,
  attract,
};

export function getTheme(stageId: string): ThemeSpec {
  const baseId = stageId.replace(/-\d+$/, '');
  return THEMES[baseId] ?? graveyard;
}

// ---------------------------------------------------------- landmarks

export function paintFerrisWheel(ctx: Ctx, radius: number, lit: boolean): void {
  const center = radius + 8;
  const spokes = 16;
  ctx.lineCap = 'round';
  if (!lit) {
    ctx.strokeStyle = '#1c0a22';
    ctx.lineWidth = radius * 0.035;
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = radius * 0.02;
    ctx.beginPath();
    ctx.arc(center, center, radius * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    for (let index = 0; index < spokes; index++) {
      const angle = (Math.PI * 2 * index) / spokes;
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.lineTo(center + Math.cos(angle) * radius, center + Math.sin(angle) * radius);
      ctx.stroke();
      ctx.fillStyle = '#240c2a';
      ctx.fillRect(center + Math.cos(angle) * radius - radius * 0.05, center + Math.sin(angle) * radius, radius * 0.1, radius * 0.08);
    }
    ctx.fillStyle = '#2a0f30';
    ctx.beginPath();
    ctx.arc(center, center, radius * 0.08, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const colors = ['#ff2f7f', '#ffdf4d', '#2cffc8'];
  for (let index = 0; index < spokes * 2; index++) {
    const angle = (Math.PI * index) / spokes;
    const x = center + Math.cos(angle) * radius;
    const y = center + Math.sin(angle) * radius;
    radialGlow(ctx, x, y, radius * 0.07, colors[index % 3], 0.9);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.012 + 1, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let index = 0; index < spokes; index++) {
    const angle = (Math.PI * 2 * index) / spokes;
    const x = center + Math.cos(angle) * radius * 0.72;
    const y = center + Math.sin(angle) * radius * 0.72;
    radialGlow(ctx, x, y, radius * 0.05, colors[(index + 1) % 3], 0.7);
  }
}

export function paintWheelStand(ctx: Ctx, radius: number, height: number): void {
  ctx.strokeStyle = '#1a0820';
  ctx.lineWidth = radius * 0.05;
  ctx.beginPath();
  ctx.moveTo(radius, radius * 0.1);
  ctx.lineTo(radius * 0.45, height);
  ctx.moveTo(radius, radius * 0.1);
  ctx.lineTo(radius * 1.55, height);
  ctx.stroke();
}

export function paintClockTower(ctx: Ctx, width: number, height: number, faceRadius: number): void {
  const center = width / 2;
  const body = ctx.createLinearGradient(0, 0, width, 0);
  body.addColorStop(0, '#0a0c24');
  body.addColorStop(0.5, '#141a3e');
  body.addColorStop(1, '#070818');
  ctx.fillStyle = body;
  ctx.fillRect(center - width * 0.3, height * 0.28, width * 0.6, height * 0.72);
  ctx.fillRect(center - width * 0.36, height * 0.24, width * 0.72, height * 0.06);
  ctx.beginPath();
  ctx.moveTo(center - width * 0.34, height * 0.25);
  ctx.lineTo(center, 0);
  ctx.lineTo(center + width * 0.34, height * 0.25);
  ctx.fill();
  ctx.strokeStyle = 'rgba(94, 231, 255, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(center - width * 0.34, height * 0.25);
  ctx.lineTo(center, 0);
  ctx.lineTo(center + width * 0.34, height * 0.25);
  ctx.stroke();
  const faceY = height * 0.38;
  radialGlow(ctx, center, faceY, faceRadius * 2.2, '#5ee7ff', 0.4);
  const face = ctx.createRadialGradient(center, faceY, 0, center, faceY, faceRadius);
  face.addColorStop(0, '#f4fbff');
  face.addColorStop(0.8, '#b8ecff');
  face.addColorStop(1, '#5ee7ff');
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(center, faceY, faceRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0a0c24';
  ctx.lineWidth = faceRadius * 0.08;
  ctx.stroke();
  for (let index = 0; index < 12; index++) {
    const angle = (Math.PI * 2 * index) / 12;
    ctx.lineWidth = index % 3 === 0 ? faceRadius * 0.08 : faceRadius * 0.04;
    ctx.beginPath();
    ctx.moveTo(center + Math.cos(angle) * faceRadius * 0.78, faceY + Math.sin(angle) * faceRadius * 0.78);
    ctx.lineTo(center + Math.cos(angle) * faceRadius * 0.92, faceY + Math.sin(angle) * faceRadius * 0.92);
    ctx.stroke();
  }
  for (let row = 0; row < 5; row++) {
    for (let side = -1; side <= 1; side += 2) {
      const x = center + side * width * 0.15;
      const y = height * (0.56 + row * 0.08);
      ctx.fillStyle = row % 2 ? 'rgba(255, 63, 180, 0.55)' : 'rgba(159, 220, 255, 0.5)';
      ctx.fillRect(x - width * 0.04, y, width * 0.08, height * 0.04);
    }
  }
}

export function paintStormTower(ctx: Ctx, width: number, height: number): void {
  const center = width / 2;
  ctx.strokeStyle = '#08121a';
  ctx.lineWidth = Math.max(2, width * 0.04);
  ctx.beginPath();
  ctx.moveTo(center - width * 0.4, height);
  ctx.lineTo(center, 0);
  ctx.lineTo(center + width * 0.4, height);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, width * 0.018);
  for (let index = 1; index < 12; index++) {
    const t = index / 12;
    const half = width * 0.4 * t;
    const y = height * t;
    ctx.beginPath();
    ctx.moveTo(center - half, y);
    ctx.lineTo(center + half, y);
    ctx.lineTo(center - half * 0.9, y + height / 12);
    ctx.stroke();
  }
  ctx.fillStyle = '#0a141c';
  ctx.beginPath();
  ctx.arc(center, height * 0.04, width * 0.08, 0, Math.PI * 2);
  ctx.fill();
}
