import {
  DATA_KEY_TIMERS,
  HEARTBEAT_MS,
  TICK_MS,
  getPluginKey,
  localStorageKey,
} from "./config"
import type { DialogState, EndUndoRecord, FocusTimer, PersistedState } from "./types"
import { getSettings } from "./lib/settings"
import { makeSessionId, uid } from "./lib/util"

const Valtio = (window as any).Valtio as any

interface StoreState {
  timers: FocusTimer[]
  /** Bumped whenever a journal entry is written/removed so the history view refreshes. */
  historyVersion: number
  now: number
  dialog: DialogState | null
  lastEndUndo: EndUndoRecord | null
  notice: string | null
  ready: boolean
}

export const store: StoreState = Valtio.proxy({
  timers: [],
  historyVersion: 0,
  now: Date.now(),
  dialog: null,
  lastEndUndo: null,
  notice: null,
  ready: false,
}) as StoreState

let tickHandle: ReturnType<typeof setInterval> | null = null
let heartbeatHandle: ReturnType<typeof setInterval> | null = null
let pluginSaveHandle: ReturnType<typeof setTimeout> | null = null
let quitHandler: (() => void) | null = null
let initialized = false

function repoId(): string | undefined {
  return (orca.state as any).repo
}

export function elapsedMs(timer: FocusTimer, now: number = Date.now()): number {
  const base = Number.isFinite(timer.accumulatedMs) ? Math.max(0, timer.accumulatedMs) : 0
  if (timer.status === "running" && timer.startedAt > 0) {
    return base + Math.max(0, now - timer.startedAt)
  }
  return base
}

function serialize(): PersistedState {
  return {
    timers: JSON.parse(JSON.stringify(store.timers)) as FocusTimer[],
    savedAt: Date.now(),
  }
}

function writeLocal(state: PersistedState): void {
  try {
    window.localStorage.setItem(localStorageKey(repoId()), JSON.stringify(state))
  } catch (e) {
    console.warn("[orca-focus] localStorage write failed", e)
  }
}

function readLocal(): PersistedState | null {
  try {
    const raw = window.localStorage.getItem(localStorageKey(repoId()))
    if (!raw) return null
    return parsePersisted(raw)
  } catch (e) {
    console.warn("[orca-focus] localStorage read failed", e)
    return null
  }
}

async function readPluginData(): Promise<PersistedState | null> {
  try {
    const raw = await orca.plugins.getData(getPluginKey(), DATA_KEY_TIMERS)
    if (typeof raw === "string") return parsePersisted(raw)
    return null
  } catch (e) {
    console.warn("[orca-focus] plugin data read failed", e)
    return null
  }
}

function parsePersisted(raw: string): PersistedState | null {
  try {
    const parsed = JSON.parse(raw) as PersistedState
    if (!parsed || !Array.isArray(parsed.timers)) return null
    return parsed
  } catch {
    return null
  }
}

function normalizeTimer(raw: any): FocusTimer | null {
  if (raw == null || typeof raw !== "object") return null
  if (typeof raw.id !== "string" || typeof raw.blockId !== "number") return null
  const status: FocusTimer["status"] = raw.status === "running" ? "running" : "paused"
  const startedAt = Number(raw.startedAt) || 0
  const accumulatedMs = Number(raw.accumulatedMs) || 0
  const createdAt = Number(raw.createdAt) || Date.now()
  return {
    id: raw.id,
    sessionId:
      typeof raw.sessionId === "string" && raw.sessionId.length > 0
        ? raw.sessionId
        : makeSessionId(new Date(createdAt)),
    blockId: raw.blockId,
    title: typeof raw.title === "string" ? raw.title : "",
    status,
    startedAt: status === "running" ? startedAt || Date.now() : 0,
    accumulatedMs: Math.max(0, accumulatedMs),
    createdAt,
    startNote: typeof raw.startNote === "string" ? raw.startNote : "",
    startLogBlockId: typeof raw.startLogBlockId === "number" ? raw.startLogBlockId : null,
    lastSeenAt: Number(raw.lastSeenAt) || Date.now(),
    pausedByQuit: raw.pausedByQuit === true,
  }
}

function pickNewer(
  local: PersistedState | null,
  fromPlugin: PersistedState | null,
): PersistedState | null {
  if (local == null) return fromPlugin
  if (fromPlugin == null) return local
  return (local.savedAt ?? 0) >= (fromPlugin.savedAt ?? 0) ? local : fromPlugin
}

export interface InitResult {
  restoredCount: number
  crashPausedCount: number
  quitPausedCount: number
}

