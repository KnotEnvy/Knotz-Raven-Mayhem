# Knotz Raven Mayhem Release QA Checklist

Use this checklist for the final manual release pass before publishing `dist/` to GitHub Pages or another static host. Record failures with the browser, viewport, save state, and reproduction steps.

## Environment

- [ ] Run `npm install` if dependencies are not already present.
- [ ] Run `npm run balance:report` and review `DOCS/BALANCE-NOTES.md` before manual economy tuning.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Run `npm run release:check`, `npm run release:smoke`, or `npm run release:verify` for the full build-and-served-output gate.
- [ ] Serve the production build with `npm run preview` or an equivalent static server.
- [ ] Confirm first load has no console errors and all seed assets load from the deployed base path.

## Save States

- [ ] New save starts on the attract screen with 0 coins, Stage 1 as best stage, Quarter Pistol, and Stock Cabinet.
- [ ] Returning save preserves coins, high score, best stage, best combo, selected weapon, selected Assist Chip, upgrades, and settings.
- [ ] Reset Save clears progress and immediately refreshes the Records screen.

## Menu Flow

- [ ] Start Run enters gameplay from the attract screen.
- [ ] Armory opens, backs out to Home, and keeps its scroll area usable.
- [ ] Records opens, displays current local records, and backs out to Home.
- [ ] Options cycles music volume, SFX volume, screen shake, and motion settings.
- [ ] Credits opens and backs out to Home.

## Armory And Economy

- [ ] Each weapon can be purchased when the save has enough coins: Burst Rifle, Scattergun, and Arc Laser.
- [ ] Purchased weapons can be equipped and are reflected in the HUD.
- [ ] Each Assist Chip can be purchased and installed: Turbo Capacitor, Threat Scanner, and Chaos Net.
- [ ] Each permanent upgrade can be purchased to max rank and stops charging coins at max rank.
- [ ] Coin rewards after a run feel sufficient for an early upgrade or unlock within the first few successful runs.
- [ ] Manual playtest observations still agree with the baseline in `DOCS/BALANCE-NOTES.md`, or the tuning constants have been adjusted and the report rerun.

## Gameplay

- [ ] Mouse input fires, respects cooldown, hides the default cursor during play, and restores it on game over.
- [ ] Cooldown feedback is readable through the gun-driven reticle and "RECHARGE" feedback when firing too early.
- [ ] Burst Rifle, Scattergun, and Arc Laser show distinct projectile, spread, or lane traces.
- [ ] Touch input fires on a phone-sized viewport.
- [ ] Music changes between menu, normal stage runs, and boss fights without ignoring Music or SFX volume settings.
- [ ] Weapon shots, enemy hits, powerups, boss warning/defeat, stage clear, miss, and game-over cues are audible and distinct.
- [ ] Pause and resume work from the HUD button, Space, P, and Esc.
- [ ] Stage-clear interstitial shows reward, accuracy, best combo, total coins, next-stage preview, and a Continue action.
- [ ] Continue, Space, or P advances from stage-clear to the next stage without spawning enemies underneath the overlay.
- [ ] Missed ravens remove lives and trigger game over at 0 lives.
- [ ] Normal, fast, golden, armored, mini, shield, splitter, dive, wraith, and brute ravens appear across the staged run.
- [ ] Enemy reveals feel staggered: Stage 1 is readable, Stage 2 adds small/value targets, Stage 3 adds shields and the first boss, Stage 4 adds armor, Stage 5 adds split/dive pressure, Stage 8 adds wraiths, and Stage 9 adds brutes.
- [ ] Slow-Mo, Multi-Shot, Score Boost, Extra Life, Overdrive, and Coin Rush can drop, be collected, and affect the HUD or run state.
- [ ] Stage 3 spawns and resolves the Raven King boss.
- [ ] Stage 6 spawns and resolves the Raven King boss.
- [ ] Stage 7 Jackpot Alley behaves as a bonus round where missed enemies do not remove lives.
- [ ] Stage 9 spawns and resolves the Raven King boss.
- [ ] Stage clear rewards and stage progression continue after boss stages.
- [ ] Game over sequence plays before the final summary.
- [ ] Game over shows newly earned coins and useful armory recommendations.
- [ ] Run It Back starts a fresh run from the game-over screen.
- [ ] Open Armory routes directly to the Armory from the game-over screen, and Menu returns to the attract screen.

## Mobile And Accessibility

- [ ] Attract screen, armory, records, options, pause, HUD, and game over fit at 390x844 without overlapping controls.
- [ ] HUD remains readable at 390x844 while targets are still hittable.
- [ ] Reduced Motion disables major flash/shake effects and procedural music.
- [ ] Screen Shake off prevents camera shake while preserving core hit feedback.

## Release Deployment

- [ ] `dist/` contains `index.html` and static assets after `npm run build`.
- [ ] Production build works from a non-root static path; `npm run release:check` and `npm run release:smoke` pass and Vite `base: './'` is preserved.
- [ ] GitHub Pages settings use Source: `GitHub Actions`, not the classic branch/folder Pages source.
- [ ] The `Release Verification` GitHub Actions workflow is green on the release commit.
- [ ] The `Deploy GitHub Pages` workflow has been run manually from `master` and the run event is `workflow_dispatch`.
- [ ] Published build first-loads in a fresh browser profile with an empty local save.
- [ ] Published build loads with an existing local save from the prior release candidate.
- [ ] Final release notes list any remaining asset, mobile, leaderboard, or balance caveats.
