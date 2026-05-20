# 即我「安排」模块 V1-V4 完整迭代实现计划

## 1. 总目标

这份文档是「安排」模块的初始完整计划，而不是只规划产品 V1。它覆盖 V1 到 V4 的产品能力、工程拆分、数据模型演进、体验原则、验收标准和风险复盘。

「安排」模块的长期目标是：在即我中统一承载所有“还没发生，但需要后续执行、跟进、提醒、确认或让 AI 协助处理”的事项。它不是传统待办、日历或提醒的简单拼装，而是从用户真实对话、个人记录和手动输入中沉淀出的低焦虑行动中心。

已确认的产品选择：

- 底部导航新增第四栏「安排」，不替换「洞见」。
- V1 包含“手动闭环 + 一个确定性演示识别场景”。
- V2-V4 逐步补足真实 AI、日历提醒、合并归集、完成识别和 AI 执行分层。

## 2. 产品原则

### 2.1 简约优雅

- 页面应像移动端工具，而不是复杂项目管理系统。
- 少用重卡片、厚标题和营销式 hero。
- 操作路径要短，常用动作不应藏太深。
- 字体、间距、圆角和阴影沿用当前即我 Demo 的克制风格。

### 2.2 低焦虑

- 不用大面积红色提示逾期。
- 不把未完成事项变成压力墙。
- “以后再说”是核心动作，不是边角功能。
- 完成不是唯一出口，用户也可以暂放、恢复、重新安排。

### 2.3 AI 能力诚实表达

- V1 的 AI 识别是确定性演示，不伪装成真实模型能力。
- V2 开始才引入用户自填 API Key 和真实模型调用。
- AI 识别结果必须先让用户确认，不直接创建正式安排。
- AI 可执行能力必须有边界和确认，不自动越权。

### 2.4 上下文优先

- 安排详情要展示来源上下文，让用户知道安排为什么出现。
- 相似安排不急着强行合并，先让用户看见关联和建议。
- 私聊、发给自己里的安排识别都应保留原始消息片段；未来若启用群聊安排识别，也必须保留原始群聊片段。

## 3. 当前项目基线

当前 Arkme Demo 是移动端优先的 React + TypeScript + Vite 项目。

- 移动端 Demo：`http://127.0.0.1:5173/`
- 消息测试后台：`http://127.0.0.1:5173/sendtest`
- 当前主导航：`records / insight / mine`，对应「快记 / 洞见 / 我的」。
- 「洞见」目前是占位页。
- 项目已有“发给自己”、私聊/群聊测试消息、侧边栏、记录详情和 localStorage 持久化模式；群聊在 Demo 中已有测试与展示能力，但「安排」模块暂不把群聊安排识别与可见性策略纳入基线。
- 「安排」模块当前尚未实现。

## 4. V1-V4 总览

| 版本 | 目标 | 用户价值 | 核心能力 | 明确不做 | 验收方式 |
| --- | --- | --- | --- | --- | --- |
| V1 | 建立可用安排闭环 | 用户能手动管理安排，并理解 AI 识别方向 | 第四栏入口、列表、创建、详情、完成、以后再说、演示识别 | 真实大模型、日历、真实提醒、复杂合并 | 移动端可创建、持久化、完成、暂放、从演示消息生成安排 |
| V2 | 接入真实 AI 识别 | 用户能用自己的模型能力从记录/对话中提取安排 | API Key 配置、发给自己识别、私聊识别、识别草稿确认、连续多消息物品识别可选特殊情形 | 群聊安排识别与可见性决策、后台同步、自动创建 | 未配置/识别中/失败/待确认状态完整，确认后生成安排；连续多消息场景不作为基线验收 |
| V3 | 补足时间、提醒、合并和完成识别 | 用户能获得日历总览，降低重复与过期压力 | 月/周视图、提醒规则、本地提醒演示、合并建议、可能完成确认 | 真实系统级推送、复杂多人同步 | 日历可扫读，提醒可配置，合并和完成识别都需用户确认 |
| V4 | 引入 AI 执行分层 | 用户知道哪些事必须自己做，哪些可由 AI 辅助或代办 | 执行等级、AI 草稿、执行建议、确认式代办 | 自动越权执行、真实支付/外部服务操作 | 每条安排清晰展示 AI 能做什么、风险和确认动作 |

