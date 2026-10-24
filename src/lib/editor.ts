import { journalDate } from "../data/journal"

export type EditorApi = {
  invokeCommand: (id: string, cursor: any, ...args: any[]) => Promise<any>
  invokeGroup: (fn: () => Promise<void>, opts?: { undoable?: boolean; topGroup?: boolean }) => Promise<void>
}

export type ViewPanelLike = {
  id: string
  view: string
  viewArgs: Record<string, any>
  viewState: Record<string, any>
}

type PanelNode = {
  id: string
  children?: PanelNode[]
  view?: string
  viewArgs?: Record<string, any>
  viewState?: Record<string, any>
}

export function forEachViewPanel(
  node: unknown,
  cb: (panel: ViewPanelLike) => void,
): void {
  if (node == null || typeof node !== "object") return
  const anyNode = node as PanelNode
  if (Array.isArray(anyNode.children)) {
    for (const child of anyNode.children) forEachViewPanel(child, cb)
    return
  }
  if (typeof anyNode.view === "string") {
    cb({
      id: anyNode.id,
      view: anyNode.view,
      viewArgs: anyNode.viewArgs ?? {},
      viewState: anyNode.viewState ?? {},
    })
  }
}

export function allViewPanels(): ViewPanelLike[] {
  const out: ViewPanelLike[] = []
  forEachViewPanel(orca.state.panels, (panel) => out.push(panel))
  return out
}

export function findPanelById(panelId: string): ViewPanelLike | null {
  return allViewPanels().find((panel) => panel.id === panelId) ?? null
}

export function findPanelByView(view: string): ViewPanelLike | null {
  return allViewPanels().find((panel) => panel.view === view) ?? null
}

export function editorOfPanel(panel: ViewPanelLike | null | undefined): EditorApi | null {
  const editor = panel?.viewState?.editor
  return editor && typeof editor.invokeCommand === "function" ? (editor as EditorApi) : null
}

let lastEditorPanelId: string | null = null

/** Prefer the active panel's editor, then the last used editor panel, then any editor panel. */
export function findEditorPanel(): { panel: ViewPanelLike; editor: EditorApi } | null {
  const panels = allViewPanels()
  const active = panels.find((panel) => panel.id === orca.state.activePanel) ?? null
  const activeEditor = editorOfPanel(active)
  if (active != null && activeEditor != null) {
    lastEditorPanelId = active.id
    return { panel: active, editor: activeEditor }
  }
  const last = lastEditorPanelId ? panels.find((panel) => panel.id === lastEditorPanelId) : null
  const lastEditor = editorOfPanel(last)
  if (last != null && lastEditor != null) return { panel: last, editor: lastEditor }
  for (const panel of panels) {
    const editor = editorOfPanel(panel)
    if (editor != null) {
      lastEditorPanelId = panel.id
      return { panel, editor }
    }
  }
  return null
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Return an editor-capable panel. When every note panel has been closed, open a
 * journal panel on the side so writes still have an undo history to land in.
 */
export async function ensureEditor(): Promise<{ panel: ViewPanelLike; editor: EditorApi } | null> {
  const found = findEditorPanel()
  if (found) return found

  try {
    const id = orca.nav.addTo(orca.state.activePanel, "right", {
      view: "journal",
      viewArgs: { date: journalDate() },
      viewState: {},
    } as any)
    if (id != null) {
      for (let i = 0; i < 30; i += 1) {
        await wait(100)
        const panel = findPanelById(id)
        const editor = editorOfPanel(panel)
        if (panel && editor) {
          lastEditorPanelId = panel.id
          return { panel, editor }
        }
      }
    }
  } catch (e) {
    console.warn("[orca-focus] failed to open a fallback editor panel", e)
  }
  return findEditorPanel()
}

/** Run an editor command in an editor-capable panel (undo enters that panel's history). */
export async function runEditorCommand(id: string, ...args: any[]): Promise<any> {
  const ctx = await ensureEditor()
  if (!ctx) throw new Error("orca-focus: no editor panel available")
  return ctx.editor.invokeCommand(id, null, ...args)
}

/** Run several editor commands as a single undoable step. */
export async function runEditorGroup(
  fn: (editor: EditorApi) => Promise<void>,
  opts: { undoable?: boolean; topGroup?: boolean } = { undoable: true },
): Promise<void> {
  const ctx = await ensureEditor()
  if (!ctx) throw new Error("orca-focus: no editor panel available")
  await ctx.editor.invokeGroup(() => fn(ctx.editor), opts)
}
