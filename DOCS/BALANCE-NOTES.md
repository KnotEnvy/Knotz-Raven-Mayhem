# Knotz Raven Mayhem Balance Notes

Use `npm run balance:report` before manual tuning sessions. The report reads the live stage, enemy, weapon, upgrade, and economy tuning data, then estimates stage pacing, run rewards, and armory costs.

## Current Baseline

- Cheapest first upgrade or unlock: 50 coins.
- Cheapest paid weapon or crosshair: 90 coins.
- All paid weapons and crosshairs: 1230 coins.
- All permanent upgrade ranks: 2745 coins.
- Full armory economy: 3975 coins.
- Solid Stage 1 clear estimate: 76 coins.
- Solid Stage 3 clear estimate: 331 coins.
- Solid Stage 6 clear estimate: 938 coins.
- Solid full 9-stage clear estimate: 1781 coins.
- Solid full 9-stage score estimate: 15880 points.

## Release Interpretation

- A solid first-stage clear should buy the first permanent upgrade immediately.
- The first paid weapon or crosshair should be reachable after roughly two solid Stage 1 clears, or sooner after deeper runs.
- A full six-stage clear should unlock meaningful armory progress without exhausting the whole economy.
- A full nine-stage clear should buy several upgrades or one major weapon path, but still leaves room for repeat-run progression.
- Jackpot Alley is a no-life-loss bonus round after Stage 6; verify it feels like a payout spike rather than a difficulty wall.
- Manual playtests still own final tuning for boss health, stage pressure, powerup drop feel, and whether the full armory grind feels fair.

## Tuning Entry Points

- Player stats, economy, powerups, mobile hit forgiveness, and presentation caps: `src/game/data/tuning.ts`.
- Stage length, spawn pools, rewards, and bosses: `src/game/data/stages.ts`.
- Weapon and crosshair prices or identities: `src/game/data/weapons.ts`.
- Permanent upgrade costs and ranks: `src/game/data/upgrades.ts`.

## Current Content Notes

- Stage count is now 9: the original six-stage arc, Jackpot Alley bonus round, Cinder Viaduct, and Clocktower Apex.
- New enemy introductions: Wraith Raven appears first in Jackpot Alley, and Brute Raven appears first in Cinder Viaduct.
- New powerup: Coin Rush doubles enemy coin drops while active.
- `npm run balance:report` now prints both Stage 6 and final-stage reward/score estimates.