## 5. 跨版本数据模型演进

### 5.1 V1：本地安排项

V1 数据模型只服务本地可用闭环。

```ts
export type ArrangementStatus = "active" | "completed" | "later";

export type ArrangementTimeKind = "none" | "due" | "range";

export type ArrangementSourceType =
  | "manual"
  | "self"
  | "private"
  | "group"
  | "demo-ai";

export type ArrangementExecutionLevel =
  | "user-only"
  | "ai-assisted"
  | "ai-executable";

export type ArrangementSourceRef = {
  id: string;
  type: ArrangementSourceType;
  title: string;
  excerpt: string;
  createdAt: number;
};

export type ArrangementItem = {
  id: string;
  title: string;
  description: string;
  status: ArrangementStatus;
  timeKind: ArrangementTimeKind;
  dueAt: number | null;
  startAt: number | null;
  endAt: number | null;
  location: string;
  people: string[];
  reminderNote: string;
  sourceRefs: ArrangementSourceRef[];
  executionLevel: ArrangementExecutionLevel;
  createdAt: number;
  updatedAt: number;
};
```

### 5.2 V2：AI 配置与识别草稿

V2 增加真实 AI 识别，但识别结果先进入草稿确认，不直接写入正式安排。

```ts
export type AiConfig = {
  provider: "openai-compatible";
  baseUrl: string;
  model: string;
  apiKey: string;
  updatedAt: number;
};

export type AiRecognitionStatus =
  | "not-configured"
  | "configured"
  | "recognizing"
  | "failed"
  | "ready-to-confirm";

export type AiRecognitionResult = {
  title: string;
  description: string;
  timeKind: ArrangementTimeKind;
  dueAt: number | null;
  startAt: number | null;
  endAt: number | null;
  location: string;
  people: string[];
  confidence: "low" | "medium" | "high";
  reason: string;
};

export type ArrangementDraft = {
  id: string;
  sourceRefs: ArrangementSourceRef[];
  result: AiRecognitionResult;
  status: AiRecognitionStatus;
  errorMessage: string;
  createdAt: number;
};
```

### 5.3 V3：日历、提醒、合并与完成识别

V3 补充时间系统和归集能力。

```ts
export type ReminderRule = {
  id: string;
  type: "at-time" | "before" | "daily" | "weekly";
  offsetMinutes: number | null;
  enabled: boolean;
};

export type CalendarBucket = {
  dateKey: string;
  arrangementIds: string[];
};

export type MergeSuggestion = {
  id: string;
  primaryArrangementId: string;
  candidateArrangementIds: string[];
  reason: string;
  confidence: "low" | "medium" | "high";
  status: "pending" | "accepted" | "dismissed";
};

export type CompletionSuggestion = {
  id: string;
  arrangementId: string;
  sourceRefs: ArrangementSourceRef[];
  reason: string;
  status: "pending" | "accepted" | "dismissed";
};
```

### 5.4 V4：AI 执行建议

V4 不让 AI 自动越权，而是把 AI 可做事项拆成透明建议。

```ts
export type ExecutionSuggestion = {
  id: string;
  arrangementId: string;
  level: ArrangementExecutionLevel;
  title: string;
  description: string;
  userConfirmationRequired: boolean;
  riskNote: string;
  status: "draft" | "confirmed" | "dismissed";
  createdAt: number;
};
```

## 6. V1 详细计划：本地闭环与演示识别

### 6.1 目标

交付一个能真实使用的本地安排模块，用户可以手动创建安排、查看详情、完成、恢复、以后再说，并通过一个确定性演示理解 AI 从对话生成安排的方向。

### 6.2 工程改动

- 修改 `src/App.tsx`：`PageType` 增加 `"arrangements"`。
- 修改 `src/pages/Home.tsx`：底部导航增加 arrangements，当前页为 arrangements 时渲染安排页。
- 修改 `src/settings/preferences.ts`：增加 `tabs.arrangements` 和安排页所需多语言文案。
- 新建 `src/data/arrangements.ts`：类型、storage key、种子数据、读取、保存、创建、更新状态。
- 新建 `src/pages/Arrangements.tsx`：安排列表、创建弹层、详情弹层、演示识别确认卡。

