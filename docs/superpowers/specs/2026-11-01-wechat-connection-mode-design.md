# 微信连接模式：本地直连与公共中转设计

- 日期：2026-11-01
- 状态：已按用户当前指令批准（本任务只落设计文档，不实施、不提交）
- 前置：`2026-08-18-wechat-workbench-design.md`；现有 `WeChatApiRelayTransport`、`settings-tab` 账号卡、`PluginSettings.wechatApiBaseUrl` / `wechatProxyAccessKey` / SecretStorage `wechatProxySecret`
- 范围：账号设置卡连接模式 UI 简化 + 内置公共中转零 AK/SK 输入；不含自定义自建中转 UI、不含 commit/push/release

## 1. Goal

简化账号设置：

1. **默认本地直连**：插件从用户本机出口 IP 访问 `api.weixin.qq.com`。
2. **可选公共中转**：一键切换到内置中转 `http://121.196.229.165:18080`，用户**零 AK/SK 输入**。
3. 去掉冗长引导段落与纵向换行标签；主 UI 不再暴露「微信 API 代理地址 / 代理 Access Key / 代理 Secret」。

权威冲突说明：`AGENTS.md` 曾写「作者不维护云端托管服务」「不加入作者控制的中转服务」。本设计经用户明确批准，将**可选公共中转**作为产品例外纳入设置；自定义自建中转 UI 仍属 Non-goals。后续更新 `AGENTS.md` / `SECURITY.md` / `PRIVACY.md` 时需同步此边界，不在本任务完成。

## 2. Connection modes（仅 2 种）

| Mode ID | UI 文案 | 行为 |
| --- | --- | --- |
| `local`（默认） | 本地直连 | 请求直达 `https://api.weixin.qq.com`；展示当前 egress IP + 一行白名单提示 + 复制 |
| `public_relay` | 公共中转 | 经内置中转 `http://121.196.229.165:18080` 转发；绿色提示框展示固定 IP `121.196.229.165` + 复制；无自定义地址、无用户可见 AK/SK |

不允许第三种面向用户的模式（无「自定义代理」分段）。高级自建中转延后。

## 3. UI layout（已批准：layout A + tip mock C）

账号卡顶部使用 **Segmented control**：

```
[ 本地直连 | 公共中转 ]
```

字段区（两种模式始终相同）：

- 公众号名称
- AppID
- AppSecret（password + eye 切换，沿用现有控件）

字段下方 **Tip box**（随模式切换内容，去掉长段落）：

- **`local`**：展示当前 egress IP（验证失败/成功路径已有的 `whitelistIp` 或等价探测结果）；一行白名单提示，例如「将此 IP 加入公众号平台 IP 白名单」；提供复制按钮。无 IP 时显示简短占位（如「验证连接后显示出口 IP」），不恢复长文案。
- **`public_relay`**：绿色提示框（对齐 mock C），固定展示可复制 IP `121.196.229.165`；文案说明将该 IP 加入白名单即可。不展示中转 URL、不展示 AK/SK。

移除：

- 引导区长段落（「插件直接从本地…」「若配置了下方「微信 API 代理」…」等）
- 主 UI 中的「微信 API 代理地址」「代理 Access Key」「代理 Secret」及对应 desc
- 任何导致 Setting 名称纵向换行、冗长换行的标签文案

保留不变：

- 「保存账号配置」按钮与现有保存主流程（账号名 / AppID / AppSecret + 新的 `connectionMode`）
- 「验证连接 / 重新验证」「打开公众号后台」等能力（文案可随 tip 变短，行为不变）
- 状态区（CONNECTED / FAILED / VERIFYING 等）

布局示意（语义，非像素稿）：

```
┌─ account-card ─────────────────────────────┐
│  [ 本地直连 | 公共中转 ]                    │
│  status …                                   │
│  公众号名称  [________]                     │
│  AppID       [________]                     │
│  AppSecret   [••••••••][eye]                │
│  ┌ tip-box ─────────────────────────────┐  │
│  │ local: 出口 IP x.x.x.x  [复制] + 一行提示 │
│  │ 或 public: 绿底 121.196.229.165 [复制]   │
│  └──────────────────────────────────────┘  │
│  [保存账号配置]  [验证连接] …               │
└────────────────────────────────────────────┘
```

## 4. Public relay security

### 4.1 客户端

- 公共中转的 **base URL + Access Key + Secret** 以**编译期或打包常量**嵌入插件构建产物，**不在 UI 展示、不写入用户 `data.json`、不要求用户粘贴**。
- `public_relay` 模式下，`WeChatApiRelayTransport` 使用上述常量；请求改写目标主机为中转，并为发往原 `api.weixin.qq.com` 的路径附加：
  - `X-WeChat-Proxy-Key`
  - `X-WeChat-Proxy-Secret`
- `local` 模式下 `baseUrl` 视为空：transport 直通，不附加代理头。
- 常量不得出现在 Notice、日志、错误详情、发布报告、测试快照或仓库明文文档的「用户必填」说明中；仓库内可用占位符描述机制，真实 secret 仅存在于构建机密或服务端配置。

### 4.2 服务端（公共中转）

