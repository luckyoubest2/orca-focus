import type { Block, BlockRefData, DbId } from "../orca"
import { blockExists, ensureBlock, ensureBlocks } from "./blocks"
import {
  collectInlineRefTargetIds,
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
import { formatClock } from "../lib/util"
import type { FocusTimer } from "../types"
import { elapsedMs } from "../store"
import { buildTagData, ensureFocusTag } from "./tag"
import { blockTitle } from "./blocks"

/** Default text written when the end dialog's summary is left empty. */
export const DEFAULT_END_TEXT = "专注"

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

async function resolveRepoAlias(name: string): Promise<Block | null> {
  try {
    const found = (await orca.invokeBackend("get-blockid-by-alias", name)) as any
    if (found?.id != null) return await ensureBlock(found.id)
  } catch (e) {
    console.warn("[orca-focus] alias lookup failed", name, e)
  }
  return null
}

/**
 * Locate the block that collects focus entries.
 *
 * 1. an existing block in today's journal matching the configured names/aliases
 *    (handles headings written as `[DailyLog|Log]` / `[[DailyLog]]`),
 * 2. otherwise a repo-wide alias lookup (e.g. a standalone DailyLog page),
 * 3. otherwise create a plain block under the configured journal section.
 */
async function findOrCreateLogTarget(date: Date): Promise<Block> {
  const settings = getSettings()
  const day = journalDate(date)
  const key = dateKey(day)

  const journal = await getJournalBlock(day)
  if (journal == null) {
    throw new Error("找不到这一天的日记块，请先在 Orca 中打开一次当天的日记。")
  }

  const cachedId = targetCache.get(key)
  if (cachedId != null) {
    const cached = await ensureBlock(cachedId)
    if (cached != null) return cached
    targetCache.delete(key)
  }

  const blocks = await loadBlockTree(journal.id)
  // Headings may hold an inline reference (e.g. `[DailyLog|Log]`); load those
  // targets so the heading can be matched through the referenced block's alias.
  const refTargets = collectInlineRefTargetIds(blocks)
  if (refTargets.length > 0) await ensureBlocks(refTargets.slice(0, 200))

  let existing = findBlockByNames(blocks.length > 0 ? blocks : [journal], settings.logBlockNames)
  if (existing == null) {
    for (const name of settings.logBlockNames) {
      const aliasBlock = await resolveRepoAlias(name)
      if (aliasBlock != null && aliasBlock.id !== journal.id) {
        existing = aliasBlock
        break
      }
    }
  }
  if (existing != null) {
    targetCache.set(key, existing.id)
    return existing
  }

  const section = findLogSection(journal.id, settings.logSectionNames)
  const parent = section ?? journal
  const parentBlock = orca.state.blocks[parent.id] ?? (await ensureBlock(parent.id)) ?? parent
  const blockName = settings.logBlockNames[0] ?? "工作日志"
  const newId = await runEditorCommand(
    "core.editor.insertBlock",
    parentBlock,
    "lastChild",
    [{ t: "t", v: blockName }],
    { type: "text" },
  )
  if (typeof newId !== "number") throw new Error(`创建「${blockName}」块失败。`)
  const created = await ensureBlock(newId)
  if (created != null) {
    targetCache.set(key, newId)
    return created
  }
  return { id: newId } as Block
}

interface InsertEntryOptions {
  target: Block
  text: string
  /** Real source block; when null the entry only carries the cached title. */
  sourceBlockId: DbId | null
  tagName: string | null
  tagDataFactory?: (targetRefId: DbId | null) => BlockRefData[] | null
}

/**
 * Insert an entry under the log target. The source block is linked through the
 * `#专注日志` tag's 目标 block-reference property (a RefType.RefData reference),
 * never through inline content.
 */
async function insertEntry(opts: InsertEntryOptions): Promise<DbId> {
  let newBlockId: DbId | null = null
  await runEditorGroup(async (editor: EditorApi) => {
    const blockId = await editor.invokeCommand(
      "core.editor.insertBlock",
      null,
      opts.target,
      "lastChild",
      [{ t: "t", v: opts.text }],
      { type: "text" },
    )
    if (typeof blockId !== "number") throw new Error("插入专注记录块失败。")
    newBlockId = blockId

    let targetRefId: DbId | null = null
    if (opts.sourceBlockId != null) {
      const refId = await editor.invokeCommand(
        "core.editor.createRef",
        null,
        blockId,
        opts.sourceBlockId,
        3, // RefType.RefData: block-reference property value
      )
      if (typeof refId === "number") targetRefId = refId
    }

    if (opts.tagName != null && opts.tagDataFactory != null) {
      const data = opts.tagDataFactory(targetRefId)
      if (data != null && data.length > 0) {
        await editor.invokeCommand("core.editor.insertTag", null, blockId, opts.tagName, data)
      }
    }
  })
  if (newBlockId == null) throw new Error("插入专注记录块失败。")
  await ensureBlocks([newBlockId])
  return newBlockId
}

/**
 * "Start entry": always written when a focus session starts (same mechanism as
 * the end entry). Payload is `HH:mm 开始专注` plus the optional intent note,
 * tagged with #专注日志 carrying 开始时间 / 目标.
 */
export function writeStartEntry(timer: FocusTimer): Promise<DbId> {
  return enqueue(async () => {
    const tag = await ensureFocusTag()
    const target = await findOrCreateLogTarget(new Date(timer.createdAt))
    const alive = (await blockExists(timer.blockId)) ? timer.blockId : null
    const suffix = alive == null ? `（${timer.title}）` : ""
    const note = timer.startNote.trim()
    const text = `${formatClock(timer.createdAt)} 开始专注${note ? `：${note}` : ""}${suffix}`
    return insertEntry({
      target,
      text,
      sourceBlockId: alive,
      tagName: tag.name,
      tagDataFactory: (targetRefId) => buildTagData({ startMs: timer.createdAt, targetRefId }),
    })
  })
}

export interface EndEntryResult {
  blockId: DbId
  elapsedMs: number
}

/**
 * Write the "end entry":
 *   HH:mm {summary or default text}
 * tagged with #专注日志, carrying 开始时间 / 结束时间 / 目标 as tag properties.
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
    const alive = (await blockExists(timer.blockId)) ? timer.blockId : null
    const suffix = alive == null ? `（${timer.title}）` : ""
    const body = summary.trim() || DEFAULT_END_TEXT
    const text = `${formatClock(endMs)} ${body}${suffix}`

    const blockId = await insertEntry({
      target,
      text,
      sourceBlockId: alive,
      tagName: tag.name,
      tagDataFactory: (targetRefId) =>
        buildTagData({ startMs: timer.createdAt, endMs, targetRefId }),
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
  return matchesNames(block, settings.logBlockNames)
}
