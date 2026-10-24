import { store } from "../store"

/** One rendered "block end actions" toolbar (fixed-position, viewport coords). */
export interface BlockActionItem {
  key: string
  timerId: string
  status: "running" | "paused"
  top: number
  left: number
}

/** Estimated toolbar width used to clamp the overlay inside the block content box. */
const TOOLBAR_WIDTH = 100
const TOOLBAR_HEIGHT = 22

type RectLike = { top: number; left: number; right: number; bottom: number; width: number; height: number }

function contentElementOf(blockEl: HTMLElement): HTMLElement | null {
  const direct = blockEl.querySelector<HTMLElement>(
    ":scope > .orca-repr > .orca-repr-main > .orca-repr-main-content",
  )
  if (direct != null) return direct
  return blockEl.querySelector<HTMLElement>(".orca-repr-main-content")
}

/** Rect of the last piece of content (end of the block's text), falling back to the content box. */
function anchorRect(content: HTMLElement, contentRect: RectLike): RectLike {
  try {
    const range = document.createRange()
    range.selectNodeContents(content)
    const rects = Array.from(range.getClientRects()).filter(
      (rect) => rect.width > 1 && rect.height > 1,
    )
    if (rects.length > 0) return rects[rects.length - 1]
  } catch {
    /* ignore range measurement errors */
  }
  return contentRect
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Compute the fixed-position toolbar items for every rendered occurrence of a
 * block that currently has a focus timer (real block and mirror copies).
 *
 * This is an overlay: nothing is inserted into Orca's editor DOM or note
 * content, so it cannot pollute contentEditable / undo / copy.
 */
export function computeBlockActionItems(): BlockActionItem[] {
  if (typeof document === "undefined" || document.body == null) return []
  const items: BlockActionItem[] = []
  const seen = new Set<string>()
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0

  for (const timer of store.timers) {
    if (timer.status !== "running" && timer.status !== "paused") continue
    const selector = `.orca-block[data-id="${timer.blockId}"], .orca-block[data-mirror-id="${timer.blockId}"]`
    let nodes: NodeListOf<HTMLElement>
    try {
      nodes = document.querySelectorAll<HTMLElement>(selector)
    } catch {
      continue
    }
    for (let i = 0; i < nodes.length; i += 1) {
      const blockEl = nodes[i]
      const content = contentElementOf(blockEl)
      if (content == null) continue
      const contentRect = content.getBoundingClientRect()
      if (contentRect.width < 20 || contentRect.height <= 0) continue
      if (contentRect.bottom < 0 || contentRect.top > viewportHeight) continue

      const anchor = anchorRect(content, contentRect)
      const maxLeft = Math.max(contentRect.left, contentRect.right - TOOLBAR_WIDTH)
      const left = clamp(anchor.right + 6, contentRect.left, maxLeft)
      const top = Math.max(0, anchor.top + (anchor.height - TOOLBAR_HEIGHT) / 2)
      if (viewportWidth > 0 && (left < 0 || left > viewportWidth)) continue

      const rnd = blockEl.dataset.rndId ?? blockEl.dataset.id ?? String(i)
      const key = `${timer.id}:${rnd}`
      if (seen.has(key)) continue
      seen.add(key)
      items.push({
        key,
        timerId: timer.id,
        status: timer.status as "running" | "paused",
        top: Math.round(top * 2) / 2,
        left: Math.round(left * 2) / 2,
      })
    }
  }

  items.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  return items
}

/** Cheap equality check so the overlay only re-renders when something visible changed. */
export function sameBlockActionItems(a: BlockActionItem[], b: BlockActionItem[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i]
    const right = b[i]
    if (left.key !== right.key || left.timerId !== right.timerId || left.status !== right.status) {
      return false
    }
    if (Math.abs(left.top - right.top) > 0.5 || Math.abs(left.left - right.left) > 0.5) return false
  }
  return true
}
