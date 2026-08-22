# WeChat Workbench 公众号账号、封面与主题适配设计

- 状态：技术方案已确认，书面规格待用户复核
- 日期：2026-08-22
- 适用版本：`0.1.x`
- 验收 Vault：`$HOME/workspace/Github/wechat-workbench-test-vault`
- 依据：用户于 2026-08-22 提供的五张真实 Obsidian 截图及逐项反馈

## 1. 结论

本次改动采用“小型领域服务 + 精简 UI”的方式完成，不做只改文字和 CSS 的表面补丁，也不执行破坏性设置迁移。

改动分为三个相互配合的工作流：

1. 公众号本地账号配置、显式连接验证和状态展示。
2. 工作台导航、文章信息和 Obsidian 主题适配。
3. 文章首图、本地上传和智能生成三种封面来源。

现有渲染、复制、草稿事务、恢复和 SecretStorage 边界保持不变。所有真实改动和验证只在固定测试 Vault 进行，不加载到 `commit_note` 主 Vault。

## 2. 与既有设计的关系

本规格是增量覆盖设计，不改写历史文档。发生冲突时，本规格覆盖 `2026-08-19-wesight-ui-redesign-design.md` 的以下决定：

- 5.1：顶部账号入口不再打开本地账号弹窗，改为跳转公众号后台。
- 5.2：激活标签不再固定使用微信绿色，改用 Obsidian 当前主题强调色。
- 8.1：发布设置不再显示“原文链接”。
- 8.2：封面选择器不再显示 Frontmatter 封面和插件默认封面，只显示三种确认来源。
- 11、12.1：外壳颜色、字号和视觉验收改为 Obsidian 主题变量契约。

本规格不降低下列既有约束：

- 插件仅创建或更新公众号草稿，不群发、不公开发布。
- AppSecret、Access Token、图片 API Key 只进入 Obsidian `SecretStorage`。
- 被动预览不联网。
- 同一次操作的预览、复制和草稿正文继续共享不可变 `RenderArtifact`。
- 发布结果未知时继续进入 `AMBIGUOUS`，不得自动重试创建草稿。
- 继续使用 clean-room 实现，不复制 WeSight 的 AGPL 源码、CSS 或品牌资产。

## 3. 目标与非目标

### 3.1 目标

- 在插件设置页形成紧凑、可理解的单公众号配置区。
- 用户填入 AppID、AppSecret 后可主动验证基础连接，并看到最近状态和时间。
- 工作台顶部提供明确的公众号后台浏览器入口。
- 发布设置只保留标题、作者、摘要、封面和发布状态等当前决策需要的信息。
- 封面默认使用文章第一张可用图片，并提供系统文件选择器和智能生成。
- 标签、分区标题和主操作遵循当前 Obsidian 主题色与字号。
- 在固定测试 Vault 中形成自动化和真实桌面证据。

### 3.2 非目标

- 不复制 WeSight 云端代理或固定出口 IP 语义。
- 不引入作者托管服务、登录、积分、多账号或云端凭据。
- 不通过第三方“查询公网 IP”服务增加新的隐私外发。
- 不保证一次 Token 验证即可证明所有素材、草稿接口权限均可用。
- 不自动删除旧笔记的 `content_source_url`、`cover` 或旧插件设置字段。
- 不在本轮执行 Git push、公开发布、社区插件提交或生产部署。

## 4. 页面结构

### 4.1 插件设置页

设置页按职责分为两个连续分区，不使用固定高度、空白占位或大段垂直间隔：

```text
微信公众号
  IP 白名单说明                         [打开公众号后台]
  公众号名称                            [本地展示名]
  AppID                                 [wx...]
  AppSecret                             [已安全保存 / 输入新值]
  [保存账号配置]

  连接状态：未配置 / 待验证 / 验证中 / 成功 / 失败
  最近验证：YYYY-MM-DD HH:mm:ss
                             [重新验证] [断开连接]

智能封面
  图片服务地址
  图片模型
  图片 API Key                          [已安全保存 / 输入新值]
```

账号配置区与连接状态区之间最大使用一个 `var(--size-4-4)` 间距。不得通过 `min-height`、空 `Setting`、空容器或绝对定位制造截图中的中部空白。

“公众号名称”仅是本地展示名，不修改微信后台账号名称，不参与账号哈希、Token 或草稿关联。

