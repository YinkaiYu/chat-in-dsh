# AGENTS.md — 开发 Agent 指南

这个文件写给在本仓库里工作的 Agent 和开发者。**人类用户请看 [README.md](README.md)。**

目标是让任何 Agent 在动手前知道：这是什么、去哪里读、怎么改、哪些不能做、什么时候算完成。

## 文档地图

| 文档 | 什么时候读 |
|---|---|
| [docs/README.md](docs/README.md) | 文档索引与维护规则 |
| [docs/product.md](docs/product.md) | 产品定位、非目标、官方网页版对齐原则 |
| [docs/architecture.md](docs/architecture.md) | 路由、凭据、转发、存储、导入、构建链路 |
| [docs/testing.md](docs/testing.md) | 自动测试、系统自检、人工 gate；**功能行为优先写成测试，不要塞进 AGENTS** |
| [docs/release.md](docs/release.md) | 版本策略、发布前门槛、发布步骤 |

## 这个仓库是什么

一个 DeepSeek Harness 插件：在左侧面板托管官方 [chat-demo](https://github.com/deepseek-ai/chat-demo) 的构建产物，并用 DSH 的账户凭据替浏览器转发请求。

产品定位是**尽量还原 DeepSeek 官方网页版（限额前）**，不是通用多模型聊天前端。完整边界见 [docs/product.md](docs/product.md)。

## 结构

| 块 | 文件 | 作用 |
|---|---|---|
| 宿主 | `index.js` | 注册 `/webchat` 前缀路由（**必须用 `handler`，`resource` 只接 GET/HEAD**） |
| 路由 | `src/webview.js` | 静态产物、自检、导入接口、Messages/Files/TTS/ASR 转发 |
| 约定 | `src/protocol.js` | 端点根、令牌头、路径越界判断（纯函数，有测试） |
| 导入 | `src/dsh-import.js` | 只读解析 DSH 会话日志 → chat-demo 格式；暂存与确认（纯函数，有测试） |
| 界面 | `client.js` | 左侧面板槽位、iframe、会话右键菜单、麦克风/头像桥 |
| 前端 | `webview/dist` | chat-demo v0.1.4 构建产物，随仓库分发 |
| 上游补丁 | `webview/patches/0001-dsh-integration.patch` | 对 chat-demo 的全部改动 |

上游基准：`cdf9617c5f265d58e0e1805635b2c10a3d41284d`（chat-demo v0.1.4，MIT）。

实现细节看 [docs/architecture.md](docs/architecture.md)，这里不重复。

## 命令

```bash
node --test test/protocol.test.js test/dsh-import.test.js test/frontend-compat.test.js
pwsh scripts/build-webview.ps1     # fetch 上游、应用补丁、构建、同步 webview/dist
```

安装：`plugin_manager` 装仓库根目录。宿主代码（`index.js`、`src/*`）改动后要 `remove_bundle` 再 `install_bundle`；
只改 `client.js` / `webview/dist` 时刷新页面即可。

## 工作约定

1. **先读文档**：产品边界看 `docs/product.md`，实现看 `docs/architecture.md`，测试看 `docs/testing.md`。
2. **前端不能直接改 vendor 交付**：流程是
   `vendor` 改动 → `git add -A` → `git diff --cached --binary` 生成补丁 → `git reset` → 跑构建脚本。
   构建脚本会 reset 上游，vendor 里的未生成补丁改动会被清掉。
3. **`webview/dist` 是构建产物**：只能由构建脚本生成；不要手改。
4. **宿主改动要重装插件**；`client.js` / 前端产物改动刷新即可。
5. **测试要求**：改 `protocol.js` / `dsh-import.js` 必须跑对应单元测试；可自动化的行为优先补测试，不能自动化的才按 `docs/testing.md` 的人工 gate 验证。
6. **提交要小**：一个提交只做一件事，不要把无关改动、临时测试文件、个人配置混进来。
7. **不擅自发布**：push / npm publish / tag / Release 必须等用户明确同意；本地测试通过只代表可以进入发布评审。
8. **文档分层**：新功能行为写成测试；测试说明写 `docs/testing.md`；架构变化写 `docs/architecture.md`；版本流程写 `docs/release.md`。不要让 AGENTS 重新膨胀。

## 硬约束

1. **一个入口**：只有左侧面板。不要加模型路由/模型选择、不要加 `conversation.view`、不要做会话双向同步——这是产品决定，不是待办。
2. **网页版独立存储**：用上游自带的本地存储；只有「导入」这一次性复制会从 DSH 读数据。
3. **不发明提示词**：浏览器构造请求体，宿主只转发；不替模型拼系统提示词。
4. **密钥不出宿主**：浏览器不持有 API Key；`BOOTSTRAP` 注入的只是让上游放行的占位值。
5. **官方网页版优先**：不新增官网没有的常驻 UI、提示或设置；不因非公开网页能力额外引入第二套网页登录态。浏览器级能力可在不增加常驻 UI 的前提下补齐。
6. **许可证合规**：`webview/dist/LICENSE` 是上游 MIT 原文，不要删。

## 验证入口

最小自动化基线：

- `node --test test/protocol.test.js test/dsh-import.test.js test/frontend-compat.test.js`
- `GET /webchat/api/self-test`：入口页、静态资源、一次真实生成三项全绿
- `npm pack --dry-run`：入口文件和 `webview/dist` 都在包内

测试与人工 gate 见 [docs/testing.md](docs/testing.md)；版本和发布流程见 [docs/release.md](docs/release.md)。
