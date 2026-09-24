import Phaser from 'phaser';
import { AUDIO_KEYS, SPRITE_KEYS, assetPath } from '../data/assets';
import { registerCabinetPipeline } from '../fx/CabinetPipeline';
import { bakeAllTextures } from '../fx/TextureFactory';
import { loadSave } from '../save';
import { resolveQualityProfile, setRendererCapabilities } from '../systems/Quality';

export const DISPLAY_FONT = '"Bungee", Impact, Haettenschweiler, sans-serif';
export const UI_FONT = '"Chakra Petch", "Segoe UI", Arial, sans-serif';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    this.load.spritesheet(SPRITE_KEYS.raven, assetPath('assets/raven.png'), {
      frameWidth: 271,
      frameHeight: 194,
    });
    this.load.spritesheet(SPRITE_KEYS.explosion, assetPath('assets/boom.png'), {
      frameWidth: 200,
      frameHeight: 179,
    });
    this.load.audio(AUDIO_KEYS.boom, [assetPath('assets/boom.wav'), assetPath('assets/boom.mp3')]);
  }

  create(): void {
    setRendererCapabilities(registerCabinetPipeline(this.game));
    const quality = resolveQualityProfile(loadSave().settings);
    bakeAllTextures(this, quality);

    this.anims.create({
      key: 'raven-flap',
      frames: this.anims.generateFrameNumbers(SPRITE_KEYS.raven, { start: 0, end: 4 }),
      frameRate: 12,
      repeat: -1,
    });

    this.anims.create({
      key: 'boom-pop',
      frames: this.anims.generateFrameNumbers(SPRITE_KEYS.explosion, { start: 0, end: 4 }),
      frameRate: 22,
      repeat: 0,
      hideOnComplete: true,
    });

    // Phaser text rasterizes with whatever font is available at creation time,
    // so wait for the bundled faces before any scene draws text.
    void waitForFonts().then(() => this.scene.start('AttractScene'));
  }
}

async function waitForFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, 1500));
  const loads = Promise.all([
    document.fonts.load('32px "Bungee"'),
    document.fonts.load('500 16px "Chakra Petch"'),
    document.fonts.load('700 16px "Chakra Petch"'),
  ]).then(() => undefined).catch(() => undefined);
  await Promise.race([loads, timeout]);
}
