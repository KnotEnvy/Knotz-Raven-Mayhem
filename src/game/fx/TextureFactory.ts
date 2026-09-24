import Phaser from 'phaser';
import { SPRITE_KEYS } from '../data/assets';
import { ENEMIES } from '../data/enemies';
import type { EnemyId } from '../types';
import type { QualityProfile } from '../systems/Quality';

// Everything in this module is painted once at boot with Canvas 2D and then
// uploaded as a regular texture, so the runtime cost is a normal sprite draw.
// The seed raven sheet is a flat black silhouette, which made every enemy
// variant look identical on a night sky; baking lit, colored variants with
// their own accessories is what gives each raven a readable identity.

export const FX = {
  glow: 'fx-glow',
  dot: 'fx-dot',
  streak: 'fx-streak',
  ring: 'fx-ring',
  feather: 'fx-feather',
  smoke: 'fx-smoke',
  shard: 'fx-shard',
  coin: 'fx-coin',
  star: 'fx-star',
  hex: 'fx-hex',
  flare: 'fx-flare',
  vignette: 'fx-vignette',
  fog: 'fx-fog',
  rain: 'fx-rain',
} as const;

const SOURCE_FRAME_WIDTH = 271;
const SOURCE_FRAME_HEIGHT = 194;
const SOURCE_FRAME_COUNT = 6;
const EYE_X = 94;
const EYE_Y = 91;
const RAVEN_PAD = 30;
const SHEET_COLUMNS = 3;

type Rgb = [number, number, number];

interface RavenStyle {
  body: Rgb;
  sheen: Rgb;
  rim: Rgb;
  wingDark: Rgb;
  wingLight: Rgb;
  iris: string;
  sclera: string;
  glow: string;
  glowBlur: number;
  opacity?: number;
  eyeAura?: string;
  accessory?: (ctx: CanvasRenderingContext2D, frame: number) => void;
}

