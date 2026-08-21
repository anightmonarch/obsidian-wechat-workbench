# 样式工作台验证记录

## 自动化验证

验证日期：2026-08-21

- Obsidian 插件构建：`npm test` 通过。
- 样式工作台、渲染投影、发布哈希一致性专项测试通过。
- `npm run lint` 通过。
- `npm run scan:secrets` 通过。
- Doocs 三套黄金 HTML：`doocs-classic`、`doocs-grace`、`doocs-simple` 均有确定性回归文件。
- `npm run generate:code-themes` 二次生成结果字节一致。

## 本地 UI 验证边界

已用 jsdom 验证：

- 文章预览与发布设置页签切换；发布设置页不显示预览工具栏。
- 样式面板的主题、字体、字号、主题色、标题、代码、图注、段落控件。
- `Escape` 关闭样式面板；窄容器使用右侧浮层，不压缩正文预览。
- 样式保存状态只显示“正在保存样式”“样式尚未保存”等用户信息，不展示 hash、CSS 解析器或英文校验细节。

## 尚未执行的真实环境验证

以下项目需要在独立 Obsidian 测试 Vault 和已授权公众号账号中执行，不能由单元测试替代：

- 窄侧栏下的实际截图验收。
- 真实剪贴板粘贴到微信公众号编辑器后的视觉检查。
- 使用已授权账号创建或更新一个草稿，并在公众号后台核对结果。

## 已执行的真实 Obsidian 验证

在独立 Vault `/tmp/wechat-workbench-checkpoint-1`、Obsidian 1.13.7 中完成：

- 插件从 `.obsidian/plugins/wechat-workbench` 加载，文章预览和样式工作台可用。
- 重新打开独立 Vault 后，文章级 `wechat-style` 能读取并显示当前主题。
- 切换主题后 Frontmatter 更新，预览刷新，样式面板保持打开，可连续调整。
- 真实窗口截图确认中文主题、字体、字号和主题色控件可见；未显示内部校验细节。

本项目没有执行正式发布、群发、删除草稿、`git push`、npm 发布或社区提交。
