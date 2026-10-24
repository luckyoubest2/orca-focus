// Plugin-wide constants and the runtime plugin key.
//
// Orca derives the plugin name from its folder name, so every identifier is
// prefixed with "orca-focus." and the actual plugin key is provided at load
// time via `load(pluginName)`.

export const PLUGIN_ID = "orca-focus"

/** Custom panel view type registered through `orca.panels.registerPanel`. */
export const PANEL_VIEW = "orca-focus.focusPanel"

export const CMD_OPEN_PANEL = "orca-focus.openPanel"
export const CMD_OPEN_HISTORY = "orca-focus.openHistory"
export const CMD_START_CURRENT = "orca-focus.startCurrent"
export const CMD_TOGGLE_CURRENT = "orca-focus.toggleCurrent"
export const CMD_END_CURRENT = "orca-focus.endCurrent"
export const CMD_NOTE_CURRENT = "orca-focus.noteCurrent"
export const CMD_UNDO_END = "orca-focus.undoLastEnd"
export const CMD_CLEAN_ACTION_BLOCKS = "orca-focus.cleanActionBlocks"

export const ACTION_BLOCK_TYPE = "orca-focus.actions"
export const HEADBAR_ID = "orca-focus.headbar"
export const BLOCK_MENU_ID = "orca-focus.blockMenu"
export const STYLE_ROLE = "orca-focus"
export const DIALOG_HOST_ID = "orca-focus-dialog-host"

/** Plugin-data key that mirrors the timer list for durability. */
export const DATA_KEY_TIMERS = "timers"

/** UI re-render / elapsed recalculation interval. */
export const TICK_MS = 1000
/** Heartbeat interval for crash recovery while timers are running. */
export const HEARTBEAT_MS = 5000

let pluginKey = PLUGIN_ID

export function setPluginKey(name: string): void {
  pluginKey = name
}

export function getPluginKey(): string {
  return pluginKey
}

export function localStorageKey(repo: string | undefined | null): string {
  return `orca-focus:${repo ?? "default"}:timers`
}
