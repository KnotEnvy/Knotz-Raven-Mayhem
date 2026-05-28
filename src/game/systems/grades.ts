import { GRADE_TUNING } from '../data/tuning';
import type { StageGrade, StageGradeLabel } from '../types';

export interface StageGradeInput {
  gradeEligibleSpawned: number;
  gradeEligibleKilled: number;
  escapedGradeEligible: number;
  shieldedEscapes: number;
  optionalKills: number;
  stageAccuracy: number;
  gradeBufferPercent: number;
  bonusStage?: boolean;
}

export function calculateStageGrade(input: StageGradeInput): StageGrade {
  if (input.bonusStage || input.gradeEligibleSpawned <= 0) {
    return {
      gradeEligibleSpawned: input.gradeEligibleSpawned,
      gradeEligibleKilled: input.gradeEligibleKilled,
      escapedGradeEligible: input.escapedGradeEligible,
      shieldedEscapes: input.shieldedEscapes,
      optionalKills: input.optionalKills,
      stageAccuracy: input.stageAccuracy,
      rawGradePercent: 100,
      gradePercent: 100,
      gradeBufferPercent: 0,
      starCount: 0,
      gradeLabel: 'Bonus',
    };
  }

  const rawGradePercent = clampPercent(((input.gradeEligibleKilled + input.shieldedEscapes) / input.gradeEligibleSpawned) * 100);
  const gradeBufferPercent = Math.min(input.gradeBufferPercent, Math.max(0, 100 - rawGradePercent));
  const gradePercent = clampPercent(rawGradePercent + gradeBufferPercent);
  const starCount = getStarCount(gradePercent);

  return {
    gradeEligibleSpawned: input.gradeEligibleSpawned,
    gradeEligibleKilled: input.gradeEligibleKilled,
    escapedGradeEligible: input.escapedGradeEligible,
    shieldedEscapes: input.shieldedEscapes,
    optionalKills: input.optionalKills,
    stageAccuracy: input.stageAccuracy,
    rawGradePercent,
    gradePercent,
    gradeBufferPercent,
    starCount,
    gradeLabel: getGradeLabel(starCount),
  };
}

export function getStarCount(gradePercent: number): number {
  if (gradePercent >= GRADE_TUNING.fiveStarPercent) return 5;
  if (gradePercent >= GRADE_TUNING.fourStarPercent) return 4;
  if (gradePercent >= GRADE_TUNING.threeStarPercent) return 3;
  if (gradePercent >= GRADE_TUNING.twoStarPercent) return 2;
  return 1;
}

export function getGradeLabel(starCount: number): StageGradeLabel {
  if (starCount >= 5) return 'S';
  if (starCount === 4) return 'A';
  if (starCount === 3) return 'B';
  if (starCount === 2) return 'C';
  return 'D';
}

export function calculateGradeAdjustedStageReward(baseRewardCoins: number, starCount: number): number {
  const multiplier = GRADE_TUNING.rewardMultipliers[starCount as keyof typeof GRADE_TUNING.rewardMultipliers] ?? 1;
  return Math.max(0, Math.round(baseRewardCoins * multiplier));
}

export function averageGradePercent(totalGradePercent: number, gradedStagesCleared: number): number {
  if (gradedStagesCleared <= 0) return 100;
  return Math.round(totalGradePercent / gradedStagesCleared);
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
