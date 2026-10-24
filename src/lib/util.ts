export function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

/** Local time as HH:mm. */
export function formatClock(ts: number): string {
  const d = new Date(ts)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** Duration for the timer panel: HH:MM:SS (hours are omitted below one hour). */
export function formatElapsedClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`
}

/** Human readable duration for the timer panel / notifications: "28 分钟" / "1 小时 05 分钟". */
export function formatDurationHuman(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.round(totalSeconds / 60)
  if (minutes < 1) return "不到 1 分钟"
  if (minutes < 60) return `${minutes} 分钟`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分钟`
}

export function truncate(text: string, max = 60): string {
  const t = (text ?? "").trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/**
 * Parse a comma/newline separated list of block names that may be written as
 * plain names, aliases, or Orca link/reference syntax:
 *   DailyLog / [[DailyLog]] / [[DailyLog|Log]] / [DailyLog|Log]
 */
export function parseReferenceNameList(raw: string | undefined | null, fallback: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const add = (value: string) => {
    const name = value.replace(/^\[+/, "").replace(/\]+$/, "").trim()
    if (!name || seen.has(name.toLowerCase())) return
    seen.add(name.toLowerCase())
    out.push(name)
  }
  for (const piece of (raw ?? "").split(/[,，\n]/)) {
    const trimmed = piece.trim()
    if (!trimmed) continue
    const link = trimmed.match(/^\[\[?([^\]|]+)(?:\|([^\]]+))?\]\]?$/)
    if (link) {
      add(link[1])
      if (link[2]) add(link[2])
      continue
    }
    add(trimmed)
  }
  return out.length > 0 ? out : fallback
}

/** Readable focus-session id: 20261024-0944-a1b2 (used by 专注ID tag property). */
export function makeSessionId(base: Date = new Date()): string {
  const y = base.getFullYear()
  const m = pad2(base.getMonth() + 1)
  const d = pad2(base.getDate())
  const hh = pad2(base.getHours())
  const mm = pad2(base.getMinutes())
  const rand = Math.random().toString(36).slice(2, 6)
  return `${y}${m}${d}-${hh}${mm}-${rand}`
}
