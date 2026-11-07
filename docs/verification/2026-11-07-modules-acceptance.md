# 功能模块统一验收报告(2026-11-07)

> **验收状态:已完成,12/12 全部通过。** 问题 1/2 已于当日修复(`f50c6b5`)并完成 GUI 复核;"发文章按钮无响应"已破案(窗口位移导致旧坐标打偏,功能正常)。

## 验收范围

依据 Git 提交记录,本次验收覆盖 11-01 以来 5 个提交与当前工作区未提交改动,归纳为 5 个功能模块:

| 模块 | 来源提交 | 核心改动 |
| --- | --- | --- |
| M1 封面 AI 生成(Codex 本地链路) | `19f5ac1`、`70759c6` + 未提交改动 | GUI 短 PATH 定位 Codex、封面 AI 禁用原因保留 null、提示词重构(参考传入/logo 放行/最高优先级补充要求/强制出图)、`artifact.metadata` 传参 |
| M2 渲染保真 | `fc0b39b`、`f98b805` | 代码块空格 NBSP 保真、高亮 `==mark==`、公式居中 |
| M3 图片处理 | `f98b805`、`b01631a` | EXIF 烤正与压缩(`electron-image-normalize`、`jpeg-orientation`) |
| M4 微信公共中转连接 | `b01631a` | 连接方式设置、`api-relay-transport` |
| M5 草稿假复制去除 | `fc0b39b` | 复制行为修正 |

## 环境与前置

- 构建产物:`npm run build`(typecheck + esbuild production)通过;`WECHAT_WORKBENCH_TEST_VAULT` 已同步 3 个 runtime assets(main.js 时间戳 2026-11-07 10:25)。
- 单元测试:封面模块 `vitest run tests/unit/cover/` 8 文件 49 用例全绿(含本次新增 3 个用例);补验阶段另跑 `tests/unit/settings tests/unit/wechat tests/unit/publish tests/visual` 27 文件 142 用例全绿;问题修复后全量 `vitest run` **103 文件 628 用例全绿**,lint 清零。
- 验收 Vault:仅使用隔离测试 Vault `~/workspace/Github/wechat-workbench-test-vault`;未触碰主 Vault `commit_note` 配置(其插件为用户自行安装版本,未做任何改动)。
- 验收笔记:`验收-模块冒烟-20261107.md`(frontmatter 含 title/digest,正文含缩进代码块、高亮、公式、EXIF 测试图)。
- Obsidian 1.15.0;插件经 Vault 切换与重启共加载新构建两次,行为一致。

## 验收结果总表

| # | 优先级 | 验收点 | 结果 | 证据 |
| --- | --- | --- | --- | --- |
| 1 | P0 | 封面 AI 链路:logo 补充要求放行品牌标识 | ✅ 通过 | 截图 06(画面含微信 logo) |
| 2 | P0 | 封面 AI 链路:未勾选标题/摘要仅作参考,不画入封面 | ✅ 通过 | 截图 04(未勾选)+ 截图 06(画面无标题/摘要文字) |
| 3 | P0 | 封面 AI 链路:强制直接出图(不追问) | ✅ 通过 | 截图 05→06,45 秒内产出候选图 |
| 4 | P0 | 封面 AI 链路:候选图采用、frontmatter 写入、落盘 | ✅ 通过 | 截图 07(toast + cover 字段);磁盘文件见下 |
| 5 | P0 | Codex GUI 短 PATH 定位 | ✅ 通过 | 进程证据 + 设置页路径显示(截图 15:codex-cli 0.167.0-alpha.3.2 · 图片生成已启用) |
| 6 | P0 | 封面 AI 禁用原因不误判(`70759c6`) | ✅ 通过 | 截图 02/07:标题/摘要 AI 按钮显示"本地 Codex",无误报禁用 |
| 7 | P1 | 代码块缩进保真(预览层) | ✅ 通过 | 截图 01/02(缩进保留) |
| 8 | P1 | 高亮 mark 样式(预览层) | ✅ 通过 | 截图 01(黄色高亮) |
| 9 | P1 | 公式居中(预览层) | ✅ 通过 | 截图 01/02(块级公式居中) |
| 10 | P1 | 剪贴板层:NBSP 保真 + 假复制去除 | ✅ 通过 | 剪贴板 HTML 分析(见下) |
| 11 | P2 | EXIF 烤正与压缩(复制链路) | ✅ 通过 | 解码图片 1080×679 已回正、Orientation 移除、体积 -33% |
| 12 | P3 | 公共中转连接设置 UI | ✅ 通过 | 设置页截图 14(连接方式=公共中转、AppSecret 打码)+ 截图 15 + 单元/视觉测试 142 通过 + data.json 持久化 |

