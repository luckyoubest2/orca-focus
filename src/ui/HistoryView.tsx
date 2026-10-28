import { useCallback, useEffect, useState } from "react"
import type { DbId } from "../orca"
import { ensureBlocks } from "../data/blocks"
import { loadFocusHistory } from "../data/history"
import type { FocusHistory, HistorySession } from "../data/history"
import { getSettings } from "../lib/settings"
import { formatClock, formatDurationHuman } from "../lib/util"
import { useFocusStore } from "../store"

const { Button } = orca.components as any

function dayKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function dayLabel(ms: number): string {
  const d = new Date(ms)
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]
  const base = `${d.getMonth() + 1}月${d.getDate()}日 ${weekdays[d.getDay()]}`
  const today = new Date()
  if (dayKey(ms) === dayKey(today.getTime())) return `${base} · 今日`
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  if (dayKey(ms) === dayKey(yesterday.getTime())) return `${base} · 昨天`
  return base
}

interface DayGroup {
  key: string
  label: string
  sessions: HistorySession[]
  totalMs: number
}

function groupByDay(sessions: HistorySession[]): DayGroup[] {
  const groups: DayGroup[] = []
  const map = new Map<string, DayGroup>()
  for (const session of sessions) {
    const anchor = session.startMs ?? session.entries[0]?.createdMs
    if (anchor == null) continue
    const key = dayKey(anchor)
    let group = map.get(key)
    if (group == null) {
      group = { key, label: dayLabel(anchor), sessions: [], totalMs: 0 }
      map.set(key, group)
      groups.push(group)
    }
    group.sessions.push(session)
    if (!session.running && !session.paused) group.totalMs += session.effectiveMs
  }
  return groups
}

function jumpTo(blockId: DbId | null): void {
  if (blockId == null) return
  orca.nav.goTo("block", { blockId })
}

function SessionCard({ session }: { session: HistorySession }) {
  const openEnd = session.running || session.paused
  const range =
    session.startMs != null && session.endMs != null
      ? `${formatClock(session.startMs)}–${openEnd ? "…" : formatClock(session.endMs)}`
      : session.startMs != null
        ? `${formatClock(session.startMs)}–…`
        : session.entries[0] != null
          ? formatClock(session.entries[0].createdMs)
          : ""
  const duration = session.effectiveMs > 0 ? formatDurationHuman(session.effectiveMs) : ""
  const durationTitle =
    session.pauseMs > 0
      ? `有效专注 ${formatDurationHuman(session.effectiveMs)} · 墙钟 ${formatDurationHuman(
          session.durationMs,
        )} · 暂停 ${formatDurationHuman(session.pauseMs)}`
      : `专注 ${formatDurationHuman(session.effectiveMs)}`

  return (
    <div className={`of-history-session ${session.running || session.paused ? "of-history-session-running" : ""}`}>
      <div className="of-history-session-head">
        <span
          className="of-history-target"
          title={session.targetTitle}
          onClick={() => jumpTo(session.targetBlockId)}
        >
          {session.targetTitle || "（未关联目标）"}
        </span>
        <span className="of-history-range">{range}</span>
        {duration !== "" && (
          <span className="of-history-duration" title={durationTitle}>
            {duration}
          </span>
        )}
        {session.pauseMs > 0 && (
          <span className="of-history-pause" title={durationTitle}>
            暂停 {session.pauseCount > 0 ? `${session.pauseCount} 次 · ` : ""}
            {formatDurationHuman(session.pauseMs)}
          </span>
        )}
        {session.running && <span className="of-history-badge">进行中</span>}
        {session.paused && <span className="of-history-badge">暂停中</span>}
        {session.legacy && <span className="of-history-badge of-history-badge-legacy">旧记录</span>}
      </div>
      {session.entries.length > 0 && (
        <div className="of-history-entries">
          {session.entries.map((entry) => (
            <div
              key={entry.blockId}
              className="of-history-entry"
              title="跳到这条记录"
              onClick={() => jumpTo(entry.blockId)}
            >
              {/* 记录正文本身以 HH:mm 开头，这里不再重复显示时间 */}
              <span className="of-history-entry-text">{entry.text || "（空）"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * History tab: all focus journal entries, aggregated by 专注ID through a query
 * over the focus tag. Totals are computed from each session's first 开始时间 to
 * its last 结束时间.
 */
export default function FocusHistoryView() {
  const snapshot = useFocusStore()
  const [history, setHistory] = useState<FocusHistory | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await loadFocusHistory()
      setHistory(result)
      if (result.error) setError(result.error)
      const targetIds = result.sessions
        .map((session) => session.targetBlockId)
        .filter((id): id is DbId => id != null)
      if (targetIds.length > 0) void ensureBlocks(targetIds)
    } catch (e) {
      console.warn("[orca-focus] history load failed", e)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh, snapshot.historyVersion])

  const groups = history != null ? groupByDay(history.sessions) : []
  const hasData = history != null && history.totalCount > 0

  return (
    <div className="of-history">
      <div className="of-history-stats">
        <div className="of-history-stat">
          <span className="of-history-stat-label">今日专注</span>
          <span className="of-history-stat-value">
            {history != null ? formatDurationHuman(history.todayMs) : "—"}
          </span>
        </div>
        <div className="of-history-stat">
          <span className="of-history-stat-label">全部专注</span>
          <span className="of-history-stat-value">
            {history != null ? formatDurationHuman(history.totalMs) : "—"}
          </span>
        </div>
        <div className="of-history-stat">
          <span className="of-history-stat-label">专注次数</span>
          <span className="of-history-stat-value">
            {history != null ? `${history.todayCount} / ${history.totalCount}` : "—"}
          </span>
        </div>
        <Button
          variant="plain"
          className="of-history-refresh"
          title="重新查询"
          onClick={() => void refresh()}
        >
          <i className={`ti ti-refresh ${loading ? "of-spin" : ""}`} />
        </Button>
      </div>

      <div className="of-history-body">
        {error != null && <div className="of-history-error">{error}</div>}
        {!hasData && !loading && (
          <div className="of-empty">
            <i className="ti ti-history of-empty-icon" />
            <div className="of-empty-title">还没有专注记录</div>
            <div className="of-empty-text">开始一次专注后，记录会自动汇总到这里。</div>
          </div>
        )}
        {loading && history == null && <div className="of-history-loading">加载中…</div>}
        {groups.map((group) => (
          <div className="of-history-day" key={group.key}>
            <div className="of-history-day-head">
              <span className="of-history-day-label">{group.label}</span>
              <span className="of-history-day-meta">
                {group.sessions.length} 次
                {group.totalMs > 0 ? ` · ${formatDurationHuman(group.totalMs)}` : ""}
              </span>
            </div>
            {group.sessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        ))}
      </div>
      <div className="of-panel-footer">
        记录汇总自笔记里的 #{getSettings().tagName} 标签（含暂停/恢复与中间备注）；时长只算有开始+结束的连续专注段，暂停不计入。
      </div>
    </div>
  )
}
