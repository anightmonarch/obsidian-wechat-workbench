# WeChat Workbench Implementation Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个可本地验证、可公开发布的 Obsidian 桌面端微信公众号工作台，并保证预览、复制和草稿同步共享确定性渲染产物。

**Architecture:** 项目按四个可独立验收的阶段实施。第一阶段建立官方插件骨架、SecretStorage 和隔离测试 Vault；第二阶段交付本地渲染、主题、预检、右侧视图和复制；第三阶段交付微信素材与可恢复草稿事务；第四阶段补齐封面生成、对抗验证和公开发布资产。

**Tech Stack:** TypeScript 5.8、Obsidian API 1.13 类型定义、最低 Obsidian 1.11.4、esbuild、Vitest、jsdom、unified/remark/rehype、PostCSS、juice、KaTeX、Mermaid、Electron 桌面 API、微信公众平台 API。

## Global Constraints

- 仓库名固定为 `obsidian-wechat-workbench`；插件显示名固定为 `WeChat Workbench`；插件 ID 固定为 `wechat-workbench`。
- `manifest.json.minAppVersion` 固定为 `1.11.4`，`isDesktopOnly` 固定为 `true`。
- 只支持单账号 UI；不得加入作者云端、遥测、广告、正式群发或移动端能力。
- AppSecret、Access Token、图片 API Key 只进入 Obsidian `SecretStorage` 和请求内存。
- 被动预览完全本地；网络只能由用户明确动作触发。
- 预览、复制和草稿正文必须来自同一个不可变 `RenderArtifact`。
- 远端草稿结果未知时进入 `AMBIGUOUS`，不得自动重试创建。
- 采用 MIT 许可证和 clean-room 实现，不复制 WeSight AGPL 源码、CSS 或非公开协议。
- 每个任务先写失败测试，再写最小实现；提交前执行敏感信息扫描。
- 开发只使用独立测试 Vault，不在 `commit_note` 主 Vault 中加载开发插件。

---

## 阶段拆分

| 顺序 | 计划 | 可独立验收的交付物 | 进入下一阶段的门槛 |
| --- | --- | --- | --- |
| 1 | [Foundation and Local Development](./2026-08-19-wechat-workbench-foundation-plan.md) | 插件可在独立 Vault 本地安装；设置、SecretStorage、空工作台可用 | 测试、lint、类型检查、构建、本地加载通过 |
| 2 | [Rendering and Workbench UI](./2026-08-19-wechat-workbench-rendering-plan.md) | 4 主题、实时预览、预检、复制和 HTML 源码可用 | 黄金样例确定性、真实微信编辑器复制核对通过 |
| 3 | [WeChat Draft Transaction](./2026-08-19-wechat-workbench-publishing-plan.md) | 素材上传、创建/更新/跳过、恢复和报告可用 | 专用测试号真实草稿创建与更新通过 |
| 4 | [Cover, Security, and Release](./2026-08-19-wechat-workbench-cover-release-plan.md) | 本地/AI 封面、对抗测试、三平台验证和发布资产完整 | 全部发布门槛通过，等待用户批准公开发布 |

四个阶段必须按顺序执行。后续阶段只能依赖前序计划列出的公开接口，不得绕过接口直接读取其他模块内部状态。

### 已批准的增量计划

下列增量计划在对应基础阶段完成后、最终发布候选验收前执行：

| 顺序 | 计划 | 前置条件 | 验收门槛 |
| --- | --- | --- | --- |
| 1 | [Account, Cover, and UI Refinement](./2026-08-22-account-cover-ui-refinement-plan.md) | Foundation、Rendering、Publishing 生产骨架完成 | 账号设置、三来源封面和 Obsidian 原生 UI 门禁通过 |
| 2 | [AI Content Generation](./2026-08-23-ai-content-generation-plan.md) | 上一增量计划已落地；AI 内容生成设计已批准 | 双 Endpoint、文本候选、无闪烁自动保存、封面候选会话与固定 Vault 验收通过 |

增量计划只覆盖其规格明确列出的行为，不得降低四阶段路线中的发布事务、安全、跨平台和公开发布门槛。

## Design Coverage

| 设计章节 | 实施计划 |
| --- | --- |
| 1–4 结论、调研、用户、范围 | 全局约束与本路线图 |
| 5 交互设计 | Foundation Task 3；Rendering Tasks 6–7；Publishing Task 7 |
| 6 系统架构 | 四阶段 File Map 与 Interfaces |
| 7 渲染产物 | Rendering Tasks 1、3、4 |
| 8 Markdown/HTML | Rendering Tasks 3、4 |
| 9 主题系统 | Rendering Task 2、8 |
| 10 数据与存储 | Foundation Task 2；Publishing Tasks 3、5 |
| 11 主要数据流 | Rendering Tasks 6–7；Publishing Task 6；Cover Tasks 2–3 |
| 12 草稿关联 | Publishing Tasks 5–6 |
| 13 状态机 | Publishing Task 6 |
| 14 异常与恢复 | Publishing Tasks 5–7 |
| 15 发布预检 | Rendering Task 5；Publishing Task 7 |
| 16 安全与隐私 | Foundation Tasks 2、4；Publishing Tasks 1–2；Cover Tasks 2、4–5 |
| 17 IP 白名单指南 | Publishing Task 8 |
| 18 测试与本地加载 | Foundation Tasks 4–5；各阶段最后验收任务 |
| 19 发布门槛 | Cover Tasks 4–5 |
| 20 验收标准 | 四个 Phase Acceptance 合并验收 |
| 21 实施顺序 | 本路线图阶段顺序 |
| 22 已接受取舍 | 全局约束，所有任务隐式继承 |

## 统一源码结构

```text
obsidian-wechat-workbench/
├── AGENTS.md
├── LICENSE
├── README.md
├── SECURITY.md
├── PRIVACY.md
├── manifest.json
├── versions.json
├── package.json
├── package-lock.json
├── tsconfig.json
├── eslint.config.mjs
├── esbuild.config.mjs
├── vitest.config.ts
├── styles.css
├── scripts/
│   ├── sync-test-vault.mjs
│   ├── verify-release.mjs
│   └── scan-secrets.mjs
├── src/
│   ├── main.ts
│   ├── domain/
│   ├── settings/
│   ├── render/
│   ├── themes/
│   ├── preflight/
│   ├── clipboard/
│   ├── wechat/
│   ├── publish/
│   ├── cover/
│   ├── security/
│   └── ui/
├── tests/
│   ├── fixtures/
│   ├── golden/
│   ├── integration/
│   └── unit/
└── docs/
    ├── superpowers/
    ├── user-guide/
    └── verification/
```

## 统一验证命令

每个阶段结束时执行：

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run verify:release
npm run scan:secrets
```

如果某项因尚未到对应阶段而不存在，前序阶段必须提供一个真实执行且明确报告“当前无该类资产”的脚本，不得使用恒定成功的空壳命令。

## 执行纪律

- 每个任务单独提交；提交消息使用 Conventional Commits。
- 每个提交只包含该任务列出的文件。
- 每次提交前运行任务级测试和 `npm run scan:secrets`。
- 每个阶段结束后做一次独立规格符合性审查和一次代码质量审查。
- 真实微信、真实图片 API 和跨平台验证证据放入 `docs/verification/`，凭据和远端完整响应不得入库。
- Git push、GitHub Release、BRAT 公测、社区提交和 npm 发布均不属于计划自动动作，必须再次取得用户明确批准。
