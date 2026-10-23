import type { Block, DbId, Repr } from "../orca"
import { truncate } from "../lib/util"

export function getRepr(block: Block | undefined | null): Repr | null {
  if (!block?.properties) return null
  const prop = block.properties.find((p) => p.name === "_repr")
  const value = prop?.value
  if (value == null) return null
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Repr
    } catch {
      return null
    }
  }
  return value as Repr
}

export function blockText(block: Block | undefined | null): string {
  if (!block) return ""
  if (typeof block.text === "string" && block.text.length > 0) return block.text
  const parts: string[] = []
  for (const frag of block.content ?? []) {
    if (frag && (frag.t === "t" || frag.t === "r") && typeof frag.v === "string") parts.push(frag.v)
  }
  return parts.join("")
}

/** Display title: aliases first, then plain text with inline tags stripped. */
export function blockTitle(block: Block | undefined | null): string {
  if (!block) return ""
  const alias = (block.aliases ?? []).find((a) => typeof a === "string" && a.trim().length > 0)
  if (alias) return truncate(alias, 60)
  const raw = blockText(block)
  const cut = raw.search(/\s+#(?!#)/)
  const head = cut >= 0 ? raw.slice(0, cut) : raw
  const cleaned = head.replace(/[,\s]+$/g, "").trim()
  return truncate(cleaned || raw.trim() || "(未命名块)", 60)
}

/** For mirror blocks, return the block they mirror; otherwise null. */
export function mirrorTargetId(block: Block | undefined | null): DbId | null {
  const repr = getRepr(block)
  if (repr?.type === "mirror" && typeof repr.mirroredId === "number") return repr.mirroredId
  return null
}

/** Resolve a possibly-mirrored block id to the real block id. */
export function getMirrorId(id: DbId): DbId {
  return mirrorTargetId(orca.state.blocks[id]) ?? id
}

export async function ensureBlocks(ids: DbId[]): Promise<void> {
  const missing = ids.filter((id) => orca.state.blocks[id] == null)
  if (missing.length === 0) return
  try {
    const blocks = (await orca.invokeBackend("get-blocks", missing)) as Block[] | null
    if (!Array.isArray(blocks)) return
    for (const block of blocks) {
      if (block?.id != null) orca.state.blocks[block.id] = block
    }
  } catch (e) {
    console.warn("[orca-focus] failed to load blocks", missing, e)
  }
}

export async function ensureBlock(id: DbId): Promise<Block | null> {
  const cached = orca.state.blocks[id]
  if (cached) return cached
  try {
    const block = (await orca.invokeBackend("get-block", id)) as Block | null
    if (block?.id != null) {
      orca.state.blocks[block.id] = block
      return block
    }
  } catch (e) {
    console.warn("[orca-focus] get-block failed", id, e)
  }
  return null
}

export async function blockExists(id: DbId): Promise<boolean> {
  try {
    const block = await orca.invokeBackend("get-block", id)
    return block != null && (block as Block).id != null
  } catch {
    return false
  }
}
