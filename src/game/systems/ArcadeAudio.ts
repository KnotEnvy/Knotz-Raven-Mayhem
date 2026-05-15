import type { GameSettings, WeaponId } from '../types';

type MusicMode = 'menu' | 'run' | 'boss';

class ArcadeAudio {
  private context?: AudioContext;
  private musicTimer?: number;
  private musicStep = 0;
  private mode: MusicMode = 'menu';
  private settings: GameSettings = {
    musicVolume: 0.65,
    sfxVolume: 0.75,
    screenShake: true,
    reducedMotion: false,
  };

  applySettings(settings: GameSettings): void {
    this.settings = { ...settings };
  }

  startMusic(mode: MusicMode, settings = this.settings): void {
    this.applySettings(settings);
    this.mode = mode;
    this.ensureContext();
    this.stopMusic();

    if (this.settings.musicVolume <= 0 || this.settings.reducedMotion) return;

    const interval = mode === 'boss' ? 150 : mode === 'run' ? 185 : 240;
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
    const base = weaponId === 'scattergun' ? 150 : weaponId === 'arcLaser' ? 720 : weaponId === 'burstRifle' ? 460 : 540;
    this.tone(base, 0.045, weaponId === 'arcLaser' ? 'sawtooth' : 'square', 0.08);
    if (weaponId === 'scattergun') this.tone(90, 0.07, 'sawtooth', 0.05);
  }

  playHit(): void {
    this.tone(760, 0.04, 'triangle', 0.07);
  }

  playMiss(): void {
    this.tone(150, 0.08, 'sawtooth', 0.05);
  }

  playPowerup(): void {
    this.tone(720, 0.06, 'square', 0.08);
    this.tone(1080, 0.08, 'square', 0.07, 0.055);
  }

  playStageClear(): void {
    [523, 659, 784, 1046].forEach((frequency, index) => {
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
    this.tone(sequence[index], 0.095, 'square', 0.045 * this.settings.musicVolume);
    if (this.musicStep % 2 === 0) {
      this.tone(lead[index], 0.06, 'triangle', 0.035 * this.settings.musicVolume, 0.025);
    }

    this.musicStep++;
  }

  private tone(
    frequency: number,
    durationSeconds: number,
    type: OscillatorType,
    volume: number,
    delaySeconds = 0,
  ): void {
    const context = this.ensureContext();
    if (!context || this.settings.sfxVolume <= 0) return;

    const now = context.currentTime + delaySeconds;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * this.settings.sfxVolume), now + 0.012);
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
}

export const arcadeAudio = new ArcadeAudio();
