import React, { useEffect, useRef } from "react"
import {
  confirmEndFocus,
  confirmFocusNote,
  confirmPauseFocus,
  confirmResumeFocus,
  confirmStartFocus,
} from "../actions"
import { getSettings } from "../lib/settings"
import { formatClock, formatDurationHuman } from "../lib/util"
import {
  closeDialog,
  elapsedMs,
  getTimer,
  lastOpenPause,
  pausedMs,
  useFocusStore,
} from "../store"

const { ModalOverlay, Button, CompositionTextArea } = orca.components as any

function useAutoFocus<T extends HTMLElement>(): React.RefObject<T> {
  const ref = useRef<T>(null)
  useEffect(() => {
    const handle = setTimeout(() => ref.current?.focus(), 60)
    return () => clearTimeout(handle)
  }, [])
  return ref
}

/** Read the textarea's live DOM value at submit time (no debounced state to fall behind). */
function textareaValue(ref: React.RefObject<HTMLTextAreaElement>): string {
  return ref.current?.value ?? ""
}

/**
 * Enter confirms the dialog directly. Soft returns are not accepted: Shift+Enter
 * is swallowed instead of inserting a line break. Enter during IME composition is
 * left to the IME so confirming a candidate does not submit.
 */
function submitOnEnter(submit: () => void) {
  return (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter") return
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    e.preventDefault()
    if (e.shiftKey) return
    submit()
  }
}

function StartDialog({ title }: { title: string }) {
  const inputRef = useAutoFocus<HTMLTextAreaElement>()

  const submit = () => {
    void confirmStartFocus(textareaValue(inputRef))
  }

  return (
    <ModalOverlay
      visible={true}
      canClose={true}
      onClose={() => closeDialog()}
      blurred={false}
    >
      <div className="of-dialog">
        <div className="of-dialog-title">
          <i className="ti ti-clock-play" /> 开始专注
        </div>
        <div className="of-dialog-subtitle" title={title}>
          {title}
        </div>
        <CompositionTextArea
          ref={inputRef}
          className="of-textarea"
          rows={3}
          placeholder="这次要做什么？（可留空）"
          onKeyDown={submitOnEnter(submit)}
        />
        <div className="of-dialog-hint">
          开始时会写一条日志记录；填了内容就用这段文字，留空则自动放上目标块的引用。回车直接开始。
        </div>
        <div className="of-dialog-actions">
          <Button variant="outline" onClick={() => closeDialog()}>
            取消
          </Button>
          <Button variant="solid" onClick={submit}>
            <i className="ti ti-player-play" /> 开始专注
          </Button>
        </div>
      </div>
    </ModalOverlay>
  )
}

function EndDialog({ timerId }: { timerId: string }) {
  const snapshot = useFocusStore()
  const inputRef = useAutoFocus<HTMLTextAreaElement>()
  const timer = getTimer(timerId)
  const elapsed = timer ? elapsedMs(timer, snapshot.now) : 0
  const tagName = getSettings().tagName

  const submit = () => {
    void confirmEndFocus(textareaValue(inputRef))
  }

  return (
    <ModalOverlay
      visible={true}
      canClose={true}
      onClose={() => closeDialog()}
      blurred={false}
    >
      <div className="of-dialog">
        <div className="of-dialog-title">
          <i className="ti ti-player-stop" /> 结束专注
        </div>
        <div className="of-dialog-subtitle" title={timer?.title ?? ""}>
          {timer?.title ?? "（计时器已不存在）"}
        </div>
        <div className="of-dialog-elapsed">
          <span className="of-dialog-elapsed-value">{formatDurationHuman(elapsed)}</span>
          <span className="of-dialog-elapsed-note">结束后会写到日志里，并打上 #{tagName} 标签</span>
        </div>
        <CompositionTextArea
          ref={inputRef}
          className="of-textarea"
          rows={3}
          placeholder="总结（可留空，留空则自动放上目标块的引用）"
          onKeyDown={submitOnEnter(submit)}
        />
        <div className="of-dialog-hint">回车直接结束。</div>
        <div className="of-dialog-actions">
          <Button variant="outline" onClick={() => closeDialog()}>
            取消
          </Button>
          <Button variant="solid" onClick={submit}>
            结束专注
          </Button>
        </div>
      </div>
    </ModalOverlay>
  )
}

/**
 * Optional pause reason. Like the start/end dialogs, the action only happens on
 * confirm: cancelling keeps the timer running and writes nothing.
 */
