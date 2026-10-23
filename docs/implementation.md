# orca-focus · 实现记录

## 1. 起因与需求

在虎鲸笔记（Orca Note）里做「专注计时」：

1. 不再给块打任务标签，而是把入口挂到**块左侧小点（block handle）的右键菜单**，所有块都能发起专注；
2. 开始专注可填「这次做什么」：填了写一条开始记录到日志并引用回本块，不填不写；
3. 结束可填总结：不填也记一条默认记录，打标签、标开始/结束时间、关联回本块；
4. 有专门的面板管理所有计时器，允许**多个计时器并行**；
5. 退出应用时计时器**自动暂停**；
6. 「结束」可以**撤销**（按错结束能恢复计时）。

## 2. 关键结论（先调研后动手）

| 能力 | 结论 |
| --- | --- |
| 块小点右键菜单 | 官方 `orca.blockMenuCommands.registerBlockMenuCommand`。**注意**：非 `core.*` 命令统一渲染在菜单的「插件命令」子菜单里，不是顶层 |
| 自定义面板 | 官方 `orca.panels.registerPanel`；`PanelView` 用 `panelRenderers[view]` 渲染，组件收到 `panelId` + viewArgs |
| 开始/结束弹窗 | 全局挂一个 React root（`window.createRoot`，Orca 暴露），用 `orca.components.ModalOverlay` + `CompositionTextArea` + `Button` |
| 写开始条/结束条 | 编辑器命令 `core.editor.insertBlock` / `createRef` / `setBlocksContent` / `insertTag`；全部放进 `editor.invokeGroup` 成为**一步可撤销**操作 |
| 标签 + 起止时间 | 建 `#专注日志` 标签块（insertBlock + createAlias），`setProperties` 定义 `开始时间/结束时间/时长` 三个标签属性；实例数据用 `insertTag(..., data)` 写入 |
| 关联回源块 | `createRef(from=日志块, to=源块, RefType.Inline)` 拿到 refId，日志内容里写 `{t:"r", v:refId}` 内联引用；源块 backrefs 自动出现记录 |
| 退出自动暂停 | **Orca 退出时不会调用插件 `unload()`**（源码里 unload 只在禁用/更新/移除插件时调用）。用 `window.addEventListener("beforeunload")` 同步写 localStorage + 运行期 5s 心跳；下次启动读取时把 running 视为异常退出，按心跳时间暂停 |
| 撤销结束 | 结束写日志的命令组进编辑器撤销栈；`registerAfterCommand("core.editor.undo")` 里检测结束条是否被撤销、是则恢复计时器；另有通知「撤销」入口和命令面板命令兜底 |

## 3. 数据模型

```ts
type FocusTimer = {
  id: string
  blockId: DbId          // 镜像块已解析为真实块
  title: string
  status: "running" | "paused"
  startedAt: number      // 当前运行段起点（paused 时为 0）
  accumulatedMs: number  // 已完成的运行段累计
  createdAt: number      // 本次会话第一次开始（写日志用的开始时间）
  startNote: string      // 开始弹窗填的意图
  startLogBlockId: DbId | null
  lastSeenAt: number     // 心跳时间（崩溃恢复）
  pausedByQuit?: boolean
}
```

- 活动计时器状态：`localStorage`（主，含心跳）+ 插件数据 `timers`（兜底/跨会话），都按 repo 区分；
- 最终记录：写进笔记（原生块 + 原生标签数据），随 Orca 同步；
- 撤销记录 `EndUndoRecord`：只在内存里（原生撤销栈本身也不跨会话）。

## 4. 目录结构

```
src/
├── main.ts          load/unload：设置、块菜单、命令、面板、头栏、弹窗宿主
├── config.ts        所有 id / key
├── types.ts         FocusTimer / PersistedState / EndUndoRecord
├── store.ts         valtio store、持久化、心跳、退出暂停与启动恢复、增删改
├── actions.ts       开始/结束/撤销流程编排、undo after-hook
├── data/blocks.ts   块文本、标题、镜像解析、批量加载
├── data/journal.ts  日记日期约定（UTC 零点）、块树、名称匹配、分区查找
├── data/log.ts      日志目标定位/创建、开始条/结束条写入（写队列串行化）
├── data/tag.ts      #专注日志 标签块与属性
├── lib/editor.ts    编辑器上下文（撤销栈所在）、命令/分组调用、兜底开面板
├── lib/panels.ts    自定义面板开关、按 view 查找
├── lib/settings.ts  插件设置
├── lib/util.ts      时间/文本格式化
├── ui/blockMenu.tsx 块小点右键菜单贡献
├── ui/dialogs.tsx   开始/结束弹窗
├── ui/TimerPanel.tsx 计时面板
├── ui/FocusChip.tsx 顶栏实时计时徽标
└── styles.ts        注入 CSS
```

