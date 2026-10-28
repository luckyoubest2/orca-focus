import type { DbId } from "./orca"
import { blockExists, blockTitle, ensureBlock, getMirrorId } from "./data/blocks"
import { ensureActionBlock, removeActionBlock } from "./data/actionBlock"
import {
  deleteEntry,
  writeEndEntry,
  writeNoteEntry,
  writePauseEntry,
  writeResumeEntry,
  writeStartEntry,
} from "./data/log"
import { openFocusPanel } from "./lib/panels"
import { formatDurationHuman } from "./lib/util"
import { getSettings } from "./lib/settings"
import {
  bumpHistoryVersion,
  clearEndUndo,
  closeDialog,
  closeOpenPause,
  createTimer,
  discardTimer,
  elapsedMs,
  ensureSessionId,
  findPause,
  getTimer,
  getTimerForBlock,
  openEndDialog,
  openNoteDialog,
  openPauseDialog,
  openResumeDialog,
  openStartDialog,
  pauseAllRunning,
  pauseTimer,
  peekEndUndo,
  pushEndUndo,
  removeTimer,
  restoreTimer,
  resumeTimer,
  setPauseBlockId,
  setPauseNote,
  store,
} from "./store"
import type { EndUndoRecord, FocusTimer, PauseSegment } from "./types"

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function notifyError(message: string): void {
  orca.notify("error", message, { title: "专注" })
}

/** Right-click / command entry point: open the optional-intent start dialog. */
export async function requestStartFocus(blockId: DbId): Promise<void> {
  const realId = getMirrorId(blockId)
  const existing = getTimerForBlock(realId)
  if (existing) {
    if (existing.status === "paused") {
      requestResumeFocus(existing.id)
    } else {
      orca.notify("info", `这个块已经在专注中：${existing.title}`)
    }
    return
  }
  const block = await ensureBlock(realId)
  if (block == null) {
    notifyError("找不到这个块，无法开始专注。")
    return
  }
  openStartDialog(realId, blockTitle(block) || "未命名块")
}

/**
 * Start dialog confirmed. A "start entry" is always written (the note is
 * optional content, like the summary of the end entry).
 */
export async function confirmStartFocus(note: string): Promise<void> {
  const dialog = store.dialog
  if (dialog?.kind !== "start") return
  closeDialog()
  const block = await ensureBlock(dialog.blockId)
  if (block == null) {
    notifyError("找不到这个块，无法开始专注。")
    return
  }
  const timer = createTimer(dialog.blockId, blockTitle(block) || dialog.title, note)
  ensureSessionId(timer)
  try {
    await ensureActionBlock(timer)
  } catch (e) {
    console.warn("[orca-focus] failed to insert action block on start", e)
  }
  if (getSettings().autoOpenPanel) openFocusPanel()
  try {
    await writeStartEntry(timer)
    bumpHistoryVersion()
  } catch (error) {
    console.warn("[orca-focus] start entry write failed", error)
    orca.notify("error", `「开始专注」记录写入日志失败：${errorText(error)}（计时已开始，请检查今天的日记是否存在）`, {
      title: "专注",
    })
  }
}

/** Open the mid-session note dialog for a block that currently has a timer. */
export function requestFocusNoteForBlock(blockId: DbId): void {
  const realId = getMirrorId(blockId)
  const timer = getTimerForBlock(realId)
  if (timer == null) {
    orca.notify("info", "这个块当前没有专注计时。", { title: "专注" })
    return
  }
  openNoteDialog(timer.id, timer.title)
}

/** Mid-session note confirmed: write `HH:mm {note}` tagged with 目标 + 专注ID. */
export async function confirmFocusNote(note: string): Promise<void> {
  const dialog = store.dialog
  if (dialog?.kind !== "note") return
  closeDialog()
  const timer = getTimer(dialog.timerId)
  if (timer == null) {
    orca.notify("info", "这个计时器已经不存在了。", { title: "专注" })
    return
  }
  const text = note.trim()
  if (!text) {
    orca.notify("info", "没有输入内容，未写入专注备注。", { title: "专注" })
    return
  }
  ensureSessionId(timer)
  try {
    await writeNoteEntry(timer, Date.now(), text)
    bumpHistoryVersion()
    orca.notify("success", "已插入专注备注", { title: "专注" })
  } catch (error) {
    console.warn("[orca-focus] note entry write failed", error)
    notifyError(`专注备注写入失败：${errorText(error)}`)
  }
}

