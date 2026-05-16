import type {
  CrosshairDefinition,
  EnemyDefinition,
  RunRewards,
  RunSnapshot,
  SaveData,
  StageClearSummary,
  StageDefinition,
  UpgradeDefinition,
  WeaponDefinition,
} from '../game/types';

export type UiState =
  | {
      screen: 'attract';
      mode: 'home' | 'armory' | 'records' | 'options' | 'credits' | 'raven-guide' | 'field-guide' | 'upgrade-guide' | 'armory-guide';
      save: SaveData;
      weapons: WeaponDefinition[];
      crosshairs: CrosshairDefinition[];
      upgrades: UpgradeDefinition[];
      enemies: EnemyDefinition[];
    }
  | {
      screen: 'hud';
      snapshot: RunSnapshot;
      stage: StageDefinition;
      weapon: WeaponDefinition;
      crosshair: CrosshairDefinition;
    }
  | {
      screen: 'pause';
      snapshot: RunSnapshot;
      stage: StageDefinition;
    }
  | {
      screen: 'stage-clear';
      summary: StageClearSummary;
    }
  | {
      screen: 'gameover';
      snapshot: RunSnapshot;
      rewards: RunRewards;
      save: SaveData;
    }
  | {
      screen: 'blank';
    };

export type CommandName =
  | 'start-run'
  | 'open-armory'
  | 'open-records'
  | 'open-options'
  | 'open-credits'
  | 'show-home'
  | 'restart-run'
  | 'return-menu'
  | 'pause'
  | 'resume'
  | 'continue-stage'
  | 'reset-save'
  | 'purchase-weapon'
  | 'select-weapon'
  | 'purchase-crosshair'
  | 'select-crosshair'
  | 'purchase-upgrade'
  | 'cycle-setting';

export interface CommandDetail {
  id?: string;
}

const UI_STATE_EVENT = 'knotz:ui-state';
const commandEvent = (command: CommandName) => `knotz:${command}`;

export function dispatchUiState(state: UiState): void {
  window.dispatchEvent(new CustomEvent<UiState>(UI_STATE_EVENT, { detail: state }));
}

export function onUiState(handler: (state: UiState) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<UiState>).detail);
  window.addEventListener(UI_STATE_EVENT, listener);
  return () => window.removeEventListener(UI_STATE_EVENT, listener);
}

export function dispatchCommand(command: CommandName, detail: CommandDetail = {}): void {
  window.dispatchEvent(new CustomEvent<CommandDetail>(commandEvent(command), { detail }));
}

export function onCommand(command: CommandName, handler: (detail: CommandDetail) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<CommandDetail>).detail);
  window.addEventListener(commandEvent(command), listener);
  return () => window.removeEventListener(commandEvent(command), listener);
}