function PauseDialog({ timerId }: { timerId: string }) {
  const snapshot = useFocusStore()
  const inputRef = useAutoFocus<HTMLTextAreaElement>()
  const timer = getTimer(timerId)
  const elapsed = timer ? elapsedMs(timer, snapshot.now) : 0

  const submit = () => {
    void confirmPauseFocus(textareaValue(inputRef))
  }

  return (
    <ModalOverlay
      visible={true}
      canClose={true}
      onClose={() => closeDialog()}
      blurred={false}
    >
      <div className="of-dialog">
        <div className="of-dialog-title">
          <i className="ti ti-player-pause" /> 暂停专注
        </div>
        <div className="of-dialog-subtitle" title={timer?.title ?? ""}>
          {timer?.title ?? "（计时器已不存在）"}
        </div>
        <div className="of-dialog-elapsed">
          <span className="of-dialog-elapsed-value">{formatDurationHuman(elapsed)}</span>
          <span className="of-dialog-elapsed-note">确认后暂停 · 暂停记录会写进今天日志</span>
        </div>
        <CompositionTextArea
          ref={inputRef}
          className="of-textarea"
          rows={3}
          placeholder="这次为什么暂停？（可留空）"
          onKeyDown={submitOnEnter(submit)}
        />
        <div className="of-dialog-hint">
          暂停时会写一条日志记录；填了内容就用这段文字，留空则自动放上目标块的引用。回车直接暂停。
        </div>
        <div className="of-dialog-actions">
          <Button variant="outline" onClick={() => closeDialog()}>
            取消
          </Button>
          <Button variant="solid" onClick={submit}>
            <i className="ti ti-player-pause" /> 暂停专注
          </Button>
        </div>
      </div>
    </ModalOverlay>
  )
}

/**
 * Optional resume note. Same confirm/cancel semantics as the other dialogs:
 * cancelling keeps the timer paused and writes nothing.
 */
function ResumeDialog({ timerId }: { timerId: string }) {
  const snapshot = useFocusStore()
  const inputRef = useAutoFocus<HTMLTextAreaElement>()
  const timer = getTimer(timerId)
  const openPause = timer ? lastOpenPause(timer) : null
  const elapsed = timer ? elapsedMs(timer, snapshot.now) : 0
  const totalPaused = timer ? pausedMs(timer, snapshot.now) : 0

  const submit = () => {
    void confirmResumeFocus(textareaValue(inputRef))
  }

  return (
    <ModalOverlay
      visible={true}
      canClose={true}
      onClose={() => closeDialog()}
      blurred={false}
    >
      <div className="of-dialog">
        <div className="of-dialog-title">
          <i className="ti ti-player-play" /> 恢复专注
        </div>
        <div className="of-dialog-subtitle" title={timer?.title ?? ""}>
          {timer?.title ?? "（计时器已不存在）"}
        </div>
        <div className="of-dialog-elapsed">
          <span className="of-dialog-elapsed-value">{formatDurationHuman(elapsed)}</span>
          <span className="of-dialog-elapsed-note">
            {openPause != null ? `暂停于 ${formatClock(openPause.startMs)} · ` : ""}
            已暂停 {formatDurationHuman(totalPaused)} · 确认后继续计时
          </span>
        </div>
        <CompositionTextArea
          ref={inputRef}
          className="of-textarea"
          rows={3}
          placeholder="恢复说明（可留空，留空写默认恢复记录）"
          onKeyDown={submitOnEnter(submit)}
        />
        <div className="of-dialog-hint">
          恢复时会写一条日志记录；填了内容就用这段文字，留空则自动放上目标块的引用。回车直接继续。
        </div>
        <div className="of-dialog-actions">
          <Button variant="outline" onClick={() => closeDialog()}>
            取消
          </Button>
          <Button variant="solid" onClick={submit}>
            <i className="ti ti-player-play" /> 恢复专注
          </Button>
        </div>
      </div>
    </ModalOverlay>
  )
}

function NoteDialog({ title }: { title: string }) {
  const inputRef = useAutoFocus<HTMLTextAreaElement>()
  const tagName = getSettings().tagName

  const submit = () => {
    void confirmFocusNote(textareaValue(inputRef))
  }

  return (
    <ModalOverlay
      visible={true}
      canClose={true}
      onClose={() => closeDialog()}
      blurred={false}
    >
      <div className="of-dialog">
        <div className="of-dialog-title">
          <i className="ti ti-note" /> 插入专注备注
        </div>
        <div className="of-dialog-subtitle" title={title}>
          {title}
        </div>
        <CompositionTextArea
          ref={inputRef}
          className="of-textarea"
          rows={4}
          placeholder="记录一下此刻的进展 / 想法（按当前时间写进日志）"
          onKeyDown={submitOnEnter(submit)}
        />
        <div className="of-dialog-hint">
          会写成「HH:mm 备注内容」并打上 #{tagName}；不带起止时间。回车直接插入。
        </div>
        <div className="of-dialog-actions">
          <Button variant="outline" onClick={() => closeDialog()}>
            取消
          </Button>
          <Button variant="solid" onClick={submit}>
            插入备注
          </Button>
        </div>
      </div>
    </ModalOverlay>
  )
}

/** Mounted once into a dedicated DOM host; renders whichever dialog is pending. */
export function DialogHost() {
  const snapshot = useFocusStore()
  const dialog = snapshot.dialog
  if (dialog == null) return null
  if (dialog.kind === "start") return <StartDialog title={dialog.title} />
  if (dialog.kind === "note") return <NoteDialog title={dialog.title} />
  if (dialog.kind === "pause") return <PauseDialog timerId={dialog.timerId} />
  if (dialog.kind === "resume") return <ResumeDialog timerId={dialog.timerId} />
  return <EndDialog timerId={dialog.timerId} />
}
