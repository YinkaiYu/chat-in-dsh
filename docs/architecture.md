# 架构与工程链路

## 组件

| 层 | 文件 | 职责 |
|---|---|---|
| 宿主入口 | `index.js` | 注册 `/webchat` 前缀路由（必须用 `handler`，`resource` 只接 GET/HEAD） |
| 宿主路由 | `src/webview.js` | 静态产物、自检、导入接口、Messages/Files 转发、TTS/ASR 转发 |
| 协议约定 | `src/protocol.js` | 端点根、令牌头、路径越界判断；纯函数，有测试 |
| 导入解析 | `src/dsh-import.js` | 只读解析 DSH 会话日志 → chat-demo 会话；暂存与确认；有测试 |
| 界面壳 | `client.js` | 左侧面板槽位、iframe、会话右键菜单、麦克风/头像桥 |
| 前端产物 | `webview/dist` | chat-demo v0.1.4 构建产物，随仓库分发 |
| 上游补丁 | `webview/patches/0001-dsh-integration.patch` | 对 chat-demo 的全部改动 |

上游基准：`cdf9617c5f265d58e0e1805635b2c10a3d41284d`（chat-demo v0.1.4，MIT）。

## 请求链路

1. 浏览器只访问同源宿主 `/webchat/*`，不持有 DeepSeek 凭据。
2. 宿主把 `/webchat/anthropic/v1/messages` 转发到官方 Messages：
   - 优先 DSH 账户令牌（`x-dsh-auth-token`）
   - 没有账户令牌时用 DSH 模型设置里的 API Key（`x-api-key`）
3. 附件走 `/webchat/anthropic/v1/files`：
   - 只有官方端点（hostname `api.deepseek.com`）改走 Files API 根路径 `/files`
   - 自定义兼容网关保留原 `/anthropic/v1/files`
   - 图片表单带 `purpose=user_data`，但仍先做客户端预缩放
   - 100MB 级上传必须流式转发，不能整包读内存
4. TTS/ASR 都经宿主 `/webchat/v1/tools/*` 转发，浏览器不接触凭据。

## 长文档链路

- 官方 API 的扩展模式（请求里带 `safety_check`、`tools`、`title` 任一）限制输入 32k tokens。
- 前端命中 400 `user input too long ... max 32768` 时：
  1. 去掉扩展字段，用普通模式带完整附件/历史重发；
  2. 回答完成后单独发一个小标题请求（提问 + 文件名 + 粘贴原文截断 + 主回复摘要）。
- 普通短消息仍走扩展模式，不主动降级。
- 服务端仍有 20 个文档引用、每个请求 600 张图片、8MiB 文档文字、1M 上下文等硬限制；前端不能绕过。

## 存储与导入

- 左侧面板由 `slots` 和 `layout` 注册。会话导入优先接入 `contextMenus`；旧宿主在 `sidebar.workspaces.session.menu.item` 渲染宿主自带的菜单按钮。两个入口共用同一次暂存请求，菜单服务就绪或卸载时切换注册。
- 主数据库：chat-demo IndexedDB，**保持 v11**，不要无必要升级。
- 导入回执：独立数据库 `chat-demo-import-receipts`，避免主库升级阻塞多个面板。
- 导入操作：
  - 每次主动导入一个 `importId`；
  - 回执先 pending，会话保存成功后 done；
  - ACK 按 `importId` 精确匹配，旧/无标识确认不能删新暂存；
  - 已有本地会话时只做前缀更新/追加，本地续聊、分支、标题、置顶优先保留；
  - ZIP 导出/回导保留消息原始 ID，以便之后继续从 DSH 导入。
- 保存失败：
  - 连接失效先重开连接并补存一次；
  - 手动「重试」先丢弃失效句柄；
  - 未打开会话改名失败进入待重试队列。
- ZIP 导入/导出/清空与待导入共用 Web Locks，防止多个同源面板同时提交暂存。
- 手动 ZIP 导入沿用上游 v0.1.4 的覆盖语义，并采用其导入进度与图片附件随会话导入；
  设置页仍保留本插件的错误分类、关闭后结果可见等行为。

## 旧内核与导入状态

- DSH Go / Android WebView 可能停留在 Chromium 110 之前。上游 v0.1.4 已把
  `Array.prototype.toSorted` / `toReversed` 改为不依赖 ES2023 的写法；`frontend-compat`
  测试继续守住源码和构建产物，禁止重新引入这些方法。
- 设置页的导入 hook 挂在 `SettingsDialog`，关闭设置不会卸载导入任务；导入中显示上游进度条，
  结果和错误在重新打开设置后仍可见，避免用户以为点了没反应而重复操作。
- 导入错误按原因区分：归档格式/版本错误用 `BackupError.key`；`QuotaExceededError` 提示存储空间不足；
  `NotReadableError` 提示重新选择 ZIP；未知错误用中性重试提示。不要把具体对话内容写进错误。

## 桌面壳与旧版 DSH

- `engines.dsh` / 可选 peer 最低兼容 `0.1.7-alpha.1`；不能只靠降低版本号，插件必须在新旧宿主都能挂载。
- 新版宿主用 `contextMenus` 注册会话导入；旧版没有该服务时，用宿主自带的
  `sidebar.workspaces.session.menu.item` 渲染同一条导入按钮。两个入口共用一次暂存请求，
  `contextMenus` 迟到或卸载时切换注册，不会同时出现两份。
- macOS 的窗口控制悬浮在窗口内容上方。非全屏时，插件作为 global main panel
  按 `--dsh-frame-top-clearance` 减去 DSH main panel 已有的 padding，避开红绿灯；
  全屏时红绿灯隐藏但 `shell.leading` 的侧栏/新会话按钮仍在左上，插件按
  `--dsh-frame-leading-clearance` 留出左边，避免压住网页版自己的顶部按钮。

## 前端构建

上游前端不能用“直接改 vendor”作为交付方式。流程固定：

```bash
cd webview/vendor/chat-demo
git add -A
git diff --cached --binary --output=../../patches/0001-dsh-integration.patch
git reset

cd ../../..
pwsh scripts/build-webview.ps1
```

`scripts/build-webview.ps1` 会 fetch 上游、`git reset --hard`、`git clean -fd` 再应用补丁，最后构建并同步 `webview/dist`。只改 `webview/dist` 或 `client.js` 时通常刷新页面即可；宿主 `index.js` / `src/*` 改动需要重新安装插件。

## 测试

- 宿主纯函数：`node --test test/protocol.test.js test/dsh-import.test.js`
- 系统自检与人工 gate：见 [testing.md](testing.md)
- 发布门槛与版本策略：见 [release.md](release.md)
