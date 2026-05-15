import Phaser from 'phaser';
import './styles.css';
import { BootScene } from './game/scenes/BootScene';
import { AttractScene } from './game/scenes/AttractScene';
import { GameScene } from './game/scenes/GameScene';
import { initializeUi } from './ui/app';

initializeUi();

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-root',
  backgroundColor: '#070510',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: false,
  },
  audio: {
    disableWebAudio: false,
  },
  scene: [BootScene, AttractScene, GameScene],
};

new Phaser.Game(config);