/** Read persisted timers, recover from a quit/crash and start the clocks. */
export async function initStore(): Promise<InitResult> {
  if (initialized) return { restoredCount: 0, crashPausedCount: 0, quitPausedCount: 0 }
  initialized = true

  const local = readLocal()
  const fromPlugin = await readPluginData()
  const chosen = pickNewer(local, fromPlugin)
  const settings = getSettings()
  const timers: FocusTimer[] = []
  let crashPausedCount = 0
  let quitPausedCount = 0

  for (const raw of chosen?.timers ?? []) {
    const timer = normalizeTimer(raw)
    if (!timer) continue
    if (timer.status === "running") {
      if (settings.autoPauseOnExit) {
        // The app was closed (or crashed) while the timer was running: pause it
        // at the last heartbeat so the offline time is not charged to the session.
        const lastSeen = Math.max(timer.lastSeenAt || 0, timer.startedAt || 0)
        timer.accumulatedMs = timer.accumulatedMs + Math.max(0, lastSeen - timer.startedAt)
        timer.startedAt = 0
        timer.status = "paused"
        timer.lastSeenAt = Date.now()
        crashPausedCount += 1
      } else {
        timer.lastSeenAt = Date.now()
      }
    } else if (timer.pausedByQuit) {
      quitPausedCount += 1
      timer.pausedByQuit = false
    }
    timers.push(timer)
  }

  store.timers = timers
  store.now = Date.now()
  store.ready = true
  saveState()

  startClocks()
  attachQuitHandler()

  const restoredCount = timers.length
  if (crashPausedCount > 0) {
    store.notice = `上次退出时自动暂停了 ${crashPausedCount} 个专注计时。`
  } else if (quitPausedCount > 0) {
    store.notice = `上次退出时自动暂停了 ${quitPausedCount} 个专注计时，可在面板里继续。`
  }
  return { restoredCount, crashPausedCount, quitPausedCount }
}

export function startClocks(): void {
  if (tickHandle == null) {
    tickHandle = setInterval(() => {
      store.now = Date.now()
    }, TICK_MS)
  }
  if (heartbeatHandle == null) {
    heartbeatHandle = setInterval(() => {
      const running = store.timers.filter((timer) => timer.status === "running")
      if (running.length === 0) return
      const now = Date.now()
      for (const timer of running) timer.lastSeenAt = now
      writeLocal(serialize())
    }, HEARTBEAT_MS)
  }
}

function attachQuitHandler(): void {
  if (quitHandler != null) return
  quitHandler = () => {
    const settings = getSettings()
    const now = Date.now()
    if (settings.autoPauseOnExit) {
      for (const timer of store.timers) {
        if (timer.status !== "running") continue
        timer.accumulatedMs = elapsedMs(timer, now)
        timer.startedAt = 0
        timer.status = "paused"
        timer.lastSeenAt = now
        timer.pausedByQuit = true
      }
    } else {
      for (const timer of store.timers) {
        if (timer.status === "running") timer.lastSeenAt = now
      }
    }
    writeLocal({ ...serialize(), quitAt: now })
    // Best-effort durable copy; the synchronous localStorage write above is the
    // one guaranteed to land before the window goes away.
    void orca.plugins
      .setData(getPluginKey(), DATA_KEY_TIMERS, JSON.stringify({ ...serialize(), quitAt: now }))
      .catch(() => {})
  }
  window.addEventListener("beforeunload", quitHandler)
  window.addEventListener("pagehide", quitHandler)
}

export function disposeStore(): void {
  if (quitHandler != null) {
    window.removeEventListener("beforeunload", quitHandler)
    window.removeEventListener("pagehide", quitHandler)
    quitHandler = null
  }
  if (tickHandle != null) {
    clearInterval(tickHandle)
    tickHandle = null
  }
  if (heartbeatHandle != null) {
    clearInterval(heartbeatHandle)
    heartbeatHandle = null
  }
  if (pluginSaveHandle != null) {
    clearTimeout(pluginSaveHandle)
    pluginSaveHandle = null
  }
  // Allow a later re-enable of the plugin to re-read persisted timers.
  initialized = false
  store.ready = false
}

function schedulePluginSave(): void {
  if (pluginSaveHandle != null) clearTimeout(pluginSaveHandle)
  pluginSaveHandle = setTimeout(() => {
    pluginSaveHandle = null
    const payload = JSON.stringify(serialize())
    void orca.plugins.setData(getPluginKey(), DATA_KEY_TIMERS, payload).catch((e) => {
      console.warn("[orca-focus] plugin data write failed", e)
    })
  }, 300)
}

export function saveState(): void {
  writeLocal(serialize())
  schedulePluginSave()
}

/** Immediately persist to both stores (used on plugin unload / disable). */
export async function flushState(): Promise<void> {
  if (pluginSaveHandle != null) {
    clearTimeout(pluginSaveHandle)
    pluginSaveHandle = null
  }
  writeLocal(serialize())
  try {
    await orca.plugins.setData(getPluginKey(), DATA_KEY_TIMERS, JSON.stringify(serialize()))
  } catch (e) {
    console.warn("[orca-focus] plugin data flush failed", e)
  }
}

