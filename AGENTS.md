# AGENTS.md

## 项目身份

- GitHub 仓库：`obsidian-wechat-workbench`
- Obsidian 插件显示名：`WeChat Workbench`
- 插件 ID 与安装目录：`wechat-workbench`
- 产品形态：可公开发布的 Obsidian 桌面端社区插件
- 核心定位：Obsidian 中可验证、可复现的微信公众号发布工作台

## 当前阶段

项目当前处于实施阶段。正式设计和四阶段实施计划已经用户批准。

- 按 `docs/superpowers/plans/2026-08-19-wechat-workbench-implementation-roadmap.md` 顺序执行，不跨过阶段验收门槛。
- 当前从 Foundation 阶段开始；每项生产行为必须先有失败测试，再写最小实现。
- 开发新功能或调整行为前，先更新对应设计或计划，不能先写代码再补规则。
- AppID、AppSecret 等真实公众号信息只在 Publishing 阶段真实联调时读取，并只注入隔离测试 Vault 的 SecretStorage。
- 用户已授权开发完成后操作本机 Obsidian；后续所有开发插件安装、功能改动和真实端到端验收固定使用 `$HOME/workspace/Github/wechat-workbench-test-vault`，禁止把开发插件加载到 `commit_note` 主 Vault。

## 权威文档顺序

发生冲突时，按以下顺序处理：

1. 用户在当前任务中的明确指令
2. 本文件
3. `docs/superpowers/specs/` 下已批准的设计文档
4. 已批准的实施计划
5. Obsidian 官方开发文档与开发者政策
6. 微信公众平台官方 API 文档

不以参考项目的实现覆盖本项目规则。

## 产品边界

首版必须遵守以下边界：

- 仅支持 Obsidian 桌面端，覆盖 macOS、Windows、Linux。
- UI 只支持单公众号账号，但数据模型使用稳定账号标识，为后续扩展预留边界。
- 作者不维护云端托管服务。
- 用户在本机维护微信公众号 AppID、AppSecret、Access Token 和图片生成服务凭据。
- 插件只创建或更新微信公众号草稿，不执行正式群发或公开发布。
- 正文编辑仍由 Obsidian Markdown 编辑器负责；插件使用右侧 `ItemView` 提供预览和发布工作台。
- 被动预览完全本地执行；只有用户明确触发测试账号、加载远程资源、生成封面、复制并处理资源或同步草稿时才允许联网。

## 核心不变量

- 同一次操作的预览、复制内容和草稿正文必须来自同一个不可变 `RenderArtifact`。
- 相同输入、主题版本和渲染器版本必须生成字节一致的规范化 HTML。
- 发布事务必须区分远端提交与本地状态写入，不能把“远端成功、本地失败”误报为发布失败。
- 超时导致远端结果未知时进入 `AMBIGUOUS`，不得自动重试创建草稿。
- 已同步且内容哈希未变化时，不重复创建或更新草稿。
- 正在发布时冻结已确认的渲染产物；用户继续编辑不会改变本次请求。

## 模块边界

实现应保持以下模块职责独立：

- `NoteSnapshotService`：读取当前 Markdown 与文章元数据，生成不可变快照。
- `ThemeRegistry`：发现、校验、加载内置及 Vault 自定义主题包。
- `RenderArtifactBuilder`：把快照与主题编译为规范化发布产物。
- `PreflightEngine`：生成阻断项、警告项和可操作修复建议。
- `ClipboardService`：写入 `text/html` 与 `text/plain`。
- `WeChatClient`：封装令牌、素材、图片、草稿创建与更新 API。
- `CoverService`：封面来源选择与可插拔图片生成适配器。
- `PublishStateStore`：维护草稿关联、内容哈希、发布报告和恢复信息。
- Obsidian `ItemView`、设置页与弹窗只负责交互，不承载渲染和发布业务逻辑。

单文件职责必须清晰。不得复制参考项目中把 UI、渲染、网络和状态混在一个超大文件的结构。

## 凭据与隐私

