import type { Block, DbId } from "../orca"
import { ensureBlocks } from "../data/blocks"
import { runEditorCommand, runEditorGroup } from "../lib/editor"
import { getSettings } from "../lib/settings"

export const TAG_PROP_START = "开始时间"
export const TAG_PROP_END = "结束时间"
export const TAG_PROP_DURATION = "时长"

let cachedName: string | null = null
let cachedId: DbId | null = null

async function findTagId(name: string): Promise<DbId | null> {
  try {
    const found = (await orca.invokeBackend("get-blockid-by-alias", name)) as any
    if (found?.id != null) return found.id as DbId
  } catch (e) {
    console.warn("[orca-focus] get-blockid-by-alias failed", name, e)
  }
  return null
}

async function ensureTagProperties(tagId: DbId): Promise<void> {
  const block = orca.state.blocks[tagId]
  const existingNames = new Set((block?.properties ?? []).map((prop) => prop.name))
  const wanted = [
    { name: TAG_PROP_START, type: 5, typeArgs: { subType: "datetime" } },
    { name: TAG_PROP_END, type: 5, typeArgs: { subType: "datetime" } },
    { name: TAG_PROP_DURATION, type: 3 },
  ]
  const missing = wanted.filter((prop) => !existingNames.has(prop.name))
  if (missing.length === 0) return
  try {
    await runEditorCommand("core.editor.setProperties", [tagId], wanted)
  } catch (e) {
    console.warn("[orca-focus] failed to configure focus tag properties", e)
  }
}

/**
 * Ensure the configured focus tag exists (creating an alias block when needed)
 * and expose the tag properties used to record start/end/duration.
 */
export async function ensureFocusTag(): Promise<{ id: DbId | null; name: string }> {
  const name = getSettings().tagName
  if (cachedName === name && cachedId != null) {
    await ensureBlocks([cachedId])
    if (orca.state.blocks[cachedId] != null) return { id: cachedId, name }
    cachedName = null
    cachedId = null
  }

  let tagId = await findTagId(name)
  if (tagId == null) {
    let createdId: DbId | null = null
    await runEditorGroup(async (editor) => {
      const blockId = await editor.invokeCommand(
        "core.editor.insertBlock",
        null,
        null,
        null,
        [{ t: "t", v: name }],
        { type: "text" },
      )
      if (typeof blockId !== "number") throw new Error("failed to create focus tag block")
      createdId = blockId
      tagId = blockId
      const error = await editor.invokeCommand("core.editor.createAlias", null, name, blockId)
      if (error != null) console.warn("[orca-focus] createAlias returned", error)
    })
    if (createdId != null) {
      // If the alias already belonged to another block (race / stale lookup),
      // remove the unnecessary duplicate and use the existing tag block.
      const resolved = await findTagId(name)
      if (resolved != null && resolved !== createdId) {
        try {
          await runEditorCommand("core.editor.deleteBlocks", [createdId])
        } catch (e) {
          console.warn("[orca-focus] failed to clean up duplicate tag block", e)
        }
        tagId = resolved
      }
    }
  }

  if (tagId != null) {
    await ensureBlocks([tagId])
    await ensureTagProperties(tagId)
  }
  cachedName = name
  cachedId = tagId
  return { id: tagId, name }
}

export function invalidateTagCache(): void {
  cachedName = null
  cachedId = null
}

export function getCachedTag(): { id: DbId | null; name: string } | null {
  if (cachedName == null) return null
  return { id: cachedId, name: cachedName }
}

export function tagData(
  startMs: number,
  endMs: number,
  minutes: number,
): { name: string; type: number; value: any }[] {
  return [
    { name: TAG_PROP_START, type: 5, value: new Date(startMs) },
    { name: TAG_PROP_END, type: 5, value: new Date(endMs) },
    { name: TAG_PROP_DURATION, type: 3, value: minutes },
  ]
}

export function tagBlockForDisplay(): Block | null {
  return cachedId != null ? (orca.state.blocks[cachedId] ?? null) : null
}
