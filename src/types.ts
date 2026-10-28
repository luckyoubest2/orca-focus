import type { DbId } from "./orca"

export type TimerStatus = "running" | "paused"

/**
 * One pause of a focus timer. The journal receives a matching pair of entries:
 * a "暂停" entry covering the run segment that ends at `startMs`, and a "恢复"
 * entry starting at `endMs`.
 */
export interface PauseSegment {
  /** Epoch ms when this pause began (the 结束时间 of the 暂停 entry). */
  startMs: number
  /** Epoch ms when the timer was resumed; null while still paused. */
  endMs: number | null
  /** Epoch ms when the run segment closed by this pause had started. */
  runStartMs: number
  /** Optional reason typed in the pause dialog (journal text only). */
  note: string
  /** Journal block of the 暂停 entry; null until it is written. */
  blockId: DbId | null
}

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
  /** Custom action block inserted under the focused block while the timer is active. */
  actionBlockId: DbId | null
  /** Epoch ms of the last persistence write while running (crash recovery). */
  lastSeenAt: number
  /** Set when the timer was paused automatically because the app quit. */
  pausedByQuit?: boolean
  /** Pauses of this timer, oldest first (one open segment while paused). */
  pauses: PauseSegment[]
}

/** Shape persisted to localStorage / plugin data. */
export interface PersistedState {
  timers: FocusTimer[]
  savedAt: number
}

export type DialogState =
  | { kind: "start"; blockId: DbId; title: string }
  | { kind: "end"; timerId: string }
  | { kind: "note"; timerId: string; title: string }
  /** Optional pause reason; the timer pauses only when the dialog is confirmed. */
  | { kind: "pause"; timerId: string }
  /** Optional resume note; the timer resumes only when the dialog is confirmed. */
  | { kind: "resume"; timerId: string }

/** Snapshot kept after ending a timer so the action can be undone. */
export interface EndUndoRecord {
  timer: FocusTimer
  /** Active (non-paused) elapsed time at the moment the timer was ended. */
  elapsedAtEnd: number
  wasRunning: boolean
  endBlockId: DbId | null
  at: number
}
