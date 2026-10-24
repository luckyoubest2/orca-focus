import type { Block, DbId } from "../orca"
import { getRepr } from "../data/blocks"
import { ensureBlock } from "../data/blocks"
import { ensureActionBlock } from "../data/actionBlock"
import { findEditorPanel } from "./editor"
import { isActionBlockMutationAllowed, withActionBlockMutationAllowed } from "./actionBlockGuard"
import { setTimerActionBlock, store } from "../store"

const ACTION_TYPE = "orca-focus.actions"

/** Is this block an action block belonging to the given timer? */
export function isActionBlockOf(block: Block | null | undefined, timerId: string, sourceBlockId?: number): boolean {
  const repr = getRepr(block)
  if (repr?.type !== ACTION_TYPE) return false
  if (typeof repr.timerId === "string" && repr.timerId === timerId) return true
  return typeof sourceBlockId === "number" && repr.sourceBlockId === sourceBlockId
}

function actionBlockIds(): Set<number> {
  const ids = new Set<number>()
  for (const timer of store.timers) {
    if (typeof timer.actionBlockId === "number") ids.add(timer.actionBlockId)
  }
  return ids
}

let lastNotifyAt = 0

function notifyBound(): void {
  const now = Date.now()
  if (now - lastNotifyAt < 2500) return
  lastNotifyAt = now
  orca.notify("warn", "专注操作块绑定在当前块下，不能移动或删除。", { title: "专注" })
}

function rejects(ids: unknown): boolean {
  if (isActionBlockMutationAllowed()) return false
  const blocked = actionBlockIds()
  if (Array.isArray(ids) && ids.some((id) => typeof id === "number" && blocked.has(id))) {
    notifyBound()
    return true
  }
  if (typeof ids === "number" && blocked.has(ids)) {
    notifyBound()
    return true
  }
  return false
}

type BeforeHook = (cmdId: string, ...args: any[]) => boolean

const hooks: { id: string; hook: BeforeHook }[] = []

function registerHook(id: string, hook: BeforeHook): void {
  hooks.push({ id, hook })
  try {
    orca.commands.registerBeforeCommand(id, hook as any)
  } catch (e) {
    console.warn("[orca-focus] failed to register binding hook", id, e)
  }
}

/** Register before-command hooks that keep the action block attached to its block. */
export function installActionBlockBinding(): void {
  if (hooks.length > 0) return
  // [cursor-excluded args] blockIds, refBlockId, position, options
  registerHook("core.editor.moveBlocks", (_cmd, blockIds) => !rejects(blockIds))
  registerHook("core.editor.deleteBlocks", (_cmd, blockIds) => !rejects(blockIds))
  // mergeBlocks: (blockId, targetBlockId, content?)
  registerHook("core.editor.mergeBlocks", (_cmd, blockId, targetBlockId) => {
    return !(rejects(blockId) || rejects(targetBlockId))
  })
  // copyBlocks: (blockIds, refBlockId, position, ...) — avoid making copies of the bar.
  registerHook("core.editor.copyBlocks", (_cmd, blockIds) => !rejects(blockIds))
}

export function uninstallActionBlockBinding(): void {
  for (const { id, hook } of hooks) {
    try {
      orca.commands.unregisterBeforeCommand(id, hook as any)
    } catch (e) {
      console.warn("[orca-focus] failed to unregister binding hook", id, e)
    }
  }
  hooks.length = 0
}

let repairHandle: ReturnType<typeof setInterval> | null = null

/** Make sure the action block still exists, is a child of its block and stays first. */
export async function repairActionBlockBindings(): Promise<void> {
  const editor = findEditorPanel()?.editor
  if (editor == null) return
  for (const timer of [...store.timers]) {
    const source = await ensureBlock(timer.blockId)
    if (source == null) {
      if (timer.actionBlockId != null) setTimerActionBlock(timer.id, null)
      continue
    }
    if (timer.actionBlockId == null) {
      await ensureActionBlock(timer)
      continue
    }
    const action = await ensureBlock(timer.actionBlockId)
    if (action == null) {
      setTimerActionBlock(timer.id, null)
      await ensureActionBlock(timer)
      continue
    }
    const actionId: DbId = timer.actionBlockId
    const needsMove =
      action.parent !== timer.blockId || (source.children?.length ?? 0) === 0 || source.children?.[0] !== actionId
    if (!needsMove) continue
    try {
      await withActionBlockMutationAllowed(async () => {
        await ensureBlock(timer.blockId)
        // moveBlocks expects the reference block's DbId, not the Block object.
        await editor.invokeCommand("core.editor.moveBlocks", null, [actionId], timer.blockId, "firstChild")
      })
    } catch (e) {
      console.warn("[orca-focus] failed to re-attach action block", actionId, e)
    }
  }
}

export function startActionBlockRepair(): void {
  if (repairHandle != null) return
  repairHandle = setInterval(() => {
    void repairActionBlockBindings()
  }, 3000)
}

export function stopActionBlockRepair(): void {
  if (repairHandle == null) return
  clearInterval(repairHandle)
  repairHandle = null
}

/** Is this rendered action block the canonical one recorded on the timer? */
export function isCanonicalActionBlock(timerId: string, blockId: DbId): boolean {
  const timer = store.timers.find((candidate) => candidate.id === timerId)
  if (timer == null) return false
  return timer.actionBlockId === blockId
}
