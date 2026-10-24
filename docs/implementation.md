# orca-focus · 实现记录

## 1. 起因与需求

在虎鲸笔记（Orca Note）里做「专注计时」：

1. 不再给块打任务标签，而是把入口挂到**块左侧小点（block handle）的右键菜单**，所有块都能发起专注；
2. 开始专注必定写一条「开始专注」记录到日志；弹窗填的备注作为记录文本（可空）；
3. 结束可填总结：不填也记一条默认记录，打标签、标开始/结束时间，目标块以**属性引用**关联回本块；
4. 有专门的面板管理所有计时器，允许**多个计时器并行**；
5. 退出应用时计时器**自动暂停**；
6. 「结束」可以**撤销**（按错结束能恢复计时）。

## 2. 关键结论（先调研后动手）

| 能力 | 结论 |
| --- | --- |
| 块小点右键菜单 | 官方 `orca.blockMenuCommands.registerBlockMenuCommand`。**注意**：非 `core.*` 命令统一渲染在菜单的「插件命令」子菜单里，不是顶层 |
| 自定义面板 | 官方 `orca.panels.registerPanel`；`PanelView` 用 `panelRenderers[view]` 渲染，组件收到 `panelId` + viewArgs |
| 开始/结束弹窗 | 全局挂一个 React root（`window.createRoot`，Orca 暴露），用 `orca.components.ModalOverlay` + `CompositionTextArea` + `Button` |
| 写开始条/结束条 | 编辑器命令 `core.editor.insertBlock` / `createRef` / `insertTag`；全部放进 `editor.invokeGroup` 成为**一步可撤销**操作 |
| 标签 + 起止时间 | 建 `#专注日志` 标签块（insertBlock + createAlias），`setProperties` 定义 `开始时间/结束时间/目标` 三个标签属性；实例数据用 `insertTag(..., data)` 写入 |
| 关联回源块 | **不再写内联引用**：`createRef(from=日志块, to=源块, RefType.RefData)` 拿 refId，作为标签数据 `{name:"目标", type:BlockRefs, value:[refId]}` 写进 `#专注日志` 属性（Orca 标签数据按钮里可查看/跳转） |
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

### 5.2 一条记录长什么样（v0.4）

```
16:48 开始专注：⟦目标块⟧            #专注日志（开始时间、目标；结束时间空）
16:48 整理方案                      #专注日志（开始时间、目标；结束时间空）
16:50 中间备注                      #专注日志（仅目标；起止时间空）
16:51 结束专注：⟦目标块⟧            #专注日志（开始时间、结束时间、目标）
16:51 写完初稿                      #专注日志（开始时间、结束时间、目标）
```

- 记录正文 = `HH:mm` + 弹窗内容；开始/结束弹窗留空时，正文 = `开始专注：`/`结束专注：` + 内联目标引用（RefType.Inline），保证记录可读；
- 填了内容时正文不带任何引用；目标块始终通过标签的 `目标` 属性（RefType.RefData + BlockRefs 数据）关联；
- 中间备注（`writeNoteEntry`）只带 `目标`，起止时间不写。

- 结束条只保留**一个时间戳**（结束时刻），不显示时长；
- 正文里没有任何引用/内联块引用；
- 目标块通过 `#专注日志` 标签的 `目标` 属性关联（RefType.RefData 引用 + BlockRefs 类型标签数据），平时藏在标签后面的小角标里；
- 标签 schema：`开始时间` / `结束时间`（datetime）+ `目标`（BlockRefs）；v0.1 的 `时长` 属性在下次写入时自动删除；
- 记录入口：开始弹窗 / 结束弹窗 / 中间备注（块菜单「插入专注备注…」、计时面板备注按钮、命令面板）。

### 5.2.1 目标块识别

1. 取今天的日记块（日期统一 `journalDate()` 成 UTC 零点后传给 backend）；
2. 拉整棵树，并对树里的内联引用目标补加载，让 `[DailyLog|Log]` 这种「标题是别名引用」的分区能被别名匹配上；
3. 配置的日志块名称支持纯文本/别名/`[[DailyLog]]`/`[DailyLog|Log]` 写法；
4. 今日日记里找不到 → 按仓库别名（`get-blockid-by-alias`）找，比如独立的 DailyLog 页面；
5. 都没有 → 在配置的日志分区下创建一个普通块。

### 5.3 撤销

- 结束写日志使用 `editor.invokeGroup`，是一步撤销；
- `registerAfterCommand("core.editor.undo")` 触发后轮询 8×250ms 检查结束条是否消失；消失则恢复计时器（原先 running 的恢复为「继续运行、不把撤销间隔算进时长」，原先 paused 的恢复为 paused）；
- 结束成功通知带「撤销」动作；命令面板「专注：撤销上一次结束专注」直接删结束条（编辑器命令，可再撤销）+ 恢复计时器；
- 只有「刚结束的那一条」保留撤销记录（内存，一条）。

### 5.3b 专注中的块前小时钟

