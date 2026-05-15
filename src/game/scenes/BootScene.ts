import Phaser from 'phaser';
import { AUDIO_KEYS, SPRITE_KEYS, assetPath } from '../data/assets';

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
    this.anims.create({
      key: 'raven-flap',
      frames: this.anims.generateFrameNumbers(SPRITE_KEYS.raven, { start: 0, end: 4 }),
      frameRate: 12,
      repeat: -1,
    });

    this.anims.create({
      key: 'boom-pop',
      frames: this.anims.generateFrameNumbers(SPRITE_KEYS.explosion, { start: 0, end: 5 }),
      frameRate: 22,
      repeat: 0,
      hideOnComplete: true,
    });

    this.scene.start('AttractScene');
  }
}