## 5. 关键实现细节

### 5.1 写入目标：今日「工作日志」块

1. `get-journal-block(journalDate(now))` 取当天日记块；
2. `get-block-tree` 拉整棵树并灌进 `orca.state.blocks`；
3. 在树里找文本/别名等于「工作日志」（可设置）的块；
4. 找不到 → 在配置的分区（默认 `DailyLog/今日笔记/日志`）下 `insertBlock` 一个**普通块**「工作日志」——故意不建 H2，避免今日看板（orca-daytime）多出一个「未匹配分区」；
5. 开始条/结束条作为它的 `lastChild` 追加，按时间顺序排列。

### 5.2 一条记录长什么样

```
09:12 开始专注：整理方案 ⟦源块⟧
09:12–09:40 专注 28 分钟｜写完初稿 ⟦源块⟧ #专注日志
```

- `⟦源块⟧` = 内联引用（ref fragment），点击跳回源块；
- `#专注日志` 标签实例数据：开始时间 / 结束时间 / 时长（分钟）；
- 标签块上定义同名属性 schema（datetime ×2 + number），Orca 原生渲染成属性 chip。

### 5.3 撤销

- 结束写日志使用 `editor.invokeGroup`，是一步撤销；
- `registerAfterCommand("core.editor.undo")` 触发后轮询 8×250ms 检查结束条是否消失；消失则恢复计时器（原先 running 的恢复为「继续运行、不把撤销间隔算进时长」，原先 paused 的恢复为 paused）；
- 结束成功通知带「撤销」动作；命令面板「专注：撤销上一次结束专注」直接删结束条（编辑器命令，可再撤销）+ 恢复计时器；
- 只有「刚结束的那一条」保留撤销记录（内存，一条）。

### 5.4 退出自动暂停

- 运行期每 5s 把 running 计时器的 `lastSeenAt` 写进 localStorage（只写本地，不写插件数据，避免 DB 抖动）；
- `beforeunload` / `pagehide`：把 running 计时器结算成 paused（`pausedByQuit=true`）并同步写 localStorage（同步 API 保证落盘），再 best-effort 写插件数据；
- 启动：读 localStorage / 插件数据取较新者；running → 按 `lastSeenAt` 结算后暂停（异常退出兜底）；`pausedByQuit` → 面板提示「上次退出时自动暂停了 N 个」；
- 设置里可关掉「退出自动暂停」，此时退出保留 running，下次启动继续走（离线时间计入）。

### 5.5 编辑器上下文

Orca 的编辑器命令必须经由某个**编辑器面板**执行才能进撤销栈：
`panel.viewState.editor.invokeCommand(id, cursor, ...args)`。
`lib/editor.ts` 优先当前面板、再上次使用的编辑器面板、再任意有 `viewState.editor` 的面板；都没有时自动在右侧开一个日记面板再重试。计时面板自身没有编辑器，所以从面板结束计时也走同一套兜底。

## 6. 验证

- `npx tsc --noEmit`、`npm run build` 通过；
- 用 esbuild 把 `actions/store/log` 打成一个测试 bundle，在 Node 里用 mock 的 `orca` 运行时跑通：
  1. 开始（带备注）→ 自动创建「工作日志」→ 开始条 + 内联引用；
  2. 结束（带总结）→ 结束条 + `#专注日志` + 起止/时长标签数据 + 标签 schema；
  3. 撤销结束 → 删结束条 + 恢复 running 计时器；
  4. 暂停/继续；
  5. 多计时器并行（同块不重复、不同块可并行）；
  6. `beforeunload` → 全部暂停 + localStorage 写入 `quitAt` / `pausedByQuit`；
  7. 重启恢复 → 暂停计时器 & 提示文案；
  8. 异常退出（手动伪造心跳）→ 按心跳时间恢复并暂停；
  9. autoPauseOnExit=false → 退出保持 running、重启仍 running；
  10. 模拟原生 Cmd+Z 删掉结束条 → after-hook 恢复计时器。
- 真机 UI（块菜单子项、弹窗、自定义面板、头栏徽标、CSS）需要重启 Orca 后验证，见 README「已知限制」。

## 7. 已知风险 / 待真机确认

1. 自定义面板在**重启后布局恢复**时，插件注册晚于面板首帧渲染，`PanelView` 会先回退到 block renderer（空 viewArgs → 渲染 null），插件加载后 re-render 正常；若实测有异常，可退回「自定义块页面」方案（orca-daytime 已验证过）；
2. 旧快照里 `core.editor.undo` 是否一定走命令管线（触发 after-hook）需真机确认；已用通知动作和命令面板兜底；
3. 跨午夜：开始条写开始当天、结束条写结束当天；
4. 多窗口同 repo 不同步计时状态（按单窗口设计）；
5. 工作日志块被手动删除后，下次写入会重新创建（目标缓存会失效重查）。