### 4.2 工作台顶部

顶部保持品牌名称和一个右侧图标：

```text
[自有图标] WeChat Workbench                         [外部链接]
```

右侧使用 Obsidian/Lucide `external-link` 图标：

- `aria-label`：`跳转到公众号后台`
- `title`：`跳转到公众号后台`
- 点击后通过系统浏览器打开固定地址 `https://mp.weixin.qq.com/`
- 地址不得来自用户输入或插件设置
- 不引入微信 Logo 图片、WeSight 资产或远程图标

顶部不再打开 `AccountSettingsModal`。完整账号配置只在 Obsidian 插件设置页维护。

### 4.3 发布设置页

发布设置保留三个分区：

1. 文章信息：标题、作者、摘要和保存按钮。
2. 文章封面：当前来源、缩略预览和更换操作。
3. 发布状态：草稿关联、同步状态和最近同步时间。

不显示“原文链接”。保存文章信息时只修改标题、作者和摘要，不修改已有 `content_source_url`。旧笔记、全局默认值和用户手工 Frontmatter 继续兼容，发布层仍可读取已有值。

## 5. 公众号账号配置与验证

### 5.1 数据模型

普通插件设置新增：

```ts
export interface AccountVerificationRecord {
  accountHash: string;
  outcome: 'SUCCESS' | 'FAILURE';
  verifiedAt: number;
  errorCode: string | null;
  errcode: number | null;
}

export interface PluginSettings {
  schemaVersion: 3;
  accountDisplayName: string;
  accountVerification: Readonly<AccountVerificationRecord> | null;
}
```

约束：

- 不保存 AppSecret、Access Token、微信原始响应或完整错误消息。
- `accountHash` 必须由当前 AppID 计算，不保存可逆账号副本。
- `errorCode` 只保存插件内部稳定分类。
- `errcode` 只保存微信数字错误码，用于用户后续排查。
- `VERIFYING` 仅是内存 UI 状态，不写入 `data.json`。

设置结构升级到 `schemaVersion: 3`，并继续接受版本 1、2 输入。旧 `defaultCoverStrategy`、`globalDefaultCoverPath` 和 `defaultSourceUrl` 在本轮保留兼容读取，不做破坏性删除。

### 5.2 状态推导

连接状态不从“Access Token 是否缓存”单独推断：

- `UNCONFIGURED`：AppID 为空或 AppSecret 未配置。
- `UNVERIFIED`：配置完整，但没有匹配当前账号哈希的验证记录。
- `VERIFYING`：当前显式验证正在进行。
- `CONNECTED`：最近验证成功，记录账号哈希与当前 AppID 匹配，AppSecret 仍存在。
- `FAILED`：最近验证失败，记录账号哈希与当前 AppID 匹配。

界面必须同时显示状态和最近验证时间，避免把历史成功误解为持续在线。成功文案使用：

```text
公众号基础连接正常
上次验证：<本地时间>
```

“基础连接正常”只表示当前凭据、网络和微信 Token 端点通过验证。素材与草稿权限仍在真实同步动作中验证。

### 5.3 保存、验证和断开

`AccountConnectionService` 负责业务流程，设置页只收集输入和渲染结果。

保存账号配置：

1. 去除公众号名称与 AppID 两端空白。
2. AppID 变化时更新账号哈希、清除 Access Token、到期时间和旧验证记录。
3. AppSecret 输入为空时保留 SecretStorage 中的旧值。
4. AppSecret 输入非空时替换 SecretStorage 中的值，并清除 Token 和旧验证记录。
5. AppSecret 永不回填输入框；保存后清空输入框内容。

验证连接：

1. 拒绝 AppID 为空或 AppSecret 未配置的请求，不发起网络连接。
2. 设置内存状态为 `VERIFYING`，禁用重复验证和断开按钮。
3. 调用现有 `TokenService.getValidToken(null, { forceRefresh: true })`。
4. 成功后保存 `SUCCESS`、账号哈希和当前时间。
5. 失败后保存脱敏后的内部错误分类、微信 `errcode` 和当前时间。
6. 无论成功或失败都恢复按钮可用状态。

并发验证按单账号 single-flight 处理。设置页关闭或重新渲染不得发起额外网络请求。

