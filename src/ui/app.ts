import { getUpgradeCost, UPGRADES } from '../game/data/upgrades';
import { CROSSHAIRS, WEAPONS } from '../game/data/weapons';
import type { CrosshairDefinition, GameSettings, SaveData, UpgradeDefinition, WeaponDefinition } from '../game/types';
import { dispatchCommand, onUiState, type UiState } from './events';

const root = () => document.getElementById('ui-root');

export function initializeUi(): void {
  onUiState(render);

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const actionEl = target?.closest<HTMLElement>('[data-action]');
    if (!actionEl) return;

    const action = actionEl.dataset.action;
    const id = actionEl.dataset.id;
    if (!action) return;

    dispatchCommand(action as Parameters<typeof dispatchCommand>[0], { id });
  });
}

function render(state: UiState): void {
  const uiRoot = root();
  if (!uiRoot) return;

  uiRoot.className = `ui-root ui-${state.screen}`;

  if (state.screen === 'blank') {
    uiRoot.innerHTML = '';
    return;
  }

  if (state.screen === 'attract') {
    uiRoot.innerHTML = renderAttract(state);
    return;
  }

  if (state.screen === 'hud') {
    uiRoot.innerHTML = renderHud(state);
    return;
  }

  if (state.screen === 'pause') {
    uiRoot.innerHTML = renderPause(state);
    return;
  }

  if (state.screen === 'stage-clear') {
    uiRoot.innerHTML = renderStageClear(state);
    return;
  }

  uiRoot.innerHTML = renderGameOver(state);
}

function renderAttract(state: Extract<UiState, { screen: 'attract' }>): string {
  return `
    <div class="crt-overlay" aria-hidden="true"></div>
    <main class="attract-shell">
      <section class="cabinet-title">
        <p class="eyebrow">KNOTZ ARCADE SYSTEM 1996</p>
        <h1><span>Knotz</span><span>Raven</span><span>Mayhem</span></h1>
        <p class="tagline">Aim sharp. Chain combos. Upgrade the shooter. Outlast the flock.</p>
      </section>
      <nav class="arcade-menu" aria-label="Main menu">
        <button class="primary-command" data-action="start-run">Start Run</button>
        <button data-action="open-armory">Armory</button>
        <button data-action="open-records">Records</button>
        <button data-action="open-options">Options</button>
        <button data-action="open-credits">Credits</button>
      </nav>
      ${state.mode === 'armory' ? renderArmory(state.save, state.weapons, state.crosshairs, state.upgrades) : ''}
      ${state.mode === 'records' ? renderRecords(state.save) : ''}
      ${state.mode === 'options' ? renderOptions(state.save.settings) : ''}
      ${state.mode === 'credits' ? renderCredits() : ''}
      ${state.mode === 'home' ? renderHomeStats(state.save) : ''}
      <footer class="coin-line">Press Start or click Start Run. Space pauses during play.</footer>
    </main>
  `;
}

function renderHomeStats(save: SaveData): string {
  return `
    <section class="arcade-panel compact-panel">
      <div>
        <span class="panel-label">Best Score</span>
        <strong>${save.highScore}</strong>
      </div>
      <div>
        <span class="panel-label">Best Stage</span>
        <strong>${save.bestStage}</strong>
      </div>
      <div>
        <span class="panel-label">Coins</span>
        <strong>${save.coins}</strong>
      </div>
    </section>
  `;
}

function renderOptions(settings: GameSettings): string {
  return `
    <section class="arcade-panel options-panel">
      <header class="panel-header">
        <div>
          <h2>Options</h2>
          <p>Cabinet settings are saved locally.</p>
        </div>
        <button data-action="show-home">Back</button>
      </header>
      <div class="settings-grid">
        ${renderSetting('Music', formatVolume(settings.musicVolume), 'musicVolume')}
        ${renderSetting('SFX', formatVolume(settings.sfxVolume), 'sfxVolume')}
        ${renderSetting('Screen Shake', settings.screenShake ? 'On' : 'Off', 'screenShake')}
        ${renderSetting('Motion', settings.reducedMotion ? 'Reduced' : 'Full', 'reducedMotion')}
      </div>
    </section>
  `;
}

