import React from "react"
import { journalDate } from "../data/journal"
import { liveTitle } from "../data/log"
import { ensureBlocks } from "../data/blocks"
import { formatClock, formatElapsedClock, formatDurationHuman } from "../lib/util"
import {
  pauseAllRunning,
  openEndDialog,
  pauseTimer,
  resumeTimer,
  discardTimer,
  elapsedMs,
  openNoteDialog,
  setNotice,
  useFocusStore,
} from "../store"

const { Button } = orca.components as any

function TimerCard({ timerId }: { timerId: string }) {
  const snapshot = useFocusStore()
  const timer = snapshot.timers.find((item) => item.id === timerId)
  const [confirmDiscard, setConfirmDiscard] = React.useState(false)

  React.useEffect(() => {
    if (!confirmDiscard) return
    const handle = setTimeout(() => setConfirmDiscard(false), 3000)
    return () => clearTimeout(handle)
  }, [confirmDiscard])

  if (timer == null) return null
  const elapsed = elapsedMs(timer, snapshot.now)
  const running = timer.status === "running"
  const title = liveTitle(timer)

  const jump = () => {
    orca.nav.goTo("block", { blockId: timer.blockId })
  }

  return (
    <div className={`of-card ${running ? "of-card-running" : "of-card-paused"}`}>
      <div className="of-card-main">
        <div className={`of-card-dot ${running ? "of-card-dot-running" : ""}`} />
        <div className="of-card-info">
          <div className="of-card-title" title={title} onClick={jump}>
            {title || "未命名块"}
          </div>
          <div className="of-card-meta">
            {running ? `开始于 ${formatClock(timer.startedAt)}` : "已暂停"}
            {timer.startNote ? ` · ${timer.startNote}` : ""}
          </div>
        </div>
        <div className="of-card-elapsed">{formatElapsedClock(elapsed)}</div>
      </div>
      <div className="of-card-actions">
        <Button
          variant="plain"
          className="of-icon-btn"
          title={running ? "暂停" : "继续"}
          onClick={() => (running ? pauseTimer(timer.id) : resumeTimer(timer.id))}
        >
          <i className={`ti ${running ? "ti-player-pause" : "ti-player-play"}`} />
        </Button>
        <Button
          variant="plain"
          className="of-icon-btn"
          title="结束并写日志"
          onClick={() => openEndDialog(timer.id)}
        >
          <i className="ti ti-player-stop" />
        </Button>
        <Button
          variant="plain"
          className="of-icon-btn"
          title="插入专注备注"
          onClick={() => openNoteDialog(timer.id, timer.title)}
        >
          <i className="ti ti-note" />
        </Button>
        <Button variant="plain" className="of-icon-btn" title="跳到源块" onClick={jump}>
          <i className="ti ti-arrow-up-right" />
        </Button>
        <Button
          variant="plain"
          className={`of-icon-btn of-icon-btn-danger ${confirmDiscard ? "of-confirm" : ""}`}
          title={confirmDiscard ? "再点一次丢弃（不写日志）" : "丢弃（不写日志）"}
          onClick={() => {
            if (!confirmDiscard) {
              setConfirmDiscard(true)
              return
            }
            discardTimer(timer.id)
          }}
        >
          <i className={`ti ${confirmDiscard ? "ti-trash-x" : "ti-trash"}`} />
        </Button>
      </div>
    </div>
  )
}

/** Custom right-side panel that holds every active timer. */
export default function FocusPanel({ panelId }: { panelId: string }) {
  const snapshot = useFocusStore()
  const timers = snapshot.timers
  const running = timers.filter((timer) => timer.status === "running")
  const totalElapsed = timers.reduce((sum, timer) => sum + elapsedMs(timer, snapshot.now), 0)

  React.useEffect(() => {
    const ids = timers.map((timer) => timer.blockId)
    if (ids.length > 0) void ensureBlocks(ids)
  }, [timers.length])

  const openJournal = () => {
    orca.nav.goTo("journal", { date: journalDate() })
  }

  return (
    <div className="of-panel" data-panel-id={panelId}>
      <div className="of-panel-header">
        <div className="of-panel-title">
          <i className="ti ti-clock-play" />
          <span>专注</span>
          {running.length > 0 && <span className="of-panel-badge">{running.length} 进行中</span>}
        </div>
        <div className="of-panel-header-actions">
          {running.length > 0 && (
            <Button variant="plain" className="of-header-btn" title="暂停全部" onClick={() => pauseAllRunning()}>
              <i className="ti ti-player-pause" />
            </Button>
          )}
          <Button variant="plain" className="of-header-btn" title="打开今日工作日志" onClick={openJournal}>
            <i className="ti ti-notebook" />
          </Button>
        </div>
      </div>

      {timers.length > 0 && (
        <div className="of-panel-summary">
          共 {timers.length} 个计时器 · 累计 {formatDurationHuman(totalElapsed)}
        </div>
      )}

      {snapshot.notice != null && (
        <div className="of-notice">
          <span>{snapshot.notice}</span>
          <button className="of-notice-close" title="知道了" onClick={() => setNotice(null)}>
            <i className="ti ti-x" />
          </button>
        </div>
      )}

      <div className="of-panel-list">
        {timers.length === 0 ? (
          <div className="of-empty">
            <i className="ti ti-clock-play of-empty-icon" />
            <div className="of-empty-title">还没有专注计时</div>
            <div className="of-empty-text">
              在任意块左侧的小点上右键 → 插件命令 → 开始专注
            </div>
          </div>
        ) : (
          [...running, ...timers.filter((timer) => timer.status !== "running")].map((timer) => (
            <TimerCard key={timer.id} timerId={timer.id} />
          ))
        )}
      </div>

      <div className="of-panel-footer">
        右键小点 → 插件命令 → 开始专注；结束记录会写到今日「工作日志」。
      </div>
    </div>
  )
}
