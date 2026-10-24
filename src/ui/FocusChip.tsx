import React from "react"
import { formatElapsedClock } from "../lib/util"
import { toggleFocusPanel } from "../lib/panels"
import { elapsedMs, useFocusStore } from "../store"

const { Button } = orca.components as any

/** Headbar chip: always-visible live timer; click toggles the focus panel. */
export default function FocusChip() {
  const snapshot = useFocusStore()
  const running = snapshot.timers.filter((timer) => timer.status === "running")
  const first = running[0]
  const pausedCount = snapshot.timers.length - running.length

  return (
    <Button
      variant="plain"
      className={`of-chip ${first ? "of-chip-active" : ""}`}
      title={first ? "专注中，点击打开计时面板" : "专注计时面板"}
      onClick={() => toggleFocusPanel()}
    >
      <i
        className={`ti ${
          first ? "ti-clock-play" : snapshot.timers.length > 0 ? "ti-clock-pause" : "ti-layout-sidebar-right"
        }`}
      />
      {first != null && (
        <span className="of-chip-time">
          {running.length > 1 ? `${running.length} · ` : ""}
          {formatElapsedClock(elapsedMs(first, snapshot.now))}
        </span>
      )}
      {first == null && pausedCount > 0 && <span className="of-chip-paused">{pausedCount}</span>}
    </Button>
  )
}
