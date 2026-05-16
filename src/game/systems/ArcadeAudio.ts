import type { EnemyId, GameSettings, PowerupId, WeaponId } from '../types';

type MusicMode = 'menu' | 'run' | 'boss';
type AudioBus = 'music' | 'sfx';

interface StageAudioProfile {
  transpose: number;
  bassWave: OscillatorType;
  leadWave: OscillatorType;
  accentEvery: number;
}

const STAGE_AUDIO_PROFILES: Record<string, StageAudioProfile> = {
  'graveyard-dusk': { transpose: -2, bassWave: 'square', leadWave: 'triangle', accentEvery: 4 },
  'neon-boardwalk': { transpose: 2, bassWave: 'square', leadWave: 'square', accentEvery: 3 },
  'storm-tower': { transpose: 5, bassWave: 'sawtooth', leadWave: 'triangle', accentEvery: 4 },
  'junkyard-moon': { transpose: -5, bassWave: 'sawtooth', leadWave: 'square', accentEvery: 5 },
  'carnival-night': { transpose: 7, bassWave: 'square', leadWave: 'square', accentEvery: 2 },
  'raven-kings-nest': { transpose: -7, bassWave: 'sawtooth', leadWave: 'sawtooth', accentEvery: 3 },
};

const DEFAULT_STAGE_PROFILE: StageAudioProfile = {
  transpose: 0,
  bassWave: 'square',
  leadWave: 'triangle',
  accentEvery: 4,
};

class ArcadeAudio {
  private context?: AudioContext;
  private musicTimer?: number;
  private musicStep = 0;
  private mode: MusicMode = 'menu';
  private stageId = 'menu';
  private settings: GameSettings = {
    musicVolume: 0.65,
    sfxVolume: 0.75,
    screenShake: true,
    reducedMotion: false,
  };

  applySettings(settings: GameSettings): void {
    this.settings = { ...settings };
  }

  startMusic(mode: MusicMode, settings = this.settings, stageId = this.stageId): void {
    this.applySettings(settings);
    this.mode = mode;
    this.stageId = stageId;
    this.musicStep = 0;
    this.ensureContext();
    this.stopMusic();

    if (this.settings.musicVolume <= 0 || this.settings.reducedMotion) return;

    const profile = this.stageProfile;
    const interval = mode === 'boss' ? 150 : mode === 'run' ? 185 - Math.min(18, Math.max(0, profile.transpose)) : 240;
    this.musicTimer = window.setInterval(() => this.playMusicStep(), interval);
  }

