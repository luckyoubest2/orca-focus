import React from "react"
import { formatElapsedClock } from "../lib/util"
import { runEditorCommand } from "../lib/editor"
import {
  elapsedMs,
  openEndDialog,
  openNoteDialog,
  pauseTimer,
  resumeTimer,
  useFocusStore,
} from "../store"

const { BlockShell } = orca.components as any

function ActionButton({ icon, title, onClick }: { icon: string; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="of-focus-action-btn"
      title={title}
      // Never let the buttons steal the editor caret / selection.
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onClick()
      }}
    >
      <i className={`ti ${icon}`} />
    </button>
  )
}

function ActiveRow({ timerId, sourceBlockId }: { timerId?: string; sourceBlockId?: number }) {
  const snapshot = useFocusStore()
  const timer = snapshot.timers.find(
    (candidate) =>
      (typeof timerId === "string" && candidate.id === timerId) ||
      (typeof sourceBlockId === "number" && candidate.blockId === sourceBlockId),
  )
  if (timer == null) return <StaleRow />
  const running = timer.status === "running"
  return (
    <span className="of-focus-action-row" contentEditable={false}>
      <i className={`ti ${running ? "ti-clock-play" : "ti-player-pause"} of-focus-action-state`} />
      <span className="of-focus-action-elapsed">{formatElapsedClock(elapsedMs(timer, snapshot.now))}</span>
      <span className="of-focus-action-sep" />
      <ActionButton
        icon="ti-note"
        title="插入专注备注"
        onClick={() => openNoteDialog(timer.id, timer.title)}
      />
      <ActionButton
        icon={running ? "ti-player-pause" : "ti-player-play"}
        title={running ? "暂停专注" : "继续专注"}
        onClick={() => (running ? pauseTimer(timer.id) : resumeTimer(timer.id))}
      />
      <ActionButton icon="ti-player-stop" title="结束专注" onClick={() => openEndDialog(timer.id)} />
    </span>
  )
}

function StaleRow() {
  return (
    <span className="of-focus-action-row of-focus-action-row-stale" contentEditable={false}>
      <i className="ti ti-clock-off of-focus-action-state" />
      <span className="of-focus-action-elapsed">专注已结束</span>
      <span className="of-focus-action-sep" />
      <span className="of-focus-action-hint">这个按钮块可以删掉</span>
    </span>
  )
}

/**
 * Custom child-block renderer for the floating-free action row.
 * The block is a real note block (inserted as the focused block's first child
 * while a timer is active), so it follows the document layout instead of using
 * a fixed overlay.
 */
export default function FocusActionBlockRenderer(props: any) {
  const {
    panelId,
    blockId,
    rndId,
    blockLevel,
    indentLevel,
    initiallyCollapsed,
    renderingMode,
    mirrorId,
    sourceBlockId,
    timerId,
  } = props

  return (
    <BlockShell
      panelId={panelId}
      blockId={blockId}
      rndId={rndId}
      mirrorId={mirrorId}
      blockLevel={blockLevel}
      indentLevel={indentLevel}
      initiallyCollapsed={initiallyCollapsed}
      renderingMode={renderingMode}
      reprClassName="of-repr-focus-actions"
      contentClassName="of-repr-focus-actions-content"
      contentAttrs={{ contentEditable: false }}
      contentJsx={<ActiveRow timerId={timerId} sourceBlockId={sourceBlockId} />}
    />
  )
}

/** Delete a stale action block from user-facing fallback UI. */
export async function deleteActionBlock(blockId: number): Promise<void> {
  try {
    await runEditorCommand("core.editor.deleteBlocks", [blockId])
  } catch (e) {
    console.warn("[orca-focus] failed to delete stale action block", blockId, e)
  }
}
