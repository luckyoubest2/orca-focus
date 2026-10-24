import type { Block, DbId } from "../orca"
import { blockTitle } from "./blocks"
import { getSettings } from "../lib/settings"
import { store } from "../store"
import { TAG_PROP_END, TAG_PROP_SESSION, TAG_PROP_START, TAG_PROP_TARGET } from "./tag"

export interface HistoryEntry {
  blockId: DbId
  text: string
  startMs: number | null
  endMs: number | null
  createdMs: number
}

export interface HistorySession {
  id: string
  legacy: boolean
  targetBlockId: DbId | null
  targetTitle: string
  entries: HistoryEntry[]
  startMs: number | null
  endMs: number | null
  /** Wall-clock duration: last 结束时间 - first 开始时间 (same session id). */
  durationMs: number
  running: boolean
}

export interface FocusHistory {
  sessions: HistorySession[]
  todayMs: number
  totalMs: number
  todayCount: number
  totalCount: number
  error?: string
}

export function emptyHistory(): FocusHistory {
  return { sessions: [], todayMs: 0, totalMs: 0, todayCount: 0, totalCount: 0 }
}

function toMs(value: any): number | null {
  if (value == null) return null
  if (value instanceof Date) {
    const time = value.getTime()
    return Number.isFinite(time) ? time : null
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
    const num = Number(value)
    if (Number.isFinite(num)) return num < 1e12 ? num * 1000 : num
  }
  return null
}

function tagDataOf(block: Block, tagId: DbId): { name: string; type?: number; value?: any }[] {
  const tagRef = (block.refs ?? []).find((ref) => ref.type === 2 && ref.to === tagId)
  return (tagRef?.data ?? []) as any
}

function dataValue(data: { name: string; value?: any }[], name: string): any {
  return data.find((item) => item.name === name)?.value
}

function refTargetId(block: Block, refId: any): DbId | null {
  if (typeof refId !== "number") return null
  const ref = (block.refs ?? []).find((item) => item.id === refId)
  return ref != null ? ref.to : null
}