  stopMusic(): void {
    if (this.musicTimer) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = undefined;
    }
  }

  playMenuConfirm(): void {
    this.tone(660, 0.055, 'square', 0.08);
    this.tone(990, 0.08, 'triangle', 0.05, 0.045);
  }

  playShot(weaponId: WeaponId): void {
    if (weaponId === 'scattergun') {
      this.tone(130, 0.06, 'sawtooth', 0.08);
      this.tone(92, 0.08, 'sawtooth', 0.05, 0.018);
      this.tone(180, 0.035, 'square', 0.04, 0.035);
      return;
    }

    if (weaponId === 'arcLaser') {
      this.tone(720, 0.08, 'sawtooth', 0.07);
      this.tone(1080, 0.06, 'triangle', 0.05, 0.018);
      this.tone(1440, 0.04, 'square', 0.035, 0.04);
      return;
    }

    if (weaponId === 'burstRifle') {
      [460, 520, 580].forEach((frequency, index) => {
        this.tone(frequency, 0.035, 'square', 0.055, index * 0.035);
      });
      return;
    }

    this.tone(540, 0.045, 'square', 0.08);
    this.tone(810, 0.03, 'triangle', 0.035, 0.018);
  }

  playHit(enemyId: EnemyId): void {
    const base = enemyId === 'boss'
      ? 185
      : enemyId === 'armored'
        ? 290
        : enemyId === 'shield'
          ? 920
          : enemyId === 'golden'
            ? 1040
            : 760;

    this.tone(base, enemyId === 'boss' ? 0.075 : 0.04, enemyId === 'shield' ? 'square' : 'triangle', 0.07);
    if (enemyId === 'armored' || enemyId === 'boss') this.tone(base * 0.5, 0.06, 'sawtooth', 0.04, 0.025);
  }

  playMiss(): void {
    this.tone(150, 0.08, 'sawtooth', 0.05);
  }

  playEnemyDestroyed(enemyId: EnemyId, comboMultiplier: number): void {
    if (enemyId === 'boss') return;

    const bonus = Math.min(7, comboMultiplier) * 18;
    const root = enemyId === 'golden' ? 880 : enemyId === 'splitter' ? 440 : enemyId === 'armored' ? 320 : 620;
    this.tone(root + bonus, 0.055, enemyId === 'golden' ? 'triangle' : 'square', enemyId === 'golden' ? 0.08 : 0.045);
    if (enemyId === 'golden') {
      [1108, 1318, 1760].forEach((frequency, index) => this.tone(frequency, 0.07, 'triangle', 0.055, 0.05 + index * 0.045));
    }
  }

  playPowerup(id: PowerupId): void {
    const roots: Record<PowerupId, number[]> = {
      slowmo: [330, 247, 196],
      multishot: [520, 660, 780],
      scoreBoost: [660, 990, 1320],
      extraLife: [392, 523, 784],
      overdrive: [740, 1110, 1480],
      coinRush: [880, 1175, 1760],
    };

    roots[id].forEach((frequency, index) => {
      this.tone(frequency, 0.07, id === 'overdrive' ? 'sawtooth' : 'square', 0.07, index * 0.045);
    });
  }

  playStageClear(stageIndex: number): void {
    const transpose = Math.min(12, stageIndex * 2);
    [523, 659, 784, 1046].forEach((frequency, index) => {
      this.tone(transposeFrequency(frequency, transpose), 0.1, 'triangle', 0.08, index * 0.075);
    });
  }

  playBossDefeated(): void {
    [196, 294, 392, 587, 784, 1175].forEach((frequency, index) => {
      this.tone(frequency, 0.1, 'triangle', 0.08, index * 0.075);
    });
  }

  playBossWarning(): void {
    this.tone(82, 0.18, 'sawtooth', 0.11);
    this.tone(96, 0.18, 'sawtooth', 0.09, 0.16);
  }

  playGameOver(): void {
    [392, 330, 262, 196, 130].forEach((frequency, index) => {
      this.tone(frequency, 0.18, 'sawtooth', 0.08, index * 0.13);
    });
  }

  private playMusicStep(): void {
    if (this.settings.musicVolume <= 0) return;

    const profile = this.stageProfile;
    const sequence = this.mode === 'boss'
      ? [55, 55, 82, 73, 55, 98, 82, 73]
      : this.mode === 'run'
        ? [110, 147, 165, 196, 110, 220, 196, 165]
        : [98, 123, 147, 196, 147, 123, 110, 123];
    const lead = this.mode === 'boss'
      ? [220, 196, 185, 165, 147, 165, 185, 196]
      : this.mode === 'run'
        ? [440, 494, 523, 659, 523, 494, 392, 440]
        : [330, 392, 494, 523, 494, 392, 330, 294];

    const index = this.musicStep % sequence.length;
    const transpose = this.mode === 'menu' ? 0 : profile.transpose;
    this.tone(transposeFrequency(sequence[index], transpose), 0.095, profile.bassWave, 0.045, 0, 'music');
    if (this.musicStep % 2 === 0) {
      this.tone(transposeFrequency(lead[index], transpose), 0.06, profile.leadWave, 0.035, 0.025, 'music');
    }

    if (this.mode !== 'menu' && this.musicStep % profile.accentEvery === 0) {
      this.tone(this.mode === 'boss' ? 41 : 55, 0.045, 'square', 0.025, 0.01, 'music');
    }

    this.musicStep++;
  }

  private tone(
    frequency: number,
    durationSeconds: number,
    type: OscillatorType,
    volume: number,
    delaySeconds = 0,
    bus: AudioBus = 'sfx',
  ): void {
    const context = this.ensureContext();
    const busVolume = bus === 'music' ? this.settings.musicVolume : this.settings.sfxVolume;
    if (!context || busVolume <= 0) return;

    const now = context.currentTime + delaySeconds;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * busVolume), now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + durationSeconds + 0.03);
  }

  private ensureContext(): AudioContext | undefined {
    if (typeof window === 'undefined') return undefined;
    if (!this.context) {
      const AudioCtor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return undefined;
      this.context = new AudioCtor();
    }
    if (this.context.state === 'suspended') {
      void this.context.resume();
    }
    return this.context;
  }

  private get stageProfile(): StageAudioProfile {
    const baseStageId = this.stageId.replace(/-\d+$/, '');
    return STAGE_AUDIO_PROFILES[baseStageId] ?? DEFAULT_STAGE_PROFILE;
  }
}

export const arcadeAudio = new ArcadeAudio();

function transposeFrequency(frequency: number, semitones: number): number {
  return frequency * 2 ** (semitones / 12);
}
