export const FOCUS_CSS = `
.of-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--orca-color-bg-1);
  color: var(--orca-color-text-1);
  font-family: var(--orca-fontfamily-ui);
  font-size: var(--orca-fontsize-sm);
  overflow: hidden;
}

.of-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--orca-color-border);
  flex: 0 0 auto;
}

.of-panel-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: var(--orca-fontweight-md);
  font-size: var(--orca-fontsize-md);
}

.of-panel-title i { color: var(--orca-color-primary-5); }

.of-panel-badge {
  margin-left: 4px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--orca-color-primary-5);
  color: var(--orca-color-white);
  font-size: var(--orca-fontsize-xs);
  font-weight: var(--orca-fontweight-sm);
}

.of-panel-header-actions { display: flex; align-items: center; gap: 2px; }

.of-panel-summary {
  flex: 0 0 auto;
  padding: 6px 12px 2px;
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-xs);
}

.of-notice {
  flex: 0 0 auto;
  margin: 8px 12px 0;
  padding: 8px 10px;
  border-radius: var(--orca-radius-md);
  background: var(--orca-color-yellow-1, var(--orca-color-bg-2));
  color: var(--orca-color-text-1);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  font-size: var(--orca-fontsize-xs);
}

.of-notice-close {
  border: none;
  background: transparent;
  color: var(--orca-color-text-2);
  cursor: pointer;
  padding: 0 2px;
  flex: 0 0 auto;
}

.of-panel-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 12px 12px;
}

.of-card {
  border: 1px solid var(--orca-color-border);
  border-left: 3px solid var(--orca-color-gray-3, var(--orca-color-border));
  border-radius: var(--orca-radius-md);
  background: var(--orca-color-bg-2);
  padding: 8px 10px;
  margin-bottom: 8px;
}

.of-card-running { border-left-color: var(--orca-color-primary-5); }

.of-card-main { display: flex; align-items: center; gap: 8px; }

.of-card-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--orca-color-gray-3, var(--orca-color-border));
  flex: 0 0 auto;
}

.of-card-dot-running {
  background: var(--orca-color-primary-5);
  animation: of-pulse 1.6s ease-in-out infinite;
}

@keyframes of-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: .45; transform: scale(.82); }
}

.of-card-info { flex: 1 1 auto; min-width: 0; }

.of-card-title {
  font-weight: var(--orca-fontweight-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.of-card-title:hover { text-decoration: underline; }

.of-card-meta {
  margin-top: 1px;
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-xs);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.of-card-elapsed {
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
  font-size: var(--orca-fontsize-md);
  font-weight: var(--orca-fontweight-md);
  color: var(--orca-color-text-1);
}

.of-card-running .of-card-elapsed { color: var(--orca-color-primary-5); }

.of-card-actions {
  display: flex;
  align-items: center;
  gap: 0;
  margin-top: 4px;
  margin-left: auto;
  justify-content: flex-end;
}

.of-icon-btn { padding: 2px 6px !important; color: var(--orca-color-text-2); }
.of-icon-btn:hover { color: var(--orca-color-text-1); }
.of-icon-btn-danger:hover { color: var(--orca-color-dangerous-5, var(--orca-color-text-1)); }
.of-icon-btn.of-confirm { color: var(--orca-color-dangerous-5, var(--orca-color-text-1)); }

.of-empty {
  padding: 36px 16px;
  text-align: center;
  color: var(--orca-color-text-2);
}

.of-empty-icon { font-size: 28px; opacity: .55; }
.of-empty-title { margin-top: 8px; font-weight: var(--orca-fontweight-sm); color: var(--orca-color-text-1); }
.of-empty-text { margin-top: 4px; font-size: var(--orca-fontsize-xs); line-height: 1.6; }

.of-panel-footer {
  flex: 0 0 auto;
  padding: 8px 12px;
  border-top: 1px solid var(--orca-color-border);
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-xs);
  line-height: 1.5;
}

.of-dialog {
  width: min(480px, calc(100vw - 96px));
  max-height: 80vh;
  overflow-y: auto;
  background: var(--orca-color-bg-1);
  color: var(--orca-color-text-1);
  border-radius: var(--orca-radius-lg, var(--orca-radius-md));
  box-shadow: 0 12px 48px rgba(0, 0, 0, .28);
  padding: 18px;
  font-family: var(--orca-fontfamily-ui);
}

.of-dialog-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--orca-fontsize-lg, var(--orca-fontsize-md));
  font-weight: var(--orca-fontweight-lg, var(--orca-fontweight-md));
}

.of-dialog-title i { color: var(--orca-color-primary-5); }

.of-dialog-subtitle {
  margin-top: 6px;
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.of-dialog-elapsed {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: var(--orca-radius-md);
  background: var(--orca-color-bg-2);
}

.of-dialog-elapsed-value { font-size: var(--orca-fontsize-lg, var(--orca-fontsize-md)); font-weight: var(--orca-fontweight-md); }
.of-dialog-elapsed-note { color: var(--orca-color-text-2); font-size: var(--orca-fontsize-xs); }

.of-textarea {
  margin-top: 12px;
  width: 100%;
  min-height: 84px;
  resize: vertical;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid var(--orca-color-border);
  border-radius: var(--orca-radius-md);
  background: var(--orca-color-bg-2);
  color: var(--orca-color-text-1);
  font-family: inherit;
  font-size: var(--orca-fontsize-sm);
  line-height: 1.5;
  outline: none;
}

.of-textarea:focus { border-color: var(--orca-color-primary-5); }

.of-dialog-hint { margin-top: 6px; color: var(--orca-color-text-2); font-size: var(--orca-fontsize-xs); }

.of-dialog-actions {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.of-chip { display: flex; align-items: center; gap: 4px; }
.of-chip-time { font-variant-numeric: tabular-nums; font-size: var(--orca-fontsize-sm); }
.of-chip-active { color: var(--orca-color-primary-5); }
.of-chip-paused { font-size: var(--orca-fontsize-xs); color: var(--orca-color-text-2); }
`

