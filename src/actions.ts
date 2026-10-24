import type { DbId } from "./orca"
import { blockExists, blockTitle, ensureBlock, getMirrorId } from "./data/blocks"
import { deleteEntry, writeEndEntry, writeNoteEntry, writeStartEntry } from "./data/log"
import { openFocusPanel, editorPanelId } from "./lib/panels"
import { formatDurationHuman } from "./lib/util"
import { getSettings } from "./lib/settings"
import {
  bumpHistoryVersion,
  clearEndUndo,
  closeDialog,
  createTimer,
  elapsedMs,
  ensureSessionId,
  getTimer,
  getTimerForBlock,
  openEndDialog,
  openNoteDialog,
  openStartDialog,
  pauseTimer,
  peekEndUndo,
  pushEndUndo,
  removeTimer,
  restoreTimer,
  resumeTimer,
  setTimerStartLog,
  store,
} from "./store"
import type { EndUndoRecord, FocusTimer } from "./types"

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
      resumeTimer(existing.id)
      orca.notify("info", `继续专注：${existing.title}`)
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
  if (getSettings().autoOpenPanel) openFocusPanel()
  try {
    const blockId = await writeStartEntry(timer)
    setTimerStartLog(timer.id, blockId)
    bumpHistoryVersion()
    console.log("[orca-focus] start entry written", blockId)
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

/** Open the mid-session note dialog from the timer panel. */
export function requestFocusNoteForTimer(timerId: string): void {
  const timer = getTimer(timerId)
  if (timer == null) {
    orca.notify("info", "这个计时器已经不存在了。", { title: "专注" })
    return
  }
  openNoteDialog(timer.id, timer.title)
}

/** Mid-session note confirmed: write `HH:mm {note}` tagged with 目标 only. */
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
    const blockId = await writeNoteEntry(timer, Date.now(), text)
    bumpHistoryVersion()
    console.log("[orca-focus] note entry written", blockId)
    orca.notify("success", "已插入专注备注", { title: "专注" })
  } catch (error) {
    console.warn("[orca-focus] note entry write failed", error)
    notifyError(`专注备注写入失败：${errorText(error)}`)
  }
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
    pauseTimer(timer.id)
  } else {
    resumeTimer(timer.id)
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
  const snapshot = snapshotTimer(timer)
  const panelId = editorPanelId() ?? ""

  try {
    const result = await writeEndEntry(timer, endMs, summary)
    removeTimer(timer.id)
    const record: EndUndoRecord = {
      timer: snapshot,
      elapsedAtEnd,
      wasRunning,
      endBlockId: result.blockId,
      at: Date.now(),
      editorPanelId: panelId,
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
    if (timer.status === "running") pauseTimer(timer.id)
    notifyError(`写专注记录失败：${errorText(error)}（计时已暂停，可再试一次结束）`)
  }
}

function restoreFromRecord(record: EndUndoRecord): void {
  const restored: FocusTimer = {
    ...snapshotTimer(record.timer),
    status: record.wasRunning ? "running" : "paused",
    startedAt: record.wasRunning ? Date.now() : 0,
    accumulatedMs: record.elapsedAtEnd,
    lastSeenAt: Date.now(),
    pausedByQuit: false,
  }
  restoreTimer(restored)
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
  restoreFromRecord(record)
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
        restoreFromRecord(current)
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
