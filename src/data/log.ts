import type { Block, DbId } from "../orca"
import { blockExists, ensureBlocks } from "./blocks"
import {
  dateKey,
  findBlockByNames,
  findLogSection,
  getJournalBlock,
  journalDate,
  loadBlockTree,
  matchesNames,
} from "./journal"
import type { EditorApi } from "../lib/editor"
import { runEditorCommand, runEditorGroup } from "../lib/editor"
import { getSettings } from "../lib/settings"
import { durationMinutes, formatClock, formatDurationHuman } from "../lib/util"
import type { FocusTimer } from "../types"
import { elapsedMs } from "../store"
import { ensureFocusTag, tagData } from "./tag"
import { blockTitle } from "./blocks"

const targetCache = new Map<string, DbId>()

/** Serialize journal writes so concurrent start/end actions cannot race. */
let writeQueue: Promise<unknown> = Promise.resolve()
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn)
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

function dayKeyFor(ts: number): string {
  return dateKey(journalDate(new Date(ts)))
}

async function findOrCreateLogTarget(date: Date): Promise<Block> {
  const settings = getSettings()
  const journal = await getJournalBlock(date)
  if (journal == null) {
    throw new Error("找不到这一天的日记块，请先在 Orca 中打开一次当天的日记。")
  }

  const cachedId = targetCache.get(dateKey(journalDate(date)))
  if (cachedId != null) {
    const cached = orca.state.blocks[cachedId]
    if (cached != null) return cached
    await ensureBlocks([cachedId])
    const rehydrated = orca.state.blocks[cachedId]
    if (rehydrated != null) return rehydrated
    targetCache.delete(dateKey(journalDate(date)))
  }

  const blocks = await loadBlockTree(journal.id)
  const all = blocks.length > 0 ? blocks : [journal]

  // 1) An existing block called e.g. 工作日志 anywhere in the journal.
  const existing = findBlockByNames(all, [settings.logBlockName])
  if (existing) {
    targetCache.set(dateKey(journalDate(date)), existing.id)
    return existing
  }

  // 2) Create it under the configured section (DailyLog / 今日笔记 / ...), falling
  //    back to the journal root. Deliberately a plain block, not an H2 heading,
  //    so the today-dashboard's heading matching is not disturbed.
  const section = findLogSection(journal.id, settings.logSectionNames)
  const parent = section ?? journal
  const parentBlock = orca.state.blocks[parent.id] ?? (await ensureBlockById(parent.id)) ?? parent

  const newId = await runEditorCommand(
    "core.editor.insertBlock",
    parentBlock,
    "lastChild",
    [{ t: "t", v: settings.logBlockName }],
    { type: "text" },
  )
  if (typeof newId !== "number") throw new Error("创建「" + settings.logBlockName + "」块失败。")
  await ensureBlocks([newId])
  targetCache.set(dateKey(journalDate(date)), newId)
  const created = orca.state.blocks[newId]
  if (created) return created
  return { id: newId } as Block
}

async function ensureBlockById(id: DbId): Promise<Block | null> {
  await ensureBlocks([id])
  return orca.state.blocks[id] ?? null
}

/** Insert a plain text + inline reference block under the log target. */
async function insertEntry(
  target: Block,
  text: string,
  sourceBlockId: DbId | null,
  extra: (editor: EditorApi, blockId: DbId) => Promise<void> = async () => {},
): Promise<DbId> {
  let newBlockId: DbId | null = null
  await runEditorGroup(async (editor) => {
    const blockId = await editor.invokeCommand(
      "core.editor.insertBlock",
      null,
      target,
      "lastChild",
      [{ t: "t", v: text }],
      { type: "text" },
    )
    if (typeof blockId !== "number") throw new Error("插入专注记录块失败。")
    newBlockId = blockId
    if (sourceBlockId != null) {
      const refId = await editor.invokeCommand("core.editor.createRef", null, blockId, sourceBlockId, 1)
      await editor.invokeCommand("core.editor.setBlocksContent", null, [
        { id: blockId, content: [{ t: "t", v: text }, { t: "r", v: refId }] },
      ])
    }
    await extra(editor, blockId)
  })
  if (newBlockId == null) throw new Error("插入专注记录块失败。")
  await ensureBlocks([newBlockId])
  return newBlockId
}

/** Optional "start entry" written only when the user typed an intent note. */
export async function writeStartEntry(timer: FocusTimer): Promise<DbId | null> {
  const note = timer.startNote.trim()
  if (!note) return null
  return enqueue(async () => {
    const date = new Date(timer.createdAt)
    const target = await findOrCreateLogTarget(date)
    const alive = await blockExists(timer.blockId)
    const suffix = alive ? " " : `（${timer.title}） `
    const text = `${formatClock(timer.createdAt)} 开始专注：${note}${suffix}`
    return insertEntry(target, text, alive ? timer.blockId : null)
  })
}

export interface EndEntryResult {
  blockId: DbId
  elapsedMs: number
}

/**
 * Write the "end entry":
 *   HH:mm–HH:mm 专注 28 分钟｜summary <inline ref to source block>
 * and tag it with the focus tag carrying start/end/duration data.
 */
export function writeEndEntry(
  timer: FocusTimer,
  endMs: number,
  summary: string,
): Promise<EndEntryResult> {
  return enqueue(async () => {
    const tag = await ensureFocusTag()
    const elapsed = elapsedMs(timer, endMs)
    const target = await findOrCreateLogTarget(new Date(endMs))
    const alive = await blockExists(timer.blockId)
    const suffix = alive ? " " : `（${timer.title}） `
    const text = `${formatClock(timer.createdAt)}–${formatClock(endMs)} 专注 ${formatDurationHuman(
      elapsed,
    )}${summary.trim() ? `｜${summary.trim()}` : ""}${suffix}`

    const blockId = await insertEntry(target, text, alive ? timer.blockId : null, async (editor, entryId) => {
      await editor.invokeCommand(
        "core.editor.insertTag",
        null,
        entryId,
        tag.name,
        tagData(timer.createdAt, endMs, durationMinutes(elapsed)),
      )
    })
    return { blockId, elapsedMs: elapsed }
  })
}

/** Remove an entry created by a focus action (used by undo). */
export async function deleteEntry(blockId: DbId | null): Promise<void> {
  if (blockId == null) return
  if (!(await blockExists(blockId))) return
  try {
    await runEditorCommand("core.editor.deleteBlocks", [blockId])
  } catch (e) {
    console.warn("[orca-focus] failed to delete focus entry", blockId, e)
  }
}

/** Update a cached timer title from the live block (e.g. after edits). */
export function liveTitle(timer: FocusTimer): string {
  const block = orca.state.blocks[timer.blockId]
  return block ? blockTitle(block) || timer.title : timer.title
}

export function invalidateTargetCache(): void {
  targetCache.clear()
}

export function matchesLogBlock(block: Block): boolean {
  const settings = getSettings()
  return matchesNames(block, [settings.logBlockName])
}