- AppSecret、Access Token、图片生成 API Key、代理密码只能进入 Obsidian `SecretStorage`。
- 凭据不得写入 `data.json`、Frontmatter、日志、错误详情、发布报告、测试快照或仓库。
- AppID 可以保存在普通设置中；Frontmatter 只保存不可逆的账号标识哈希。
- 所有日志和错误对象必须经过统一脱敏。
- 不加入遥测、广告、作者控制的中转服务或后台上传。
- 调用图片生成服务前，必须明确展示将发送的内容、服务地址、提供商、模型和可能成本，并由用户确认。

## 网络与内容安全

- 默认不在被动预览中自动加载远程图片。
- 远程资源请求必须限制协议、重定向、超时、响应大小和真实文件类型。
- 阻止 localhost、回环地址、私网、链路本地地址及其重定向目标，防止 SSRF。
- 自定义主题禁止 JavaScript、`@import`、外部 `url()`、全局样式污染及不安全定位。
- 输出 HTML 必须经过白名单清洗；清洗后再计算内容哈希。
- 发布到微信的正文图片必须转换为微信可接受的 HTTPS 地址。

## Obsidian 规范

- 以 Obsidian 官方 Sample Plugin 与 Developer Docs 为实现基线。
- `manifest.json` 的 `id` 固定为 `wechat-workbench`，`name` 固定为 `WeChat Workbench`，`isDesktopOnly` 为 `true`。
- 最低 Obsidian 版本不得低于提供 `SecretStorage` 的 `1.11.4`。
- 插件外壳使用 Obsidian CSS 变量和原生组件语义；文章主题样式必须隔离。
- `onload` 和视图构造保持轻量，重任务在布局就绪后执行。
- 正确处理 Deferred Views，不假定 `leaf.view` 已同步实例化。
- 默认在右侧打开并复用现有插件视图；允许用户移动、缩放和关闭。

## 数据约定

- 普通全局设置和有限数量的发布报告摘要保存到插件 `data.json`。
- 文章内容元数据与草稿关联状态保存到当前笔记 Frontmatter，并保留用户未知字段及原有格式语义。
- 自定义主题默认位于 `.wechat-workbench/themes/<theme>/`，允许用户改为其他 Vault 目录。
- 生成封面位于 `.wechat-workbench/covers/<note-name>/`。
- 完整渲染产物只驻留内存，不持久化正文副本。
- 写 Frontmatter 必须采用安全合并，禁止重写或删除无关字段。

## 质量门槛

每次实现变更至少执行与风险相称的验证。正式发布前必须覆盖：

- 单元测试、黄金样例、临时 Vault 集成测试、对抗性输入测试。
- TypeScript 类型检查、lint、构建、发布资产校验、依赖审计、敏感信息扫描。
- Obsidian 最低支持版本和最新稳定版的真实桌面测试。
- macOS 完整真实链路；Windows、Linux 至少完成桌面冒烟测试。
- 专用微信公众号测试账号的真实草稿创建、更新、无变化跳过及后台视觉核对。
- 复制到真实公众号编辑器后的视觉核对。

不能把环境阻塞、既有基线失败或未执行测试描述为“通过”。验证证据统一放入 `docs/verification/`。

## Git 与发布纪律

- 保持改动小而聚焦，不修改无关文件。
- 不复制 `wesight-obsidian` 的 AGPL 源码；采用 clean-room 方式重新实现公开接口行为。
- 每次提交前执行敏感信息扫描。
- 未经用户明确批准，不执行 `git push`、rebase、reset、强制推送、npm 发布、社区插件提交或任何公开发布动作。
- 不删除文件、目录或 Git 历史，除非用户明确批准。
- 公开发布前必须重新核对 Obsidian Developer Policies、Manifest 规则和微信 API 当前要求。

## 文档与目录

- 正式设计：`docs/superpowers/specs/`
- 实施计划：`docs/superpowers/plans/`
- 验证证据：`docs/verification/`
- 用户文档：`docs/user-guide/`
- 安全与隐私说明：仓库根目录 `SECURITY.md`、`PRIVACY.md`

目录不存在时，只有在对应工作获批后才能创建。
