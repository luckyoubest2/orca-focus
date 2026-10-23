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

/**
 * Orca's journal backend expects a UTC-midnight journal date. Normalize here so
 * callers can pass "now" or any timestamp safely.
 */
export async function getJournalBlock(date: Date): Promise<Block | null> {
  try {
    const journal = (await orca.invokeBackend("get-journal-block", journalDate(date))) as Block | null
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

function normalizeName(text: string | null | undefined): string {
  return (text ?? "").trim().toLowerCase()
}

function addCandidate(out: Set<string>, value: string | null | undefined): void {
  const name = normalizeName(value?.replace(/^\[+/, "").replace(/\]+$/, ""))
  if (name) out.add(name)
}

/**
 * Extract possible names from a piece of text. Handles plain text plus Orca's
 * reference/alias syntaxes used in headings, e.g. `[DailyLog|Log]`,
 * `[[DailyLog]]`, `[[DailyLog|Log]]`.
 */
export function textNameCandidates(text: string | null | undefined): Set<string> {
  const out = new Set<string>()
  const raw = text ?? ""
  addCandidate(out, raw)
  for (const match of raw.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)) {
    addCandidate(out, match[1])
    addCandidate(out, match[2])
  }
  for (const match of raw.matchAll(/\[([^\]|]+)(?:\|([^\]]+))?\]/g)) {
    addCandidate(out, match[1])
    addCandidate(out, match[2])
  }
  for (const piece of raw.split(/[,，|]/)) addCandidate(out, piece)
  return out
}

/** All names a block can be matched by: aliases, text (incl. ref syntax), inline-ref targets. */
export function blockNameCandidates(block: Block): Set<string> {
  const out = new Set<string>()
  for (const alias of block.aliases ?? []) addCandidate(out, alias)
  for (const name of textNameCandidates(typeof block.text === "string" ? block.text : "")) out.add(name)
  for (const frag of block.content ?? []) {
    if (frag?.t !== "r") continue
    const ref = (block.refs ?? []).find((item) => item.id === frag.v)
    if (ref == null) continue
    const target = orca.state.blocks[ref.to]
    if (target == null) continue
    for (const alias of target.aliases ?? []) addCandidate(out, alias)
    for (const name of textNameCandidates(target.text)) out.add(name)
  }
  return out
}

/** Test whether a block matches one of the configured names/aliases. */
export function matchesNames(block: Block, names: string[]): boolean {
  const wanted = names.map(normalizeName).filter((name) => name.length > 0)
  if (wanted.length === 0) return false
  const candidates = blockNameCandidates(block)
  return wanted.some((name) => candidates.has(name))
}

/** Find the first matching block among the loaded journal tree. */
export function findBlockByNames(blocks: Block[], names: string[]): Block | null {
  for (const block of blocks) {
    if (matchesNames(block, names)) return block
  }
  return null
}

/** Collect inline-ref targets of a block list so alias-based headings can be resolved. */
export function collectInlineRefTargetIds(blocks: Block[]): DbId[] {
  const ids = new Set<DbId>()
  for (const block of blocks) {
    for (const ref of block.refs ?? []) {
      if (ref.type === 1 && typeof ref.to === "number") ids.add(ref.to)
    }
  }
  return Array.from(ids)
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
