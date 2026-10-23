import { getPluginKey } from "../config"
import { parseReferenceNameList } from "./util"

export interface FocusSettings {
  /** Tag applied to finished focus entries, e.g. 专注日志. */
  tagName: string
  /** Names/aliases of the block that collects focus entries. */
  logBlockNames: string[]
  /** Names/aliases of the journal section used to auto-create the log block. */
  logSectionNames: string[]
  /** Open the timer panel after starting a new timer. */
  autoOpenPanel: boolean
  /** Pause all running timers when the app quits. */
  autoPauseOnExit: boolean
}

const DEFAULT_LOG_SECTIONS = ["DailyLog", "今日笔记", "日志"]

const DEFAULT_LOG_BLOCK_NAMES = ["工作日志"]

export const DEFAULT_SETTINGS: FocusSettings = {
  tagName: "专注日志",
  logBlockNames: DEFAULT_LOG_BLOCK_NAMES,
  logSectionNames: DEFAULT_LOG_SECTIONS,
  autoOpenPanel: false,
  autoPauseOnExit: true,
}

export function getSettings(): FocusSettings {
  const raw = orca.state.plugins[getPluginKey()]?.settings as Record<string, any> | undefined
  if (raw == null) return { ...DEFAULT_SETTINGS }
  return {
    tagName:
      typeof raw.tagName === "string" && raw.tagName.trim() ? raw.tagName.trim() : DEFAULT_SETTINGS.tagName,
    logBlockNames: parseReferenceNameList(
      typeof raw.logBlockName === "string" ? raw.logBlockName : "",
      DEFAULT_LOG_BLOCK_NAMES,
    ),
    logSectionNames: parseReferenceNameList(raw.logSectionNames, DEFAULT_LOG_SECTIONS),
    autoOpenPanel: raw.autoOpenPanel === true,
    autoPauseOnExit: raw.autoPauseOnExit !== false,
  }
}

export async function registerSettings(pluginName: string): Promise<void> {
  await orca.plugins.setSettingsSchema(pluginName, {
    tagName: {
      label: "专注日志标签名",
      description: "结束专注时写到日志块上的标签，标签上会记录开始/结束时间与时长。",
      type: "string",
      defaultValue: DEFAULT_SETTINGS.tagName,
    },
    logBlockName: {
      label: "日志块名称",
      description:
        "收集专注记录的块/分区名称，可填块名或别名，支持 [[DailyLog]]、[DailyLog|Log] 这类写法（逗号分隔多个候选）。优先在今天的日记里找，找不到再按仓库别名找，最后自动创建。",
      type: "string",
      defaultValue: DEFAULT_LOG_BLOCK_NAMES.join(","),
    },
    logSectionNames: {
      label: "日志分区名称",
      description:
        "逗号分隔；自动创建日志块时会放到这些名称/别名的 H2 分区下（例如 DailyLog、今日笔记）。",
      type: "string",
      defaultValue: DEFAULT_SETTINGS.logSectionNames.join(","),
    },
    autoOpenPanel: {
      label: "开始后自动打开计时面板",
      description: "开始一个新的专注计时后，自动在右侧打开计时面板。",
      type: "boolean",
      defaultValue: false,
    },
    autoPauseOnExit: {
      label: "退出应用时自动暂停",
      description: "关闭 Orca Note 时自动暂停所有进行中的计时器（下次启动后显示为已暂停）。",
      type: "boolean",
      defaultValue: true,
    },
  })
}
