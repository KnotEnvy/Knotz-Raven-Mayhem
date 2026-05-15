import type { EnemyId, StageDefinition, WeightedEntry } from '../types';

export class WaveDirector {
  private spawnTimerMs = 0;

  reset(): void {
    this.spawnTimerMs = 0;
  }

  update(deltaMs: number, stage: StageDefinition): EnemyId | null {
    this.spawnTimerMs += deltaMs;
    if (this.spawnTimerMs < stage.spawnEveryMs) return null;

    this.spawnTimerMs = 0;
    return weightedPick(stage.enemyPool);
  }
}

export function weightedPick<TId extends string>(pool: WeightedEntry<TId>[]): TId {
  const total = pool.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;

  for (const item of pool) {
    roll -= item.weight;
    if (roll <= 0) return item.id;
  }

  return pool[pool.length - 1].id;
}
