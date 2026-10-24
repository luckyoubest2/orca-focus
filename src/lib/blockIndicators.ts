import { store } from "../store"

/**
 * Orca has no official "decorate an existing block" hook, so block-level state
 * is applied by adding CSS classes to the rendered block DOM
 * (`.orca-block[data-id]` / `.orca-block[data-mirror-id]`):
 *
 * - `of-block-focusing`: a running timer → CSS draws a pulsing clock in front of
 *   the block content.
 * - `of-block-has-timer`: any active timer (running or paused) → CSS hides the
 *   right-side backref-count marker so the floating focus action bar can use
 *   that slot.
 *
 * Nothing is written into the note. React re-renders can recreate block
 * elements, so classes are re-applied by a throttled MutationObserver and a 1s
 * state poll.
 */
export const FOCUSING_CLASS = "of-block-focusing"
export const HAS_TIMER_CLASS = "of-block-has-timer"

let observer: MutationObserver | null = null
let pollHandle: ReturnType<typeof setInterval> | null = null
let scheduled: ReturnType<typeof setTimeout> | null = null
let lastSignature = ""

/** blockId -> whether any timer for that block is currently running. */
function activeBlocks(): Map<string, boolean> {
  const map = new Map<string, boolean>()
  for (const timer of store.timers) {
    const id = String(timer.blockId)
    map.set(id, (map.get(id) ?? false) || timer.status === "running")
  }
  return map
}

function signature(): string {
  return Array.from(activeBlocks().entries())
    .map(([id, running]) => `${id}:${running ? 1 : 0}`)
    .sort()
    .join(",")
}

function selectorFor(id: string): string {
  return `.orca-block[data-id="${id}"], .orca-block[data-mirror-id="${id}"]`
}

function runningStateOf(element: HTMLElement): boolean | undefined {
  const active = activeBlocks()
  const blockId = element.dataset?.id ?? ""
  if (active.has(blockId)) return active.get(blockId)
  const mirrorId = element.dataset?.mirrorId ?? ""
  if (active.has(mirrorId)) return active.get(mirrorId)
  return undefined
}

function applyClasses(element: HTMLElement, running: boolean): void {
  element.classList.toggle(FOCUSING_CLASS, running)
  element.classList.toggle(HAS_TIMER_CLASS, true)
}

function removeClasses(element: HTMLElement): void {
  element.classList.remove(FOCUSING_CLASS, HAS_TIMER_CLASS)
}

/** Add the block state classes to rendered blocks; drop stale classes. */
export function applyFocusIndicators(): void {
  if (typeof document === "undefined" || document.body == null) return
  const active = activeBlocks()

  // Clean up elements that no longer have an active timer.
  const marked = new Set<Element>()
  for (const className of [FOCUSING_CLASS, HAS_TIMER_CLASS]) {
    const collection = document.getElementsByClassName(className)
    for (let i = 0; i < collection.length; i += 1) marked.add(collection[i])
  }
  for (const element of marked) {
    const blockEl = element as HTMLElement
    const state = runningStateOf(blockEl)
    if (state === undefined) removeClasses(blockEl)
    else applyClasses(blockEl, state)
  }

  // Add classes to every rendered occurrence (real block + mirrors).
  for (const [id, running] of active) {
    const nodes = document.querySelectorAll<HTMLElement>(selectorFor(id))
    for (let i = 0; i < nodes.length; i += 1) applyClasses(nodes[i], running)
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
      if (activeBlocks().size === 0) return
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
  const marked = new Set<Element>()
  for (const className of [FOCUSING_CLASS, HAS_TIMER_CLASS]) {
    const collection = document.getElementsByClassName(className)
    for (let i = 0; i < collection.length; i += 1) marked.add(collection[i])
  }
  for (const element of marked) removeClasses(element as HTMLElement)
}
