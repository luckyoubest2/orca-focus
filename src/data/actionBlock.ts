import { ACTION_BLOCK_TYPE } from "../config"
import type { EditorApi } from "../lib/editor"
import { findEditorPanel } from "../lib/editor"
import type { FocusTimer } from "../types"
import { getRepr } from "./blocks"
import { ensureBlock } from "./blocks"
import { setTimerActionBlock, store } from "../store"
import { withActionBlockMutationAllowed } from "../lib/actionBlockGuard"

function actionEditor(): EditorApi | null {
  return findEditorPanel()?.editor ?? null
}

function isActionBlock(repr: any, timer: FocusTimer): boolean {
  if (repr?.type !== ACTION_BLOCK_TYPE) return false
  if (typeof repr.timerId === "string" && repr.timerId === timer.id) return true
  return typeof repr.sourceBlockId === "number" && repr.sourceBlockId === timer.blockId
}

/** Look for an action block already attached to the source block (e.g. after a reload). */
async function findExistingActionBlock(timer: FocusTimer): Promise<number | null> {
  const source = await ensureBlock(timer.blockId)
  if (source == null) return null
  for (const childId of source.children ?? []) {
    const child = await ensureBlock(childId)
    if (child == null) continue
    if (isActionBlock(getRepr(child), timer)) return childId
  }
  return null
}

/**
 * Ensure the focused block has one custom child block rendering the
 * 备注 / 暂停·继续 / 结束 buttons. Inserted as the first child so it sits right
 * under the block's own text.
 */
const ensureInFlight = new Map<string, Promise<number | null>>()

export function ensureActionBlock(timer: FocusTimer): Promise<number | null> {
  const running = ensureInFlight.get(timer.id)
  if (running != null) return running
  const task = ensureActionBlockInternal(timer).finally(() => ensureInFlight.delete(timer.id))
  ensureInFlight.set(timer.id, task)
  return task
}

async function ensureActionBlockInternal(timer: FocusTimer): Promise<number | null> {
  if (timer.actionBlockId != null) {
    const existing = await ensureBlock(timer.actionBlockId)
    if (existing != null && isActionBlock(getRepr(existing), timer)) return timer.actionBlockId
    setTimerActionBlock(timer.id, null)
  }

  const found = await findExistingActionBlock(timer)
  if (found != null) {
    setTimerActionBlock(timer.id, found)
    return found
  }

  const editor = actionEditor()
  const source = await ensureBlock(timer.blockId)
  if (editor == null || source == null) return null

  try {
    const blockId = await editor.invokeCommand(
      "core.editor.insertBlock",
      null,
      source,
      "firstChild",
      null,
      { type: ACTION_BLOCK_TYPE, sourceBlockId: timer.blockId, timerId: timer.id },
    )
    if (typeof blockId !== "number") return null
    setTimerActionBlock(timer.id, blockId)
    return blockId
  } catch (e) {
    console.warn("[orca-focus] failed to insert action block", e)
    return null
  }
}

/** Delete the timer's action block (on end / discard). */
export async function removeActionBlock(timer: FocusTimer): Promise<void> {
  const blockId = timer.actionBlockId
  setTimerActionBlock(timer.id, null)
  if (blockId == null) return
  const editor = actionEditor()
  try {
    if (editor != null) {
      const existing = await orca.invokeBackend("get-block", blockId)
      if (existing != null) {
        await withActionBlockMutationAllowed(async () => {
          await editor.invokeCommand("core.editor.deleteBlocks", null, [blockId])
        })
      }
    } else {
      // Plugin teardown path: delete through the backend so no editor is needed.
      await orca.invokeBackend("delete-blocks", [blockId])
    }
  } catch (e) {
    console.warn("[orca-focus] failed to remove action block", blockId, e)
  }
}

/** Remove action blocks for every active timer (used on plugin unload). */
export async function removeAllActionBlocks(): Promise<void> {
  const timers = [...store.timers]
  for (const timer of timers) await removeActionBlock(timer)
}

/** Remove action blocks whose timer no longer exists (left by an abnormal exit). */
export async function cleanupOrphanActionBlocks(): Promise<number> {
  const activeTimerIds = new Set(store.timers.map((timer) => timer.id))
  const activeBlockIds = new Set(store.timers.map((timer) => timer.blockId))
  const orphans: number[] = []
  for (const block of Object.values(orca.state.blocks)) {
    const repr = getRepr(block as any)
    if (repr?.type !== ACTION_BLOCK_TYPE) continue
    const timerId = typeof repr.timerId === "string" ? repr.timerId : null
    const sourceBlockId = typeof repr.sourceBlockId === "number" ? repr.sourceBlockId : null
    const alive =
      (timerId != null && activeTimerIds.has(timerId)) ||
      (sourceBlockId != null && activeBlockIds.has(sourceBlockId))
    if (!alive && typeof (block as any)?.id === "number") orphans.push((block as any).id)
  }
  if (orphans.length === 0) return 0
  const editor = actionEditor()
  try {
    if (editor != null) {
      await withActionBlockMutationAllowed(async () => {
        await editor.invokeCommand("core.editor.deleteBlocks", null, orphans)
      })
    } else {
      await orca.invokeBackend("delete-blocks", orphans)
    }
  } catch (e) {
    console.warn("[orca-focus] failed to clean orphan action blocks", e)
    return 0
  }
  return orphans.length
}
