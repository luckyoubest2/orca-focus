const { ContextMenu, Menu, MenuText, Button } = orca.components as any

function panelDragDataType(): string {
  try {
    const repo = String((orca.state as any).repo ?? "")
    return `orca/panel/${encodeURIComponent(repo).toLowerCase()}`
  } catch {
    return "orca/panel/"
  }
}

/**
 * Orca's internal `PanelDragHandle` is not exposed to plugins, so custom panels
 * render this equivalent draggable "⋮" button themselves: it opens the native
 * panel menu (split / maximize / wide / lock / recents / close).
 */
export function PanelMenuButton({ panelId }: { panelId: string }) {
  const closePanel = () => {
    try {
      orca.nav.close(panelId)
    } catch (e) {
      console.warn("[orca-focus] failed to close panel", e)
    }
  }

  const splitPanel = () => {
    try {
      const next = orca.nav.addTo(panelId, "right")
      if (next != null) orca.nav.switchFocusTo(next)
    } catch (e) {
      console.warn("[orca-focus] failed to split panel", e)
    }
  }

  const runPanelCommand = (id: string) => {
    try {
      orca.commands.invokeCommand(id, panelId)
    } catch (e) {
      console.warn("[orca-focus] panel command failed", id, e)
    }
  }

  return (
    <ContextMenu
      alignment="right"
      allowBeyondContainer={true}
      menu={(close: () => void) => {
        const panel = orca.nav.findViewPanel(panelId, orca.state.panels as any)
        const shortcuts = (orca.state.shortcuts ?? {}) as Record<string, string | undefined>
        const multiple = (() => {
          try {
            return orca.nav.isThereMoreThanOneViewPanel != null
              ? orca.nav.isThereMoreThanOneViewPanel()
              : true
          } catch {
            return true
          }
        })()
        return (
          <Menu>
            <MenuText
              preIcon="ti ti-layout-columns"
              title="拆分面板"
              shortcut={shortcuts["core.panel.split"]}
              onClick={() => {
                close()
                splitPanel()
              }}
            />
            {multiple && (
              <MenuText
                preIcon="ti ti-maximize"
                title={panel?.viewState?.maximized ? "还原" : "最大化"}
                postIcon={panel?.viewState?.maximized ? "ti ti-check" : undefined}
                shortcut={shortcuts["core.panel.toggleMaximize"]}
                onClick={() => {
                  close()
                  runPanelCommand("core.panel.toggleMaximize")
                }}
              />
            )}
            <MenuText
              preIcon="ti ti-viewport-wide"
              title="宽视图"
              postIcon={panel?.wide ? "ti ti-check" : undefined}
              shortcut={shortcuts["core.panel.toggleWideView"]}
              onClick={() => {
                close()
                runPanelCommand("core.panel.toggleWideView")
              }}
            />
            <MenuText
              preIcon="ti ti-lock"
              title="锁定面板"
              postIcon={panel?.locked ? "ti ti-check" : undefined}
              shortcut={shortcuts["core.panel.toggleLock"]}
              onClick={() => {
                close()
                runPanelCommand("core.panel.toggleLock")
              }}
            />
            <MenuText
              preIcon="ti ti-history"
              title="最近访问"
              shortcut={shortcuts["core.panel.showRecents"]}
              onClick={() => {
                close()
                runPanelCommand("core.panel.showRecents")
              }}
            />
            <MenuText
              preIcon="ti ti-x"
              title="关闭面板"
              shortcut={shortcuts["core.closePanel"]}
              onClick={() => {
                close()
                closePanel()
              }}
            />
          </Menu>
        )
      }}
    >
      {(open: (e: any) => void) => (
        <Button
          variant="plain"
          className="of-header-btn of-panel-menu-btn"
          title="面板菜单 / 拖动移动面板"
          onClick={(e: any) => open(e)}
          onContextMenu={(e: any) => open(e)}
          draggable={true}
          onDragStart={(e: any) => {
            try {
              e.dataTransfer.effectAllowed = "move"
              e.dataTransfer.setData(panelDragDataType(), panelId)
              ;(orca as any)._panelDragged = panelId
            } catch (err) {
              console.warn("[orca-focus] panel drag start failed", err)
            }
          }}
          onDragEnd={() => {
            ;(orca as any)._panelDragged = undefined
          }}
        >
          <i className="ti ti-dots-vertical" />
        </Button>
      )}
    </ContextMenu>
  )
}

/** Always-visible close button in the panel header. */
export function ClosePanelButton({ panelId }: { panelId: string }) {
  return (
    <Button
      variant="plain"
      className="of-header-btn of-close-btn"
      title="关闭面板"
      onClick={() => {
        try {
          orca.nav.close(panelId)
        } catch (e) {
          console.warn("[orca-focus] failed to close panel", e)
        }
      }}
    >
      <i className="ti ti-x" />
    </Button>
  )
}