如果 Token 已成功获取，但验证记录写入 `data.json` 失败，服务必须清除刚取得的缓存 Token 和到期时间，保持 `UNVERIFIED`，并提示“连接已验证，但本地状态保存失败，请重新验证”。不得仅凭内存结果显示 `CONNECTED`。

断开连接：

1. 显示确认弹窗，说明将清除本机 AppSecret 和 Access Token，不会修改微信后台账号。
2. 确认后清除 AppSecret、Access Token、到期时间和验证记录。
3. 保留公众号名称和 AppID，便于重新输入 AppSecret。
4. 不删除文章 Frontmatter、草稿关联、素材缓存或发布报告。

### 5.4 IP 白名单

WeSight 使用云端代理，参考图中的固定 IP 属于其服务端。本插件直接从用户本机连接，出口 IP 取决于当前网络，不能复制该固定值。

本轮规则：

- 默认显示本机直连说明和“打开公众号后台”。
- 不调用第三方公网 IP 查询服务。
- 如果微信验证错误明确返回未授权出口 IP，可在当前设置会话提取并显示该 IP，提供“复制 IP”。
- 提取失败时只显示微信 `errcode` 和可执行白名单说明，不猜测 IP。
- 原始微信错误经过现有统一脱敏后才能进入 Notice 或状态模型。

## 6. 外部浏览器入口

新增窄接口隔离 Electron：

```ts
export interface ExternalBrowserPort {
  open(url: string): Promise<void>;
}
```

生产实现使用 Electron `shell.openExternal`。工作台注入一个无参数动作，动作内部只允许打开编译期常量 `WECHAT_MP_BACKEND_URL`。

失败处理：

- 打开失败时显示 `无法打开公众号后台，请在浏览器访问 mp.weixin.qq.com。`
- UI 不显示 Electron 原始错误或堆栈。
- 点击失败不影响预览、复制、封面或发布。

## 7. 封面来源模型

### 7.1 用户可见来源

封面选择器只显示三种来源：

1. `文章首图（默认）`
2. `上传本地图片`
3. `智能生成封面`

不得显示：

- `文章 Frontmatter 封面`
- `插件默认封面`
- Vault 图片路径输入框
- 本机绝对路径
- 内部资源哈希

Frontmatter 仍是内部持久化机制，不是用户可见来源。上传和 AI 生成后的 Vault 路径继续安全合并到当前笔记 `cover` 字段。

### 7.2 默认文章首图

封面解析优先级：

1. 当前笔记已有用户确认的上传或 AI 封面时使用该显式封面。
2. 没有显式封面时，使用文章正文中按文档顺序出现的第一张普通图片。
3. 没有可用图片时，封面状态显示“文章没有可用首图”，发布预检保持阻断，用户可上传或生成封面。

普通图片包含 `local-image` 和 `remote-image`，不把 Mermaid、数学公式或其他生成资产自动作为首图。

网络规则：

- 本地首图可在本地准备和预览。
- 远程首图在被动预览中只显示占位，不自动下载。
- 用户点击“更换封面”准备远程首图，或点击“发文章”时，才允许经现有 `RemoteImageFetcher` 和网络策略显式加载。
- 远程资源必须继续经过协议、DNS、重定向、私网地址、响应大小和真实 MIME 校验。

用户在封面选择器确认“文章首图（默认）”时，清除当前显式 `cover` 覆盖，恢复动态首图模式。后续正文第一张图片变化时，新首图自动生效。

### 7.3 本地文件上传

点击“上传本地图片”必须打开系统文件选择器，不要求输入路径。

UI 使用隐藏的 `<input type="file">`：

- `accept="image/png,image/jpeg,image/webp"`
- 单文件选择
- 用户取消时保持弹窗和原封面不变
- 只读取 `File.arrayBuffer()`，不依赖或持久化本机绝对路径

文件字节进入 `CoverWorkflow.prepareUpload`：

1. 检查输入非空和最大字节数。
2. 根据文件魔数确认 MIME，不信任扩展名或浏览器声明。
3. 使用 Electron `nativeImage` 解码。
4. 居中裁剪为 2.35:1 并编码为 PNG。
5. 保存到 `.wechat-workbench/covers/<note-name>/`。
6. 返回内存预览；用户确认后才更新当前笔记 Frontmatter。

读取、处理或保存失败时不得覆盖当前封面。

