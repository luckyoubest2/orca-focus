import { PANEL_VIEW } from "../config"
import { findEditorPanel, findPanelByView, findPanelById, editorOfPanel } from "./editor"

export { findPanelByView } from "./editor"

/** Open (or focus) the custom focus panel; `args` are merged into its viewArgs. */
export function openFocusPanel(args?: Record<string, any>): string | null {
  const existing = findPanelByView(PANEL_VIEW)
  if (existing) {
    try {
      if (args != null && Object.keys(args).length > 0) {
        orca.nav.replace(PANEL_VIEW, { ...existing.viewArgs, ...args }, existing.id)
      }
    } catch (e) {
      console.warn("[orca-focus] failed to update focus panel args", e)
    }
    orca.nav.switchFocusTo(existing.id)
    return existing.id
  }
  try {
    const id = orca.nav.addTo(orca.state.activePanel, "right", {
      view: PANEL_VIEW,
      viewArgs: args ?? {},
      viewState: {},
    } as any)
    return id ?? null
  } catch (e) {
    console.warn("[orca-focus] failed to open focus panel", e)
    return null
  }
}

/** Headbar / command entry: open the panel, or focus/close it when already open. */
export function toggleFocusPanel(): void {
  const existing = findPanelByView(PANEL_VIEW)
  if (existing) {
    if (orca.state.activePanel === existing.id) {
      orca.nav.close(existing.id)
    } else {
      orca.nav.switchFocusTo(existing.id)
    }
    return
  }
  openFocusPanel()
}

export function editorPanelId(): string | null {
  const found = findEditorPanel()
  return found?.panel.id ?? null
}

export function hasEditorPanel(panelId: string | null): boolean {
  if (panelId == null) return false
  return editorOfPanel(findPanelById(panelId)) != null
}
