# Knotz Raven Mayhem Balance Notes

Use `npm run balance:report` before manual tuning sessions. The report reads the live stage, enemy, weapon, upgrade, and economy tuning data, then estimates stage pacing, run rewards, and armory costs.

## Current Baseline

- Cheapest first upgrade or unlock: 50 coins.
- Cheapest paid weapon or Assist Chip: 90 coins.
- All paid weapons and Assist Chips: 1230 coins.
- All permanent upgrade ranks: 2745 coins.
- Full armory economy: 3975 coins.
- Solid Stage 1 clear estimate: 77 coins.
- Solid Stage 3 clear estimate: 315 coins.
- Solid Stage 6 clear estimate: 886 coins.
- Solid full 9-stage clear estimate: 1659 coins.
- Solid full 9-stage score estimate: 12254 points.

## Release Interpretation

- A solid first-stage clear should buy the first permanent upgrade immediately.
- The first paid weapon or Assist Chip should be reachable after roughly two solid Stage 1 clears, or sooner after deeper runs.
- A full six-stage clear should unlock meaningful armory progress without exhausting the whole economy.
- A full nine-stage clear should buy several upgrades or one major weapon path, but still leaves room for repeat-run progression.
- Grade estimates now model learning, solid, and hot runs at 58%, 76%, and 92% grade clears. Verify that low-grade advancement still feels tense without making mastery irrelevant.
- Jackpot Alley is a no-grade-penalty bonus round after Stage 6; verify it feels like a payout spike rather than a difficulty wall.
- Manual playtests still own final tuning for boss health, stage pressure, powerup drop feel, and whether the full armory grind feels fair.

## Tuning Entry Points

- Player stats, economy, powerups, mobile hit forgiveness, and presentation caps: `src/game/data/tuning.ts`.
- Stage length, spawn pools, rewards, and bosses: `src/game/data/stages.ts`.
- Weapon and Assist Chip prices or identities: `src/game/data/weapons.ts`.
- Permanent upgrade costs and ranks: `src/game/data/upgrades.ts`.

## Current Content Notes

- Stage count is now 9: the original six-stage arc, Jackpot Alley bonus round, Cinder Viaduct, and Clocktower Apex.
- Enemy introductions are now staggered across the full arc: Stage 1 teaches Raven and Turbo Raven, Stage 2 adds Mini and Jackpot Raven, Stage 3 adds Shield Raven and the first Raven King boss, Stage 4 adds Armored Raven, Stage 5 adds Splitter and Dive Raven, Stage 8 adds Wraith Raven, and Stage 9 adds Brute Raven.
- Jackpot Alley is intentionally a no-new-enemy payout remix before the late-game Wraith and Brute reveals.
- Grade Shield replaces Extra Life as the non-lives recovery powerup; it forgives one escaped grade-eligible raven.
- Recovery Matrix keeps the internal `thickJacket` save id but now grants a small grade buffer instead of starting lives.
- Coin Rush doubles enemy coin drops while active.
- `npm run balance:report` now prints grade percent, stars per stage, Stage 6 estimates, and final-stage reward/score estimates.
