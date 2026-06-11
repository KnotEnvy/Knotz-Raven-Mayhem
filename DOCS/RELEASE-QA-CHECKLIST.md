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
- [ ] Confirm release-shell assets load from the deployed base path: favicon, app icons, manifest, social preview image, robots file, and sitemap.
- [ ] Confirm the page source contains the canonical URL, production title/description, Open Graph tags, Twitter card tags, theme color, and mobile/iOS web app tags.

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

- [ ] Mouse input fires, respects cooldown, hides the default cursor during play, and restores it on run report or menu return.
- [ ] Cooldown feedback is readable through the gun-driven reticle and "RECHARGE" feedback when firing too early.
- [ ] Burst Rifle, Scattergun, and Arc Laser show distinct projectile, spread, or lane traces.
- [ ] Touch input fires on a phone-sized viewport.
- [ ] Music changes between menu, normal stage runs, and boss fights without ignoring Music or SFX volume settings.
- [ ] Weapon shots, enemy hits, powerups, boss warning/defeat, stage clear, miss, and run-report cues are audible and distinct.
- [ ] Pause and resume work from the HUD button, Space, P, and Esc.
- [ ] Stage-clear interstitial shows a dramatic grade reveal, stars, grade percent, escaped ravens, grade-adjusted reward, stage aim, best combo, total coins, next-stage preview, Continue, Retry Stage, and Quit Run actions.
- [ ] Retry Stage from the stage-clear screen replays the same stage and rolls back the prior attempt's score, coins, stars, boss credit, shield changes, and grade record contribution.
- [ ] S-grade stage clears trigger a celebratory confetti burst without obscuring the stage-clear controls.
- [ ] Stage-clear interstitial waits until the stage quota has spawned and all active ravens and field powerups are gone.
- [ ] Continue, Space, or P advances from stage-clear to the next stage without spawning enemies underneath the overlay.
- [ ] Missed grade-eligible ravens become escaped ravens, lower the stage grade, reset combo pressure, and do not stop stage progression.
- [ ] Normal, fast, golden, armored, mini, shield, splitter, dive, wraith, and brute ravens appear across the staged run.
- [ ] Enemy reveals feel staggered: Stage 1 is readable, Stage 2 adds small/value targets, Stage 3 adds shields and the first boss, Stage 4 adds armor, Stage 5 adds split/dive pressure, Stage 8 adds wraiths, and Stage 9 adds brutes.
- [ ] Slow-Mo, Multi-Shot, Score Boost, Grade Shield, Overdrive, and Coin Rush can drop, be collected, and affect the HUD or run state.
- [ ] Stage 3 spawns and resolves the Raven King boss.
- [ ] Stage 6 spawns and resolves the Raven King boss.
- [ ] Stage 7 Jackpot Alley behaves as a bonus round where missed enemies do not lower stage stars.
- [ ] Stage 9 spawns and resolves the Raven King boss.
- [ ] Stage clear rewards and stage progression continue after boss stages.
- [ ] Quit Run from pause or stage clear banks earned coins and shows the run report.
- [ ] Run report shows newly earned coins, total stars, average grade, perfect stages, and useful armory recommendations.
- [ ] Run It Back starts a fresh run from the run-report screen.
- [ ] Open Armory routes directly to the Armory from the run-report screen, and Menu returns to the attract screen.

## Automated Mobile Layout Audit

`npm run audit:mobile` (with `npm run dev` serving; set `AUDIT_URL` if the port differs) drives headless Chrome/Edge through home, armory, records, options, credits, live HUD, pause, a synthetic S-rank stage clear, and the run report at 667x375, 740x360, 844x390, 932x430, 1180x820, and 1440x900. It screenshots every surface into `audit-shots/` and flags unreachable, clipped, or sub-36px tap targets.

- [ ] `npm run audit:mobile` reports 0 flagged issues.
- [ ] Spot-check the `audit-shots/` screenshots for visual regressions the probe cannot catch (overlap, contrast, truncation).

Last run 2026-06-11: 0 issues flagged across all six sizes after the HUD bar restructure, persistent-HUD patching fix, attract-shell scroll fix, and stage-clear/run-report compact tightening.

## Mobile And Accessibility

- [ ] Portrait phone view, such as 390x844, shows the landscape orientation gate clearly and returns cleanly to the game after rotating.
- [ ] Phone landscape viewports, including 667x375, 740x360, 844x390, 852x393, and 932x430, keep the attract screen, armory, records, options, pause, HUD, stage clear, and run report free of overlapping controls.
- [ ] Touch-only Stage 1 play works in phone landscape: firing, HUD Pause, Resume, Continue, Retry Stage, Quit Run, Run It Back, Open Armory, and Menu targets are reachable without browser scroll or gesture conflicts.
- [ ] Stage-clear grade UI fits in phone landscape with the dramatic grade, stars, grade-adjusted reward, escaped count, Retry Stage, Continue, and Quit Run actions readable and tappable.
- [ ] S-grade confetti in phone landscape does not cover the stage-clear actions and does not visibly tank framerate on a real device.
- [ ] Run report fits in phone landscape with total stars, average grade, perfect stages, coins, armory recommendations, and all action buttons usable.
- [ ] HUD remains readable in phone landscape while targets are still hittable and the lower-middle playfield is not blocked by persistent UI.
- [ ] Installed or home-screen PWA-style launch uses the correct title, icon, theme/background color, orientation, and relative start URL on at least one iOS and one Android device when available.
- [ ] Long-running attract mode and late-stage runs do not visibly slow down from accumulated ravens, powerups, traces, text, or particle effects.
- [ ] Reduced Motion disables major flash/shake effects and procedural music.
- [ ] Screen Shake off prevents camera shake while preserving core hit feedback.

## Release Deployment

- [ ] `dist/` contains `index.html` and static assets after `npm run build`.
- [ ] Production build works from the `/Knotz-Raven-Mayhem/` project path; `npm run release:check` and `npm run release:smoke` pass and Vite `base: './'` is preserved.
- [ ] GitHub Pages settings use Source: `GitHub Actions`, not the classic branch/folder Pages source.
- [ ] The `Release Verification` GitHub Actions workflow is green on the release commit.
- [ ] The `Deploy GitHub Pages` workflow has been run manually from `master` and the run event is `workflow_dispatch`.
- [ ] Published URL is `https://knotenvy.github.io/Knotz-Raven-Mayhem/`.
- [ ] Published build first-loads in a fresh browser profile with an empty local save.
- [ ] Published build loads with an existing local save from the prior release candidate.
- [ ] Final release notes list any remaining asset, mobile, leaderboard, or balance caveats.
