import type { GameSettings, GraphicsQuality } from '../types';

export type QualityTier = 'high' | 'balanced' | 'low';

// A quality profile is the single source of truth for how much GPU/CPU the
// presentation layer may spend. Desktop "high" leans on the GPU (bloom + CRT
// post shader, dense particles, extra parallax); phones get "balanced" which
// keeps every gameplay cue but trims the expensive extras.
export interface QualityProfile {
  tier: QualityTier;
  postFx: boolean;
  particleScale: number;
  ambientParticles: number;
  parallaxLayers: number;
  backdropScale: number;
  corpses: boolean;
  maxCorpses: number;
  glowSprites: boolean;
  lightShafts: boolean;
  spriteBakeScale: number;
}

const PROFILES: Record<QualityTier, QualityProfile> = {
  high: {
    tier: 'high',
    postFx: true,
    particleScale: 1,
    ambientParticles: 1,
    parallaxLayers: 4,
    backdropScale: 1,
    corpses: true,
    maxCorpses: 14,
    glowSprites: true,
    lightShafts: true,
    spriteBakeScale: 1,
  },
  balanced: {
    tier: 'balanced',
    postFx: false,
    particleScale: 0.55,
    ambientParticles: 0.5,
    parallaxLayers: 3,
    backdropScale: 0.75,
    corpses: true,
    maxCorpses: 6,
    glowSprites: true,
    lightShafts: false,
    spriteBakeScale: 0.7,
  },
  low: {
    tier: 'low',
    postFx: false,
    particleScale: 0.3,
    ambientParticles: 0.2,
    parallaxLayers: 2,
    backdropScale: 0.6,
    corpses: false,
    maxCorpses: 0,
    glowSprites: false,
    lightShafts: false,
    spriteBakeScale: 0.6,
  },
};

const TIER_ORDER: QualityTier[] = ['high', 'balanced', 'low'];

// When "auto" is selected and the frame rate collapses, the runtime steps the
// tier down for the rest of the session instead of letting the game stutter.
let autoDowngradeTier: QualityTier | undefined;
let webglAvailable = true;

export function setRendererCapabilities(isWebGl: boolean): void {
  webglAvailable = isWebGl;
}

export function resolveQualityProfile(settings: Pick<GameSettings, 'graphicsQuality'>): QualityProfile {
  const override = readUrlOverride();
  const requested: GraphicsQuality = override ?? settings.graphicsQuality;
  let tier: QualityTier = requested === 'auto' ? detectAutoTier() : requested;

  if (requested === 'auto' && autoDowngradeTier && TIER_ORDER.indexOf(autoDowngradeTier) > TIER_ORDER.indexOf(tier)) {
    tier = autoDowngradeTier;
  }

  const profile = { ...PROFILES[tier] };
  if (!webglAvailable) profile.postFx = false;
  return profile;
}

export function isAutoQuality(settings: Pick<GameSettings, 'graphicsQuality'>): boolean {
  return (readUrlOverride() ?? settings.graphicsQuality) === 'auto';
}

export function stepDownAutoQuality(current: QualityTier): QualityTier | undefined {
  const index = TIER_ORDER.indexOf(current);
  if (index < 0 || index >= TIER_ORDER.length - 1) return undefined;
  autoDowngradeTier = TIER_ORDER[index + 1];
  return autoDowngradeTier;
}

export function describeQuality(settings: Pick<GameSettings, 'graphicsQuality'>): string {
  const labels: Record<GraphicsQuality, string> = {
    auto: 'Auto',
    high: 'High',
    balanced: 'Balanced',
    low: 'Low',
  };
  const label = labels[settings.graphicsQuality];
  if (settings.graphicsQuality !== 'auto') return label;
  const tier = resolveQualityProfile(settings).tier;
  return `Auto (${labels[tier]})`;
}

function detectAutoTier(): QualityTier {
  if (typeof window === 'undefined') return 'balanced';

  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const noHover = window.matchMedia?.('(hover: none)').matches ?? false;
  const shortSide = Math.min(window.innerWidth, window.innerHeight);
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 8;

  if (!webglAvailable) return 'balanced';
  if ((coarse && noHover) || shortSide <= 520) return 'balanced';
  if (cores <= 2 || memory <= 2) return 'low';
  if (cores <= 4 && memory <= 4) return 'balanced';
  return 'high';
}

function readUrlOverride(): GraphicsQuality | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const value = new URLSearchParams(window.location.search).get('quality');
    if (value === 'auto' || value === 'high' || value === 'balanced' || value === 'low') return value;
  } catch {
    return undefined;
  }
  return undefined;
}
