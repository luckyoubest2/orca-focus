import React from "react"
import {
  ACTION_BLOCK_TYPE,
  BLOCK_MENU_ID,
  CMD_CLEAN_ACTION_BLOCKS,
  CMD_END_CURRENT,
  CMD_NOTE_CURRENT,
  CMD_OPEN_HISTORY,
  CMD_OPEN_PANEL,
  CMD_START_CURRENT,
  CMD_TOGGLE_CURRENT,
  CMD_UNDO_END,
  DIALOG_HOST_ID,
  HEADBAR_ID,
  PANEL_VIEW,
  STYLE_ROLE,
  setPluginKey,
} from "./config"
import {
  installUndoWatcher,
  requestEndFocusForBlock,
  requestFocusNoteForBlock,
  requestStartFocus,
  toggleFocusForBlock,
  undoLastEnd,
  uninstallUndoWatcher,
} from "./actions"
import { cleanupOrphanActionBlocks, removeAllActionBlocks } from "./data/actionBlock"
import { invalidateTargetCache } from "./data/log"
import { invalidateTagCache } from "./data/tag"
import { findPanelByView, openFocusPanel, toggleFocusPanel } from "./lib/panels"
import { installActionBlockBinding, startActionBlockRepair, stopActionBlockRepair, uninstallActionBlockBinding } from "./lib/actionBlockBinding"
import { disposeFocusIndicators, installFocusIndicators } from "./lib/blockIndicators"
import { getSettings, registerSettings } from "./lib/settings"
import { ACTION_BLOCK_CSS, BLOCK_INDICATOR_CSS, FOCUS_CSS, HISTORY_CSS, focusTagCss } from "./styles"
import {
  closeDialog,
  disposeStore,
  flushState,
  initStore,
  pauseAllRunning,
} from "./store"
import FocusActionBlockRenderer from "./ui/ActionBlock"
import { DialogHost } from "./ui/dialogs"
import FocusChip from "./ui/FocusChip"
import FocusPanel from "./ui/TimerPanel"
import { renderBlockMenu } from "./ui/blockMenu"

let dialogRoot: { render: (node: React.ReactNode) => void; unmount: () => void } | null = null
let dialogHostEl: HTMLElement | null = null
function mountDialogs(): void {
  if (dialogHostEl != null) return
  const el = document.createElement("div")
  el.id = DIALOG_HOST_ID
  document.body.appendChild(el)
  dialogHostEl = el
  const createRoot = (window as any).createRoot as (node: Element) => any
  dialogRoot = createRoot(el)
  dialogRoot!.render(React.createElement(DialogHost))
}

function unmountDialogs(): void {
  try {
    dialogRoot?.unmount()
  } catch (e) {
    console.warn("[orca-focus] dialog unmount failed", e)
  }
  dialogRoot = null
  dialogHostEl?.remove()
  dialogHostEl = null
}

type EditorCommandContext = [string, number, any, ...any[]]

function cursorBlockId(ctx: EditorCommandContext | undefined): number | null {
  const cursor = ctx?.[2]
  const blockId = cursor?.anchor?.blockId ?? cursor?.focus?.blockId
  return typeof blockId === "number" ? blockId : null
}