- 校验 `X-WeChat-Proxy-Key` + `X-WeChat-Proxy-Secret`；失败拒绝转发。
- **按客户端 IP 与按 AppID** 限流（具体阈值由运维配置，插件侧不暴露调参 UI）。
- 监控异常流量；异常时可临时拒绝或轮换密钥。

### 4.3 诚实边界（必须写入实现注释与安全文档更新清单）

嵌入式 shared secret **可从公开分发的插件包（如 OSS / GitHub Release 的 `main.js`）中被提取**。因此：

- 密钥本身不是强隔离手段；
- **限流 + 监控 + 滥用处置**才是实用防线；
- 轮换方式：发布新插件版本（新常量）+ 更新服务端密钥映射；旧密钥可设宽限期后失效。

不得在 UI 中暗示「公共中转绝对私密 / 仅你可用」。

## 5. Data model

### 5.1 首选字段

```ts
connectionMode: 'local' | 'public_relay'  // default: 'local'
```

持久化到插件 `data.json`（普通设置，非 SecretStorage）。

### 5.2 废弃 / 隐藏的用户字段

| 既有字段 | UI | 持久化 | 说明 |
| --- | --- | --- | --- |
| `wechatApiBaseUrl` | 主 UI 移除 | 迁移后可清空或内部保留只读兼容 | `public_relay` 使用打包常量 URL，不再由用户填写 |
| `wechatProxyAccessKey` | 主 UI 移除 | 同上 | 公共模式用打包常量 |
| SecretStorage `wechatProxySecret` | 主 UI 移除 | 迁移后可 clear | 公共模式用打包常量；不再让用户写入 |

`WeChatApiRelayConfig` 在运行时由 mode 解析：

- `local` → `{ baseUrl: '', accessKey: '', secret: '' }`
- `public_relay` → 打包常量

Transport 选择：继续复用 `WeChatApiRelayTransport`；mode → config 的解析集中在单一函数（如 `resolveWeChatApiRelayConfig(settings, bundledPublicRelay)`），便于单测。

### 5.3 Migration

加载旧 `data.json` 时：

1. 若已存在合法 `connectionMode`，尊重之。
2. 否则：若 `wechatApiBaseUrl`（规范化后）等于公共中转 base（`http://121.196.229.165:18080`，忽略尾斜杠），映射为 `public_relay`。
3. 其余情况（空 URL、其他自建 URL、异常值）→ `local`。
4. 映射完成后：新写入可不再依赖用户填写的三字段；为避免把旧自建 URL「静默改成公共中转」，**非公共 URL 一律落 `local`**（自建能力本版不做 UI，见 Non-goals）。若需提示「检测到自定义代理已停用」，可用一次性 Notice / 状态文案，不阻塞加载。
5. Schema：随实现 bump `schemaVersion`（当前实现为 7 一带；具体数字在实施计划锁定），迁移逻辑放在 `sanitizeSettings` / settings-store，并补单测。

### 5.4 Egress IP 展示数据源

- 优先复用账号验证路径已解析的出口 IP（现有 whitelist 失败文案中的 public IP / `whitelistIp`）。
- `local` tip 在未验证前可不显示具体 IP；验证后刷新 tip。
- `public_relay` tip **不依赖**本机 egress，固定展示 `121.196.229.165`。

## 6. Non-goals

- 自定义自建中转 UI（地址 / AK / SK 再次暴露）——延期
- 本任务内的代码实施、commit、push、npm/GitHub Release、社区插件提交
- 修改 `AGENTS.md` / `SECURITY.md` / `PRIVACY.md`（列为 follow-up，避免本任务越界）
- 多账号、非桌面端、群发能力

## 7. Acceptance

- 设置账号卡视觉与交互对齐 **layout A（顶部分段）+ tip mock C（公共中转绿框可复制固定 IP）**
- 仅两种模式；默认 `local`；无代理三字段
- `local`：直连微信 API；tip 显示 egress IP（可得时）+ 一行白名单提示 + 复制
- `public_relay`：请求经 `http://121.196.229.165:18080`；自动带打包 Key/Secret 头；UI 零 AK/SK
- 迁移：旧公共中转 URL → `public_relay`；否则 → `local`
- **单元测试**：mode 切换持久化；`resolveWeChatApiRelayConfig` / transport 选择（local 不改写 URL、不带头；public_relay 改写并带头）；settings-store 迁移用例
- 不在本任务提交 Git；实施另开计划与 TDD 工单

## 8. 实施触及面（供后续 plan，本文件不实施）

- `src/settings/model.ts` / `settings-store.ts`：`connectionMode` + 迁移
- `src/settings/settings-tab.ts`：账号卡分段 + tip，删除代理三 Setting
- `src/wechat/api-relay-transport.ts`（或装配处）：从 mode + bundled constants 取 config
- 打包常量注入点（`esbuild` define / 专用 module）；真实值不进用户文档
- 单测：`settings-store`、`api-relay-transport`、settings-tab / account UI（若有 DOM 测）
- Follow-up 文档：`AGENTS.md` 产品边界例外、`SECURITY.md` / `PRIVACY.md` 公共中转诚实说明