### 6.3 功能清单

- 底部第四栏显示「安排」。
- 安排列表按“重点关注 / 近期 / 无明确时间 / 以后再说 / 已完成”分组。
- 创建安排支持标题、说明、时间、地点、相关人、提醒备注。
- 详情页展示安排正文、时间、地点、相关人、来源上下文、执行等级。
- 支持完成、恢复、以后再说。
- “以后再说”从主关注列表降噪，但不删除。
- 过期安排只用温和标签提示，不用大面积红色。
- 演示识别生成“明天到公司帮林夏带早餐”安排，并保留原始消息。

### 6.4 体验重点

- 创建路径尽量一步完成。
- 空状态要温和，不给用户制造“你还没规划”的压力。
- 详情页操作要明显但不压迫。
- 四栏底部导航要控制图标和文字尺寸，避免拥挤。

### 6.5 V1 验收

- `pnpm verify:answer` 通过。
- 打开 `http://127.0.0.1:5173/` 可以看到第四栏「安排」。
- 创建安排后刷新仍存在。
- 完成、恢复、以后再说都可用。
- 演示识别可以生成安排，详情能看到来源上下文。
- 无大面积红色逾期焦虑。

## 7. V2 详细计划：真实 AI 识别与 API Key

### 7.1 目标

让用户能配置自己的 OpenAI-compatible API，并从“发给自己”和私聊中识别安排。识别结果必须先进入确认卡，用户确认后才创建正式安排。连续对话中识别 A/B/C/D/E 多物品可放在 V2 作为额外特殊情形，但不进入 V2 基线验收。

### 7.2 工程改动

- 扩展 `src/data/arrangements.ts`：增加 `AiConfig`、`ArrangementDraft`、`AiRecognitionResult`、草稿读写。
- 新增或扩展安排设置入口：承载 provider、baseUrl、model、apiKey。
- 扩展 `src/pages/Arrangements.tsx`：增加 AI 配置状态、识别入口、识别结果确认卡。
- 复用已有“发给自己”和测试私聊数据作为识别来源。
- 为连续多消息识别预留 `sourceRefs` 多来源能力：同一个草稿可以引用多条候选消息，但第一阶段只在明确样例中启用。

### 7.3 功能清单

- AI 配置入口支持 provider、baseUrl、model、apiKey。
- 未配置时展示“配置后可从对话识别安排”。
- 已配置后允许用户从候选消息中触发识别。
- 识别状态包含：未配置、已配置、识别中、识别失败、待确认。
- 从“发给自己”识别一条安排，例如“后天去医院”。
- 从私聊识别一条承诺安排，例如“明天到公司帮我带早餐”。
- 可选特殊情形：从连续私聊或发给自己的多条消息中识别一条包含 A/B/C/D/E 多物品的安排，保留多条来源上下文；该能力只作为 V2 扩展样例，不影响 V2 主流程交付。
- 识别结果展示标题、时间、地点、相关人、来源和 AI 理由。
- 用户确认后创建正式安排；取消则只丢弃草稿。

### 7.4 明确不做

- 不做群聊安排识别与“只展示与我相关 / 展示全部安排”的可见性决策；虽然当前 Demo 已有群聊测试与展示能力，但安排模块暂不消费群聊作为 V2 基线来源。
- 不做后台同步。
- 不把识别结果自动创建为正式安排。
- 不把 API Key 上传到任何远端。
- 不保证所有隐喻都能识别，无法识别时引导用户手动创建。
- 不要求连续多消息 A/B/C/D/E 识别覆盖复杂真实对话；它只是可选特殊情形，不作为必须实现项。

### 7.5 体验重点

- API Key 配置要低调，不应打断手动安排主流程。
- 识别失败要给出可理解原因和重试入口。
- 待确认卡要让用户能轻松修改标题、时间、地点和人。
- 明确文案说明“将消耗你配置的模型额度”。

### 7.6 V2 验收

- 无 API Key 时，安排模块仍可完整使用 V1 能力。
- 配置 API Key 后，能触发发给自己识别和私聊识别。
- 连续多消息物品识别若实现，只需覆盖一个明确样例，并能在草稿中保留多条来源；未实现不阻塞 V2 验收。
- 识别失败不会造成页面崩溃或正式数据污染。
- 草稿确认后才进入安排列表。
- 详情页能看到识别来源上下文。