/** De-duplicate concurrent 暂停 entry writes for the same pause segment. */
const pauseLogWrites = new Map<string, Promise<void>>()

/**
 * Make sure the journal has the 暂停 entry for a paused segment. The entry is
 * normally written when the pause dialog is answered, but a pause triggered by
 * an app quit or a failed write is flushed on the next resume/end.
 */
function writePauseLog(timer: FocusTimer, segment: PauseSegment): Promise<void> {
  if (segment.blockId != null) return Promise.resolve()
  const key = `${timer.id}:${segment.startMs}`
  const pending = pauseLogWrites.get(key)
  if (pending != null) return pending
  const run = (async () => {
    ensureSessionId(timer)
    const blockId = await writePauseEntry(timer, segment)
    setPauseBlockId(timer.id, segment.startMs, blockId)
    bumpHistoryVersion()
  })().finally(() => {
    pauseLogWrites.delete(key)
  })
  pauseLogWrites.set(key, run)
  return run
}

async function flushPendingPauseLogs(timer: FocusTimer): Promise<void> {
  for (const segment of [...timer.pauses]) {
    if (segment.blockId != null) continue
    try {
      await writePauseLog(timer, segment)
    } catch (error) {
      console.warn("[orca-focus] pause entry write failed", error)
    }
  }
}

/** True when another modal dialog already owns the shared dialog slot. */
function dialogBusy(): boolean {
  return store.dialog != null
}

/**
 * Pause a running timer. The dialog only collects an optional reason: the timer
 * pauses when the dialog is confirmed, and cancelling leaves it running (same
 * confirm/cancel semantics as the start and end dialogs).
 */
export async function requestPauseFocus(timerId: string): Promise<boolean> {
  const timer = getTimer(timerId)
  if (timer == null || timer.status !== "running") return false

  if (getSettings().pauseDialog) {
    if (dialogBusy()) {
      orca.notify("info", "请先关闭当前弹窗，再暂停专注。", { title: "专注" })
      return false
    }
    openPauseDialog(timerId)
    return true
  }

  const segment = pauseTimer(timerId)
  if (segment == null) return false
  try {
    await writePauseLog(timer, segment)
    orca.notify("info", `已暂停：${timer.title}`, { title: "专注" })
  } catch (error) {
    console.warn("[orca-focus] pause entry write failed", error)
    notifyError(`暂停日志写入失败：${errorText(error)}（计时已暂停，恢复或结束时会再试）`)
  }
  return true
}

/** Pause dialog confirmed: pause now and write the 暂停 entry. */
export async function confirmPauseFocus(note: string): Promise<void> {
  const dialog = store.dialog
  if (dialog?.kind !== "pause") return
  closeDialog()
  const timer = getTimer(dialog.timerId)
  if (timer == null || timer.status !== "running") return
  const segment = pauseTimer(timer.id)
  if (segment == null) return
  setPauseNote(timer.id, segment.startMs, note)
  // Re-read through the store: pauseTimer() returns the raw segment, but the
  // note was written to Valtio's proxied copy, so the raw object still has "".
  const stored = findPause(timer, segment.startMs)
  if (stored == null) return
  try {
    await writePauseLog(timer, stored)
  } catch (error) {
    console.warn("[orca-focus] pause entry write failed", error)
    notifyError(`暂停日志写入失败：${errorText(error)}（计时已暂停，恢复或结束时会再试）`)
  }
}

/**
 * Resume a paused timer. Like the other dialogs the action happens on confirm;
 * cancelling keeps the timer paused and writes nothing.
 */