const RAVEN_STYLES: Record<EnemyId, RavenStyle> = {
  normal: {
    body: [16, 12, 30],
    sheen: [70, 54, 122],
    rim: [196, 176, 255],
    wingDark: [26, 20, 48],
    wingLight: [104, 86, 168],
    iris: '#ffc933',
    sclera: '#f6f2ff',
    glow: 'rgba(160, 130, 255, 0.55)',
    glowBlur: 12,
  },
  fast: {
    body: [4, 26, 40],
    sheen: [18, 128, 168],
    rim: [150, 250, 255],
    wingDark: [6, 44, 64],
    wingLight: [40, 196, 232],
    iris: '#e9ffff',
    sclera: '#ffffff',
    glow: 'rgba(56, 232, 255, 0.75)',
    glowBlur: 16,
    accessory: drawSpeedStripes,
  },
  golden: {
    body: [110, 66, 0],
    sheen: [255, 184, 28],
    rim: [255, 242, 176],
    wingDark: [150, 92, 0],
    wingLight: [255, 214, 90],
    iris: '#ff6a00',
    sclera: '#fffbe6',
    glow: 'rgba(255, 212, 71, 0.9)',
    glowBlur: 22,
    accessory: drawGoldenShine,
  },
  armored: {
    body: [30, 34, 44],
    sheen: [110, 122, 142],
    rim: [236, 244, 255],
    wingDark: [44, 50, 62],
    wingLight: [150, 162, 182],
    iris: '#ff3b3b',
    sclera: '#fff0f0',
    glow: 'rgba(216, 226, 239, 0.55)',
    glowBlur: 10,
    accessory: drawArmorPlates,
  },
  mini: {
    body: [38, 8, 56],
    sheen: [168, 64, 220],
    rim: [246, 196, 255],
    wingDark: [60, 14, 86],
    wingLight: [214, 110, 255],
    iris: '#ff7ad9',
    sclera: '#ffffff',
    glow: 'rgba(207, 92, 255, 0.8)',
    glowBlur: 16,
  },
  shield: {
    body: [4, 38, 22],
    sheen: [30, 160, 92],
    rim: [178, 255, 214],
    wingDark: [8, 58, 34],
    wingLight: [70, 222, 140],
    iris: '#aaffcf',
    sclera: '#f2fff7',
    glow: 'rgba(88, 255, 156, 0.65)',
    glowBlur: 14,
    accessory: drawShieldGem,
  },
  splitter: {
    body: [48, 14, 6],
    sheen: [196, 72, 36],
    rim: [255, 196, 168],
    wingDark: [72, 22, 10],
    wingLight: [255, 120, 70],
    iris: '#ffe14b',
    sclera: '#fff4ec',
    glow: 'rgba(255, 106, 61, 0.75)',
    glowBlur: 14,
    accessory: drawSplitSeam,
  },
  dive: {
    body: [50, 6, 30],
    sheen: [200, 40, 120],
    rim: [255, 186, 222],
    wingDark: [80, 10, 46],
    wingLight: [255, 90, 170],
    iris: '#ffffff',
    sclera: '#ffe6f3',
    glow: 'rgba(255, 63, 159, 0.75)',
    glowBlur: 14,
    eyeAura: 'rgba(255, 120, 200, 0.55)',
    accessory: drawDiveBeak,
  },
  wraith: {
    body: [30, 18, 56],
    sheen: [140, 108, 220],
    rim: [236, 226, 255],
    wingDark: [48, 30, 88],
    wingLight: [190, 160, 255],
    iris: '#e8ddff',
    sclera: '#ffffff',
    glow: 'rgba(181, 140, 255, 0.9)',
    glowBlur: 26,
    opacity: 0.82,
    eyeAura: 'rgba(214, 196, 255, 0.7)',
    accessory: drawWraithWisps,
  },
  brute: {
    body: [52, 30, 8],
    sheen: [190, 118, 40],
    rim: [255, 224, 184],
    wingDark: [80, 46, 12],
    wingLight: [255, 170, 80],
    iris: '#ff2d2d',
    sclera: '#fff1dc',
    glow: 'rgba(255, 179, 92, 0.7)',
    glowBlur: 14,
    accessory: drawBruteHorns,
  },
  boss: {
    body: [40, 0, 14],
    sheen: [178, 18, 58],
    rim: [255, 170, 190],
    wingDark: [64, 0, 22],
    wingLight: [255, 60, 100],
    iris: '#ffe14b',
    sclera: '#ffe9ec',
    glow: 'rgba(255, 33, 79, 0.9)',
    glowBlur: 28,
    eyeAura: 'rgba(255, 210, 60, 0.75)',
    accessory: drawBossCrown,
  },
};

const bakeScales = new Map<EnemyId, number>();

// Small PNG portraits of each baked variant for the DOM bounty board, so the
// attract-mode guide shows the same lit art as gameplay.
export const ravenPortraits: Partial<Record<EnemyId, string>> = {};

export function ravenTextureKey(id: EnemyId): string {
  return `raven-${id}`;
}

export function ravenAnimKey(id: EnemyId): string {
  return `flap-${id}`;
}

// Scale between the baked texture and the seed-sheet coordinate space that
// gameplay code (radius, def.scale) is written against.
export function ravenBakeScale(id: EnemyId): number {
  return bakeScales.get(id) ?? 1;
}

export function bakeAllTextures(scene: Phaser.Scene, quality: QualityProfile): void {
  bakeFxTextures(scene);
  bakeRavenVariants(scene, quality);
}