- Orca 没有「给已有块加装饰」的官方钩子，所以用渲染层标记：按 running 计时器的 `blockId` 找到 DOM 里的
  `.orca-block[data-id="ID"]` 以及 `.orca-block[data-mirror-id="ID"]`（镜像块），加一个 `of-block-focusing` class；
  不写入任何块内容。
- CSS 伪元素在 `.orca-repr-main-content::before` 渲染 tabler `ti-clock-play`（\f549）并做呼吸动画。
- React 重渲染可能重建 DOM 节点/覆盖 class：用 MutationObserver（120ms 节流）+ 1s 状态轮询重新补齐；
  插件 unload 时移除全部标记。
- 暂停/结束的计时器不显示。

### 5.3c 专注 ID 与历史汇总（v0.5）

- 每次开始生成 `sessionId`（`YYYYMMDD-HHmm-xxxx`），存进 `FocusTimer.sessionId` 并持久化；
- 开始/中间备注/结束条都通过标签数据写 `专注ID`（Text 类型标签属性）；标签 schema 迁移时自动补上该属性；
- 历史数据：`get-blocks-with-tags([tagName])` 查询所有记录 → 用每条 tag ref 的 data 读 `开始时间/结束时间/目标/专注ID`；
- 目标块通过 RefData 引用 id → `block.refs.find(r=>r.id===refId).to` 解析；
- 按 `专注ID` 分组；单次时长 = 组内最早 `开始时间` → 最晚 `结束时间`（首尾自动算）；没有 ID 的旧记录单条展示；
- 累计：所有有起止的会话时长求和；今日累计按开始时间的本地日期过滤；面板 tab 里展示；
- 历史 tab 在 `store.historyVersion` 变化（开始/结束/备注/撤销写入成功）时自动重查，也可手动刷新；
- 命令「专注：打开专注历史」通过 `openFocusPanel({tab:"history"})` 打开面板并切到历史 tab。

### 5.3d 块末尾悬浮操作条（v0.6）

- 需求：计时中的块，在文字末尾直接给出「备注 / 暂停·继续 / 结束」三个按钮；
- 不往阅读 DOM / contentEditable 里插节点（避免污染复制/撤销/导出），改为**固定定位浮层**：
  - 挂一个 `position: fixed; inset: 0; pointer-events: none` 的 host 到 body，React root 渲染 `BlockActionsLayer`；
  - 对每个 active timer 的块，查 `.orca-block[data-id]` / `[data-mirror-id]`（镜像也支持），拿 `.orca-repr-main-content`；
  - 用 `Range.getClientRects()` 取最后一段文字的 rect，把操作条放在 `rect.right + 6`、垂直居中，并夹在内容框内；
  - 滚动（capture）、resize、store 变更时 rAF 节流重算；600ms 轮询兜底；对比 item 列表避免无谓渲染；
  - 按钮 mousedown/click 都 preventDefault+stopPropagation，避免抢编辑器光标；备注/暂停继续/结束复用现有 action 与弹窗；
  - 无 active timer 时组件返回 null；插件 unload 时卸载 root 并移除 host。

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
- 用 esbuild 把 `actions/store/log/tag` 打成一个测试 bundle，在 Node 里用 mock 的 `orca` 运行时跑通（模拟用户真实结构：日记分区标题是 `[DailyLog|Log]`、设置写成 `[[DailyLog]]`、旧标签块带 `时长` 属性）：
  1. 开始（带备注）→ 记录写到 `[DailyLog|Log]` 分区下，不再创建「工作日志」块；正文无内联引用；标签数据含开始时间 + 目标 RefData 引用；
  2. 结束（带总结）→ 结束条只有一个时间戳、无时长；标签数据含开始/结束/目标；标签 schema 自动迁移（删 `时长`、加 `目标`）；
  3. 空总结 → 默认文案「专注」；
  4. 撤销结束 → 删结束条 + 恢复 running 计时器；
  5. 多计时器并行；
  6. `beforeunload` → 全部暂停 + localStorage `quitAt` / `pausedByQuit`；
  7. 重启恢复 → 暂停计时器 & 提示文案；
  8. 模拟原生 Cmd+Z 删掉结束条 → after-hook 恢复计时器。
- 真机 UI（块菜单子项、弹窗、自定义面板、头栏徽标、CSS）需要重启 Orca 后验证，见 README「已知限制」。

## 7. 已知风险 / 待真机确认

1. 自定义面板在**重启后布局恢复**时，插件注册晚于面板首帧渲染，`PanelView` 会先回退到 block renderer（空 viewArgs → 渲染 null），插件加载后 re-render 正常；若实测有异常，可退回「自定义块页面」方案（orca-daytime 已验证过）；
2. 旧快照里 `core.editor.undo` 是否一定走命令管线（触发 after-hook）需真机确认；已用通知动作和命令面板兜底；
3. 跨午夜：开始条写开始当天、结束条写结束当天；
4. 多窗口同 repo 不同步计时状态（按单窗口设计）；
5. 工作日志块被手动删除后，下次写入会重新创建（目标缓存会失效重查）。
