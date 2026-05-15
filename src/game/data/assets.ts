export const assetPath = (path: string) => `${import.meta.env.BASE_URL}${path}`;

export const SPRITE_KEYS = {
  raven: 'raven',
  explosion: 'explosion',
} as const;

export const AUDIO_KEYS = {
  boom: 'boom',
} as const;
