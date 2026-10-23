import type { Block, DbId } from "../orca"
import { getRepr } from "./blocks"

/** Today's journal date: local Y/M/D encoded as UTC midnight (Orca convention). */
export function journalDate(base: Date = new Date()): Date {
  return new Date(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate()))
}

export function dateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`
}

/** Flatten `get-block-tree` results (array / nested `{block, children}` / block w/ children). */
export function flattenBlocks(node: unknown, acc: Block[] = []): Block[] {
  if (node == null) return acc
  if (Array.isArray(node)) {
    for (const n of node) flattenBlocks(n, acc)
    return acc
  }
  const anyNode = node as any
  if (typeof anyNode?.id === "number" && Array.isArray(anyNode?.properties)) {
    acc.push(anyNode as Block)
    return acc
  }
  const block = anyNode?.block ?? anyNode
  if (block && typeof block === "object" && typeof block.id === "number") {
    acc.push(block as Block)
    const children = anyNode?.children
    if (Array.isArray(children)) {
      for (const c of children) {
        if (c && typeof c === "object") flattenBlocks(c, acc)
      }
    }
  }
  return acc
}

export async function getJournalBlock(date: Date): Promise<Block | null> {
  try {
    const journal = (await orca.invokeBackend("get-journal-block", date)) as Block | null
    if (journal?.id == null) return null
    orca.state.blocks[journal.id] = journal
    return journal
  } catch (e) {
    console.error("[orca-focus] get-journal-block failed", date, e)
    return null
  }
}

/** Load a whole block tree into `orca.state.blocks` and return the flattened list. */
export async function loadBlockTree(rootId: DbId): Promise<Block[]> {
  let tree: unknown = null
  try {
    tree = await orca.invokeBackend("get-block-tree", rootId)
  } catch (e) {
    console.error("[orca-focus] get-block-tree failed", rootId, e)
    return []
  }
  const blocks = flattenBlocks(tree)
  for (const block of blocks) {
    if (block?.id != null) orca.state.blocks[block.id] = block
  }
  return blocks
}

function normalize(text: string): string {
  return (text ?? "").trim().toLowerCase()
}

/** Test whether a block's text or aliases match one of the configured names. */
export function matchesNames(block: Block, names: string[]): boolean {
  const wanted = names.map(normalize).filter((n) => n.length > 0)
  if (wanted.length === 0) return false
  const text = normalize(typeof block.text === "string" ? block.text : "")
  const aliases = (block.aliases ?? []).map(normalize)
  return wanted.some((name) => text === name || aliases.includes(name))
}

/** Find the first matching block among the loaded journal tree (BFS order). */
export function findBlockByNames(blocks: Block[], names: string[]): Block | null {
  for (const block of blocks) {
    if (matchesNames(block, names)) return block
  }
  return null
}

/** H2/journal section candidate used as the parent for the auto-created log block. */
export function findLogSection(journalId: DbId, sectionNames: string[]): Block | null {
  const journal = orca.state.blocks[journalId]
  if (!journal) return null
  for (const childId of journal.children ?? []) {
    const child = orca.state.blocks[childId]
    if (child && matchesNames(child, sectionNames)) return child
  }
  return null
}

export function isJournalBlock(block: Block | undefined | null): boolean {
  return getRepr(block)?.type === "journal"
}