export function bakeRavenVariants(scene: Phaser.Scene, quality: QualityProfile): void {
  const source = scene.textures.get(SPRITE_KEYS.raven).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const frameCanvas = createCanvas(SOURCE_FRAME_WIDTH, SOURCE_FRAME_HEIGHT);
  const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true });
  if (!frameCtx) return;

  for (const id of Object.keys(RAVEN_STYLES) as EnemyId[]) {
    const style = RAVEN_STYLES[id];
    const def = ENEMIES[id];
    const bake = Phaser.Math.Clamp(def.scale * 1.2, 0.42, 1.45) * quality.spriteBakeScale;
    bakeScales.set(id, bake);

    const cellWidth = Math.ceil((SOURCE_FRAME_WIDTH + RAVEN_PAD * 2) * bake);
    const cellHeight = Math.ceil((SOURCE_FRAME_HEIGHT + RAVEN_PAD * 2) * bake);
    const rows = Math.ceil(SOURCE_FRAME_COUNT / SHEET_COLUMNS);
    const sheet = createCanvas(cellWidth * SHEET_COLUMNS, cellHeight * rows);
    const sheetCtx = sheet.getContext('2d');
    if (!sheetCtx) continue;

    for (let frame = 0; frame < SOURCE_FRAME_COUNT; frame++) {
      paintRavenFrame(frameCtx, source, frame, style);
      const column = frame % SHEET_COLUMNS;
      const row = Math.floor(frame / SHEET_COLUMNS);

      sheetCtx.save();
      sheetCtx.translate(column * cellWidth, row * cellHeight);
      sheetCtx.scale(bake, bake);
      sheetCtx.globalAlpha = style.opacity ?? 1;
      sheetCtx.shadowColor = style.glow;
      sheetCtx.shadowBlur = style.glowBlur * bake;
      sheetCtx.drawImage(frameCanvas, RAVEN_PAD, RAVEN_PAD);
      sheetCtx.shadowBlur = 0;
      sheetCtx.drawImage(frameCanvas, RAVEN_PAD, RAVEN_PAD);
      sheetCtx.restore();
    }

    ravenPortraits[id] = makePortrait(sheet, cellWidth, cellHeight, bake);

    const key = ravenTextureKey(id);
    const texture = replaceCanvasTexture(scene, key, sheet);
    for (let frame = 0; frame < SOURCE_FRAME_COUNT; frame++) {
      const column = frame % SHEET_COLUMNS;
      const row = Math.floor(frame / SHEET_COLUMNS);
      texture.add(frame, 0, column * cellWidth, row * cellHeight, cellWidth, cellHeight);
    }

    const animKey = ravenAnimKey(id);
    if (scene.anims.exists(animKey)) scene.anims.remove(animKey);
    scene.anims.create({
      key: animKey,
      frames: [0, 1, 2, 3, 4, 5].map((frame) => ({ key, frame })),
      frameRate: id === 'fast' || id === 'mini' || id === 'dive' ? 16 : id === 'brute' || id === 'boss' ? 9 : 12,
      repeat: -1,
    });
  }
}

function makePortrait(sheet: HTMLCanvasElement, cellWidth: number, cellHeight: number, bake: number): string {
  const inset = (RAVEN_PAD - 10) * bake;
  const width = 128;
  const height = Math.round((width * (cellHeight - inset * 2)) / (cellWidth - inset * 2));
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(sheet, inset, inset, cellWidth - inset * 2, cellHeight - inset * 2, 0, 0, width, height);
  try {
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

function paintRavenFrame(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  frame: number,
  style: RavenStyle,
): void {
  const width = SOURCE_FRAME_WIDTH;
  const height = SOURCE_FRAME_HEIGHT;
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(source, frame * width, 0, width, height, 0, 0, width, height);

  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const alphaAt = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : data[(y * width + x) * 4 + 3]);
  const alpha = new Uint8ClampedArray(width * height);
  for (let index = 0; index < alpha.length; index++) alpha[index] = data[index * 4 + 3];
  const maskAt = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : alpha[y * width + x]);

  for (let y = 0; y < height; y++) {
    const light = Phaser.Math.Clamp(1 - (y - 34) / 132, 0, 1);
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      if (data[offset + 3] === 0) continue;

      const lum = data[offset] / 255;
      const eyeDistance = Math.hypot(x - EYE_X, y - EYE_Y);
      const grain = hashNoise(x, y) * 0.07 - 0.035;
      let color: Rgb;

      if (lum > 0.1 && eyeDistance > 22) {
        const t = Phaser.Math.Clamp((lum - 0.1) / 0.6, 0, 1);
        color = mix(style.wingDark, style.wingLight, t * 0.85 + light * 0.15);
      } else {
        color = mix(style.body, style.sheen, light * 0.62);
      }

      const topEdge = maskAt(x, y - 3) < 70 || maskAt(x, y - 2) < 40;
      const backEdge = maskAt(x + 3, y) < 70;
      const bellyEdge = maskAt(x, y + 3) < 70;
      if (topEdge) color = mix(color, style.rim, 0.82);
      else if (backEdge) color = mix(color, style.rim, 0.5);
      else if (bellyEdge) color = mix(color, style.sheen, 0.45);

      data[offset] = clampByte(color[0] * (1 + grain));
      data[offset + 1] = clampByte(color[1] * (1 + grain));
      data[offset + 2] = clampByte(color[2] * (1 + grain));
      // Keep the silhouette alpha untouched so gameplay hit radii still match.
      data[offset + 3] = alphaAt(x, y);
    }
  }

  ctx.putImageData(image, 0, 0);
  paintRavenEye(ctx, style);
  style.accessory?.(ctx, frame);
}

