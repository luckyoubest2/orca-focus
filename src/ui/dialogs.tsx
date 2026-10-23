import React, { useEffect, useRef } from "react"
import { confirmEndFocus, confirmFocusNote, confirmStartFocus } from "../actions"
import { closeDialog, elapsedMs, getTimer, useFocusStore } from "../store"
import { formatDurationHuman } from "../lib/util"

const { ModalOverlay, Button, CompositionTextArea } = orca.components as any

function useAutoFocus<T extends HTMLElement>(): React.RefObject<T> {
  const ref = useRef<T>(null)
  useEffect(() => {
    const handle = setTimeout(() => ref.current?.focus(), 60)
    return () => clearTimeout(handle)
  }, [])
  return ref
}

/**
 * Read the textarea's DOM value at submit time instead of relying on a debounced
 * onChange state: typing and clicking「开始专注」quickly used to lose the note.
 */
function textareaValue(ref: React.RefObject<HTMLTextAreaElement>): string {
  return ref.current?.value ?? ""
}

function StartDialog({ blockId, title }: { blockId: number; title: string }) {
  const inputRef = useAutoFocus<HTMLTextAreaElement>()

  const submit = () => {
    void confirmStartFocus(textareaValue(inputRef))
  }

  return (
    <ModalOverlay
      visible={true}
      canClose={true}
      onClose={() => closeDialog()}
      className="of-modal"
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
          onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault()
              submit()
            }
          }}
        />
        <div className="of-dialog-hint">
          开始时会写一条日志记录；填了内容就用这段文字，留空则自动放上目标块的引用。
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

  const submit = () => {
    void confirmEndFocus(textareaValue(inputRef))
  }

  return (
    <ModalOverlay
      visible={true}
      canClose={true}
      onClose={() => closeDialog()}
      className="of-modal"
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
          <span className="of-dialog-elapsed-note">结束后会写到日志里，并打上 #专注日志 标签</span>
        </div>
        <CompositionTextArea
          ref={inputRef}
          className="of-textarea"
          rows={3}
          placeholder="总结（可留空，留空写默认文案「专注」）"
          onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault()
              submit()
            }
          }}
        />
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

function NoteDialog({ timerId, title }: { timerId: string; title: string }) {
  const inputRef = useAutoFocus<HTMLTextAreaElement>()

  const submit = () => {
    void confirmFocusNote(textareaValue(inputRef))
  }

  return (
    <ModalOverlay
      visible={true}
      canClose={true}
      onClose={() => closeDialog()}
      className="of-modal"
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
          onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault()
              submit()
            }
          }}
        />
        <div className="of-dialog-hint">
          会写成「HH:mm 备注内容」并打上 #专注日志；只带目标引用，不带起止时间。
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
  if (dialog.kind === "start") return <StartDialog blockId={dialog.blockId} title={dialog.title} />
  if (dialog.kind === "note") return <NoteDialog timerId={dialog.timerId} title={dialog.title} />
  return <EndDialog timerId={dialog.timerId} />
}