补验结论:第 10、11、12 项全部通过(第 12 项的设置页 GUI 复核已于解锁后完成,见截图 14/15)。

### 模块级结论

| 模块 | 结论 | 说明 |
| --- | --- | --- |
| M1 封面 AI 生成(Codex 本地链路) | ✅ 通过 | 5 个验收点全过;设置页截图已取得 |
| M2 渲染保真 | ✅ 通过 | 预览层与剪贴板层均验证通过 |
| M3 图片处理 | ✅ 通过 | EXIF 烤正与压缩在复制链路验证通过 |
| M4 微信公共中转连接 | ✅ 通过 | 设置页 GUI(连接方式/连接状态/白名单提示)与等效证据齐备 |
| M5 草稿假复制去除 | ✅ 通过 | 剪贴板产物 0 处假复制装饰 |

## 已验证证据

### 封面 AI 生成全链路(M1)

操作路径:测试 Vault → 打开验收笔记 → WeChat Workbench → 发布设置 → 智能生成 → 来源"本地 Codex" → 不勾选标题/摘要 → 补充要求"把文中提到的官方logo都加入到封面图中" → 生成 → 采用。

![弹窗与披露](docs/verification/assets/2026-11-07-modules-acceptance/03-ai-cover-modal-open.png)
![填入 logo 补充要求](docs/verification/assets/2026-11-07-modules-acceptance/04-ai-cover-modal-filled.png)
![生成中](docs/verification/assets/2026-11-07-modules-acceptance/05-generating-busy.png)
![候选封面(含微信 logo,无文字)](docs/verification/assets/2026-11-07-modules-acceptance/06-cover-candidate-with-logo.png)
![采用后(frontmatter 写入 cover)](docs/verification/assets/2026-11-07-modules-acceptance/07-cover-adopted.png)

落盘产物(约定目录 `.wechat-workbench/covers/<date-hash>/`,文件名含内容哈希前缀):

```
.wechat-workbench/covers/20261107-6d818fc3/cover-82b2cbf0.png
sha256: 82b2cbf01ec0894e71c1bcf3b768d0e74fe849acc0316628e663c6a99ab31aba
尺寸: 1880×800(≈2.35:1)  大小: 1591477 字节
```

### Codex 进程证据(GUI 短 PATH 定位,M1)

点击"生成"后,由 Obsidian Renderer 拉起本机 Codex(通过配置 shim `.n/bin/codex` exec ChatGPT 版 CodexCLI,与 `19f5ac1` 预期一致):

```
PID 31799  /Applications/ChatGPT.app/.../CodexCLI.app/Contents/MacOS/codex exec --ephemeral
           --sandbox workspace-write --ignore-user-config --enable image_generation --json -
PPID 29154 Obsidian Helper (Renderer)(插件宿主)
启动时间 10:38:48(与点击"生成"时刻吻合)
```

提示词经 stdin(`--json -`)传入,不在进程参数中(符合 `c7deea2`)。

### 发布设置与 AI 可用状态(M1 / `70759c6`)

![发布设置页(标题/摘要 AI 按钮显示"本地 Codex")](docs/verification/assets/2026-11-07-modules-acceptance/02-publish-settings-tab.png)
![工作台初始预览(代码块/高亮/公式)](docs/verification/assets/2026-11-07-modules-acceptance/01-workbench-initial.png)

### 剪贴板层验证(M2 / M3 / M5,解锁后补验)

操作:工作台 → 文章预览 → 复制,toast「已复制公众号富文本」(截图 09)。导出系统剪贴板(NSPasteboard):`text/html` 83842 字节 + `text/plain` 140 字符,证据文件 `copy-clip.html` / `copy-clip.txt`。

![复制成功 toast](docs/verification/assets/2026-11-07-modules-acceptance/09-copy-success-toast.png)

断言结果:

1. **NBSP 保真(fc0b39b)**:HTML 含 19 处 `&nbsp;` 实体 —— 代码块缩进按 4/8 空格逐一转为 `&nbsp;&nbsp;&nbsp;&nbsp;`(位于 `white-space: pre` 的行 span 内),关键字间隙(`def&nbsp;`、`if&nbsp;`)同样被保护。公众号剥空格场景下缩进可存活。
2. **假复制去除(fc0b39b)**:全文 0 处 `code-window-copy`,产物不再携带点不了的「复制」装饰;Mac 圆点 chrome(`code-window-dots`)按设计保留。
3. **EXIF 烤正与压缩(f98b805)**:笔记内 `exif-test-rotated.jpg`(源像素 679×1080 横放 + EXIF Orientation=6)在产物中变为 data URL JPEG:像素 1080×679(已回正)、EXIF Orientation 标签移除(烤正)、体积 84119 → 56234 字节(-33%,压缩生效)。
4. **同源一致性**:text/plain 与 text/html 来自同一 RenderArtifact(标题「微信工作台模块验收」、摘要、正文顺序一致)。

### 公共中转连接(M4,GUI 复核通过)

- `npx vitest run tests/unit/settings tests/unit/wechat tests/unit/publish tests/visual`:**27 文件 142 用例全绿**,覆盖 `settings-store` 连接方式往返、`api-relay-transport`、`resolve-api-relay-config`、`secret-store`、`asset-upload-service`(同步上传 EXIF 烤正)与 workbench 视觉回归。
- 测试 Vault `data.json` 中 `connectionMode: "public_relay"` 已持久化(设置写入路径真实生效)。
- **GUI 复核通过**:插件设置标签页「微信公众号」区块显示连接方式分段控件(本地直连/公共中转,公共中转选中)、连接状态"未配置"、AppSecret 打码、中转 IP 白名单引导(截图 14);「AI 内容生成」区块显示 Codex 可执行文件 `/Users/wangboshi/.n/bin/codex` 与检测状态"已发现本地 Codex · codex-cli 0.167.0-alpha.3.2 · 图片生成已启用"(截图 15)。

![连接方式设置(公共中转选中,AppSecret 打码)](docs/verification/assets/2026-11-07-modules-acceptance/14-relay-mode-settings.png)
![Codex 路径与检测状态](docs/verification/assets/2026-11-07-modules-acceptance/15-codex-path-detection.png)

### 修复复核(问题 1/2,GUI 验证通过)

`f50c6b5` 修复后在真实 GUI 复核:

1. **披露文案诚实化**:未勾选标题/摘要时,弹窗显示"本次发送:标题、摘要(仅作生成依据,不绘制到图中)"(截图 12),误导文案已消失。
2. **披露卡实时刷新**:补充要求输入后,披露卡立即更新为"本次发送:标题、摘要、补充封面要求(…)"(截图 13),无需重开弹窗。

![诚实化后的披露文案](docs/verification/assets/2026-11-07-modules-acceptance/12-disclosure-honest-v2.png)
![披露卡实时刷新](docs/verification/assets/2026-11-07-modules-acceptance/13-disclosure-live-refresh.png)

### 发布入口引导(发文章,谜底)

点击「发文章」(账号未配置)正确触发引导:两条 Notice——"公众号账号未配置,请先打开插件设置完善本地账号信息。"与"请打开设置 → 第三方插件 → WeChat Workbench 完善公众号账号配置。"(截图 11)。此前"按钮无响应"为验收环境的窗口位移导致旧坐标打偏,非插件缺陷。

![发布入口的账号配置引导](docs/verification/assets/2026-11-07-modules-acceptance/11-publish-account-notice.png)

## 发现的问题与修复

### 问题 1(P1):隐私披露文案与实际发送行为不符 — ✅ 已修复(`f50c6b5`)