/** Plain display text of an entry (text fragments + referenced block titles). */
function entryDisplayText(block: Block): string {
  const parts: string[] = []
  for (const frag of block.content ?? []) {
    if (frag?.t === "t" && typeof frag.v === "string") {
      parts.push(frag.v)
    } else if (frag?.t === "r") {
      const targetId = refTargetId(block, frag.v)
      const target = targetId != null ? orca.state.blocks[targetId] : null
      parts.push(target ? `「${blockTitle(target)}」` : "")
    }
  }
  const text = parts.join("").trim()
  if (text) return text
  // Fallback: stored text minus a trailing tag list, if any.
  return (block.text ?? "").replace(/\s+#[^#]*$/, "").trim()
}

function localDayKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function isToday(ms: number): boolean {
  return localDayKey(ms) === localDayKey(Date.now())
}

/**
 * Aggregate every focus journal entry by querying the focus tag
 * (`get-blocks-with-tags`), grouping entries that share the same 专注ID and
 * accumulating session durations from the first 开始时间 to the last 结束时间.
 * No extra state is stored outside the notes.
 */
export async function loadFocusHistory(): Promise<FocusHistory> {
  const settings = getSettings()
  let tagId: DbId | null = null
  try {
    const found = (await orca.invokeBackend("get-blockid-by-alias", settings.tagName)) as any
    tagId = typeof found?.id === "number" ? found.id : null
  } catch (e) {
    console.warn("[orca-focus] history: tag lookup failed", e)
  }
  if (tagId == null) return emptyHistory()

  let raw: Block[] = []
  try {
    const result = (await orca.invokeBackend("get-blocks-with-tags", [settings.tagName])) as Block[] | null
    raw = Array.isArray(result) ? result : []
  } catch (e) {
    console.warn("[orca-focus] history: get-blocks-with-tags failed", e)
    return { ...emptyHistory(), error: "查询专注记录失败" }
  }

  const list = raw.filter(
    (block) => block?.id != null && (block.refs ?? []).some((ref) => ref.type === 2 && ref.to === tagId),
  )
  if (list.length === 0) return emptyHistory()

  // Some query paths may return tag refs without their data; refresh those blocks.
  const needsRefresh = list.filter((block) => {
    const tagRef = (block.refs ?? []).find((ref) => ref.type === 2 && ref.to === tagId)
    return tagRef != null && (tagRef.data == null || tagRef.data.length === 0)
  })
  if (needsRefresh.length > 0) {
    try {
      const fresh = (await orca.invokeBackend(
        "get-blocks",
        needsRefresh.map((block) => block.id),
      )) as Block[] | null
      for (const block of fresh ?? []) {
        if (block?.id == null) continue
        orca.state.blocks[block.id] = block
        const index = list.findIndex((item) => item.id === block.id)
        if (index >= 0) list[index] = block
      }
    } catch (e) {
      console.warn("[orca-focus] history: refresh blocks failed", e)
    }
  }

  // Resolve target blocks so we can show their titles.
  const targetIds = new Set<DbId>()
  for (const block of list) {
    orca.state.blocks[block.id] = block
    const data = tagDataOf(block, tagId)
    const targets = dataValue(data, TAG_PROP_TARGET)
    if (Array.isArray(targets)) {
      for (const refId of targets) {
        const to = refTargetId(block, refId)
        if (to != null) targetIds.add(to)
      }
    }
  }
  if (targetIds.size > 0) {
    const missing = Array.from(targetIds).filter((id) => orca.state.blocks[id] == null)
    if (missing.length > 0) {
      try {
        const targets = (await orca.invokeBackend("get-blocks", missing)) as Block[] | null
        for (const block of targets ?? []) if (block?.id != null) orca.state.blocks[block.id] = block
      } catch (e) {
        console.warn("[orca-focus] history: load target blocks failed", e)
      }
    }
  }

  const runningSessionIds = new Set(
    store.timers.filter((timer) => timer.status === "running").map((timer) => timer.sessionId),
  )
  const sessionsById = new Map<string, HistorySession>()

  for (const block of list) {
    const data = tagDataOf(block, tagId)
    const sessionId = dataValue(data, TAG_PROP_SESSION)
    const startMs = toMs(dataValue(data, TAG_PROP_START))
    const endMs = toMs(dataValue(data, TAG_PROP_END))
    const createdMs = toMs(block.created) ?? toMs(block.modified) ?? Date.now()
    const targets = dataValue(data, TAG_PROP_TARGET)
    let targetBlockId: DbId | null = null
    if (Array.isArray(targets)) {
      for (const refId of targets) {
        const to = refTargetId(block, refId)
        if (to != null) {
          targetBlockId = to
          break
        }
      }
    }

    const entry: HistoryEntry = {
      blockId: block.id,
      text: entryDisplayText(block),
      startMs,
      endMs,
      createdMs,
    }

    const key = typeof sessionId === "string" && sessionId.length > 0 ? sessionId : `legacy-${block.id}`
    const legacy = !(typeof sessionId === "string" && sessionId.length > 0)
    let session = sessionsById.get(key)
    if (session == null) {
      session = {
        id: key,
        legacy,
        targetBlockId,
        targetTitle: "",
        entries: [],
        startMs: null,
        endMs: null,
        durationMs: 0,
        running: false,
      }
      sessionsById.set(key, session)
    }
    if (session.targetBlockId == null && targetBlockId != null) session.targetBlockId = targetBlockId
    if (startMs != null && (session.startMs == null || startMs < session.startMs)) session.startMs = startMs
    if (endMs != null && (session.endMs == null || endMs > session.endMs)) session.endMs = endMs
    session.entries.push(entry)
  }

  const sessions: HistorySession[] = []
  for (const session of sessionsById.values()) {
    session.entries.sort((a, b) => (a.startMs ?? a.createdMs) - (b.startMs ?? b.createdMs))
    const firstEntry = session.entries[0]
    if (session.startMs == null && firstEntry != null) {
      session.startMs = session.entries.reduce<number>(
        (min, entry) => (entry.createdMs < min ? entry.createdMs : min),
        firstEntry.createdMs,
      )
    }
    session.running = runningSessionIds.has(session.id)
    session.durationMs =
      session.startMs != null && session.endMs != null ? Math.max(0, session.endMs - session.startMs) : 0
    session.targetTitle = session.targetBlockId != null ? blockTitle(orca.state.blocks[session.targetBlockId]) : ""
    if (!session.targetTitle) {
      const firstWithText = session.entries.find((entry) => entry.text.length > 0)
      session.targetTitle = firstWithText?.text ?? ""
    }
    sessions.push(session)
  }

  sessions.sort((a, b) => (b.startMs ?? b.entries[0]?.createdMs ?? 0) - (a.startMs ?? a.entries[0]?.createdMs ?? 0))

  let totalMs = 0
  let todayMs = 0
  let todayCount = 0
  for (const session of sessions) {
    if (session.durationMs > 0) {
      totalMs += session.durationMs
      const anchor = session.startMs ?? session.entries[0]?.createdMs
      if (anchor != null && isToday(anchor)) todayMs += session.durationMs
    }
    const anchor = session.startMs ?? session.entries[0]?.createdMs
    if (anchor != null && isToday(anchor)) todayCount += 1
  }

  return {
    sessions,
    todayMs,
    totalMs,
    todayCount,
    totalCount: sessions.length,
  }
}
