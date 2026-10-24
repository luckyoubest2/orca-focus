import { getPluginKey } from "../config"
import { parseReferenceNameList } from "./util"

export interface FocusSettings {
  /** Tag applied to finished focus entries, e.g. 专注日志. */
  tagName: string
  /**
   * Names/aliases of the block that collects focus entries. Empty means: don't
   * look for a log block, append entries to the end of today's journal.
   */
  logBlockNames: string[]
  /**
   * Names/aliases of the journal section used to auto-create the log block.
   * Empty means: never auto-create a log block.
   */
  logSectionNames: string[]
  /** Open the timer panel after starting a new timer. */
  autoOpenPanel: boolean
  /** Pause all running timers when the app quits. */
  autoPauseOnExit: boolean
}

/** Empty by default: records are appended to the end of today's journal. */
const DEFAULT_LOG_BLOCK_NAMES: string[] = []

/** Empty by default: the plugin never creates a new log block. */
const DEFAULT_LOG_SECTIONS: string[] = []

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
    // Blank (or missing) values mean "append to the journal end" / "don't create".
    logBlockNames: parseReferenceNameList(typeof raw.logBlockName === "string" ? raw.logBlockName : "", []),
    logSectionNames: parseReferenceNameList(
      typeof raw.logSectionNames === "string" ? raw.logSectionNames : "",
      [],
    ),
    autoOpenPanel: raw.autoOpenPanel === true,
    autoPauseOnExit: raw.autoPauseOnExit !== false,
  }
}

export async function registerSettings(pluginName: string): Promise<void> {
  await orca.plugins.setSettingsSchema(pluginName, {
    tagName: {
      label: "专注日志标签名",
      description:
        "专注记录写到笔记里时使用的标签（默认「专注日志」）。标签上会记录开始时间、结束时间、目标块和专注ID，历史面板靠这个标签来汇总记录。注意：修改名称后，之前用旧标签写的记录不会被历史面板识别。",
      type: "string",
      defaultValue: DEFAULT_SETTINGS.tagName,
    },
    logBlockName: {
      label: "日志块名称（留空 = 写日记末尾）",
      description:
        "决定专注记录写进哪个块。填块名或别名，也支持 [[DailyLog]]、[DailyLog|Log] 这类引用写法；逗号分隔可填多个候选，按顺序匹配：① 今天的日记里按文字/别名/引用目标找 → ② 按仓库别名找。留空 = 不查找也不新建，记录直接追加到今天日记的末尾。填了但找不到时：如果下面的「日志分区名称」也为空，同样不新建、写到日记末尾；只有填了分区名称才会自动创建日志块。",
      type: "string",
      defaultValue: DEFAULT_LOG_BLOCK_NAMES.join(","),
    },
    logSectionNames: {
      label: "日志分区名称（留空 = 不自动新建）",
      description:
        "只在「上面的日志块在今天的日记和仓库别名里都找不到、需要自动创建」时生效：按顺序在今天日记里找名称/别名匹配的分区（通常是 DailyLog、今日笔记这类 H2），把新建的日志块放到它下面；一个都没找到时建在日记最外层。留空 = 不自动新建日志块，找不到日志块时记录直接写今天日记的末尾。和「日志块名称」的区别：那个决定记录写进哪个已有的块，这个只决定自动创建的新块放在哪里。逗号分隔多个候选。",
      type: "string",
      defaultValue: DEFAULT_SETTINGS.logSectionNames.join(","),
    },
    autoOpenPanel: {
      label: "开始后自动打开计时面板",
      description: "开始一个新的专注计时后，自动在右侧打开专注计时面板，方便马上看到实时用时。",
      type: "boolean",
      defaultValue: false,
    },
    autoPauseOnExit: {
      label: "退出应用时自动暂停",
      description:
        "关闭 Orca Note 时自动暂停所有进行中的计时器，下次启动后显示为已暂停，可以在计时面板继续。关闭该项后，退出时会保留运行状态，下次启动继续计时（关闭期间的时间也会计入专注时长）。",
      type: "boolean",
      defaultValue: true,
    },
  })
}
