import type { DbId } from "./orca"

export type TimerStatus = "running" | "paused"

/** One focus timer. Timers can run concurrently. */
export interface FocusTimer {
  /** Local unique id (stable across persistence reloads). */
  id: string
  /** Stable focus-session id shared by the start/note/end journal entries. */
  sessionId: string
  /** Real block id (mirror blocks are resolved to their target). */
  blockId: DbId
  /** Cached display title of the source block. */
  title: string
  status: TimerStatus
  /** Epoch ms when the current running segment started; 0 while paused. */
  startedAt: number
  /** Milliseconds accumulated by finished running segments. */
  accumulatedMs: number
  /** Epoch ms of the first start of the session (used for log timestamps). */
  createdAt: number
  /** Optional intent typed when the timer was started. */
  startNote: string
  /** Journal block id of the optional "start entry", when a start note was written. */
  startLogBlockId: DbId | null
  /** Custom action block inserted under the focused block while the timer is active. */
  actionBlockId: DbId | null
  /** Epoch ms of the last persistence write while running (crash recovery). */
  lastSeenAt: number
  /** Set when the timer was paused automatically because the app quit. */
  pausedByQuit?: boolean
}

/** Shape persisted to localStorage / plugin data. */
export interface PersistedState {
  timers: FocusTimer[]
  savedAt: number
  /** Set right before the window unloads, used to explain auto-pauses on next launch. */
  quitAt?: number
}

export type DialogState =
  | { kind: "start"; blockId: DbId; title: string }
  | { kind: "end"; timerId: string }
  | { kind: "note"; timerId: string; title: string }

/** Snapshot kept after ending a timer so the action can be undone. */
export interface EndUndoRecord {
  timer: FocusTimer
  /** Active (non-paused) elapsed time at the moment the timer was ended. */
  elapsedAtEnd: number
  wasRunning: boolean
  endBlockId: DbId | null
  at: number
  /** Panel whose editor holds the undo step for the end-entry writes. */
  editorPanelId: string
}