### 7.4 智能生成封面

智能封面继续复用现有 OpenAI 兼容图片适配器。用户所说“模型K”在本规格中明确解释为“图片模型 + 图片 API Key”，不新增名为 `K` 的字段。

配置来源：

- `imageApiBaseUrl`：普通插件设置。
- `imageApiModel`：普通插件设置。
- `imageApiKey`：Obsidian `SecretStorage`。

封面弹窗不再提供第二套模型选择。每次点击智能生成时读取最新配置，避免设置页与弹窗状态漂移。

缺少任一配置时：

- 按钮保持不可执行。
- 弹窗直接列出缺少的配置项。
- 本地上传和文章首图继续可用。

调用前仍必须展示：服务地址、模型、标题、摘要、正文摘录、可能费用。只有用户确认后才能发起网络请求。AI 失败不得清除现有封面或阻断其他封面来源。

## 8. Obsidian 主题与排版

工作台外壳只使用 Obsidian CSS 变量：

- 主强调色：`var(--interactive-accent)`
- 强调文字：`var(--text-accent)`
- 普通文字：`var(--text-normal)`
- 次级文字：`var(--text-muted)`
- 页面背景：`var(--background-secondary)`
- 卡片背景：`var(--background-primary)`
- 边框：`var(--background-modifier-border)`

不得让 `--color-green` 优先于当前 Obsidian 强调色。不得为标签、分区标题或主按钮硬编码绿色十六进制值。

字号规则：

- 顶部两个标签使用 `var(--font-ui-medium)`。
- `文章信息`、`文章封面`、`发布状态`使用 `var(--font-ui-large)` 和 `var(--font-semibold)`。
- 字段标签继续使用 `var(--font-ui-small)`，避免窄面板拥挤。

激活标签使用普通文字色和当前主题强调色底边。分区标题使用普通文字色，不把三个大分区全部染成强调色。主按钮继续使用 Obsidian 原生 `mod-cta`。

文章预览白色画布属于公众号预览语义，可继续保持白色；本轮主题适配只约束插件外壳和交互控件，不改变文章主题产物。

## 9. 组件与职责

### 9.1 新增组件

- `AccountConnectionService`：保存账号配置、触发 Token 验证、记录安全状态、断开本地连接。
- `ExternalBrowserPort`：打开固定公众号后台地址，隔离 Electron API。
- `PublishCoverResolverPort`：为发布事务准备最终封面字节，隔离来源解析、受控下载、裁剪和存储。

```ts
export interface PreparedPublishCover {
  source: 'explicit' | 'first-local-image' | 'first-remote-image';
  vaultPath: string;
  bytes: Uint8Array;
  mimeType: 'image/png';
  contentHash: string;
}

export interface PublishCoverResolverPort {
  prepareForPublish(
    file: VaultFileRef,
    artifact: Readonly<RenderArtifact>,
  ): Promise<Readonly<PreparedPublishCover>>;
}
```

### 9.2 调整组件

- `WeChatWorkbenchSettingTab`：只渲染公众号与智能封面设置，转发保存、验证、断开动作。
- `SettingsStore`：安全解析新增账号展示名和验证记录，兼容旧设置。
- `WeChatWorkbenchView`：将顶部账号按钮替换为外部后台入口。
- `workbench-publish-settings`：移除原文链接控件，保留旧数据。
- `CoverPickerModal`：三来源 UI、文件输入、预览与确认。
- `CoverWorkflow`：首图来源解析、受控远程读取、上传字节处理、AI 生成、裁剪、内容寻址存储和确认持久化；实现 `PublishCoverResolverPort`。
- `PublishWorkflow`：消费 `PublishCoverResolverPort` 返回的冻结封面，不复制来源解析、下载或裁剪逻辑。
- `styles.css`：Obsidian 主题色、字号和紧凑布局。

### 9.3 不改变组件

- `RenderArtifactBuilder`
- `ClipboardService`
- `WeChatClient` 草稿与素材协议
- `PublishCoordinator` 事务状态机
- `PublishStateStore` 草稿关联与恢复语义
- `SecretStore` 的 SecretStorage 边界

## 10. 数据流

### 10.1 账号验证

