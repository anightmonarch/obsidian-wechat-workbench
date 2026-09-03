# WeChat Workbench 本地 Codex 内容生成设计

- 状态：已授权实施
- 日期：2026-09-04
- 验收 Vault：`$HOME/workspace/Github/wechat-workbench-test-vault`
- 覆盖范围：标题候选、摘要候选、智能封面
- 前置设计：`2026-08-23-ai-content-generation-design.md`

## 1. 结论

为标题、摘要和封面增加第二条生成链路：

1. `原始 API`：继续使用插件中已配置的供应商 Base URL、API Key 和模型。
2. `本地 Codex`：插件自动发现本机 Codex CLI，复用用户已经完成的 Codex 登录，不要求在插件中填写 OpenAI API Key。

文本与图片分别保存一个默认生成方式。工作台每次生成前允许临时选择本次使用 `原始 API` 或 `本地 Codex`；临时选择不改写后台默认值，也不写入文章 Frontmatter。

本地 Codex 采用稳定的非交互命令 `codex exec --ephemeral`。不接入实验性的 app-server，不自动操作 Codex Desktop 界面，不扫描或复制 Codex 登录凭据。

本机实测已经证明：

- 在 `read-only` 沙箱且禁用 Shell 工具时，Codex 可以返回标题/摘要所需的 JSON。
- 在 `workspace-write` 沙箱且禁用 Shell 工具时，Codex 的 `image_generation` 能力可以生成 PNG。
- 生图文件位于 `$CODEX_HOME/generated_images/<thread_id>/`；插件按本次 JSONL 输出中的 `thread_id` 精确取图，不扫描全局“最新文件”。

## 2. 目标与非目标

### 2.1 目标

- 后台可分别设置文本和图片的默认生成方式。
- 前台标题、摘要、封面三种操作均可在本次请求中切换生成方式。
- 本地安装并已登录 Codex 后，插件可以自动发现并使用，不要求重复填写 Key。
- 本地 Codex 文本结果继续进入现有候选流程，不自动覆盖文章字段。
- 本地 Codex 图片继续进入现有封面候选、预览、采用和本地保存流程。
- Codex 不可用、未登录、超时、输出异常和生图能力不可用时显示可操作的中文错误。
- Codex 失败时不静默回退到原始 API，避免用户不知情地把内容发给另一服务或产生额外费用。

### 2.2 非目标

- 不在插件内实现 Codex 登录、账号切换、额度查询或续费。
- 不读取、显示、导出或迁移 `$CODEX_HOME` 中的认证内容。
- 不允许用户输入任意 Codex 命令参数或 Shell 命令。
- 不改变原始 API 供应商、模型发现和密钥保存规则。
- 不自动采用生成结果，不把候选持久化到文章。
- 不在本轮执行 GitHub Release、插件市场发布或 `git push`。

## 3. 用户交互

### 3.1 设置页

`AI 内容生成` 中的文本、图片两个模式各增加“默认生成方式”：

```text
文本模型配置
  默认生成方式  [原始 API] [本地 Codex]

  原始 API
    供应商 / Base URL / API Key / 模型 / 获取模型列表

  本地 Codex
    状态：已发现 / 未发现 / 需要登录
    路径：/opt/homebrew/bin/codex
    版本：codex-cli x.y.z
    文本生成：可用
    [重新检测]

图片模型配置
  默认生成方式  [原始 API] [本地 Codex]

  原始 API
    供应商 / Base URL / API Key / 模型 / 获取模型列表

  本地 Codex
    状态：已发现 / 未发现 / 需要登录
    图片生成：已启用 / 未启用 / 首次生成后确认
    [重新检测]
```

规则：

- 打开设置页不触发模型生成。
- 自动检测只执行本地 `--version` 和 `features list`，不发送文章内容。
- 用户可选填 Codex 可执行文件路径；为空时自动发现。
- 切换默认生成方式立即按现有设置保存机制持久化，不修改原始 API 档案。
- 两个默认值相互独立，例如文本使用本地 Codex、图片继续使用 Agnes API。

### 3.2 标题与摘要

标题和摘要生成入口旁各显示紧凑的本次生成方式选择器：

```text
生成方式  [本地 Codex v]   [生成]
```

- 初始值来自对应的文本默认生成方式。
- 用户改变选择只影响当前这一次标题或摘要生成。
- 标题和摘要各自保存本次界面会话选择；切换文章或关闭工作台后重置为后台默认值。
- 使用本地 Codex 时，候选数量、长度、去重、采用和自动保存规则保持不变。

### 3.3 智能封面

封面弹窗在主题配置之上显示本次生成方式：

```text
生成方式  [本地 Codex v]
本次将通过本机 Codex 发送标题、摘要和补充要求。可能消耗当前 Codex 账号额度。
```