## 8. V3 详细计划：日历、提醒、合并与完成识别

### 8.1 目标

补足时间视角和长期使用体验，让用户能从日历获得总览，通过提醒管理时间，通过合并建议减少重复，通过完成识别降低手动维护成本。

### 8.2 工程改动

- 扩展安排数据：增加 `ReminderRule`、`MergeSuggestion`、`CompletionSuggestion`。
- 在安排页增加日历入口或顶部视图切换：列表 / 日历。
- 增加月视图和周视图的轻量实现。
- 扩展详情页：提醒设置、相似安排、可能完成提示。
- 扩展 AI 识别逻辑：支持相似安排判断和完成状态判断。

### 8.3 功能清单

- 日历月视图显示每天的安排点位。
- 周视图显示当天/本周安排摘要。
- 点击某天可查看当天安排列表。
- 时间类型明确区分无明确时间、截止时间、时间段。
- 提醒设置支持提前提醒、当天提醒、循环提醒的本地演示。
- 对相似安排给出合并建议，例如多条“去医院”相关安排。
- 合并后详情页展示多个来源上下文。
- 从后续对话中识别“可能已完成”，例如“我今天上午去医院体检了”。
- 完成识别必须让用户确认，不自动完成。

### 8.4 明确不做

- 不做真实系统级推送。
- 不做跨设备提醒同步。
- 不做复杂多人协作日历。
- 不自动删除被合并安排，先保留可追溯关系。
- 不自动完成安排。

### 8.5 体验重点

- 日历只做总览，不做密密麻麻的行程墙。
- 过期项仍保持温和提示。
- 合并建议要可忽略，不打断主流程。
- 完成识别文案应是“可能已完成”，避免 AI 过度确定。

### 8.6 V3 验收

- 列表和日历之间可切换。
- 同一安排能在列表和日历中一致呈现。
- 提醒规则能创建、编辑、关闭。
- 相似安排建议可接受或忽略。
- 完成建议可接受或忽略。
- 所有建议都保留来源上下文。

## 9. V4 详细计划：AI 执行分层

### 9.1 目标

让用户知道每条安排中 AI 能帮到什么程度：哪些必须自己做，哪些 AI 可以提前准备，哪些 AI 可以在确认后代办。V4 的重点是透明边界和用户确认，而不是自动化炫技。

### 9.2 工程改动

- 扩展 `ArrangementExecutionLevel` 的 UI 表达。
- 增加 `ExecutionSuggestion` 数据结构和本地持久化。
- 在详情页增加“AI 可以帮你做什么”区域。
- 为不同执行等级提供不同操作：
  - `user-only`：只给提醒和准备建议。
  - `ai-assisted`：生成草稿、清单、消息建议。
  - `ai-executable`：展示待确认执行卡。

### 9.3 功能清单

- 每条安排显示执行等级。
- 用户可手动调整执行等级。
- AI 可辅助安排展示准备建议，例如“就医前准备材料清单”。
- AI 可代办安排展示确认卡，例如“是否生成一条回复消息草稿”。
- 所有 AI 执行建议都展示风险说明。
- 用户确认前不执行任何外部操作。

### 9.4 明确不做

- 不做自动越权执行。
- 不做真实支付、挂号、下单等高风险外部操作。
- 不替用户发送消息。
- 不接真实第三方服务。
- 不隐藏 AI 的不确定性。

### 9.5 体验重点

- “AI 可帮你”区域应轻，不要压过安排本身。
- 风险说明要清楚但不吓人。
- 确认动作要明确，取消也要自然。
- 用户必须始终感觉自己掌控安排。

### 9.6 V4 验收

- 每条安排都能看到或设置执行等级。
- AI 辅助建议可生成、保留、关闭。
- AI 可代办建议必须确认后才进入下一步。
- 没有任何自动外部执行。
- 详情页仍保持简约，不变成复杂控制台。

## 10. 全版本测试策略

### 10.1 每个版本都必须运行

```sh
pnpm lint
pnpm build
pnpm verify:answer
```

### 10.2 V1 手动测试

