# 中转去内置化与披露修复设计(0.2.1,2026-11-08)

## 背景

v0.2.0 发布后约 2 小时,插件被 Obsidian 官方从社区目录**整包移除**(2026-11-07 19:20 UTC 镜像提交 `8d5926c8`,同批另一自动审核插件 meeting-live 一并移除;`community-plugins-removed.json` 无条目,亦无邮件通知)。根因分析:0.2.0 新增的公共中转存在四项与 [Developer policies](https://docs.obsidian.md/Developer+policies) 冲突的特征:

1. 用户 AppSecret 经**明文 HTTP**(`http://121.196.229.165:18080`)发往**硬编码裸 IP**;
2. **main.js 内嵌中转共享 AK/SK**(esbuild define 注入);
3. README 声明"No author-operated relay service",与代码矛盾(11-01 设计文档第 16 行明确记录了"文档同步不在本任务完成"的欠账,一直未还);
4. 政策要求网络用途在 README 明确披露("Network use. Clearly explain which remote services are used and why")。

官方政策允许"appears to be malicious"时**立即移除**,且"repeated violation"将永久移除——本次重做必须一次到位。

## 决策(用户确认)

- **方案 A**:发行版**不再内置任何中转地址与共享凭据**;中转改为**用户自配**(自行填写自建中转的地址与凭据),默认本地直连(HTTPS 直达 `api.weixin.qq.com`)。
- 重新收录流程:**先邮件申诉**(plugins@obsidian.md,承认披露疏漏+说明修复),再走官方提交表单。
- Windows/Linux 冒烟用户确认不阻塞;1.11.4 已做静态 API 兼容检查。

## 行为定义

### 连接模式

- `WeChatConnectionMode` = `'local' | 'relay'`;默认 `'local'`。
- **迁移**:已存储的 `'public_relay'` 一律迁移为 `'local'`(安全默认);旧 `wechatApiBaseUrl`(若与被移除的内置地址相同)不再自动映射。
- `relay` 模式要求用户填写:中转地址(URL)、访问 Key(明文设置)、Secret(SecretStorage,沿用 `wechatProxySecret` 种类)。地址为空时按本地直连处理,设置界面给出醒目提示。

### 配置解析

- `resolveWeChatApiRelayConfig(mode, url, accessKey, secret)`:仅 `relay` 且 URL 非空时返回冻结配置,否则返回空配置(传输层回落直连)。
- 删除 `public-relay-constants.ts` 与 esbuild 的 `__WECHAT_PUBLIC_RELAY_*__` 注入;`main.js` 不再包含任何中转地址或共享凭据。

### 设置界面

- `relay` 模式下展示:中转地址、访问 Key、Secret(密码框),并附明文 HTTP 风险提示("自建中转请自行评估传输安全,建议配置 HTTPS")。
- `local` 模式维持现有出口 IP 白名单引导。

## 披露同步(政策硬性要求)

- README / README.zh-CN:删除"No author-operated relay service";新增 Network use 披露——本地直连(微信官方 API)与可选自建中转(数据经用户自配服务器,明文 HTTP 风险自评)。
- PRIVACY.md:新增"自定义中转"数据流说明(AppID/AppSecret/API 请求经用户配置的中转服务器)。
- SECURITY.md / AGENTS.md:同步"发行版不内置任何中转地址与共享凭据;中转为用户自配可选能力"的边界(偿还 11-01 设计的欠账)。

## 验收

- 全量测试回归;`main.js` 中不存在 `121.196.229.165` 与中转 AK/SK 字符串(以 `grep` 断言)。
- 发布 0.2.1 → 邮件申诉 → 官方表单重新提交。
