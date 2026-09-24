import type { EnemyId, GameSettings, PowerupId, WeaponId } from '../types';

type MusicMode = 'menu' | 'run' | 'boss';

// Procedural cabinet audio. Everything is synthesized with WebAudio so the
// build ships no music files:
//   sfx bus ─┐
//   music bus ┼─> master ─> compressor ─> speakers
//   reverb ───┘  (convolver fed by per-voice sends)
// Music is a lookahead step sequencer on the AudioContext clock (not
// setInterval timing), with drums, bass, arpeggio, pads and a lead whose
// layers are added as the player's combo multiplier climbs.

interface StageAudioProfile {
  key: number;
  tempo: number;
  bassWave: OscillatorType;
  leadWave: OscillatorType;
  swing: number;
  motif: number;
}

const STAGE_AUDIO_PROFILES: Record<string, StageAudioProfile> = {
  'graveyard-dusk': { key: -5, tempo: 116, bassWave: 'sawtooth', leadWave: 'triangle', swing: 0, motif: 0 },
  'neon-boardwalk': { key: -3, tempo: 122, bassWave: 'square', leadWave: 'square', swing: 0.08, motif: 1 },
  'storm-tower': { key: -1, tempo: 126, bassWave: 'sawtooth', leadWave: 'sawtooth', swing: 0, motif: 2 },
  'junkyard-moon': { key: -7, tempo: 120, bassWave: 'square', leadWave: 'square', swing: 0.12, motif: 3 },
  'carnival-night': { key: 0, tempo: 128, bassWave: 'square', leadWave: 'triangle', swing: 0.1, motif: 1 },
  'raven-kings-nest': { key: -8, tempo: 132, bassWave: 'sawtooth', leadWave: 'sawtooth', swing: 0, motif: 2 },
  'jackpot-alley': { key: 2, tempo: 134, bassWave: 'square', leadWave: 'square', swing: 0.14, motif: 4 },
  'cinder-viaduct': { key: -4, tempo: 134, bassWave: 'sawtooth', leadWave: 'square', swing: 0, motif: 3 },
  'clocktower-apex': { key: -2, tempo: 138, bassWave: 'sawtooth', leadWave: 'triangle', swing: 0, motif: 0 },
};

const DEFAULT_STAGE_PROFILE: StageAudioProfile = { key: -3, tempo: 120, bassWave: 'sawtooth', leadWave: 'triangle', swing: 0, motif: 0 };

// Chords are [semitones from key root, minor?]. A = 0 at 220Hz.
const PROGRESSIONS: Record<MusicMode, Array<[number, boolean]>> = {
  menu: [[0, true], [-4, false], [3, false], [-2, false]],
  run: [[0, true], [-4, false], [3, false], [-2, false]],
  boss: [[0, true], [1, false], [0, true], [-2, false]],
};

// Lead motifs: 32 sixteenth steps, values are scale degrees (natural minor) or null rests.
const MOTIFS: Array<Array<number | null>> = [
  [0, null, null, 2, null, null, 4, null, 3, null, 2, null, 0, null, null, null, 4, null, null, 5, null, null, 7, null, 6, null, 4, null, 2, null, null, null],
  [4, null, 4, null, 7, null, 4, null, 2, null, 3, 4, null, null, 0, null, 4, null, 4, null, 7, null, 9, null, 7, null, 5, 4, null, null, 2, null],
  [0, 0, null, 0, 3, null, 2, null, 0, 0, null, 0, 5, null, 4, null, 0, 0, null, 0, 7, null, 6, null, 5, null, 4, null, 3, null, 2, null],
  [0, null, 3, null, null, 4, null, 3, 0, null, null, null, -1, null, 0, null, 0, null, 3, null, null, 4, null, 6, 7, null, null, null, 4, null, null, null],
  [7, null, 9, 7, null, 4, null, 7, null, 9, null, 11, 9, null, 7, null, 4, null, 7, 4, null, 2, null, 4, null, 0, null, 2, 4, null, null, null],
];

const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
const LOOKAHEAD_SECONDS = 0.14;
const SCHEDULER_INTERVAL_MS = 25;