/** Extra styling for the focus tag: its property data (incl. the target ref) stays
 * behind the small caret badge instead of showing in the entry content. */
export function focusTagCss(tagName: string): string {
  const safe = (tagName || "专注日志").replace(/["\\]/g, "")
  const selector = `.orca-tag[data-name="${safe.toLowerCase()}"]`
  return `
${selector} .orca-tag-data-icon {
  opacity: .6;
  font-size: .8em;
}
${selector} {
  --orca-tag-focus-accent: var(--orca-color-primary-5);
}
`
}

/** Pulsing clock marker in front of blocks that have a running focus timer.
 * The class is applied by lib/blockIndicators.ts (DOM-level marker, no note data). */
export const BLOCK_INDICATOR_CSS = `
.orca-block.of-block-focusing > .orca-repr > .orca-repr-main > .orca-repr-main-content::before {
  content: "\\f549";
  font-family: "tabler-icons";
  font-style: normal;
  font-weight: normal;
  font-variant: normal;
  text-transform: none;
  speak: none;
  -webkit-font-smoothing: antialiased;
  display: inline-block;
  width: 1em;
  height: 1em;
  line-height: 1;
  margin-right: var(--orca-spacing-sm, 4px);
  translate: 0 .125rem;
  font-size: calc(.25rem + var(--orca-block-line-height) / var(--orca-lineheight-md));
  color: var(--orca-color-primary-5);
  animation: of-focus-clock 1.8s ease-in-out infinite;
  pointer-events: none;
  user-select: none;
}

@keyframes of-focus-clock {
  0%, 100% { opacity: 1; }
  50% { opacity: .35; }
}
`

/** Tabs + history view styles. */
export const HISTORY_CSS = `
.of-tabs {
  display: flex;
  gap: 2px;
  padding: 6px 12px 0;
  border-bottom: 1px solid var(--orca-color-border);
  flex: 0 0 auto;
}

.of-tab {
  border: none;
  background: transparent;
  color: var(--orca-color-text-2);
  font-family: inherit;
  font-size: var(--orca-fontsize-sm);
  padding: 6px 10px;
  border-radius: var(--orca-radius-sm) var(--orca-radius-sm) 0 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  border-bottom: 2px solid transparent;
}

.of-tab:hover { color: var(--orca-color-text-1); background: var(--orca-color-bg-2); }
.of-tab-active { color: var(--orca-color-primary-5); border-bottom-color: var(--orca-color-primary-5); }

.of-tab-count {
  background: var(--orca-color-primary-5);
  color: var(--orca-color-white);
  border-radius: 999px;
  font-size: var(--orca-fontsize-xs);
  padding: 0 5px;
}

.of-history { display: flex; flex-direction: column; min-height: 0; flex: 1 1 auto; }

.of-history-stats {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--orca-color-border);
  flex: 0 0 auto;
}

.of-history-stat { display: flex; flex-direction: column; gap: 1px; }
.of-history-stat-label { color: var(--orca-color-text-2); font-size: var(--orca-fontsize-xs); }
.of-history-stat-value {
  font-weight: var(--orca-fontweight-md);
  font-size: var(--orca-fontsize-sm);
  font-variant-numeric: tabular-nums;
}
.of-history-refresh { margin-left: auto; }

.of-history-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 10px 12px 12px; }
.of-history-day { margin-bottom: 14px; }
.of-history-day-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 2px 2px 6px;
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-xs);
}
.of-history-day-label { color: var(--orca-color-text-1); font-weight: var(--orca-fontweight-sm); }

.of-history-session {
  border: 1px solid var(--orca-color-border);
  border-radius: var(--orca-radius-md);
  background: var(--orca-color-bg-2);
  padding: 8px 10px;
  margin-bottom: 8px;
}
.of-history-session-running { border-left: 3px solid var(--orca-color-primary-5); }
.of-history-session-head { display: flex; align-items: center; gap: 8px; }

.of-history-target {
  font-weight: var(--orca-fontweight-sm);
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 0 1 auto;
}
.of-history-target:hover { text-decoration: underline; }

.of-history-range {
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-xs);
  font-variant-numeric: tabular-nums;
  flex: 0 0 auto;
}
.of-history-duration {
  margin-left: auto;
  font-weight: var(--orca-fontweight-md);
  font-variant-numeric: tabular-nums;
  flex: 0 0 auto;
}

.of-history-badge {
  background: var(--orca-color-primary-5);
  color: var(--orca-color-white);
  border-radius: 999px;
  font-size: var(--orca-fontsize-xs);
  padding: 0 6px;
  flex: 0 0 auto;
}
.of-history-badge-legacy { background: var(--orca-color-gray-3, var(--orca-color-text-2)); }

.of-history-entries {
  margin-top: 6px;
  border-top: 1px dashed var(--orca-color-border);
  padding-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.of-history-entry {
  display: flex;
  gap: 6px;
  font-size: var(--orca-fontsize-xs);
  color: var(--orca-color-text-2);
  cursor: pointer;
  padding: 1px 2px;
  border-radius: var(--orca-radius-sm);
}
.of-history-entry:hover { background: var(--orca-color-bg-1); color: var(--orca-color-text-1); }
.of-history-entry-time { flex: 0 0 auto; font-variant-numeric: tabular-nums; }
.of-history-entry-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.of-history-error { color: var(--orca-color-dangerous-5, var(--orca-color-text-1)); font-size: var(--orca-fontsize-xs); padding: 6px 2px; }
.of-history-loading { color: var(--orca-color-text-2); font-size: var(--orca-fontsize-xs); padding: 12px 2px; }

.of-spin { animation: of-spin 1s linear infinite; }
@keyframes of-spin { to { transform: rotate(360deg); } }
`
