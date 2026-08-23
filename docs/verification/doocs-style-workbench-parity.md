# Doocs 样式工作台与公众号草稿箱验收记录

验证日期：2026-08-22

范围：第二批 UI、Doocs 组合式样式工作台、富文本复制、图片与 Mermaid 预览、公众号草稿箱更新链路。

## 自动化门禁

最近一次完整门禁结果：

- `npm run typecheck`：通过。
- `npm run lint`：通过，无 warning。
- `npm test`：通过，76 个测试文件、376 个测试。
- `npm run build`：通过。
- `npm run verify:release`：通过，运行时资源与公开契约校验通过。
- `npm run scan:secrets`：通过，227 个文件未发现敏感信息。

新增回归覆盖：

- Mermaid 安全 SVG 使用浏览器 `Image + canvas` 栅格化，避免真实 Obsidian 的 `nativeImage` SVG 失败。
- Vault 内插件生成路径先按直达路径解析，再回退到 Obsidian `MetadataCache` 链接解析，修复封面被误判为缺失。
- Workbench 复制与发布准备共用同一份完成渲染的 `RenderArtifact`。

## 真实 Obsidian 验证

测试环境使用独立测试 Vault，不触碰主知识库：

- `/tmp/wechat-workbench-checkpoint-1`
- `$HOME/workspace/Github/wechat-workbench-test-vault`

已验证：

- 插件通过 `.obsidian/plugins/wechat-workbench` 本地安装并加载。
- 样式面板真实 DOM 计数：内置主题 3、字体 3、字号 5、主题色 11、图注 6、开关 6、下拉控件 3。
- 连续点击主题、字体、字号、颜色、图注、开关、标题下拉和代码主题后，样式面板根节点保持同一 DOM 节点，无消失重建闪烁。
- 预览区与样式面板可以独立滚动，样式面板头部保持固定。
- 文章预览页不展示文章名称连接状态、内部校验细节或“需处理”诊断面板。
- 发布设置页隐藏预览页的发文章、复制和样式工具栏，只保留文章信息、封面和发布状态。

截图证据：

- [真实样式面板](/tmp/wechat-workbench-evidence/real-style-panel-clean.png)
- [真实富文章预览与图片/代码](/tmp/wechat-workbench-evidence/real-rich-preview-after-copy.png)

## 图片、代码与预览兼容性

真实文章包含：本地 PNG、本地 JPEG、HTTPS 远程图片、缺少说明的远程图片、标题、外链、引用、表格、TypeScript 代码块和 Mermaid 图表。

真实运行时结果：

- 本地 PNG 与 JPEG 均解析为预览图片，并保留图注。
- 远程图片不主动加载，显示“远程图片待加载”占位，不把外部请求偷偷注入预览阶段。
- Mermaid 不再显示“生成失败”，可进入复制产物并生成 PNG。
- 代码块行高稳定，行号和 Mac 窗口样式按配置显示。
- 外部链接在启用配置后生成引用标记。
- 字数与阅读时长摘要在真实预览中出现。

## 一键复制验收

通过真实 Obsidian UI 点击“复制”：

- 用户提示：`已复制公众号富文本`。
- 系统剪贴板格式：`text/plain`、`text/html`。
- HTML 读回包含文章根节点、PNG 与 JPEG 数据、图注、代码行、外链引用和 Mermaid 生成图片。
- HTML 读回大小约 277 KB；未输出或记录任何 AppSecret、Access Token 内容。

## 公众号草稿箱验收

真实流程已走到接口层：

1. 测试 Vault 中 AppID、AppSecret、Access token 本地状态均为已配置/已缓存。
2. “发文章”按钮可用。
3. 发布确认框正常出现，明确显示“只同步到草稿箱，不会正式群发”。
4. 点击“确认同步到草稿箱”后，真实请求到达公众号接口。

当前未通过的外部条件：公众号接口返回：

`当前请求出口 IP（139.227.13.3）不在公众号白名单中，请更新后重试。`

因此本批次不能诚实标记为“草稿箱更新成功”。Shell 侧查询到的公网 IP 为 `203.27.106.138`，但公众号接口看到的出口是 `139.227.13.3`；二者不是同一条网络出口。需要将公众号接口实际看到的 `139.227.13.3` 加入白名单，或让 Obsidian 请求改走已加白的出口后再重试。未在本次执行中修改公众号安全白名单。

已做独立传输核对：在同一个 Obsidian 进程内，分别用 Obsidian `requestUrl` 和 Node HTTPS 请求公众号 `stable_token` 接口，二者都返回 `40164`，并报告同一个出口 `139.227.13.3`。因此这不是插件的 Token 缓存、渲染或发布 payload 问题，也不是单一 HTTP transport 的差异。

AppSecret、Access Token 仅由用户在插件本地维护，不进入云端托管服务或代码。:codex-annotation{index="1"}

## 当前检查点结论

- 第二批 UI 与本地渲染/复制链路：通过。
- Mermaid 栅格化与本地封面直达路径：通过。
- 真实草稿箱发布流程：已到达真实接口，但被公众号 IP 白名单这一外部条件阻断。
- 正式发布、群发、删除草稿、`git push`、npm 发布和 Obsidian 社区提交：未执行。
