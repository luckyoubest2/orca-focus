import { PANEL_VIEW } from "../config"
import { findPanelByView } from "./editor"

export { findPanelByView }

/**
 * Default width of the focus panel when it is split into a horizontal row, as a
 * fraction of the row. 1/5 keeps the timer panel narrow while leaving the note
 * area usable; the user can still drag the divider to resize it.
 */
const PANEL_WIDTH_FRACTION = 1 / 5

type PanelLayoutNode = {
  id: string
  direction?: "row" | "column"
  children?: PanelLayoutNode[]
  width?: number
  height?: number
}

/** Parent container + child index of a panel (mirrors Orca's internal layout walk). */
function findPanelLayout(panelId: string): { container: PanelLayoutNode; index: number } | null {
  const stack: PanelLayoutNode[] = [orca.state.panels as any]
  while (stack.length > 0) {
    const node = stack.pop()
    if (node == null || !Array.isArray(node.children)) continue
    for (let i = 0; i < node.children.length; i += 1) {
      const child = node.children[i]
      if (child == null) continue
      if (child.id === panelId) return { container: node, index: i }
      if (Array.isArray(child.children)) stack.push(child)
    }
  }
  return null
}

/** Width fraction of a child in a horizontal row (matches Orca's PanelRow fallback). */
function rowFraction(child: PanelLayoutNode): number {
  if (typeof child.width === "number" && child.width > 0) return child.width
  if (typeof child.height === "number" && child.height > 0) return child.height
  return 0
}

/**
 * Orca splits a row evenly (50/50) when a panel is added. Shrink the focus panel
 * to its default fraction and scale the other panels proportionally.
 */
function applyDefaultPanelWidth(panelId: string): void {
  try {
    const layout = findPanelLayout(panelId)
    if (layout == null || layout.container.direction !== "row") return
    const children = layout.container.children ?? []
    if (children.length < 2) return
    const otherTotal = children.reduce(
      (sum, child, index) => (index === layout.index ? sum : sum + rowFraction(child)),
      0,
    )
    const rest = 1 - PANEL_WIDTH_FRACTION
    const values = children.map((child, index) => {
      if (index === layout.index) return PANEL_WIDTH_FRACTION
      const fraction = rowFraction(child)
      if (otherTotal > 0 && fraction > 0) return (fraction / otherTotal) * rest
      return rest / Math.max(1, children.length - 1)
    })
    orca.nav.changeSizes(panelId, values)
  } catch (e) {
    console.warn("[orca-focus] failed to set focus panel width", e)
  }
}

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
    if (id != null) {
      applyDefaultPanelWidth(id)
      return id
    }
    // Fallback for layouts where adding a panel is not possible.
    orca.nav.goTo(PANEL_VIEW as any, args ?? {})
    return null
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