- 现象:封面确认弹窗在标题/摘要均未勾选时,披露区显示"本次发送:仅视觉主题,不发送标题或摘要";但 Codex 后端会把未勾选的标题/摘要以"主题参考"形式发送,API 后端则发送空字符串(两后端不一致)。
- **修复方案(用户确认简化)**:封面生成依据固定为标题+摘要(不使用全文);两后端统一完整发送,勾选框仅控制绘制;标题/摘要为空时阻断生成并引导先填写/生成;披露文案恒示"标题、摘要"并注明绘制语义;API 生成器提示词与 Codex 对齐(未勾选 → "文章主题参考"行)。
- 涉及:`src/cover/cover-workflow.ts`(守卫 + 传参)、`src/cover/cover-generator.ts`、`src/cover/openai-image-generator.ts`(include 标志)、`src/ui/ai-cover-confirmation.ts`、`src/ui/workbench-view.ts`(入口引导)。
- GUI 复核:截图 12(诚实文案)、13(实时刷新)。

### 问题 2(P3,观察项):披露卡不随输入实时刷新 — ✅ 已修复(`f50c6b5`)

补充要求输入时只更新披露卡容器(不重绘弹窗、不丢焦点),GUI 复核见截图 13。

### 附带发现:「发文章」按钮无响应(验收期间现象)— ✅ 已破案(非缺陷)

验收期间点击「发文章」无 Notice 无弹窗,经排查为**验收环境问题**:测试 Vault 窗口在测量与点击之间发生位移,旧坐标打偏(点击落到标题栏/文件列表)。以"新鲜测量 → 立即点击"协议重试后,按钮功能完全正常:正确触发"账号未配置"引导(截图 11)。

## 补验执行记录(已执行完毕)

1. 复制层验证(M2/M3/M5)— ✅ 已执行,全部断言通过,见"剪贴板层验证"小节。
2. 设置页截图(M1/M4)— ✅ 已取得:截图 14(公共中转设置)、15(Codex 路径与检测状态)。
3. 报告结果总表第 10-12 项与模块级结论 — ✅ 已更新为最终状态。

## 发布准备状态(v0.2.0)

- 依赖安全审计清零(overrides 修复 1 critical dompurify + 2 high + 3 moderate,628 用例回归无破坏)。
- 版本已 bump 0.1.1 → 0.2.0(manifest/package/versions 三处一致,minAppVersion 1.11.4),verify:release 通过。
- 代码已推送 GitHub(23 个提交,含验收报告与本轮全部修复)。
- **GitHub Release v0.2.0 已建为 DRAFT**(附 main.js/manifest.json/styles.css,发布说明含验证声明):草稿不公开、不触发官方库更新。
- **待用户确认后执行**:在 GitHub 上把草稿 release 正式发布(一键),官方库将自动进入更新审核队列。
- **发布质量门缺口(AGENTS.md,待补验)**:① 本轮改动的真实公众号测试账号端到端(8-28 的 PARTIAL 覆盖旧阶段);② 最低支持版本 1.11.4 真实测试;③ Windows/Linux 冒烟;④ 复制到真实公众号编辑器的视觉核对。

## 环境事件记录

- 10:44 起系统出现 loginwindow 抢占(用户锁屏离开),AX 焦点全局失效:表现为 agent-desktop 反复报 `global_window_owner_churn`、Obsidian AX 窗口对 System Events 不可见、快捷键投递被拒。期间已通过 CGWindowList/Swift AX 采样排除 Obsidian 自身 AX 损坏(重启后依旧),最终由 NSWorkspace 确认 `frontmost=loginwindow` 定性为锁屏阻塞。
- 解锁后焦点系统恢复,补验完成第 10-12 项并完成问题 1/2 的修复与 GUI 复核。期间定位到两个验收环境要点(不影响插件功能):
  1. **窗口位移导致坐标失效**:测试 Vault 窗口会在测量与点击之间被移动(标题栏点击/激活重排),旧坐标打偏。曾误判「发文章」按钮无响应;改用"新鲜 AX 测量 → 立即物理点击"协议后一切正常,该按钮的账号未配置引导完全正常(截图 11)。
  2. **设置页导航路径**:Obsidian 1.15 中,设置 → 第三方插件列表 → 点击插件行会打开"第三方插件"详情窗口,内含「选项」按钮进入插件设置标签页;滚动用 Tab 焦点移动(scroll-into-view)比滚轮可靠。
- 已恢复项:ZCode 窗口可见性已还原;Obsidian 停留在测试 Vault,主 Vault `commit_note` 窗口原样保留;所有误开的弹窗/设置窗口均已关闭;设置窗口尺寸已还原。
- 期间一次菜单栏 Preferences 误开了主 Vault 设置弹窗,已立即关闭,未做任何改动。