- 打开 `http://127.0.0.1:5173/`。
- 检查第四栏「安排」。
- 创建、刷新、详情、完成、恢复、以后再说。
- 演示识别生成安排并保留来源。

### 10.3 V2 手动测试

- 未配置 API Key 时 V1 能力不受影响。
- 配置 API Key 后能从发给自己和私聊生成识别草稿。
- 若实现连续多消息 A/B/C/D/E 多物品识别，只验证一个明确样例，并确认草稿保留多条来源上下文。
- 不要求验证群聊安排识别，也不要求验证群聊安排“只看与我相关 / 看全部”的可见性策略。
- 识别失败能恢复。
- 草稿确认后才创建安排。

### 10.4 V3 手动测试

- 列表和日历切换正常。
- 截止时间、时间段、无明确时间展示正确。
- 提醒规则能创建和关闭。
- 合并建议和完成建议都可接受或忽略。

### 10.5 V4 手动测试

- 执行等级可见且可调整。
- AI 辅助建议和 AI 可代办建议边界清楚。
- 任何 AI 可代办动作都需要用户确认。

## 11. 全版本 100% 信心循环

### 第一轮：需求覆盖检查

漏洞：旧计划主要写 V1，V2-V4 只像方向摘要，不能指导后续实现。

修复：本计划将 V2、V3、V4 都扩写为目标、工程改动、功能清单、不做事项、体验重点和验收标准。

修复后结论：整个 V1-V4 都具备可执行路线。

### 第二轮：版本边界检查

漏洞：README 中 AI 识别、合并、提醒、完成识别、AI 执行分层都很重要，如果边界不清会导致第一版失控。

修复：明确 V1 做本地闭环和演示识别；V2 做真实 AI 识别；V3 做日历、提醒、合并和完成识别；V4 做 AI 执行分层。

修复后结论：每个版本都有独立价值，不需要一次做完全部能力。

### 第三轮：体验风险检查

漏洞：安排模块容易变成传统任务管理软件，给用户制造逾期和堆积焦虑。

修复：全版本都坚持低焦虑原则，V1 引入“以后再说”，V3 的过期、合并和完成识别都采用建议式、确认式设计，不自动施压。

修复后结论：计划能体现 README 中“人生充满变数，不必被任务压住”的产品哲学。

### 第四轮：工程复杂度检查

漏洞：如果继续把所有内容堆进 `Home.tsx`，实现会失控，后续版本也难维护。

修复：V1 就拆出 `src/pages/Arrangements.tsx` 和 `src/data/arrangements.ts`；后续 AI、提醒、合并、执行建议都沿着数据层和页面层扩展，不反复污染现有快记代码。

修复后结论：工程结构能支撑 V1-V4 的逐步扩展。

### 第五轮：AI 安全边界检查

漏洞：AI 识别和执行如果自动创建、自动完成或自动代办，会产生误判和越权风险。

修复：V2 识别结果先进入草稿确认；V3 完成识别只做“可能已完成”建议；V4 AI 可代办必须确认，不做真实外部操作。

修复后结论：AI 能力有清晰边界，符合用户掌控原则。

### 第六轮：群聊与连续多消息边界检查

漏洞：当前 Demo 已有群聊测试与展示能力，容易让后续实现误以为 V2 必须解决群聊中“只展示与我相关 / 展示全部安排”的产品决策；同时连续对话中识别 A/B/C/D/E 多物品涉及跨多条消息归并为一条安排，复杂度高于普通单消息识别。

修复：计划明确群聊安排识别与可见性策略暂不进入 V2 基线，即使 Demo 有群聊能力也先不消费群聊作为安排来源；连续多消息 A/B/C/D/E 识别放入 V2 作为可选特殊情形，只要求在明确样例中保留多条来源上下文，不作为必须验收项。

修复后结论：V2 保持发给自己与私聊识别的主线清晰，同时为复杂识别场景留下可演进空间，不会因为边界过宽拖垮交付。

### 最终信心结论

在当前 README 原始需求、项目基线、已确认产品选择，以及本轮对群聊与连续多消息识别边界的补充判断下，这份文档已经完整覆盖 V1-V4 的产品路线、工程路线、数据演进、体验原则、验收方式和风险修复。

我对这份 V1-V4 完整迭代计划作为后续实现依据有 100% 信心。
