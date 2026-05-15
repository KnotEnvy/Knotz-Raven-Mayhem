# Knotz Raven Mayhem Release Assessment

## Built

- Phaser + TypeScript + Vite runtime with static GitHub Pages-friendly output.
- Arcade attract screen, armory, records, options, credits, HUD, pause, and game-over overlays.
- Run-based progression with stages, bosses, coins, unlockable guns/crosshairs, upgrades, and local saves.
- Enemy roster, powerups, combo scoring, stage rewards, high score tracking, and reward payout.
- Procedural arcade music and sound effects with persistent audio/motion settings.
- Stronger death sequence before the final run summary.

## Remaining Before Public Release

- Add original production assets: stage background art, final raven variants, boss sprite work, UI cabinet art, music beds, and dedicated SFX.
- Balance the economy and difficulty curve from real play sessions: early unlock timing, boss health, powerup drop rates, stage length, and coin payouts.
- Add a small release QA checklist: first-load, new save, returning save, all menu buttons, every weapon, every powerup, boss stage, game over, mobile layout, and GitHub Pages deploy.
- Add mobile-specific tuning if touch play is a target: hit radius, HUD density, pause affordance, and performance particle caps.
- Decide whether online leaderboard/account features are in scope for v1; current release path is local records only.

## Next Recommended Build Slices

1. Balance pass with debug-friendly tuning constants and a short QA checklist.
2. Production asset pass using the existing raven/explosion assets as seed references.
3. Mobile polish and deploy rehearsal.
