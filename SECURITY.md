# 安全策略

## 支持版本

安全修复覆盖最新发布版本。尚未发布的修复以默认分支最新代码为准。

| 版本 | 安全支持 |
| --- | --- |
| 最新发布版本 | 支持 |
| 更早版本 | 建议先升级后复现 |

## 报告安全漏洞

请使用仓库的 [GitHub Private Security Advisory](https://github.com/anightmonarch/obsidian-wechat-workbench/security/advisories/new) 私下报告漏洞。

不要在公开 Issue、讨论区、截图或日志中提交以下内容。

- AppID、AppSecret、Access Token 或 AI 服务 API Key。
- 未公开文章正文、封面和附件。
- 完整媒体 ID、草稿 ID、账号标识或恢复信息。
- 可直接利用的攻击载荷和详细利用步骤。
- 本机绝对路径、私人 Vault 名称和其他个人信息。

如果 Private Security Advisory 暂时不可用，可以新建一个不含漏洞细节的公开 Issue，请求建立私密联系渠道。

## 报告内容

一份可处理的漏洞报告应包含以下信息。

- 受影响的插件版本。
- 操作系统和 Obsidian 版本。
- 最小复现步骤、预期结果和实际结果。
- 是否发生网络请求、图片读取、凭据访问或远端草稿变更。
- 已脱敏的错误代码、调用阶段和相关截图。

请使用合成文章和合成账号数据复现。必须提供真实标识时，先说明原因并等待私密渠道确认。

## 凭据泄露处理

如果 AppSecret 或 AI 服务 API Key 可能已经泄露，请按以下顺序处理。

1. 立即在对应服务中重置密钥。
2. 在插件设置中清除旧密钥并保存新密钥。
3. 清除缓存的 Access Token，随后重启 Obsidian。
4. 检查微信公众号后台、AI 服务用量和本机日志中的异常活动。
5. 删除公开位置中的泄露内容，但不要把删除当作凭据轮换的替代措施。

如果 Access Token 可能已经泄露，应重置 AppSecret，使旧 Token 失效，并重新连接账号。

## 本地安全边界

- 凭据只通过 Obsidian `SecretStorage` 保存。
- `SecretStorage` 不是硬件安全区，也不提供严格的插件间隔离。
- 同一个 Vault 中安装的其他第三方插件可能访问 Vault 数据，应只安装可信插件。
- 插件不会把凭据写入 `data.json`、Frontmatter、发布报告或测试快照。
- 远程图片读取会阻止本机和私网目标，并限制重定向、超时、大小和文件类型。
- 插件只创建或更新微信公众号草稿，不调用正式发布、群发或删除草稿接口。

## 普通问题

功能缺陷、兼容性问题和使用建议请提交到 [GitHub Issues](https://github.com/anightmonarch/obsidian-wechat-workbench/issues)。公开 Issue 中不要附带任何凭据或私人文章内容。

仓库中的 `npm run scan:secrets` 是发布前检查项，不能替代凭据轮换和人工审查。