function paintRavenEye(ctx: CanvasRenderingContext2D, style: RavenStyle): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';

  if (style.eyeAura) {
    const aura = ctx.createRadialGradient(EYE_X, EYE_Y, 4, EYE_X, EYE_Y, 30);
    aura.addColorStop(0, style.eyeAura);
    aura.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = aura;
    ctx.fillRect(EYE_X - 32, EYE_Y - 32, 64, 64);
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.fillStyle = rgb(style.body);
  ctx.beginPath();
  ctx.arc(EYE_X, EYE_Y, 16, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = style.sclera;
  ctx.beginPath();
  ctx.arc(EYE_X, EYE_Y, 12.5, 0, Math.PI * 2);
  ctx.fill();

  const iris = ctx.createRadialGradient(EYE_X - 3, EYE_Y - 1, 1, EYE_X - 3, EYE_Y, 8.5);
  iris.addColorStop(0, '#ffffff');
  iris.addColorStop(0.35, style.iris);
  iris.addColorStop(1, shade(style.iris, 0.45));
  ctx.fillStyle = iris;
  ctx.beginPath();
  ctx.arc(EYE_X - 3, EYE_Y, 8.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#05030a';
  ctx.beginPath();
  ctx.ellipse(EYE_X - 4, EYE_Y, 2.8, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.arc(EYE_X - 7, EYE_Y - 4, 2.2, 0, Math.PI * 2);
  ctx.fill();

  // Angled brow gives every raven an attitude instead of a blank stare.
  ctx.fillStyle = rgb(mix(style.body, [0, 0, 0], 0.35));
  ctx.beginPath();
  ctx.moveTo(EYE_X - 20, EYE_Y - 16);
  ctx.lineTo(EYE_X + 18, EYE_Y - 9);
  ctx.lineTo(EYE_X + 16, EYE_Y - 3);
  ctx.lineTo(EYE_X - 18, EYE_Y - 9);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgb(style.rim);
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(EYE_X - 20, EYE_Y - 16);
  ctx.lineTo(EYE_X + 18, EYE_Y - 9);
  ctx.stroke();
  ctx.restore();
}

function drawSpeedStripes(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(150, 250, 255, 0.85)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(118, 104);
  ctx.lineTo(236, 86);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(126, 118);
  ctx.lineTo(240, 102);
  ctx.stroke();
  ctx.restore();
}

function drawGoldenShine(ctx: CanvasRenderingContext2D, frame: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const offset = frame * 14;
  const band = ctx.createLinearGradient(80 + offset, 40, 150 + offset, 160);
  band.addColorStop(0, 'rgba(255,255,255,0)');
  band.addColorStop(0.45, 'rgba(255,250,220,0.42)');
  band.addColorStop(0.55, 'rgba(255,250,220,0.42)');
  band.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, SOURCE_FRAME_WIDTH, SOURCE_FRAME_HEIGHT);
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  drawSparkle(ctx, 176, 52, 9, 'rgba(255, 250, 210, 0.95)');
  drawSparkle(ctx, 238, 122, 6, 'rgba(255, 240, 170, 0.9)');
  ctx.restore();
}

function drawArmorPlates(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const helmet = ctx.createLinearGradient(60, 44, 60, 84);
  helmet.addColorStop(0, '#f4f8ff');
  helmet.addColorStop(0.45, '#9aa6ba');
  helmet.addColorStop(1, '#3b4250');
  ctx.fillStyle = helmet;
  ctx.beginPath();
  ctx.ellipse(98, 66, 44, 22, -0.08, Math.PI, Math.PI * 2);
  ctx.lineTo(142, 72);
  ctx.lineTo(56, 74);
  ctx.closePath();
  ctx.fill();

  const plate = ctx.createLinearGradient(120, 88, 120, 150);
  plate.addColorStop(0, '#d8e2ef');
  plate.addColorStop(0.5, '#7c889c');
  plate.addColorStop(1, '#2c323d');
  ctx.fillStyle = plate;
  ctx.fillRect(122, 96, 88, 52);
  ctx.strokeStyle = 'rgba(20, 24, 32, 0.8)';
  ctx.lineWidth = 3;
  for (let x = 146; x < 210; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 96);
    ctx.lineTo(x - 6, 150);
    ctx.stroke();
  }
  ctx.fillStyle = '#ffffff';
  for (const [x, y] of [[70, 70], [98, 58], [126, 64], [132, 104], [196, 104]] as const) {
    ctx.beginPath();
    ctx.arc(x, y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  paintRavenEyeSlit(ctx);
}

function paintRavenEyeSlit(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(40, 46, 58, 0.9)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(EYE_X - 17, EYE_Y - 12);
  ctx.lineTo(EYE_X + 17, EYE_Y - 7);
  ctx.stroke();
  ctx.restore();
}

function drawShieldGem(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.strokeStyle = 'rgba(178, 255, 214, 0.55)';
  ctx.lineWidth = 2;
  for (let index = 0; index < 4; index++) {
    drawHexPath(ctx, 150 + index * 22, 112 + (index % 2) * 12, 11);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.shadowColor = 'rgba(88, 255, 156, 1)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#a8ffcf';
  drawHexPath(ctx, 104, 64, 7);
  ctx.fill();
  ctx.restore();
}

function drawSplitSeam(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.shadowColor = 'rgba(255, 170, 60, 1)';
  ctx.shadowBlur = 12;
  ctx.strokeStyle = '#ffe14b';
  ctx.lineWidth = 3.5;
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  ctx.moveTo(150, 44);
  ctx.lineTo(142, 70);
  ctx.lineTo(156, 88);
  ctx.lineTo(144, 108);
  ctx.lineTo(158, 128);
  ctx.lineTo(150, 160);
  ctx.stroke();
  ctx.restore();
}

function drawDiveBeak(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const beak = ctx.createLinearGradient(0, 0, 64, 0);
  beak.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  beak.addColorStop(0.35, 'rgba(255, 110, 190, 0.85)');
  beak.addColorStop(1, 'rgba(255, 63, 159, 0)');
  ctx.fillStyle = beak;
  ctx.fillRect(0, 88, 66, 40);
  ctx.restore();
}

function drawWraithWisps(ctx: CanvasRenderingContext2D, frame: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  for (let index = 0; index < 3; index++) {
    const y = 70 + index * 30 + Math.sin(frame + index) * 6;
    const wisp = ctx.createLinearGradient(170, y, 271, y);
    wisp.addColorStop(0, 'rgba(181, 140, 255, 0.55)');
    wisp.addColorStop(1, 'rgba(181, 140, 255, 0)');
    ctx.fillStyle = wisp;
    ctx.beginPath();
    ctx.moveTo(170, y - 10);
    ctx.bezierCurveTo(210, y - 26, 240, y + 12, 271, y - 4);
    ctx.lineTo(271, y + 6);
    ctx.bezierCurveTo(236, y + 22, 206, y - 4, 170, y + 12);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawBruteHorns(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  const horn = ctx.createLinearGradient(0, 14, 0, 70);
  horn.addColorStop(0, '#fff3dc');
  horn.addColorStop(1, '#8a5a24');
  ctx.fillStyle = horn;
  ctx.strokeStyle = '#2a1604';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(70, 66);
  ctx.quadraticCurveTo(46, 44, 60, 14);
  ctx.quadraticCurveTo(66, 42, 86, 60);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(108, 60);
  ctx.quadraticCurveTo(116, 30, 138, 16);
  ctx.quadraticCurveTo(128, 42, 124, 66);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.strokeStyle = 'rgba(255, 224, 184, 0.7)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(84, 72);
  ctx.lineTo(108, 110);
  ctx.moveTo(92, 70);
  ctx.lineTo(112, 102);
  ctx.stroke();
  ctx.restore();
}

function drawBossCrown(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  const base = 64;
  const left = 58;
  const right = 134;
  const gold = ctx.createLinearGradient(0, 12, 0, base);
  gold.addColorStop(0, '#fff6b0');
  gold.addColorStop(0.5, '#ffc933');
  gold.addColorStop(1, '#b36b00');
  ctx.shadowColor = 'rgba(255, 200, 60, 0.9)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = gold;
  ctx.strokeStyle = '#3b1a00';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(left, base);
  ctx.lineTo(left - 4, 26);
  ctx.lineTo(left + 14, 44);
  ctx.lineTo(left + 22, 12);
  ctx.lineTo(left + 38, 40);
  ctx.lineTo(left + 54, 10);
  ctx.lineTo(left + 62, 42);
  ctx.lineTo(right + 4, 22);
  ctx.lineTo(right, base);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.stroke();
  ctx.fillStyle = '#b36b00';
  ctx.fillRect(left, base - 10, right - left, 10);
  for (const [x, y, color] of [[left + 22, 22, '#20f2ff'], [left + 54, 20, '#ff214f'], [left + 40, 56, '#9dff57'], [left + 14, 56, '#ff214f'], [left + 66, 56, '#20f2ff']] as const) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(x - 1.2, y - 1.2, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function bakeFxTextures(scene: Phaser.Scene): void {
  // Soft radial glow: the workhorse for flashes, halos and neon lights.
  replaceCanvasTexture(scene, FX.glow, paint(128, 128, (ctx) => {
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.18, 'rgba(255,255,255,0.72)');
    gradient.addColorStop(0.45, 'rgba(255,255,255,0.22)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  }));

  replaceCanvasTexture(scene, FX.dot, paint(32, 32, (ctx) => {
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.95)');
    gradient.addColorStop(0.65, 'rgba(255,255,255,0.35)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
  }));

  // Spark streak: bright head on the right, fading tail to the left so it can
  // be rotated to match the particle's travel direction.
  replaceCanvasTexture(scene, FX.streak, paint(64, 12, (ctx) => {
    const tail = ctx.createLinearGradient(0, 0, 64, 0);
    tail.addColorStop(0, 'rgba(255,255,255,0)');
    tail.addColorStop(0.7, 'rgba(255,255,255,0.7)');
    tail.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = tail;
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.quadraticCurveTo(40, 1, 58, 2);
    ctx.arc(58, 6, 4, -Math.PI / 2, Math.PI / 2);
    ctx.quadraticCurveTo(40, 11, 0, 6);
    ctx.fill();
  }));

  replaceCanvasTexture(scene, FX.ring, paint(128, 128, (ctx) => {
    for (let index = 0; index < 4; index++) {
      ctx.strokeStyle = `rgba(255,255,255,${[0.12, 0.3, 1, 0.3][index]})`;
      ctx.lineWidth = [10, 6, 2.5, 6][index];
      ctx.beginPath();
      ctx.arc(64, 64, 56 - (index === 3 ? 4 : 0), 0, Math.PI * 2);
      ctx.stroke();
    }
  }));

  replaceCanvasTexture(scene, FX.feather, paint(44, 16, (ctx) => {
    const vane = ctx.createLinearGradient(0, 0, 44, 0);
    vane.addColorStop(0, 'rgba(255,255,255,0.35)');
    vane.addColorStop(0.5, 'rgba(255,255,255,0.95)');
    vane.addColorStop(1, 'rgba(255,255,255,0.8)');
    ctx.fillStyle = vane;
    ctx.beginPath();
    ctx.moveTo(2, 8);
    ctx.quadraticCurveTo(18, -1, 42, 6);
    ctx.quadraticCurveTo(44, 8, 42, 10);
    ctx.quadraticCurveTo(18, 17, 2, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,40,60,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.lineTo(43, 8);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(60,60,90,0.25)';
    for (let x = 8; x < 40; x += 5) {
      ctx.beginPath();
      ctx.moveTo(x, 8);
      ctx.lineTo(x + 4, 3);
      ctx.moveTo(x, 8);
      ctx.lineTo(x + 4, 13);
      ctx.stroke();
    }
  }));

  replaceCanvasTexture(scene, FX.smoke, paint(96, 96, (ctx) => {
    const random = seededRandom(7);
    for (let index = 0; index < 9; index++) {
      const x = 48 + (random() - 0.5) * 34;
      const y = 48 + (random() - 0.5) * 34;
      const radius = 18 + random() * 16;
      const puff = ctx.createRadialGradient(x, y, 0, x, y, radius);
      puff.addColorStop(0, 'rgba(255,255,255,0.34)');
      puff.addColorStop(0.6, 'rgba(255,255,255,0.14)');
      puff.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = puff;
      ctx.fillRect(0, 0, 96, 96);
    }
  }));

  replaceCanvasTexture(scene, FX.shard, paint(20, 20, (ctx) => {
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.moveTo(2, 18);
    ctx.lineTo(10, 2);
    ctx.lineTo(18, 14);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,130,150,0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }));

  replaceCanvasTexture(scene, FX.coin, paint(32, 32, (ctx) => {
    const face = ctx.createRadialGradient(12, 10, 2, 16, 16, 15);
    face.addColorStop(0, '#fffbd0');
    face.addColorStop(0.5, '#ffd447');
    face.addColorStop(1, '#b37400');
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.arc(16, 16, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7a4a00';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 250, 210, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(16, 16, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#7a4a00';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('K', 16, 17);
  }));

  replaceCanvasTexture(scene, FX.star, paint(48, 48, (ctx) => {
    ctx.globalCompositeOperation = 'lighter';
    drawSparkle(ctx, 24, 24, 22, 'rgba(255,255,255,1)');
    const core = ctx.createRadialGradient(24, 24, 0, 24, 24, 10);
    core.addColorStop(0, 'rgba(255,255,255,1)');
    core.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, 48, 48);
  }));

  replaceCanvasTexture(scene, FX.hex, paint(256, 256, (ctx) => {
    const fresnel = ctx.createRadialGradient(128, 128, 60, 128, 128, 124);
    fresnel.addColorStop(0, 'rgba(255,255,255,0.03)');
    fresnel.addColorStop(0.75, 'rgba(255,255,255,0.14)');
    fresnel.addColorStop(0.95, 'rgba(255,255,255,0.7)');
    fresnel.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = fresnel;
    ctx.beginPath();
    ctx.arc(128, 128, 124, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(128, 128, 118, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = 2;
    const size = 20;
    for (let row = -1; row < 9; row++) {
      for (let column = -1; column < 9; column++) {
        const x = column * size * 1.75 + (row % 2) * size * 0.875 + 6;
        const y = row * size * 1.52 + 8;
        drawHexPath(ctx, x, y, size);
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(128, 128, 120, 0, Math.PI * 2);
    ctx.stroke();
    const highlight = ctx.createRadialGradient(92, 80, 0, 92, 80, 46);
    highlight.addColorStop(0, 'rgba(255,255,255,0.45)');
    highlight.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = highlight;
    ctx.fillRect(40, 30, 110, 110);
  }));

  // Anamorphic lens streak for big explosions and boss hits.
  replaceCanvasTexture(scene, FX.flare, paint(256, 32, (ctx) => {
    const horizontal = ctx.createLinearGradient(0, 0, 256, 0);
    horizontal.addColorStop(0, 'rgba(255,255,255,0)');
    horizontal.addColorStop(0.5, 'rgba(255,255,255,1)');
    horizontal.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = horizontal;
    ctx.fillRect(0, 14, 256, 4);
    const vertical = ctx.createRadialGradient(128, 16, 0, 128, 16, 128);
    vertical.addColorStop(0, 'rgba(255,255,255,0.5)');
    vertical.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = vertical;
    ctx.fillRect(0, 0, 256, 32);
  }));

  replaceCanvasTexture(scene, FX.vignette, paint(256, 256, (ctx) => {
    const vignette = ctx.createRadialGradient(128, 128, 70, 128, 128, 182);
    vignette.addColorStop(0, 'rgba(2,2,10,0)');
    vignette.addColorStop(0.6, 'rgba(2,2,10,0.28)');
    vignette.addColorStop(1, 'rgba(2,2,10,0.82)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, 256, 256);
  }));

  // Horizontally tileable fog band used by the parallax backdrop.
  replaceCanvasTexture(scene, FX.fog, paint(512, 128, (ctx) => {
    const random = seededRandom(19);
    for (let index = 0; index < 26; index++) {
      const x = random() * 512;
      const y = 64 + (random() - 0.5) * 50;
      const radius = 36 + random() * 44;
      for (const offset of [-512, 0, 512]) {
        const puff = ctx.createRadialGradient(x + offset, y, 0, x + offset, y, radius);
        puff.addColorStop(0, 'rgba(255,255,255,0.2)');
        puff.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = puff;
        ctx.fillRect(x + offset - radius, y - radius, radius * 2, radius * 2);
      }
    }
  }));

  replaceCanvasTexture(scene, FX.rain, paint(4, 48, (ctx) => {
    const drop = ctx.createLinearGradient(0, 0, 0, 48);
    drop.addColorStop(0, 'rgba(255,255,255,0)');
    drop.addColorStop(1, 'rgba(255,255,255,0.9)');
    ctx.fillStyle = drop;
    ctx.fillRect(1, 0, 2, 48);
  }));
}

export function replaceCanvasTexture(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement): Phaser.Textures.Texture {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const texture = scene.textures.addCanvas(key, canvas);
  if (!texture) throw new Error(`Unable to create texture ${key}`);
  return texture;
}

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function paint(width: number, height: number, painter: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (ctx) painter(ctx);
  return canvas;
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };
}

export function drawSparkle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.quadraticCurveTo(x, y, x, y + radius);
  ctx.quadraticCurveTo(x, y, x - radius, y);
  ctx.quadraticCurveTo(x, y, x, y - radius);
  ctx.fill();
}

function drawHexPath(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.beginPath();
  for (let index = 0; index < 6; index++) {
    const angle = (Math.PI / 3) * index + Math.PI / 6;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function hashNoise(x: number, y: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const clamped = Phaser.Math.Clamp(t, 0, 1);
  return [a[0] + (b[0] - a[0]) * clamped, a[1] + (b[1] - a[1]) * clamped, a[2] + (b[2] - a[2]) * clamped];
}

function rgb(color: Rgb): string {
  return `rgb(${Math.round(color[0])}, ${Math.round(color[1])}, ${Math.round(color[2])})`;
}

function shade(hex: string, amount: number): string {
  const color = Phaser.Display.Color.HexStringToColor(hex);
  return `rgb(${Math.round(color.red * amount)}, ${Math.round(color.green * amount)}, ${Math.round(color.blue * amount)})`;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}
