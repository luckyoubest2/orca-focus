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

/** Human readable duration used in journal entries: "28 分钟" / "1 小时 05 分钟". */
export function formatDurationHuman(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.round(totalSeconds / 60)
  if (minutes < 1) return "不到 1 分钟"
  if (minutes < 60) return `${minutes} 分钟`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分钟`
}

/** Rounded-up minutes for the `#专注日志` tag's 时长 property. */
export function durationMinutes(ms: number): number {
  return Math.max(1, Math.round(ms / 60000))
}

export function truncate(text: string, max = 60): string {
  const t = (text ?? "").trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

export function debounce<T extends (...args: any[]) => void>(fn: T, wait: number): T {
  let handle: ReturnType<typeof setTimeout> | null = null
  const wrapped = ((...args: any[]) => {
    if (handle != null) clearTimeout(handle)
    handle = setTimeout(() => {
      handle = null
      fn(...args)
    }, wait)
  }) as T
  return wrapped
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Parse comma / newline separated setting strings. */
export function parseNameList(raw: string | undefined | null, fallback: string[]): string[] {
  const names = (raw ?? "")
    .split(/[,，\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  return names.length > 0 ? names : fallback
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
