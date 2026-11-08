# 图片宽度保真修复验证(2026-11-08)

对应设计:`docs/superpowers/specs/2026-11-08-image-width-fidelity-design.md`
用户报告:手机截图发布到公众号后,桌面端阅读页两侧有大片空白;Obsidian 预览看不出该问题。

## 根因(真实环境实测)

在公众号后台真实环境(Commit日记 账号)测量:

- 已发表文章 `mp.weixin.qq.com/s/-I8IkAUgQ8q0dxZyILkBHg`(含 4 张 588px 手机截图):
  - 桌面阅读页正文固定 677px;全部 31 个内容块相邻垂直间隙 ≤24px,无垂直异常。
  - 自然宽 1080 的照片被 `width: 677px !important` 铺满;自然宽 588 的截图被
    `width: 588px !important` 居中,两侧各留 ~44px 空白(微信按 `data-w` 定宽)。
  - 源文件核对:`6-照片-6.jpg` ~ `9-照片-9.jpg` 本身即 588×1280。
- 插件预览画布宽度跟随面板(~567px),窄于 588px 图片,`max-width:100%` 使其铺满,
  与微信渲染不一致 —— 预览掩盖了留白,违反「可验证预览」不变量。

## 修复

1. `normalizeImageBytesForClipboard`:静态图(jpeg/png/webp)宽度 ∈ [480, 677) 时
   等比上采样到 677px(拉伸比 ≤1.41×),GIF 与 <480px 有意小图不放大。mediaCache
   哈希仍基于归一化后字节,无需迁移。
2. 预览:`ArticlePreviewRenderer` 将文章包进固定 677px 画布 `.wechat-workbench__preview-canvas`,
   面板更窄时按 `min(1, 可用宽/677)` 等比 zoom,预览横向比例与微信桌面阅读页一致。

## 验证证据

- 单测:`tests/unit/media/electron-image-normalize.test.ts` 11 例(480/677 边界、GIF 排除、
  320px 小图保持原样、588px 上采样后重编码);`tests/unit/ui/render-preview.test.ts` 新增
  2 例(677px 画布存在、窄面板 zoom=575/677、宽面板不缩放)。
- 全量:`npm test` 642/642 通过;`npm run lint` 0 告警;`node scripts/scan-secrets.mjs` 通过。
- 微信侧渲染模型实测(测试草稿上传三档宽度纯色图):
  - 677×900 上传后 `data-w=677`(微信不缩),阅读页按 `min(data-w, 677)` 渲染 → 铺满。
  - 588×1280 上传后 `data-w=588` → 复现用户报告的居中留白(修复前行为)。
  - 320×200 被公众号编辑器拒绝上传(平台最小尺寸限制,与本修复无关)。
  - 结论:插件把 480–677px 源图上采样到 677 后,`data-w=677` 必然铺满,修复链路闭环。
- 测试草稿(appmsgid=100011034)验证完成后已从草稿箱删除。

## 遗留

- 用户现有 588px 截图重新复制/同步后即自动上采样铺满;mediaCache 旧键因字节变化自然失效一次。
- 用户指南补充「图片 ≥677px 宽可铺满桌面端正文」(后续文档迭代)。