```text
设置页输入
  -> AccountConnectionService.save
  -> SettingsStore + SecretStore
  -> TokenService.forceRefresh
  -> AccountConnectionService 记录脱敏结果
  -> 设置页刷新状态
```

### 10.2 自动首图发布

```text
RenderArtifact.assets
  -> 选择第一张 local-image 或 remote-image
  -> CoverWorkflow 本地读取或显式受控下载
  -> CoverWorkflow 裁剪、编码与内容寻址存储
  -> PreparedPublishCover
  -> 发布预检
  -> 封面素材上传
  -> 草稿事务
```

### 10.3 本地上传

```text
系统文件选择器
  -> File bytes
  -> MIME/大小/解码校验
  -> 2.35:1 PNG
  -> 插件 Vault 封面目录
  -> 用户确认
  -> 安全合并 Frontmatter
```

### 10.4 智能生成

```text
当前 RenderArtifact + 最新图片服务配置
  -> 外发确认
  -> OpenAI 兼容图片 API
  -> 输出校验、下载或 base64 解码
  -> 2.35:1 PNG
  -> 插件 Vault 封面目录
  -> 用户确认
  -> 安全合并 Frontmatter
```

## 11. 错误与恢复

- 账号字段缺失：本地阻断，不联网。
- Token 验证失败：显示脱敏分类、微信 `errcode` 和下一步，不显示 Secret、Token、完整请求或堆栈。
- IP 未授权：只显示微信明确返回的 IP；没有可靠 IP 时不猜测。
- 后台链接打开失败：Notice 提供手工域名，不影响其他功能。
- 文章没有首图：封面区显示空状态，发布动作给出可执行阻断。
- 用户取消文件选择：无状态变化、无错误 Notice。
- 本地图片不支持或过大：保留当前封面，提示重新选择。
- 远程首图失败：保留当前封面，允许上传或 AI；不得自动绕过 SSRF 策略。
- AI 配置缺失或生成失败：文章首图和本地上传保持可用。
- 用户确认封面前文章发生变化：继续使用现有上下文哈希阻断，要求重新准备。

## 12. 安全与隐私

- AppSecret、Access Token、图片 API Key 不进入 `data.json`、Frontmatter、日志、错误详情、测试快照或仓库。
- 验证状态不保存原始微信响应和完整 `errmsg`。
- 外部浏览器只打开固定 HTTPS 地址。
- 文件选择器不保存本机绝对路径。
- 上传文件按魔数校验，不能只信扩展名、浏览器 MIME 或文件名。
- 远程首图继续执行现有 SSRF、重定向、DNS、大小和 MIME 限制。
- 智能封面调用前继续展示外发字段、服务、模型和费用。
- 所有测试凭据只存在固定测试 Vault 的 SecretStorage，不写入测试文件和验证文档。

## 13. 兼容与迁移

- 设置模型升级为 `schemaVersion: 3`；版本 1、2 缺失新字段时回退为空展示名和无验证记录。
- 旧 `defaultCoverStrategy`、`globalDefaultCoverPath`、`defaultSourceUrl` 在本轮保留解析，停止从新 UI 写入。
- 旧文章 `content_source_url` 保留并继续参与旧数据解析；发布设置保存其他字段时不得删除它。
- 旧文章 `cover` 继续视为显式封面；用户选择“文章首图（默认）”后才清除该覆盖。
- 已存在的草稿关联、素材缓存和恢复回执不迁移、不清理。
- `AccountSettingsModal` 停止接线，但本轮不删除文件；删除需另获明确授权。

## 14. 测试设计

每项生产行为先写失败测试，再写最小实现。

### 14.1 单元测试

- 设置模型安全解析新增字段，旧版本迁移不丢失其他设置。
- AppID 或 AppSecret 变化使旧验证记录失效并清除 Token。
- 空 AppSecret 保留现有 Secret；新 AppSecret 替换后不回填。
- 强制 Token 刷新成功、失败、并发 single-flight 和脱敏状态。
- 断开连接只清除本机凭据和验证状态。
- 固定公众号后台地址通过外部浏览器端口打开；用户数据不能改变 URL。
- 发布设置 DOM 不存在 `settings-source-url`，保存时保留旧原文链接。
- 首张本地图片、首张远程图片、无图片和生成资产排除规则。
- 文件上传取消、空文件、伪造扩展名、超限、解码失败、裁剪和安全保存。
- AI 配置缺失提示、读取最新模型、确认前不发请求、失败不影响其他来源。
- CSS 契约不再优先 `--color-green`，标签与分区字号使用指定变量。

