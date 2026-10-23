import React, { useEffect, useRef, useState } from "react"
import { confirmEndFocus, confirmStartFocus } from "../actions"
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

function StartDialog({ blockId, title }: { blockId: number; title: string }) {
  const [note, setNote] = useState("")
  const inputRef = useAutoFocus<HTMLTextAreaElement>()

  const submit = () => {
    void confirmStartFocus(note)
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
          placeholder="这次要做什么？（可留空；填写后会在工作日志里留一条「开始」记录）"
          value={note}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNote(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault()
              submit()
            }
          }}
        />
        <div className="of-dialog-hint">保留为空也可以直接开始，不会写日志。</div>
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
  const [summary, setSummary] = useState("")
  const inputRef = useAutoFocus<HTMLTextAreaElement>()
  const timer = getTimer(timerId)
  const elapsed = timer ? elapsedMs(timer, snapshot.now) : 0

  const submit = () => {
    void confirmEndFocus(summary)
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
          <span className="of-dialog-elapsed-note">结束后会写入「工作日志」并打上 #专注日志 标签</span>
        </div>
        <CompositionTextArea
          ref={inputRef}
          className="of-textarea"
          rows={3}
          placeholder="总结（可留空；留空时用默认文案记录）"
          value={summary}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSummary(e.target.value)}
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

/** Mounted once into a dedicated DOM host; renders whichever dialog is pending. */
export function DialogHost() {
  const snapshot = useFocusStore()
  const dialog = snapshot.dialog
  if (dialog == null) return null
  if (dialog.kind === "start") return <StartDialog blockId={dialog.blockId} title={dialog.title} />
  return <EndDialog timerId={dialog.timerId} />
}
