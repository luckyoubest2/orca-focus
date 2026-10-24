import React, { useEffect, useState } from "react"
import type { BlockActionItem } from "../lib/blockActions"
import { computeBlockActionItems, sameBlockActionItems } from "../lib/blockActions"
import { openEndDialog, openNoteDialog, pauseTimer, resumeTimer, store } from "../store"

interface ActionButtonProps {
  icon: string
  title: string
  onClick: () => void
}

function ActionButton({ icon, title, onClick }: ActionButtonProps) {
  return (
    <button
      type="button"
      className="of-block-action"
      title={title}
      onMouseDown={(e) => {
        // Keep editor selection/caret untouched.
        e.preventDefault()
        e.stopPropagation()
      }}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onClick()
      }}
    >
      <i className={`ti ${icon}`} />
    </button>
  )
}

/**
 * Floating 「备注 / 暂停·继续 / 结束」 buttons rendered at the end of the text of
 * every block that currently has a focus timer. Fixed overlay, no editor DOM
 * mutation.
 */
export default function BlockActionsLayer() {
  const [items, setItems] = useState<BlockActionItem[]>([])

  useEffect(() => {
    let disposed = false
    let frame = 0
    let interval: ReturnType<typeof setInterval> | null = null
    let unsubscribe: (() => void) | null = null

    const schedule = () => {
      if (disposed || frame !== 0) return
      frame = requestAnimationFrame(() => {
        frame = 0
        if (disposed) return
        const next = computeBlockActionItems()
        setItems((prev) => (sameBlockActionItems(prev, next) ? prev : next))
      })
    }

    const onScroll = () => schedule()
    document.addEventListener("scroll", onScroll, true)
    window.addEventListener("resize", onScroll)
    try {
      const Valtio = (window as any).Valtio
      if (Valtio?.subscribe != null) unsubscribe = Valtio.subscribe(store, schedule)
    } catch (e) {
      console.warn("[orca-focus] block actions subscribe failed", e)
    }
    interval = setInterval(schedule, 600)
    schedule()

    return () => {
      disposed = true
      if (frame !== 0) cancelAnimationFrame(frame)
      if (interval != null) clearInterval(interval)
      document.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", onScroll)
      unsubscribe?.()
    }
  }, [])

  if (items.length === 0) return null

  return (
    <>
      {items.map((item) => {
        const timer = store.timers.find((candidate) => candidate.id === item.timerId)
        if (timer == null) return null
        const running = timer.status === "running"
        return (
          <div
            key={item.key}
            className="of-block-actions"
            style={{
              top: item.top,
              left: item.left,
              transform: item.align === "right" ? "translateX(-100%)" : undefined,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <ActionButton
              icon="ti-note"
              title="插入专注备注"
              onClick={() => openNoteDialog(timer.id, timer.title)}
            />
            <ActionButton
              icon={running ? "ti-player-pause" : "ti-player-play"}
              title={running ? "暂停专注" : "继续专注"}
              onClick={() => (running ? pauseTimer(timer.id) : resumeTimer(timer.id))}
            />
            <ActionButton
              icon="ti-player-stop"
              title="结束专注"
              onClick={() => openEndDialog(timer.id)}
            />
          </div>
        )
      })}
    </>
  )
}

/** Mount the fixed overlay host into document.body. */
export function mountBlockActions(
  hostId: string,
): { render: (node: React.ReactNode) => void; unmount: () => void; el: HTMLElement } | null {
  if (typeof document === "undefined" || document.body == null) return null
  const el = document.createElement("div")
  el.id = hostId
  el.className = "of-actions-host"
  document.body.appendChild(el)
  const createRoot = (window as any).createRoot as (node: Element) => any
  const root = createRoot(el)
  root.render(React.createElement(BlockActionsLayer))
  return { render: (node) => root.render(node), unmount: () => root.unmount(), el }
}