### 14.2 集成与对抗测试

- 假微信 Token 服务验证账号状态完整流转。
- 远程首图经过受控下载，阻止 localhost、私网、重定向和伪 MIME。
- 上传文件名包含路径分隔符、控制字符、超长 Unicode 时不影响安全存储路径。
- 文章切换或修改后，旧封面准备结果不能写入新上下文。
- AppSecret、Token、图片 API Key 不出现在 DOM、快照、错误、构建产物扫描结果中。
- 520px、640px、720px 无横向溢出、遮挡或不可点击主操作。

### 14.3 自动化门禁

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run verify:release
npm run scan:secrets
WECHAT_WORKBENCH_TEST_VAULT=$HOME/workspace/Github/wechat-workbench-test-vault npm run sync:test-vault
```

既有基线失败、环境阻塞或未执行命令必须单独报告，不能描述为通过。

## 15. 真实 Obsidian 验收

全部步骤在 `$HOME/workspace/Github/wechat-workbench-test-vault` 执行：

1. 打开插件设置，确认账号区、连接状态和智能封面区连续排列，中部无异常空白。
2. 输入账号配置，确认 AppSecret 不回显；执行成功和失败验证，核对状态、时间、错误分类和按钮恢复。
3. 断开连接，确认 Secret 与 Token 清除、AppID 和展示名保留。
4. 在工作台悬浮右上图标，核对“跳转到公众号后台”；点击后确认系统浏览器打开 `mp.weixin.qq.com`。
5. 打开发布设置，确认不存在“原文链接”，文章信息保存不删除旧 Frontmatter 原文链接。
6. 使用含首张本地图片的文章，确认默认封面、裁剪预览和草稿准备一致。
7. 使用远程首图文章，确认被动预览不联网，显式准备时才受控加载。
8. 点击“上传本地图片”，确认系统文件管理器打开；选择 Vault 外图片后完成处理、预览、确认和 Vault 内保存。
9. 使用已配置图片服务验证智能生成确认、生成、失败恢复和最终保存。
10. 在浅色、深色和非绿色 Obsidian 强调色下检查标签、分区标题、按钮和卡片。
11. 在 520px、640px、720px 宽度重复检查布局。
12. 使用专用测试账号执行真实草稿创建、更新、无变化跳过及公众号后台视觉核对。

实机截图必须同时包含中央 Markdown 编辑器和右侧工作台。账号、Secret、Token、完整 AppID、内部媒体 ID 和其他敏感数据必须遮挡。

验证结果统一写入 `docs/verification/`，区分自动化通过、真实 UI 通过、真实微信通过和环境阻塞。

## 16. 实施边界与顺序

实施顺序固定为：

1. 账号配置、验证状态和测试。
2. 顶部后台入口、原文链接移除、Obsidian 主题适配和测试。
3. 三来源封面、受控远程首图、系统文件选择器和测试。
4. 全量自动化门禁、固定 Vault 真实验收和证据归档。

下一步只生成详细实施计划，不直接开始编码。实施计划必须列出准确文件、接口、失败测试、最小实现、验证命令和提交边界。

## 17. 验收标准

- 设置页具备公众号名称、AppID、AppSecret、显式验证、状态、重新验证和断开连接。
- 状态不会把历史 Token 缓存误报为当前持续在线。
- 不伪造固定出口 IP，不新增第三方 IP 查询外发。
- 工作台右上角只跳转公众号后台，不再打开本地账号弹窗。
- 发布设置不显示原文链接，旧数据不被隐式删除。
- 封面选择器只显示文章首图、本地上传和智能生成。
- 本地上传通过系统文件选择器完成，不要求路径输入。
- 自动首图支持本地与显式加载的远程普通图片，排除生成资产。
- AI 使用最新服务地址、模型和 SecretStorage API Key，并保留调用前确认。
- 标签和分区标题字号增大，不再固定使用绿色，适配当前 Obsidian 强调色。
- 所有真实改动和验证只进入固定测试 Vault，`commit_note` 主 Vault 不加载开发插件。
- 自动化、实机和真实微信验证证据分别记录，不以部分证据替代完整验收。