// --- timer mutations -------------------------------------------------------

export function createTimer(blockId: number, title: string, startNote: string): FocusTimer {
  const now = Date.now()
  const timer: FocusTimer = {
    id: uid(),
    sessionId: makeSessionId(new Date(now)),
    blockId,
    title,
    status: "running",
    startedAt: now,
    accumulatedMs: 0,
    createdAt: now,
    startNote: startNote.trim(),
    startLogBlockId: null,
    lastSeenAt: now,
  }
  store.timers.push(timer)
  store.now = now
  saveState()
  return timer
}

export function getTimer(id: string): FocusTimer | null {
  return store.timers.find((timer) => timer.id === id) ?? null
}

export function getTimerForBlock(blockId: number): FocusTimer | null {
  const matches = store.timers.filter((timer) => timer.blockId === blockId)
  if (matches.length === 0) return null
  return matches.find((timer) => timer.status === "running") ?? matches[0]
}

export function pauseTimer(id: string): boolean {
  const timer = getTimer(id)
  if (!timer || timer.status !== "running") return false
  const now = Date.now()
  timer.accumulatedMs = elapsedMs(timer, now)
  timer.startedAt = 0
  timer.status = "paused"
  timer.lastSeenAt = now
  timer.pausedByQuit = false
  store.now = now
  saveState()
  return true
}

export function resumeTimer(id: string): boolean {
  const timer = getTimer(id)
  if (!timer || timer.status === "running") return false
  timer.status = "running"
  timer.startedAt = Date.now()
  timer.lastSeenAt = Date.now()
  timer.pausedByQuit = false
  store.now = Date.now()
  saveState()
  return true
}

export function pauseAllRunning(): number {
  let count = 0
  const now = Date.now()
  for (const timer of store.timers) {
    if (timer.status !== "running") continue
    timer.accumulatedMs = elapsedMs(timer, now)
    timer.startedAt = 0
    timer.status = "paused"
    timer.lastSeenAt = now
    count += 1
  }
  if (count > 0) {
    store.now = now
    saveState()
  }
  return count
}

/** Drop a timer without writing a journal entry. */
export function discardTimer(id: string): boolean {
  const index = store.timers.findIndex((timer) => timer.id === id)
  if (index < 0) return false
  store.timers.splice(index, 1)
  saveState()
  return true
}

/** Remove a timer after its end entry was written. */
export function removeTimer(id: string): FocusTimer | null {
  const index = store.timers.findIndex((timer) => timer.id === id)
  if (index < 0) return null
  const [timer] = store.timers.splice(index, 1)
  saveState()
  return timer
}

/** Put a timer back (used by undo). */
export function restoreTimer(timer: FocusTimer): void {
  if (store.timers.some((existing) => existing.id === timer.id)) return
  store.timers.push(timer)
  store.now = Date.now()
  saveState()
}

export function setTimerStartLog(id: string, blockId: number | null): void {
  const timer = getTimer(id)
  if (!timer) return
  timer.startLogBlockId = blockId
  saveState()
}

export function setTimerTitle(id: string, title: string): void {
  const timer = getTimer(id)
  if (!timer || !title) return
  timer.title = title
}

/** Make sure a timer has a session id (old persisted timers may not). */
export function ensureSessionId(timer: FocusTimer): string {
  if (typeof timer.sessionId === "string" && timer.sessionId.length > 0) return timer.sessionId
  timer.sessionId = makeSessionId(new Date(timer.createdAt))
  saveState()
  return timer.sessionId
}

/** Notify the history view that journal entries changed. */
export function bumpHistoryVersion(): void {
  store.historyVersion += 1
}

// --- dialogs ---------------------------------------------------------------

export function openStartDialog(blockId: number, title: string): void {
  store.dialog = { kind: "start", blockId, title }
}

export function openEndDialog(timerId: string): void {
  store.dialog = { kind: "end", timerId }
}

export function openNoteDialog(timerId: string, title: string): void {
  store.dialog = { kind: "note", timerId, title }
}

export function closeDialog(): void {
  store.dialog = null
}

// --- end undo --------------------------------------------------------------

export function pushEndUndo(record: EndUndoRecord): void {
  store.lastEndUndo = record
}

export function peekEndUndo(): EndUndoRecord | null {
  return store.lastEndUndo
}

export function clearEndUndo(): void {
  store.lastEndUndo = null
}

// --- misc ------------------------------------------------------------------

export function setNotice(notice: string | null): void {
  store.notice = notice
}

export function useFocusStore(): StoreState {
  return (window as any).Valtio.useSnapshot(store) as StoreState
}