export async function load(pluginName: string): Promise<void> {
  setPluginKey(pluginName)

  await registerSettings(pluginName)
  const pluginCss =
    FOCUS_CSS + BLOCK_INDICATOR_CSS + HISTORY_CSS + ACTION_BLOCK_CSS + focusTagCss(getSettings().tagName)
  try {
    orca.themes.injectCSS(pluginCss, STYLE_ROLE)
  } catch (e) {
    console.warn("[orca-focus] injectCSS failed, falling back to <style>", e)
    const style = document.createElement("style")
    style.id = `${STYLE_ROLE}-styles`
    style.textContent = pluginCss
    document.head.appendChild(style)
  }

  mountDialogs()

  await initStore()

  try {
    orca.renderers.registerBlock(ACTION_BLOCK_TYPE, false, FocusActionBlockRenderer)
    orca.converters.registerBlock("plain", ACTION_BLOCK_TYPE, () => "")
    orca.converters.registerBlock("markdown", ACTION_BLOCK_TYPE, () => "")
    orca.converters.registerBlock("html", ACTION_BLOCK_TYPE, () => "")
  } catch (e) {
    console.warn("[orca-focus] action block renderer registration failed", e)
  }

  try {
    orca.blockMenuCommands.registerBlockMenuCommand(BLOCK_MENU_ID, {
      worksOnMultipleBlocks: false,
      render: renderBlockMenu,
    })
  } catch (e) {
    console.warn("[orca-focus] block menu command registration failed", e)
  }

  try {
    orca.panels.registerPanel(PANEL_VIEW, FocusPanel)
  } catch (e) {
    console.warn("[orca-focus] focus panel registration failed", e)
  }

  orca.commands.registerCommand(
    CMD_OPEN_PANEL,
    () => {
      toggleFocusPanel()
    },
    "专注：打开/关闭专注计时面板",
  )

  orca.commands.registerCommand(
    CMD_OPEN_HISTORY,
    () => {
      openFocusPanel({ tab: "history" })
    },
    "专注：打开专注历史",
  )

  orca.commands.registerEditorCommand(
    CMD_START_CURRENT,
    async (ctx: any) => {
      const blockId = cursorBlockId(ctx as EditorCommandContext)
      if (blockId != null) await requestStartFocus(blockId)
      else orca.notify("info", "请先把光标放到一个块里。", { title: "专注" })
      return null
    },
    () => {},
    { label: "专注：开始专注（当前块）" },
  )

  orca.commands.registerEditorCommand(
    CMD_TOGGLE_CURRENT,
    async (ctx: any) => {
      const blockId = cursorBlockId(ctx as EditorCommandContext)
      if (blockId != null) await toggleFocusForBlock(blockId)
      else orca.notify("info", "请先把光标放到一个块里。", { title: "专注" })
      return null
    },
    () => {},
    { label: "专注：开始 / 暂停 / 继续（当前块）" },
  )

  orca.commands.registerEditorCommand(
    CMD_END_CURRENT,
    async (ctx: any) => {
      const blockId = cursorBlockId(ctx as EditorCommandContext)
      if (blockId != null) requestEndFocusForBlock(blockId)
      else orca.notify("info", "请先把光标放到一个块里。", { title: "专注" })
      return null
    },
    () => {},
    { label: "专注：结束专注（当前块）" },
  )

  orca.commands.registerEditorCommand(
    CMD_NOTE_CURRENT,
    async (ctx: any) => {
      const blockId = cursorBlockId(ctx as EditorCommandContext)
      if (blockId != null) requestFocusNoteForBlock(blockId)
      else orca.notify("info", "请先把光标放到一个块里。", { title: "专注" })
      return null
    },
    () => {},
    { label: "专注：插入专注备注（当前块）" },
  )

  orca.commands.registerCommand(
    CMD_CLEAN_ACTION_BLOCKS,
    async () => {
      const count = await cleanupOrphanActionBlocks()
      orca.notify(
        count > 0 ? "success" : "info",
        count > 0 ? `已清理 ${count} 个残留的专注操作块。` : "没有发现残留的专注操作块。",
        { title: "专注" },
      )
    },
    "专注：清理残留的专注操作块",
  )

  orca.commands.registerCommand(
    CMD_UNDO_END,
    async () => {
      await undoLastEnd()
    },
    "专注：撤销上一次「结束专注」",
  )

  try {
    orca.headbar.registerHeadbarButton(HEADBAR_ID, () => React.createElement(FocusChip))
  } catch (e) {
    console.warn("[orca-focus] headbar button unavailable", e)
  }

  installUndoWatcher()
  installActionBlockBinding()
  startActionBlockRepair()
  installFocusIndicators()
}

export async function unload(): Promise<void> {
  stopActionBlockRepair()
  uninstallUndoWatcher()
  disposeFocusIndicators()
  closeDialog()
  try {
    // Remove the real action blocks before the renderer is unregistered so the
    // notes don't end up with unknown-type blocks.
    await removeAllActionBlocks()
  } catch (e) {
    console.warn("[orca-focus] failed to remove action blocks on unload", e)
  }
  uninstallActionBlockBinding()
  pauseAllRunning()
  await flushState()
  disposeStore()

  // Close custom panels before unregistering the view renderer so no panel is
  // left pointing at a missing view type.
  try {
    let panel = findPanelByView(PANEL_VIEW)
    let guard = 0
    while (panel != null && guard < 8) {
      orca.nav.close(panel.id)
      panel = findPanelByView(PANEL_VIEW)
      guard += 1
    }
  } catch (e) {
    console.warn("[orca-focus] failed to close focus panel", e)
  }

  orca.commands.unregisterCommand(CMD_OPEN_PANEL)
  orca.commands.unregisterCommand(CMD_OPEN_HISTORY)
  orca.commands.unregisterEditorCommand(CMD_START_CURRENT)
  orca.commands.unregisterEditorCommand(CMD_TOGGLE_CURRENT)
  orca.commands.unregisterEditorCommand(CMD_END_CURRENT)
  orca.commands.unregisterEditorCommand(CMD_NOTE_CURRENT)
  orca.commands.unregisterCommand(CMD_UNDO_END)
  orca.commands.unregisterCommand(CMD_CLEAN_ACTION_BLOCKS)
  try {
    orca.renderers.unregisterBlock(ACTION_BLOCK_TYPE)
    orca.converters.unregisterBlock("plain", ACTION_BLOCK_TYPE)
    orca.converters.unregisterBlock("markdown", ACTION_BLOCK_TYPE)
    orca.converters.unregisterBlock("html", ACTION_BLOCK_TYPE)
  } catch (e) {
    console.warn("[orca-focus] action block renderer unregister failed", e)
  }
  orca.panels.unregisterPanel(PANEL_VIEW)
  try {
    orca.blockMenuCommands.unregisterBlockMenuCommand(BLOCK_MENU_ID)
  } catch (e) {
    console.warn("[orca-focus] block menu unregister failed", e)
  }
  try {
    orca.headbar.unregisterHeadbarButton(HEADBAR_ID)
  } catch (e) {
    console.warn("[orca-focus] headbar unregister failed", e)
  }

  unmountDialogs()
  try {
    orca.themes.removeCSS(STYLE_ROLE)
  } catch {
    document.getElementById(`${STYLE_ROLE}-styles`)?.remove()
  }
  invalidateTagCache()
  invalidateTargetCache()
}