export function requestResumeFocus(timerId: string): boolean {
  const timer = getTimer(timerId)
  if (timer == null || timer.status === "running") return false

  if (getSettings().pauseDialog) {
    if (dialogBusy()) {
      orca.notify("info", "请先关闭当前弹窗，再继续专注。", { title: "专注" })
      return false
    }
    openResumeDialog(timerId)
    return true
  }

  void resumeNow(timerId, "")
  return true
}

/** Resume dialog confirmed: resume now and write the 恢复 entry. */
export async function confirmResumeFocus(note: string): Promise<void> {
  const dialog = store.dialog
  if (dialog?.kind !== "resume") return
  closeDialog()
  await resumeNow(dialog.timerId, note)
}

async function resumeNow(timerId: string, note: string): Promise<void> {
  const timer = getTimer(timerId)
  if (timer == null || timer.status === "running") return
  const resumeMs = Date.now()
  const segment = resumeTimer(timerId)
  try {
    if (segment != null) await flushPendingPauseLogs(timer)
    ensureSessionId(timer)
    await writeResumeEntry(timer, resumeMs, note)
    bumpHistoryVersion()
  } catch (error) {
    console.warn("[orca-focus] resume entry write failed", error)
    notifyError(`恢复记录写入失败：${errorText(error)}（计时已继续）`)
  }
}

/** Pause every running timer without per-timer dialogs; logs default entries. */
export async function pauseAllFocus(): Promise<number> {
  if (store.dialog != null) closeDialog()
  const results = pauseAllRunning()
  if (results.length === 0) return 0
  for (const result of results) {
    const timer = getTimer(result.timerId)
    if (timer == null) continue
    const segment = findPause(timer, result.pauseStartMs)
    if (segment == null) continue
    try {
      await writePauseLog(timer, segment)
    } catch (error) {
      console.warn("[orca-focus] pause entry write failed", error)
    }
  }
  bumpHistoryVersion()
  orca.notify("info", `已暂停 ${results.length} 个专注计时器`, { title: "专注" })
  return results.length
}

/** Toggle pause/resume for the block that currently owns a timer. */
export async function toggleFocusForBlock(blockId: DbId): Promise<void> {
  const realId = getMirrorId(blockId)
  const timer = getTimerForBlock(realId)
  if (timer == null) {
    await requestStartFocus(realId)
    return
  }
  if (timer.status === "running") {
    await requestPauseFocus(timer.id)
  } else {
    requestResumeFocus(timer.id)
  }
}

/** Open the optional-summary end dialog for a block/timer. */
export function requestEndFocusForBlock(blockId: DbId): void {
  const realId = getMirrorId(blockId)
  const timer = getTimerForBlock(realId)
  if (timer == null) {
    orca.notify("info", "这个块当前没有专注计时。", { title: "专注" })
    return
  }
  openEndDialog(timer.id)
}

function snapshotTimer(timer: FocusTimer): FocusTimer {
  return JSON.parse(JSON.stringify(timer)) as FocusTimer
}

/**
 * End dialog confirmed. Always writes an "end entry"; empty summary falls back
 * to the default text baked into the entry. The timer is removed only after the
 * writes succeeded so a failure never loses the session.
 */