export class ArcadeAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private musicBus?: GainNode;
  private sfxBus?: GainNode;
  private reverbInput?: GainNode;
  private noiseBuffer?: AudioBuffer;
  private schedulerTimer?: number;
  private musicStep = 0;
  private nextStepTime = 0;
  private mode: MusicMode = 'menu';
  private stageId = 'menu';
  private musicWanted = false;
  private intensity = 1;
  private unlocked = false;
  private unlockListenersBound = false;
  private throttles = new Map<string, number>();
  private settings: GameSettings = {
    musicVolume: 0.65,
    sfxVolume: 0.75,
    screenShake: true,
    reducedMotion: false,
    graphicsQuality: 'auto',
  };

  applySettings(settings: GameSettings): void {
    this.settings = { ...settings };
    const now = this.context?.currentTime ?? 0;
    this.musicBus?.gain.setTargetAtTime(this.musicGain, now, 0.05);
    this.sfxBus?.gain.setTargetAtTime(this.sfxGain, now, 0.05);
  }

  startMusic(mode: MusicMode, settings = this.settings, stageId = this.stageId): void {
    const changed = mode !== this.mode || stageId !== this.stageId || !this.schedulerTimer;
    this.applySettings(settings);
    this.mode = mode;
    this.stageId = stageId;
    this.musicWanted = true;
    if (mode === 'boss') this.intensity = Math.max(this.intensity, 3);
    if (mode === 'menu') this.intensity = 1;

    if (!this.unlocked) {
      this.bindUnlockListeners();
      return;
    }
    if (!changed) return;

    const context = this.ensureContext();
    if (!context) return;
    this.musicStep = 0;
    this.nextStepTime = context.currentTime + 0.08;
    if (!this.schedulerTimer) {
      this.schedulerTimer = window.setInterval(() => this.scheduleMusic(), SCHEDULER_INTERVAL_MS);
    }
  }

  stopMusic(): void {
    this.musicWanted = false;
    if (this.schedulerTimer) {
      window.clearInterval(this.schedulerTimer);
      this.schedulerTimer = undefined;
    }
  }

  // 0 = breakdown (stage clear), 1 = base groove, up to 6 with the combo.
  setIntensity(level: number): void {
    this.intensity = Math.max(this.mode === 'boss' ? 3 : 0, Math.min(6, level));
  }

  playMenuConfirm(): void {
    const t = this.now();
    if (t === undefined) return;
    this.osc('square', 660, t, 0.05, 0.14, { freqEnd: 990, filter: 5000 });
    this.osc('triangle', 1320, t + 0.045, 0.09, 0.1);
  }

  playShot(weaponId: WeaponId, pan = 0): void {
    const t = this.now();
    if (t === undefined) return;

    if (weaponId === 'scattergun') {
      this.noise(t, 0.26, 0.5, { type: 'lowpass', freq: 4200, freqEnd: 380, pan });
      this.osc('sine', 120, t, 0.2, 0.55, { freqEnd: 38, pan });
      this.noise(t + 0.02, 0.05, 0.18, { type: 'highpass', freq: 3000, pan });
      return;
    }

    if (weaponId === 'arcLaser') {
      this.osc('sawtooth', 1900, t, 0.26, 0.26, { freqEnd: 260, filter: 2600, pan, reverb: 0.3 });
      this.osc('sine', 2600, t, 0.2, 0.16, { freqEnd: 1300, pan, reverb: 0.3 });
      this.noise(t, 0.12, 0.3, { type: 'bandpass', freq: 5000, freqEnd: 1200, q: 3, pan });
      this.osc('sine', 180, t, 0.12, 0.3, { freqEnd: 70, pan });
      return;
    }

    if (weaponId === 'burstRifle') {
      for (let index = 0; index < 3; index++) {
        const start = t + index * 0.048;
        this.noise(start, 0.05, 0.26, { type: 'bandpass', freq: 2600, freqEnd: 900, q: 1.2, pan });
        this.osc('square', 760 - index * 60, start, 0.04, 0.07, { freqEnd: 240, pan });
        this.osc('sine', 150, start, 0.06, 0.22, { freqEnd: 60, pan });
      }
      return;
    }

    this.noise(t, 0.07, 0.5, { type: 'bandpass', freq: 3200, freqEnd: 700, q: 1.1, pan });
    this.osc('square', 920, t, 0.05, 0.1, { freqEnd: 210, pan, filter: 4000 });
    this.osc('sine', 170, t, 0.09, 0.42, { freqEnd: 55, pan });
  }

  playHit(enemyId: EnemyId, pan = 0): void {
    if (!this.throttle(`hit-${enemyId}`, 28)) return;
    const t = this.now();
    if (t === undefined) return;

    if (enemyId === 'armored' || enemyId === 'brute') {
      this.osc('square', 1240, t, 0.06, 0.09, { pan });
      this.osc('square', 1860, t, 0.09, 0.06, { pan, reverb: 0.25 });
      this.noise(t, 0.05, 0.2, { type: 'highpass', freq: 4000, pan });
      this.osc('sine', 110, t, 0.1, 0.25, { freqEnd: 60, pan });
      return;
    }

    if (enemyId === 'boss') {
      this.osc('sine', 95, t, 0.18, 0.5, { freqEnd: 42, pan });
      this.noise(t, 0.16, 0.34, { type: 'lowpass', freq: 1400, freqEnd: 200, pan });
      this.osc('sawtooth', 220, t, 0.1, 0.08, { freqEnd: 110, filter: 900, pan });
      return;
    }

    if (enemyId === 'shield') {
      this.osc('sawtooth', 980, t, 0.1, 0.18, { freqEnd: 1600, filter: 3200, pan });
      this.noise(t, 0.06, 0.34, { type: 'bandpass', freq: 3600, q: 4, pan });
      this.osc('sine', 240, t, 0.08, 0.22, { freqEnd: 120, pan });
      return;
    }

    this.noise(t, 0.07, 0.6, { type: 'bandpass', freq: 1500, freqEnd: 600, q: 1.4, pan });
    this.osc('triangle', 560, t, 0.07, 0.24, { freqEnd: 300, pan });
    this.osc('sine', 200, t, 0.08, 0.3, { freqEnd: 90, pan });
  }

  playMiss(pan = 0): void {
    const t = this.now();
    if (t === undefined) return;
    this.noise(t, 0.14, 0.32, { type: 'bandpass', freq: 700, freqEnd: 260, q: 1.5, pan });
  }

  playRecharge(): void {
    const t = this.now();
    if (t === undefined) return;
    this.osc('square', 118, t, 0.05, 0.08, { filter: 800 });
    this.osc('square', 98, t + 0.05, 0.05, 0.07, { filter: 800 });
  }

  playEscape(): void {
    const t = this.now();
    if (t === undefined) return;
    this.osc('sawtooth', 340, t, 0.32, 0.22, { freqEnd: 110, filter: 1200 });
    this.osc('square', 880, t, 0.06, 0.08, { filter: 4000 });
    this.osc('square', 660, t + 0.08, 0.08, 0.08, { filter: 4000 });
  }

  playEnemyDestroyed(enemyId: EnemyId, comboMultiplier: number, pan = 0): void {
    if (enemyId === 'boss') return;
    if (!this.throttle('destroy', 24)) return;
    const t = this.now();
    if (t === undefined) return;

    const heavy = enemyId === 'brute' || enemyId === 'armored';
    this.noise(t, heavy ? 0.5 : 0.34, heavy ? 0.46 : 0.34, { type: 'lowpass', freq: heavy ? 2400 : 3200, freqEnd: 160, pan, reverb: 0.15 });
    this.osc('sine', heavy ? 110 : 140, t, heavy ? 0.34 : 0.22, heavy ? 0.6 : 0.42, { freqEnd: 36, pan });

    // Pentatonic chime climbs with the combo so chains sound like progress.
    const pentatonic = [0, 3, 5, 7, 10, 12, 15];
    const note = pentatonic[Math.min(pentatonic.length - 1, Math.max(0, comboMultiplier - 1))];
    const chime = 660 * 2 ** (note / 12);
    this.osc('triangle', chime, t + 0.01, 0.16, 0.09, { pan, reverb: 0.35 });
    this.osc('square', chime * 2, t + 0.01, 0.06, 0.025, { pan });

    if (enemyId === 'golden') {
      [1175, 1480, 1760, 2349].forEach((frequency, index) => this.osc('square', frequency, t + 0.05 + index * 0.05, 0.1, 0.05, { pan, reverb: 0.4 }));
    }
  }

  playCoin(pan = 0): void {
    if (!this.throttle('coin', 60)) return;
    const t = this.now();
    if (t === undefined) return;
    this.osc('square', 988, t, 0.06, 0.1, { pan, filter: 6000 });
    this.osc('square', 1319, t + 0.06, 0.18, 0.1, { pan, reverb: 0.25, filter: 6000 });
  }

  playShieldBreak(pan = 0): void {
    const t = this.now();
    if (t === undefined) return;
    this.noise(t, 0.3, 0.28, { type: 'highpass', freq: 3500, pan, reverb: 0.3 });
    for (let index = 0; index < 5; index++) {
      this.osc('sine', 2200 + Math.random() * 2400, t + index * 0.03, 0.12, 0.05, { pan, reverb: 0.4 });
    }
  }

  playPowerup(id: PowerupId): void {
    const t = this.now();
    if (t === undefined) return;
    const roots: Record<PowerupId, number[]> = {
      slowmo: [659, 494, 392, 330],
      multishot: [523, 659, 784, 1047],
      scoreBoost: [659, 988, 1319, 1976],
      extraLife: [392, 523, 659, 784],
      overdrive: [740, 1109, 1480, 2217],
      coinRush: [880, 1175, 1397, 1760],
    };
    roots[id].forEach((frequency, index) => {
      this.osc(id === 'overdrive' ? 'sawtooth' : 'square', frequency, t + index * 0.055, 0.1, 0.07, { filter: 4000, reverb: 0.35 });
      this.osc('sine', frequency * 2, t + index * 0.055, 0.12, 0.04, { reverb: 0.4 });
    });
    this.osc('sine', 220, t, 0.4, 0.12, { freqEnd: id === 'slowmo' ? 110 : 440 });
  }

  playComboTier(tier: number): void {
    const t = this.now();
    if (t === undefined) return;
    const base = 440 * 2 ** ((tier * 2) / 12);
    [0, 4, 7, 12].forEach((interval, index) => {
      this.osc('square', base * 2 ** (interval / 12), t + index * 0.045, 0.09, 0.12, { filter: 5000, reverb: 0.3 });
    });
    this.noise(t, 0.2, 0.08, { type: 'highpass', freq: 6000, freqEnd: 9000 });
  }

  playStageClear(stageIndex: number): void {
    const t = this.now();
    if (t === undefined) return;
    const transpose = Math.min(12, stageIndex * 2);
    [523, 659, 784, 1047].forEach((frequency, index) => {
      this.osc('square', transposeFrequency(frequency, transpose), t + index * 0.085, 0.14, 0.07, { filter: 4000, reverb: 0.3 });
      this.osc('triangle', transposeFrequency(frequency, transpose), t + index * 0.085, 0.3, 0.07, { reverb: 0.4 });
    });
    [523, 659, 784].forEach((frequency) => this.osc('sawtooth', transposeFrequency(frequency, transpose), t + 0.36, 0.9, 0.05, { filter: 2600, reverb: 0.5 }));
    this.cymbal(t + 0.36, 0.9, 0.12);
  }

  playBossDefeated(): void {
    const t = this.now();
    if (t === undefined) return;
    this.noise(t, 1.8, 0.6, { type: 'lowpass', freq: 3000, freqEnd: 60, reverb: 0.4 });
    this.osc('sine', 90, t, 1.2, 0.7, { freqEnd: 28 });
    [196, 294, 392, 587, 784, 1175].forEach((frequency, index) => {
      this.osc('square', frequency, t + 0.5 + index * 0.08, 0.16, 0.07, { filter: 3600, reverb: 0.4 });
    });
    [392, 494, 587].forEach((frequency) => this.osc('sawtooth', frequency, t + 1.0, 1.2, 0.05, { filter: 2200, reverb: 0.6 }));
    this.cymbal(t + 1.0, 1.4, 0.16);
  }

  playBossWarning(): void {
    const t = this.now();
    if (t === undefined) return;
    for (let cycle = 0; cycle < 3; cycle++) {
      this.osc('sawtooth', 440, t + cycle * 0.42, 0.21, 0.08, { freqEnd: 660, filter: 2400 });
      this.osc('sawtooth', 660, t + cycle * 0.42 + 0.21, 0.21, 0.08, { freqEnd: 440, filter: 2400 });
    }
    this.osc('sawtooth', 55, t, 1.3, 0.2, { filter: 400 });
    this.osc('sine', 41, t, 1.3, 0.35);
  }

  playThunder(): void {
    const t = this.now();
    if (t === undefined) return;
    const delay = 0.15 + Math.random() * 0.5;
    this.noise(t + delay, 2.4, 0.36, { type: 'lowpass', freq: 520, freqEnd: 70, reverb: 0.5 });
    this.noise(t + delay, 0.12, 0.2, { type: 'lowpass', freq: 2400, freqEnd: 400 });
  }

  playFirework(): void {
    const t = this.now();
    if (t === undefined) return;
    const pan = Math.random() * 1.2 - 0.6;
    this.noise(t, 0.12, 0.22, { type: 'lowpass', freq: 1800, freqEnd: 300, pan, reverb: 0.4 });
    for (let index = 0; index < 6; index++) {
      this.noise(t + 0.3 + Math.random() * 0.4, 0.02, 0.12, { type: 'highpass', freq: 5000, pan });
    }
  }

  playGameOver(): void {
    const t = this.now();
    if (t === undefined) return;
    [392, 330, 262, 196, 130].forEach((frequency, index) => {
      this.osc('sawtooth', frequency, t + index * 0.13, 0.18, 0.08, { filter: 1800, reverb: 0.3 });
    });
  }

  // ---------------------------------------------------------------- music

  private scheduleMusic(): void {
    const context = this.context;
    if (!context || !this.musicWanted || this.musicGain <= 0) return;
    if (context.state !== 'running') return;

    // After a throttled/background tab, skip ahead instead of machine-gunning notes.
    if (this.nextStepTime < context.currentTime - 0.25) this.nextStepTime = context.currentTime + 0.05;

    const profile = this.stageProfile;
    const tempo = this.mode === 'boss' ? profile.tempo + 18 : this.mode === 'menu' ? 98 : profile.tempo;
    const stepDuration = 60 / tempo / 4;

    while (this.nextStepTime < context.currentTime + LOOKAHEAD_SECONDS) {
      const swing = this.musicStep % 2 === 1 ? profile.swing * stepDuration : 0;
      this.playMusicStep(this.musicStep, this.nextStepTime + swing, stepDuration);
      this.nextStepTime += stepDuration;
      this.musicStep++;
    }
  }

  private playMusicStep(step: number, time: number, stepDuration: number): void {
    const profile = this.mode === 'menu' ? { ...DEFAULT_STAGE_PROFILE, key: -5, bassWave: 'triangle' as OscillatorType, leadWave: 'triangle' as OscillatorType } : this.stageProfile;
    const progression = PROGRESSIONS[this.mode];
    const bar = Math.floor(step / 16);
    const beatStep = step % 16;
    const [chordRoot, minor] = progression[bar % progression.length];
    const rootSemis = profile.key + chordRoot;
    const level = this.mode === 'menu' ? 1 : Math.round(this.intensity);
    const menu = this.mode === 'menu';
    const boss = this.mode === 'boss';

    // Pads: one sustained chord per bar.
    if (beatStep === 0) {
      const third = minor ? 3 : 4;
      [0, third, 7].forEach((interval) => {
        this.osc('sawtooth', noteFrequency(rootSemis + interval + 12), time, stepDuration * 15.5, menu ? 0.03 : 0.022, {
          bus: 'music',
          filter: menu ? 1100 : 1500,
          attack: stepDuration * 3,
          detune: interval * 3 - 6,
          reverb: 0.55,
        });
      });
    }

    // Drums
    if (level >= 1 || menu) {
      const fourFloor = beatStep % 4 === 0;
      if (fourFloor && !(menu && beatStep % 8 !== 0)) this.kick(time, menu ? 0.28 : 0.42);
    }
    if (level >= 2 && !menu && (beatStep === 4 || beatStep === 12)) this.snare(time, 0.2);
    if (boss && (beatStep === 14 || beatStep === 15) && bar % 2 === 1) this.snare(time, 0.14);
    if (level >= 1 && beatStep % 2 === 1) this.hat(time, menu ? 0.03 : 0.05, level >= 3 && beatStep % 4 === 3);
    if (level >= 4 && beatStep % 2 === 0 && beatStep % 4 !== 0) this.hat(time, 0.03, false);

    // Bass: pumping synthwave octaves.
    if (level >= 1 && beatStep % 2 === 0) {
      const octave = beatStep % 4 === 2 ? 12 : 0;
      this.osc(profile.bassWave, noteFrequency(rootSemis - 12 + octave), time, stepDuration * 1.7, menu ? 0.05 : 0.075, {
        bus: 'music',
        filter: 380 + level * 160,
        filterEnd: 220,
      });
    }

    // Arpeggio: triad climbing through two octaves.
    if (level >= 2 || menu) {
      const third = minor ? 3 : 4;
      const arp = [0, third, 7, 12, 7 + 12, 12, 7, third];
      const every = menu ? 2 : level >= 4 ? 1 : 2;
      if (beatStep % every === 0) {
        const interval = arp[(step / every) % arp.length | 0];
        this.osc(menu ? 'triangle' : 'square', noteFrequency(rootSemis + interval + 12 + (level >= 5 ? 12 : 0)), time, stepDuration * 0.9, menu ? 0.028 : 0.022, {
          bus: 'music',
          filter: 2600 + level * 400,
          reverb: 0.3,
        });
      }
    }

    // Lead motif
    if (level >= 3 && !menu) {
      const motif = MOTIFS[profile.motif % MOTIFS.length];
      const degree = motif[step % motif.length];
      if (degree !== null && degree !== undefined) {
        const semis = scaleSemitone(degree);
        this.osc(profile.leadWave, noteFrequency(profile.key + semis + 24), time, stepDuration * 1.8, 0.04, {
          bus: 'music',
          filter: 3400,
          reverb: 0.4,
          vibrato: 5,
        });
      }
    }
  }

  // --------------------------------------------------------------- voices

  private kick(time: number, gain: number): void {
    this.osc('sine', 150, time, 0.32, gain, { freqEnd: 42, bus: 'music', freqTime: 0.1 });
    this.noise(time, 0.015, gain * 0.25, { type: 'highpass', freq: 3000, bus: 'music' });
  }

  private snare(time: number, gain: number): void {
    this.noise(time, 0.18, gain, { type: 'bandpass', freq: 1900, q: 0.8, bus: 'music', reverb: 0.25 });
    this.osc('triangle', 190, time, 0.1, gain * 0.6, { freqEnd: 150, bus: 'music' });
  }

  private hat(time: number, gain: number, open: boolean): void {
    this.noise(time, open ? 0.16 : 0.035, gain, { type: 'highpass', freq: 7200, bus: 'music' });
  }

  private cymbal(time: number, duration: number, gain: number): void {
    this.noise(time, duration, gain, { type: 'highpass', freq: 5200, reverb: 0.4 });
  }

  private osc(
    type: OscillatorType,
    frequency: number,
    start: number,
    duration: number,
    volume: number,
    options: {
      freqEnd?: number;
      freqTime?: number;
      filter?: number;
      filterEnd?: number;
      pan?: number;
      reverb?: number;
      bus?: 'music' | 'sfx';
      attack?: number;
      detune?: number;
      vibrato?: number;
    } = {},
  ): void {
    const context = this.context;
    const destination = options.bus === 'music' ? this.musicBus : this.sfxBus;
    if (!context || !destination) return;

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (options.freqEnd) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, options.freqEnd), start + (options.freqTime ?? duration));
    }
    if (options.detune) oscillator.detune.setValueAtTime(options.detune, start);

    let vibrato: OscillatorNode | undefined;
    if (options.vibrato) {
      vibrato = context.createOscillator();
      const depth = context.createGain();
      vibrato.frequency.value = 5.5;
      depth.gain.value = options.vibrato;
      vibrato.connect(depth).connect(oscillator.detune);
      vibrato.start(start);
      vibrato.stop(start + duration + 0.05);
    }

    const attack = options.attack ?? 0.006;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    let node: AudioNode = oscillator;
    if (options.filter) {
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(options.filter, start);
      if (options.filterEnd) filter.frequency.exponentialRampToValueAtTime(options.filterEnd, start + duration);
      node.connect(filter);
      node = filter;
    }
    node.connect(gain);
    this.route(gain, destination, options.pan, options.reverb);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  }

  private noise(
    start: number,
    duration: number,
    volume: number,
    options: { type: BiquadFilterType; freq: number; freqEnd?: number; q?: number; pan?: number; reverb?: number; bus?: 'music' | 'sfx' },
  ): void {
    const context = this.context;
    const buffer = this.noiseBuffer;
    const destination = options.bus === 'music' ? this.musicBus : this.sfxBus;
    if (!context || !buffer || !destination) return;

    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = options.type;
    filter.frequency.setValueAtTime(options.freq, start);
    if (options.freqEnd) filter.frequency.exponentialRampToValueAtTime(options.freqEnd, start + duration);
    if (options.q) filter.Q.value = options.q;
    const gain = context.createGain();
    gain.gain.setValueAtTime(Math.max(0.0002, volume), start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(gain);
    this.route(gain, destination, options.pan, options.reverb);
    const offset = Math.random() * Math.max(0, buffer.duration - duration - 0.05);
    source.start(start, offset, duration + 0.05);
  }

  private route(node: AudioNode, destination: AudioNode, pan?: number, reverb?: number): void {
    const context = this.context;
    if (!context) return;
    let output = node;
    if (pan && typeof context.createStereoPanner === 'function') {
      const panner = context.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      output.connect(panner);
      output = panner;
    }
    output.connect(destination);
    if (reverb && this.reverbInput) {
      const send = context.createGain();
      send.gain.value = reverb;
      output.connect(send).connect(this.reverbInput);
    }
  }

  // ---------------------------------------------------------------- setup

  private now(): number | undefined {
    const context = this.ensureContext();
    if (!context || this.sfxGain <= 0) return undefined;
    return context.currentTime + 0.005;
  }

  private throttle(key: string, ms: number): boolean {
    const now = performance.now();
    const last = this.throttles.get(key) ?? 0;
    if (now - last < ms) return false;
    this.throttles.set(key, now);
    return true;
  }

  // Measured with an offline render: SFX need to sit clearly above the music
  // bed, so the buses are weighted rather than mapped 1:1 to the sliders.
  private get musicGain(): number {
    return this.settings.musicVolume * 0.58;
  }

  private get sfxGain(): number {
    return this.settings.sfxVolume * 1.45;
  }

  private ensureContext(): AudioContext | undefined {
    if (typeof window === 'undefined') return undefined;
    if (!this.unlocked) {
      this.bindUnlockListeners();
      return undefined;
    }
    if (!this.context) {
      const AudioCtor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return undefined;
      this.context = new AudioCtor();
      this.buildGraph(this.context);
      document.addEventListener('visibilitychange', () => {
        if (!this.context) return;
        if (document.hidden) void this.context.suspend().catch(() => undefined);
        else void this.context.resume().catch(() => undefined);
      });
    }
    if (this.context.state === 'suspended' && !document.hidden) {
      void this.context.resume().catch(() => undefined);
    }
    return this.context;
  }

  private buildGraph(context: AudioContext): void {
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 10;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.2;
    // Brickwall-style limiter so a full scattergun volley over boss music
    // cannot clip the output.
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;
    compressor.connect(limiter).connect(context.destination);

    this.master = context.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(compressor);

    this.musicBus = context.createGain();
    this.musicBus.gain.value = this.musicGain;
    this.musicBus.connect(this.master);

    this.sfxBus = context.createGain();
    this.sfxBus.gain.value = this.sfxGain;
    this.sfxBus.connect(this.master);

    const reverb = context.createConvolver();
    reverb.buffer = createImpulse(context, 2.2, 2.6);
    const reverbReturn = context.createGain();
    reverbReturn.gain.value = 0.32;
    this.reverbInput = context.createGain();
    this.reverbInput.connect(reverb).connect(reverbReturn).connect(this.master);

    const length = context.sampleRate * 2;
    this.noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let index = 0; index < length; index++) data[index] = Math.random() * 2 - 1;
  }

  private bindUnlockListeners(): void {
    if (this.unlockListenersBound || typeof window === 'undefined') return;
    this.unlockListenersBound = true;

    const unlock = () => {
      if (this.unlocked) return;
      this.unlocked = true;
      this.unlockListenersBound = false;
      const context = this.ensureContext();
      if (context) {
        // iOS only unlocks output after a buffer plays inside the gesture.
        const silent = context.createBufferSource();
        silent.buffer = context.createBuffer(1, 1, context.sampleRate);
        silent.connect(context.destination);
        silent.start(0);
      }
      if (this.musicWanted) {
        this.schedulerTimer = undefined;
        this.startMusic(this.mode, this.settings, this.stageId);
      }
    };

    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true, passive: true });
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

function noteFrequency(semitonesFromA3: number): number {
  return 220 * 2 ** (semitonesFromA3 / 12);
}

function scaleSemitone(degree: number): number {
  const octave = Math.floor(degree / MINOR_SCALE.length);
  const index = ((degree % MINOR_SCALE.length) + MINOR_SCALE.length) % MINOR_SCALE.length;
  return MINOR_SCALE[index] + octave * 12;
}

function createImpulse(context: AudioContext, seconds: number, decay: number): AudioBuffer {
  const length = Math.floor(context.sampleRate * seconds);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let index = 0; index < length; index++) {
      data[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / length, decay);
    }
  }
  return impulse;
}
