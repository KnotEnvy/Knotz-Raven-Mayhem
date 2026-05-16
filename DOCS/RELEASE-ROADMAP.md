# Knotz Raven Mayhem Release Assessment

## Built

- Phaser + TypeScript + Vite runtime with static GitHub Pages-friendly output.
- Arcade attract screen, armory, records, options, credits, HUD, pause, and game-over overlays.
- Run-based progression with stages, bosses, coins, unlockable guns, Assist Chips, upgrades, and local saves.
- Enemy roster, powerups, combo scoring, stage rewards, high score tracking, and reward payout.
- Stage-clear interstitials with reward, accuracy, combo, next-stage preview, bonus-round warning, and new enemy warnings.
- Armory-forward game-over flow with affordable upgrade/unlock recommendations.
- Weapon-driven reticles, cooldown-readiness feedback, projectile traces, multishot chain traces, shotgun spread visualization, and laser lane feedback.
- Expanded 9-stage content arc with Jackpot Alley bonus round, Wraith Raven, Brute Raven, and Coin Rush powerup.
- Procedural arcade music and sound effects with persistent audio/motion settings.
- Stronger death sequence before the final run summary.
- Release tuning constants in `src/game/data/tuning.ts` for player stats, overflow stages, powerup behavior, combo pacing, and economy payouts.
- First-pass mobile tuning for touch hit forgiveness, compact HUD layout, touch-action handling, and mobile/reduced-motion particle caps.
- First-pass production-feel art pass with procedural set dressing for all six named stages and stronger cabinet HUD framing.
- Production audio polish with stage-aware procedural music motifs plus distinct weapon, enemy, powerup, boss warning, boss defeat, and stage-clear cues.
- Static release verification through `npm run release:verify`, including build output, deployable asset-link checks, and served `dist/` smoke coverage from a simulated GitHub Pages subpath.
- Deterministic balance report through `npm run balance:report`, with the current baseline recorded in `DOCS/BALANCE-NOTES.md`.
- GitHub Actions release verification and manual GitHub Pages deployment workflow documented in `DOCS/DEPLOYMENT-RUNBOOK.md`.
- V1 scope decision: local records only; online leaderboard and account features are deferred beyond the first public release.
- Manual release QA checklist in `DOCS/RELEASE-QA-CHECKLIST.md`.

## Remaining Before Public Release

- Add final original production visuals: final raven variants, boss sprite work, and richer UI cabinet art. Optional recorded music beds or SFX can replace the procedural audio if desired.
- Validate the economy and difficulty curve from real play sessions using `DOCS/BALANCE-NOTES.md` and the named tuning constants: early unlock timing, boss health, Jackpot Alley payout feel, new Wraith/Brute readability, powerup drop rates, stage length, and coin payouts.
- Run the release QA checklist: first-load, new save, returning save, all menu buttons, every weapon, every powerup, boss stage, game over, mobile layout, `npm run release:verify`, and GitHub Pages deploy.
- Validate mobile-specific tuning on real touch devices: hit radius, HUD density, pause affordance, and performance particle caps.

## Next Recommended Build Slices

1. Manual balance pass on the new 9-stage arc using `src/game/data/tuning.ts`, `src/game/data/stages.ts`, and the release QA checklist.
2. Final production asset pass using the existing raven/explosion assets, new Wraith/Brute color identities, and procedural stage art as seed references.
3. Mobile polish and deploy rehearsal.