export async function confirmEndFocus(summary: string): Promise<void> {
  const dialog = store.dialog
  if (dialog?.kind !== "end") return
  const timer = getTimer(dialog.timerId)
  closeDialog()
  if (timer == null) {
    orca.notify("info", "这个计时器已经不存在了。", { title: "专注" })
    return
  }

  ensureSessionId(timer)
  const endMs = Date.now()
  const wasRunning = timer.status === "running"
  const elapsedAtEnd = elapsedMs(timer, endMs)
  // The end entry opens at the current run segment start. When the timer is
  // paused there is no open segment: use a zero-length entry (start = end) so
  // the pause time is not counted as focus, while the session still gets an end.
  const segmentStartMs = wasRunning && timer.startedAt > 0 ? timer.startedAt : endMs

  try {
    // Flush a pending 暂停 entry before snapshotting so undo keeps its block id.
    if (!wasRunning) await flushPendingPauseLogs(timer)
    const snapshot = snapshotTimer(timer)
    if (!wasRunning) closeOpenPause(timer.id, endMs)
    const result = await writeEndEntry(timer, endMs, summary, segmentStartMs)
    try {
      await removeActionBlock(timer)
    } catch (e) {
      console.warn("[orca-focus] failed to remove action block on end", e)
    }
    removeTimer(timer.id)
    const record: EndUndoRecord = {
      timer: snapshot,
      elapsedAtEnd,
      wasRunning,
      endBlockId: result.blockId,
      at: Date.now(),
    }
    pushEndUndo(record)
    bumpHistoryVersion()
    orca.notify("success", `已结束：${snapshot.title}（${formatDurationHuman(elapsedAtEnd)}）`, {
      title: "专注",
      action: () => {
        void undoLastEnd()
      },
    })
  } catch (error) {
    console.warn("[orca-focus] end entry write failed", error)
    if (timer.status === "running") {
      pauseTimer(timer.id)
    } else {
      // Reopen the pause we closed for the failed end write.
      const lastPause = timer.pauses[timer.pauses.length - 1]
      if (lastPause != null && lastPause.endMs != null) lastPause.endMs = null
    }
    notifyError(`写专注记录失败：${errorText(error)}（计时已暂停，可再试一次结束）`)
  }
}

function restoreFromRecord(record: EndUndoRecord): FocusTimer {
  const restored: FocusTimer = {
    ...snapshotTimer(record.timer),
    status: record.wasRunning ? "running" : "paused",
    startedAt: record.wasRunning ? Date.now() : 0,
    accumulatedMs: record.elapsedAtEnd,
    lastSeenAt: Date.now(),
    pausedByQuit: false,
    actionBlockId: null,
  }
  restoreTimer(restored)
  return restored
}

/** Discard a timer without writing a journal entry (also removes its action block). */
export async function discardFocus(timerId: string): Promise<void> {
  const timer = getTimer(timerId)
  if (timer == null) return
  await removeActionBlock(timer)
  discardTimer(timer.id)
}

/**
 * Undo the last "end" action: delete the end entry (if still there) and bring
 * the timer back. Also used by the notification action.
 */
export async function undoLastEnd(): Promise<boolean> {
  const record = peekEndUndo()
  if (record == null) {
    orca.notify("info", "没有可以撤销的「结束专注」记录。", { title: "专注" })
    return false
  }
  clearEndUndo()
  try {
    await deleteEntry(record.endBlockId)
  } catch (error) {
    console.warn("[orca-focus] failed to delete end entry while undoing", error)
  }
  const restored = restoreFromRecord(record)
  try {
    await ensureActionBlock(restored)
  } catch (e) {
    console.warn("[orca-focus] failed to re-create action block on undo", e)
  }
  bumpHistoryVersion()
  orca.notify("success", `已撤销结束：${record.timer.title}`, { title: "专注" })
  return true
}

/**
 * Installed as an after-command hook for `core.editor.undo` so that a native
 * Cmd+Z also restores the timer when the user accidentally ended a session.
 */
let undoWatcher: ((...args: any[]) => void) | null = null

export function installUndoWatcher(): void {
  if (undoWatcher != null) return
  undoWatcher = () => {
    const record = peekEndUndo()
    if (record == null) return
    const recordAt = record.at
    void (async () => {
      // The undo command starts the editor undo without awaiting it, so poll
      // briefly until the end entry disappears (or give up if the user undid
      // some other change instead).
      for (let i = 0; i < 8; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 250))
        const current = peekEndUndo()
        if (current == null || current.at !== recordAt) return
        if (current.endBlockId != null && (await blockExists(current.endBlockId))) continue
        clearEndUndo()
        const restored = restoreFromRecord(current)
        void ensureActionBlock(restored)
        orca.notify("info", `已撤销结束，计时继续：${current.timer.title}`, { title: "专注" })
        return
      }
    })()
  }
  orca.commands.registerAfterCommand("core.editor.undo", undoWatcher)
}

export function uninstallUndoWatcher(): void {
  if (undoWatcher == null) return
  orca.commands.unregisterAfterCommand("core.editor.undo", undoWatcher)
  undoWatcher = null
}