- 选择 `原始 API` 时继续展示供应商、服务地址、模型和可能费用。
- 选择 `本地 Codex` 时展示 Codex 路径、版本、发送字段和额度提示，不展示 API Key。
- 切换生成方式会清除尚未采用的旧候选，防止把来源不明的候选误认为新链路结果。
- 重新生成沿用弹窗当前选择；关闭弹窗后恢复后台图片默认值。

## 4. 数据模型

设置新增：

```ts
export type GenerationBackend = 'api' | 'codex';

interface LocalCodexSettings {
  executablePath: string;
}

interface PluginSettings {
  textGenerationBackend: GenerationBackend;
  imageGenerationBackend: GenerationBackend;
  localCodex: LocalCodexSettings;
}
```

约束：

- schema 版本按现有最新版本递增一次。
- 旧设置迁移后两个默认值都是 `api`，现有用户行为不变。
- `executablePath` 是普通本地路径，不是密钥；不得把 Codex 认证数据写入 `data.json`。
- 前台临时选择只存在于工作台/弹窗内存状态。

## 5. 模块设计

### 5.1 能力与进程边界

新增模块：

- `CodexLocator`：发现并校验可执行文件。
- `CodexProcessRunner`：无 Shell 地启动受限的 Codex 子进程。
- `CodexCapabilityService`：读取版本及 `image_generation` 功能状态。
- `CodexTextGenerator`：构造文本提示、解析 JSONL 和校验最终 JSON。
- `CodexImageGenerator`：构造 `$imagegen` 提示、关联线程目录并读取生成图片。
- `GenerationRouter`：按本次冻结选择把请求路由到 API 或 Codex。

UI 只传递选择和展示状态；不得直接拼接 Codex 参数、解析进程输出或读取文件。

### 5.2 自动发现

发现顺序：

1. 用户设置的可执行文件路径。
2. 直接以 `codex` 启动并执行 `--version`，复用 Obsidian 进程的 `PATH`。
3. 当前平台的常见安装路径，例如 macOS 的 `/opt/homebrew/bin/codex` 和 `/usr/local/bin/codex`。

每个候选均使用 `spawn(executable, args, { shell: false })` 验证。目录、不可执行文件、启动失败或版本输出不合法都不能标记为可用。符号链接允许使用，但运行前解析为真实文件并确认可执行。

### 5.3 子进程规则

所有调用使用参数数组和 `shell: false`。禁止把文章内容、标题、摘要、补充要求、模型名称或路径拼进 Shell 字符串。

公共参数：

```text
codex exec
  --ephemeral
  --skip-git-repo-check
  --ignore-rules
  --ignore-user-config
  --disable shell_tool
  --disable apps
  --disable browser_use
  --disable computer_use
  --json
```

进程工作目录使用每次请求独立的系统临时目录。stdin 在启动后立即关闭。环境变量使用最小白名单，只保留 Codex 登录和进程运行所需的 `HOME`、`CODEX_HOME`、`PATH`、`TMPDIR`、用户及语言环境；插件供应商 API Key 不传给子进程。

限制：

- 文本超时 120 秒；图片超时 300 秒。
- stdout、stderr 分别设置字节上限。
- 支持 `AbortSignal`；取消或超时终止子进程。
- 只把脱敏后的固定错误码交给 UI，不显示原始 stderr。
- stderr 中的警告和 JSONL 中的中间重连事件不是最终失败；以退出码、`turn.completed` 和合法最终产物共同判定。

### 5.4 文本生成

文本运行额外使用 `--sandbox read-only` 和 `--disable image_generation`。

提示词只包含现有 `ArticleContextBuilder` 已清洗、截断后的上下文，并要求最终消息只返回 JSON：

```json
{"titles":["...","...","..."]}
```

或：

```json
{"digest":"..."}
```

解析流程：

1. 逐行解析 stdout JSONL。
2. 记录 `thread.started`，忽略可恢复的中间事件。
3. 只接受最后一个 `item.completed` 的 `agent_message.text`。
4. 按现有标题/摘要解析器执行 JSON 恢复、数量、长度、去重和截断校验。
5. 缺少 `turn.completed`、退出码非零或最终消息非法时失败。

### 5.5 图片生成

图片运行额外使用 `--sandbox workspace-write` 和 `--enable image_generation`。

提示以 `$imagegen` 开头，并只包含现有封面会话允许发送的标题、摘要、主题、是否含标题/摘要及补充要求。明确要求公众号横版、约 `2.35:1`，禁止水印；是否把文字绘制到图片中继续由现有封面选项决定。

取图流程：

1. 从 JSONL 的 `thread.started.thread_id` 获取本次线程 ID。
2. 进程成功完成后，只读取 `$CODEX_HOME/generated_images/<thread_id>/`。
3. 仅接受普通文件且扩展名/MIME 为 PNG、JPEG 或 WebP。
4. 拒绝符号链接、超大文件、空文件和无法识别的图片。
5. 多张图片时按修改时间选择本线程最新一张；读取后交给现有封面候选流程。

