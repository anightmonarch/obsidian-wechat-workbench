# WeChat Clipboard Visual Verification

- 测试目标：公众号后台一次性测试草稿
- 正式发布：禁止
- 当前状态：BLOCKED

## 自动化边界

- HTML 与纯文本来自同一不可变 `RenderArtifact`。
- 本地图片仅接受 PNG/JPEG/GIF/WebP magic bytes。
- 单图上限 5 MiB，文章解码图片总量上限 20 MiB。
- 任一资源失败时不写剪贴板。
- 远程图片仅在显式复制时恢复为规范化 HTTPS 地址。

## 待人工核对

| 元素 | 结果 | 观察 |
| --- | --- | --- |
| 标题与正文 | BLOCKED | macOS 锁屏 |
| 有序/无序列表 | BLOCKED | macOS 锁屏 |
| 引用与 Callout | BLOCKED | macOS 锁屏 |
| 表格与代码 | BLOCKED | macOS 锁屏 |
| 公式与 Mermaid | BLOCKED | macOS 锁屏 |
| 本地图片 | BLOCKED | macOS 锁屏 |
| 远程图片 | BLOCKED | macOS 锁屏 |

验证时只保存脱敏截图，不记录账号名、Token、草稿 ID、本机绝对路径或未发布正文。
