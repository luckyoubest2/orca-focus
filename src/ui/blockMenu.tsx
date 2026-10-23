import React from "react"
import type { DbId } from "../orca"
import { getMirrorId } from "../data/blocks"
import { formatElapsedClock } from "../lib/util"
import { openFocusPanel } from "../lib/panels"
import {
  elapsedMs,
  getTimerForBlock,
  openEndDialog,
  pauseTimer,
  resumeTimer,
  useFocusStore,
} from "../store"
import { requestFocusNoteForBlock, requestStartFocus } from "../actions"

const { MenuText } = orca.components as any

function FocusBlockMenu({ blockId, close }: { blockId: DbId; close: () => void }) {
  const snapshot = useFocusStore()
  // Subscribe to the clock so the elapsed label in the menu is current.
  void snapshot.now
  const realId = getMirrorId(blockId)
  const timer = getTimerForBlock(realId)

  const items: React.ReactNode[] = []

  if (timer == null) {
    items.push(
      React.createElement(MenuText, {
        key: "start",
        title: "开始专注…",
        preIcon: "ti ti-clock-play",
        onClick: () => {
          close()
          void requestStartFocus(realId)
        },
      }),
    )
  } else if (timer.status === "running") {
    items.push(
      React.createElement(MenuText, {
        key: "pause",
        title: `暂停专注（${formatElapsedClock(elapsedMs(timer, snapshot.now))}）`,
        preIcon: "ti ti-player-pause",
        onClick: () => {
          close()
          pauseTimer(timer.id)
        },
      }),
    )
  } else {
    items.push(
      React.createElement(MenuText, {
        key: "resume",
        title: "继续专注",
        preIcon: "ti ti-player-play",
        onClick: () => {
          close()
          resumeTimer(timer.id)
        },
      }),
    )
  }

  if (timer != null) {
    items.push(
      React.createElement(MenuText, {
        key: "note",
        title: "插入专注备注…",
        preIcon: "ti ti-note",
        onClick: () => {
          close()
          requestFocusNoteForBlock(realId)
        },
      }),
      React.createElement(MenuText, {
        key: "end",
        title: "结束专注…",
        preIcon: "ti ti-player-stop",
        onClick: () => {
          close()
          openEndDialog(timer.id)
        },
      }),
    )
  }

  items.push(
    React.createElement(MenuText, {
      key: "panel",
      title: "打开专注计时面板",
      preIcon: "ti ti-layout-sidebar-right",
      onClick: () => {
        close()
        openFocusPanel()
      },
    }),
  )

  return React.createElement(React.Fragment, null, ...items)
}

/**
 * Block-handle context menu contribution. Rendered by Orca inside the
 * 「插件命令」submenu of the block's handle (the small dot) menu.
 */
export function renderBlockMenu(blockId: DbId, _rootBlockId: DbId, close: () => void): React.ReactNode {
  return React.createElement(FocusBlockMenu, { blockId, close })
}