不得扫描 `$CODEX_HOME/generated_images` 下其他线程目录，也不得依赖 Agent 执行 `cp` 命令。

## 6. 错误契约

新增固定错误码：

| 错误码 | 用户提示 |
| --- | --- |
| `CODEX_NOT_FOUND` | 未检测到本地 Codex，请先安装或设置可执行文件路径。 |
| `CODEX_NOT_AUTHENTICATED` | 本地 Codex 尚未登录，请先在终端完成登录。 |
| `CODEX_IMAGEGEN_UNAVAILABLE` | 当前 Codex 未启用图片生成能力，请更新 Codex 或切换原始 API。 |
| `CODEX_TIMEOUT` | 本地 Codex 生成超时，请重试。 |
| `CODEX_CANCELLED` | 已取消本次生成。 |
| `CODEX_PROCESS_FAILED` | 本地 Codex 运行失败，请检查 Codex 状态后重试。 |
| `CODEX_OUTPUT_INVALID` | 本地 Codex 返回格式异常，请重新生成。 |
| `CODEX_IMAGE_NOT_FOUND` | 本地 Codex 未返回可用图片，请重新生成。 |
| `CODEX_OUTPUT_TOO_LARGE` | 本地 Codex 返回内容超过安全限制。 |

鉴权判定只匹配明确的 Codex 未登录/认证失败信号；网络重连、遥测失败和插件警告不得误报为未登录。

## 7. 安全与隐私

- 本地 Codex 是另一条明确的数据外发链路，不等于离线模型；请求会通过用户已登录的 Codex 服务处理。
- 每次生成前沿用现有披露，展示发送字段和可能消耗的账号额度。
- 禁用 Shell、浏览器、Computer Use 和 Apps，使用临时工作目录与最小环境变量。
- 不把原始 API Key、AppSecret、Access Token 或其他环境中的 Key 传入 Codex 子进程。
- 不记录完整提示、文章内容、JSONL、stderr、生成图片绝对路径或认证信息。
- 错误日志通过现有脱敏器处理，只保留错误码、阶段、退出状态和截断后的版本信息。
- 不允许静默回退，不允许自动重试生成，避免重复计费或额度消耗。

## 8. 兼容与迁移

- 旧用户升级后继续默认使用 `api`，不会因为检测到 Codex 自动改变请求来源。
- 原始 API 的 Agnes/DeepSeek 文本与 Agnes 图片能力保持不变。
- 如果后台默认选择 Codex、但运行时 Codex 不可用，前台显示明确错误并保留候选/原字段，不改走 API。
- 本地 Codex 生成的封面仍保存到 `.wechat-workbench/covers/<note-name>/`，后续预览和草稿发布不依赖 `$CODEX_HOME` 原始文件。

## 9. 验收标准

### 9.1 自动化

- 设置 schema 迁移和两个默认生成方式独立保存。
- 可执行文件发现、版本解析、功能列表解析。
- 子进程参数使用数组且 `shell: false`，环境变量经过白名单。
- 超时、取消、输出上限、非零退出、重连事件和 stderr 警告。
- 标题 3 候选、摘要 1 候选及异常 JSON。
- 图片严格按 `thread_id` 目录读取，拒绝越界路径、符号链接和异常 MIME。
- API/Codex 路由冻结、无静默回退、前台临时选择不污染后台默认值。
- 三个入口的来源选择器及错误提示。

### 9.2 真实桌面链路

构建并同步到 `$HOME/workspace/Github/wechat-workbench-test-vault`，重载 Obsidian 后完成：

1. 设置页自动识别本地 Codex 路径、版本和图片能力。
2. 后台将文本默认设为 Codex，前台使用默认值生成标题并采用一个候选。
3. 前台临时切到 API 生成摘要，再切回 Codex 生成摘要，后台默认值保持不变。
4. 后台将图片默认设为 Codex，封面弹窗显示来源和发送字段，生成真实图片、预览并采用。
5. 前台临时切到 API 的现有封面链路仍可进入原来的请求流程。
6. 临时制造未找到 Codex、超时和格式异常，确认显示对应错误且不回退 API。
7. 关闭重开工作台后，前台选择恢复后台默认值；已采用标题、摘要和封面保持正确。

真实验收记录只保存脱敏后的版本、操作、观察与结论，不保存账号、额度、完整提示或生成目录路径。

## 10. 发布边界

本设计完成和本地验收不等于公开发布。GitHub push、Release 和 Obsidian 社区插件更新仍需独立授权，并在发布前执行完整测试、构建、发布资产校验、依赖审计、敏感信息扫描和真实桌面对抗性审查。