function renderCredits(): string {
  return `
    <section class="arcade-panel credits-panel">
      <header class="panel-header">
        <div>
          <h2>Credits</h2>
          <p>Release candidate arcade build.</p>
        </div>
        <button data-action="show-home">Back</button>
      </header>
      <div class="credits-copy">
        <p><strong>Knotz Raven Mayhem</strong> is built from the original raven click-target prototype and expanded into a Phaser-powered arcade run game.</p>
        <p>Original seed assets: raven sprite, explosion sheet, and boom audio. Current build: Phaser runtime, roguelite progression, DOM arcade UI, procedural cabinet audio, and local save progression.</p>
      </div>
    </section>
  `;
}

function renderSetting(label: string, value: string, id: keyof GameSettings): string {
  return `
    <article class="setting-card">
      <div>
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
      <button data-action="cycle-setting" data-id="${id}">Change</button>
    </article>
  `;
}

function formatVolume(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function renderRecords(save: SaveData): string {
  return `
    <section class="arcade-panel records-panel">
      <header class="panel-header">
        <h2>Records</h2>
        <button data-action="show-home">Back</button>
      </header>
      <div class="record-grid">
        <div><span>High Score</span><strong>${save.highScore}</strong></div>
        <div><span>Best Stage</span><strong>${save.bestStage}</strong></div>
        <div><span>Best Combo</span><strong>${save.bestCombo}x</strong></div>
        <div><span>Lifetime Kills</span><strong>${save.lifetimeKills}</strong></div>
      </div>
      <button class="danger-command" data-action="reset-save">Reset Save</button>
    </section>
  `;
}

function renderArmory(
  save: SaveData,
  weapons: WeaponDefinition[],
  crosshairs: CrosshairDefinition[],
  upgrades: UpgradeDefinition[],
): string {
  return `
    <section class="arcade-panel armory-panel">
      <header class="panel-header">
        <div>
          <h2>Armory</h2>
          <p>${save.coins} coins available</p>
        </div>
        <button data-action="show-home">Back</button>
      </header>
      <div class="armory-columns">
        <div>
          <h3>Guns</h3>
          ${weapons.map((weapon) => renderWeaponCard(save, weapon)).join('')}
        </div>
        <div>
          <h3>Aim Mods</h3>
          <p class="column-note">Readability tuning. The live reticle now follows the equipped gun.</p>
          ${crosshairs.map((crosshair) => renderCrosshairCard(save, crosshair)).join('')}
        </div>
        <div>
          <h3>Stats</h3>
          ${upgrades.map((upgrade) => renderUpgradeCard(save, upgrade)).join('')}
        </div>
      </div>
    </section>
  `;
}

function renderWeaponCard(save: SaveData, weapon: WeaponDefinition): string {
  const unlocked = save.unlockedWeapons.includes(weapon.id);
  const selected = save.selectedWeapon === weapon.id;
  const action = unlocked ? 'select-weapon' : 'purchase-weapon';
  const label = selected ? 'Equipped' : unlocked ? 'Equip' : `Buy ${weapon.cost}`;

  return `
    <article class="loadout-card ${selected ? 'selected' : ''}">
      <div>
        <strong>${weapon.name}</strong>
        <span>${weapon.tagline}</span>
      </div>
      <button data-action="${action}" data-id="${weapon.id}" ${selected ? 'disabled' : ''}>${label}</button>
    </article>
  `;
}

function renderCrosshairCard(save: SaveData, crosshair: CrosshairDefinition): string {
  const unlocked = save.unlockedCrosshairs.includes(crosshair.id);
  const selected = save.selectedCrosshair === crosshair.id;
  const action = unlocked ? 'select-crosshair' : 'purchase-crosshair';
  const label = selected ? 'Equipped' : unlocked ? 'Equip' : `Buy ${crosshair.cost}`;

  return `
    <article class="loadout-card ${selected ? 'selected' : ''}">
      <div>
        <strong>${crosshair.name}</strong>
        <span>${crosshair.tagline}</span>
      </div>
      <button data-action="${action}" data-id="${crosshair.id}" ${selected ? 'disabled' : ''}>${label}</button>
    </article>
  `;
}

function renderUpgradeCard(save: SaveData, upgrade: UpgradeDefinition): string {
  const rank = save.upgrades[upgrade.id] ?? 0;
  const maxed = rank >= upgrade.maxRank;
  const label = maxed ? 'Max' : `Buy ${getUpgradeCost(upgrade, rank)}`;

  return `
    <article class="loadout-card ${maxed ? 'selected' : ''}">
      <div>
        <strong>${upgrade.name} ${rank}/${upgrade.maxRank}</strong>
        <span>${upgrade.tagline}</span>
      </div>
      <button data-action="purchase-upgrade" data-id="${upgrade.id}" ${maxed ? 'disabled' : ''}>${label}</button>
    </article>
  `;
}

function renderHud(state: Extract<UiState, { screen: 'hud' }>): string {
  const { snapshot, stage, weapon, crosshair } = state;
  const lifePips = Array.from({ length: snapshot.maxLives }, (_, index) => `<span class="${index < snapshot.lives ? 'on' : ''}"></span>`).join('');
  const progress = Math.min(100, (snapshot.stageKills / snapshot.stageTargetKills) * 100);
  const comboProgress = snapshot.comboWindowMs > 0 ? Math.max(0, (snapshot.comboTimerMs / snapshot.comboWindowMs) * 100) : 0;

  return `
    <div class="hud">
      <section class="hud-cluster score-cluster">
        <span>Score</span>
        <strong>${snapshot.score}</strong>
        <small>${weapon.name} / ${crosshair.name}</small>
      </section>
      <section class="hud-cluster stage-cluster">
        <span>Stage ${snapshot.stageIndex}</span>
        <strong>${stage.title}</strong>
        <div class="meter"><i style="width:${progress}%"></i></div>
      </section>
      <section class="hud-cluster life-cluster">
        <span>Lives</span>
        <div class="life-pips">${lifePips}</div>
        <button data-action="pause">Pause</button>
      </section>
      <section class="hud-cluster combo-cluster ${snapshot.comboMultiplier >= 4 ? 'hot' : ''}">
        <span>Combo</span>
        <strong>x${snapshot.comboMultiplier}</strong>
        <div class="meter combo-meter"><i style="width:${comboProgress}%"></i></div>
      </section>
      <section class="hud-cluster stat-strip">
        <span>Accuracy ${snapshot.accuracy}%</span>
        <span>Kills ${snapshot.kills}</span>
        <span>Coins +${snapshot.coinsEarned}</span>
      </section>
      ${snapshot.activePowerups.length ? renderPowerups(snapshot.activePowerups) : ''}
    </div>
  `;
}

function renderPowerups(powerups: Extract<UiState, { screen: 'hud' }>['snapshot']['activePowerups']): string {
  return `
    <section class="powerup-rack">
      ${powerups
        .map((powerup) => {
          const width = Math.max(0, (powerup.timeLeftMs / powerup.durationMs) * 100);
          return `<div><span>${powerup.label}</span><i style="width:${width}%"></i></div>`;
        })
        .join('')}
    </section>
  `;
}

function renderPause(state: Extract<UiState, { screen: 'pause' }>): string {
  const { snapshot, stage } = state;
  return `
    ${renderHud({ screen: 'hud', snapshot, stage, weapon: { name: snapshot.weaponName } as WeaponDefinition, crosshair: { name: snapshot.crosshairName } as CrosshairDefinition })}
    <section class="modal-screen pause-screen">
      <div class="modal-card">
        <p class="eyebrow">Cabinet Paused</p>
        <h2>Stage ${snapshot.stageIndex}: ${stage.title}</h2>
        <div class="record-grid">
          <div><span>Score</span><strong>${snapshot.score}</strong></div>
          <div><span>Accuracy</span><strong>${snapshot.accuracy}%</strong></div>
          <div><span>Best Combo</span><strong>${snapshot.bestCombo}x</strong></div>
          <div><span>Kills</span><strong>${snapshot.kills}</strong></div>
        </div>
        <div class="modal-actions">
          <button class="primary-command" data-action="resume">Resume</button>
          <button data-action="return-menu">Quit Run</button>
        </div>
      </div>
    </section>
  `;
}

function renderStageClear(state: Extract<UiState, { screen: 'stage-clear' }>): string {
  const { summary } = state;
  const { snapshot, currentStage, nextStage } = summary;
  const newThreats = summary.newEnemyLabels.length
    ? summary.newEnemyLabels.map((label) => `<span>${label}</span>`).join('')
    : '<span>Known flock mix</span>';

  return `
    ${renderHud({ screen: 'hud', snapshot, stage: currentStage, weapon: { name: snapshot.weaponName } as WeaponDefinition, crosshair: { name: snapshot.crosshairName } as CrosshairDefinition })}
    <section class="modal-screen stage-clear-screen">
      <div class="modal-card stage-clear-card">
        <p class="eyebrow">${summary.nextStageIsBonus ? 'Bonus Round Incoming' : 'Stage Clear'}</p>
        <h2>${currentStage.title}</h2>
        <div class="reward-line">
          <span>Stage reward</span>
          <strong>+${summary.rewardCoins}</strong>
        </div>
        <div class="record-grid">
          <div><span>Accuracy</span><strong>${snapshot.accuracy}%</strong></div>
          <div><span>Best Combo</span><strong>${snapshot.bestCombo}x</strong></div>
          <div><span>Total Coins</span><strong>+${snapshot.coinsEarned}</strong></div>
          <div><span>Kills</span><strong>${snapshot.kills}</strong></div>
        </div>
        <section class="next-stage-card">
          <span>Next</span>
          <strong>${nextStage.title}</strong>
          <p>${nextStage.subtitle}</p>
          <div class="threat-chips">${newThreats}</div>
        </section>
        <div class="modal-actions">
          <button class="primary-command" data-action="continue-stage">Continue</button>
          <button data-action="return-menu">Quit Run</button>
        </div>
      </div>
    </section>
  `;
}

function renderGameOver(state: Extract<UiState, { screen: 'gameover' }>): string {
  const { snapshot, rewards, save } = state;
  const recommendations = renderArmoryRecommendations(save);
  return `
    <div class="crt-overlay heavy" aria-hidden="true"></div>
    <section class="modal-screen gameover-screen">
      <div class="modal-card gameover-card">
        <p class="eyebrow">${rewards.newHighScore ? 'New High Score' : 'Run Complete'}</p>
        <h2>Game Over</h2>
        <div class="final-score">${snapshot.score}</div>
        <div class="record-grid">
          <div><span>Stage</span><strong>${snapshot.stageIndex}</strong></div>
          <div><span>Accuracy</span><strong>${snapshot.accuracy}%</strong></div>
          <div><span>Best Combo</span><strong>${snapshot.bestCombo}x</strong></div>
          <div><span>Kills</span><strong>${snapshot.kills}</strong></div>
        </div>
        <div class="reward-line">
          <span>Coins earned</span>
          <strong>+${rewards.totalCoins}</strong>
        </div>
        ${recommendations}
        <div class="modal-actions">
          <button class="primary-command" data-action="open-armory">Open Armory</button>
          <button data-action="restart-run">Run It Back</button>
          <button data-action="return-menu">Menu</button>
        </div>
      </div>
    </section>
  `;
}

function renderArmoryRecommendations(save: SaveData): string {
  const recommendations = [
    ...UPGRADES.map((upgrade) => {
      const rank = save.upgrades[upgrade.id] ?? 0;
      return rank >= upgrade.maxRank
        ? null
        : {
            label: `${upgrade.name} ${rank + 1}/${upgrade.maxRank}`,
            cost: getUpgradeCost(upgrade, rank),
            type: 'Upgrade',
          };
    }),
    ...WEAPONS.filter((weapon) => !save.unlockedWeapons.includes(weapon.id)).map((weapon) => ({
      label: weapon.name,
      cost: weapon.cost,
      type: 'Gun',
    })),
    ...CROSSHAIRS.filter((crosshair) => !save.unlockedCrosshairs.includes(crosshair.id)).map((crosshair) => ({
      label: crosshair.name,
      cost: crosshair.cost,
      type: 'Aim Mod',
    })),
  ]
    .filter((item): item is { label: string; cost: number; type: string } => item !== null)
    .sort((a, b) => a.cost - b.cost);

  const affordable = recommendations.filter((item) => item.cost <= save.coins).slice(0, 3);
  const near = recommendations.filter((item) => item.cost > save.coins).slice(0, 2);

  if (affordable.length === 0 && near.length === 0) {
    return '<section class="recommendation-panel"><strong>Armory complete</strong><span>Spend-free run. Chase records.</span></section>';
  }

  const rows = (affordable.length ? affordable : near)
    .map((item) => `<div><span>${item.type}</span><strong>${item.label}</strong><em>${item.cost} coins</em></div>`)
    .join('');
  const title = affordable.length ? 'Ready to buy' : 'Next targets';

  return `
    <section class="recommendation-panel">
      <strong>${title}</strong>
      <div>${rows}</div>
    </section>
  `;
}
