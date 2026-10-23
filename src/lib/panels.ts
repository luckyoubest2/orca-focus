import { PANEL_VIEW } from "../config"
import { findEditorPanel, findPanelByView, findPanelById, editorOfPanel } from "./editor"

export { findPanelByView } from "./editor"

/** Register the custom timer panel view type as a right-side panel. */
export function openFocusPanel(): string | null {
  const existing = findPanelByView(PANEL_VIEW)
  if (existing) {
    orca.nav.switchFocusTo(existing.id)
    return existing.id
  }
  try {
    const id = orca.nav.addTo(orca.state.activePanel, "right", {
      view: PANEL_VIEW,
      viewArgs: {},
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
