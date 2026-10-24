import { store } from "../store"

/**
 * Orca has no hook to decorate an existing block, so the running-focus clock
 * marker is drawn by a CSS class on the rendered block DOM
 * (`.orca-block[data-id="…"]` / `.orca-block[data-mirror-id="…"]`). Nothing is
 * written into the note.
 *
 * React re-renders can recreate block elements, so the class is re-applied by a
 * throttled MutationObserver and a 1s state poll.
 */
export const FOCUSING_CLASS = "of-block-focusing"

let observer: MutationObserver | null = null
let pollHandle: ReturnType<typeof setInterval> | null = null
let scheduled: ReturnType<typeof setTimeout> | null = null
let lastSignature = ""

function runningBlockIds(): string[] {
  const ids = new Set<string>()
  for (const timer of store.timers) {
    if (timer.status === "running") ids.add(String(timer.blockId))
  }
  return Array.from(ids)
}

function signature(): string {
  return runningBlockIds().join(",")
}

function selectorFor(id: string): string {
  return `.orca-block[data-id="${id}"], .orca-block[data-mirror-id="${id}"]`
}

/** Add the marker class to rendered blocks with a running timer; drop stale classes. */
export function applyFocusIndicators(): void {
  if (typeof document === "undefined" || document.body == null) return
  const ids = runningBlockIds()
  const wanted = new Set(ids)

  const marked = document.getElementsByClassName(FOCUSING_CLASS)
  const markedElements: Element[] = []
  for (let i = 0; i < marked.length; i += 1) markedElements.push(marked[i])
  for (const element of markedElements) {
    const blockEl = element as HTMLElement
    const blockId = blockEl.dataset?.id ?? ""
    const mirrorId = blockEl.dataset?.mirrorId ?? ""
    if (!wanted.has(blockId) && !wanted.has(mirrorId)) blockEl.classList.remove(FOCUSING_CLASS)
  }

  for (const id of ids) {
    const nodes = document.querySelectorAll<HTMLElement>(selectorFor(id))
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i]
      if (!node.classList.contains(FOCUSING_CLASS)) node.classList.add(FOCUSING_CLASS)
    }
  }
}

function scheduleApply(delay = 120): void {
  if (scheduled != null) return
  scheduled = setTimeout(() => {
    scheduled = null
    applyFocusIndicators()
  }, delay)
}

export function installFocusIndicators(): void {
  if (typeof document === "undefined" || document.body == null) return
  disposeFocusIndicators()
  applyFocusIndicators()
  lastSignature = signature()

  pollHandle = setInterval(() => {
    const next = signature()
    if (next === lastSignature) return
    lastSignature = next
    applyFocusIndicators()
  }, 1000)

  try {
    observer = new MutationObserver((records) => {
      if (runningBlockIds().length === 0) return
      for (const record of records) {
        if (record.type === "childList" && record.addedNodes.length > 0) {
          scheduleApply()
          return
        }
        if (record.type === "attributes") {
          const target = record.target as HTMLElement
          if (target.classList?.contains("orca-block")) {
            scheduleApply()
            return
          }
        }
      }
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "data-id", "data-mirror-id"],
    })
  } catch (e) {
    console.warn("[orca-focus] block indicator observer failed", e)
  }
}

export function disposeFocusIndicators(): void {
  observer?.disconnect()
  observer = null
  if (pollHandle != null) {
    clearInterval(pollHandle)
    pollHandle = null
  }
  if (scheduled != null) {
    clearTimeout(scheduled)
    scheduled = null
  }
  if (typeof document === "undefined" || document.body == null) return
  const marked = document.getElementsByClassName(FOCUSING_CLASS)
  const markedElements: Element[] = []
  for (let i = 0; i < marked.length; i += 1) markedElements.push(marked[i])
  for (const element of markedElements) element.classList.remove(FOCUSING_CLASS)
}
