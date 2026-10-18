# M1 实现范围与技术说明

> **最新默认口径和程序已更新**：打开即终端、项目可选、辅助默认收起。请以 [BASH-TUI.md](BASH-TUI.md) 的新EXE/截图为准；下文保留上一轮历史口径与证据，不作为本轮人工通过声明。

> 本文保留首轮实现记录。首轮人工体验未通过；最新界面/行距/尺寸/CLI 返修及未验范围见 [返修记录](REPAIR-20261015.md)。下文首轮自动结果不能当作人工验收通过。

> **2026-10-17/18 之后的修复**（`worker.ts`、`shell.ts`、`terminals.ts`、`app.ts`）：resize/输入竞态、中文输入回显为八进制与输入法提交键被吞、以及 `Ctrl+V`/`Ctrl+Shift+V` 粘贴失效均已定位并修复。自动回归、前后对照与证据见 [BASH-TUI.md](BASH-TUI.md) 及 `evidence/` 下各轮目录；正文各节为总体技术与边界说明，不代表某一轮快照。

## 基线与已确认口径

实际工作目录 `D:/Code/JianZJ-Hub`；开始与交付时 HEAD 均为 `31ce4c77055de11ef9d589be0b72d15d6c373de4`，分支 main。开始工作树干净；origin 为指定仓库的 SSH remote。未拉取、切分支、提交或推送，不据此声称远端当前同步。（后续：M1 代码已提交到分支 `git-bash-workstation` 并推送 origin，`main` 内容不变、仅提交说明改写。）

已读取飞书 PRD revision 21、技术计划 revision 7 和四份 M0 交接材料。认可原型 71,609 字节，SHA-256 `1033c2dab321312f09ac220450d2fea7fbbf0f905ade18c450a5ed1281e6917a`；未修改、下载替换或公开上传原型。

用户确认：关闭即退出，M1 不做托盘；保存工作区名称、目录、初始布局及偏好，不保存上次运行分屏树，不自动启动/恢复进程或重放命令。实现范围确认后持续推进，未扩充 M0 或 M2。

## 文件与复用边界

| 路径 | 作用 |
|---|---|
| `src/main/m1.ts`、`main/workstation/{app,service}.ts` | 产品窗口、精确 IPC 权限路由、服务监督、配置写入串行化和统一退出 |
| `src/preload/workstation.ts`、`shared/workstation-protocol.ts` | 具名、可退订 bridge，不暴露原始 IPC 或通用 exec |
| `src/core/layout/tree.mjs`、`shared/workstation/rules.mjs` | 不依赖 Electron/React 的树、最小尺寸、schema 与有界信用窗口 |
| `src/services/pty/workstation/{broker,worker}.ts` | 会话权威注册表、独立原生 worker、流控、排空和资源释放 |
| `src/adapters/windows/workstation/{conout,conout-reader}.ts` | 固定 node-pty 1.1.0 的产品专用 EOF 转发适配 |
| `src/services/data/workstation.ts` | SQLite 单写配置；只有 settings/workspaces，不接入 simple/M2 业务 |
| `src/renderer/workstation/` | 已认可布局、React 控件、稳定 xterm 宿主、单一 palette 和舒适样式 |
| `electron.vite.m1.config.ts`、`electron-builder.m1.json` | M1 独立构建/目录包，正式输出不含故障测试入口 |
| `scripts/m1/`、`tests/m1/` | 离线打包、真实桌面驱动、受管理监督、压力与故障验收、字节保真归档 |
| `.gitignore`、`.gitattributes`、package scripts、README | 精确放行 M1 开发记录/证据、忽略 scratch、保持 M0 原入口 |

复用 `Job`/`ProcessHandle` 的已验 Windows 机制，**该共享 adapter 未修改**。M0 主程序、原生 worker、协议、探针、测试、准备脚本、builder/vite 配置、锁文件及历史证据均无 diff，见 [保真核对](evidence/20261015/preservation.json)。新增源码的具体文件、长度和哈希见 [源码清单](evidence/20261015/source-manifest.json)。

## 会话与进程生命周期

- workspaceId 是配置归属；paneId 是展示叶；sessionId 是一次真实 Shell；generation 是该运行代次，当前每次新建使用新 sessionId/generation 1。改名、布局变化和隐藏不会创建新会话。
- main 只持窗口/窗格/工作区归属索引，生命周期权威在 broker。运行资源及时删除；结束摘要和幂等请求记录各有 128 条上界，不持 Job/ProcessHandle/worker。
- broker 不加载 node-pty。每个 worker 一生只建一次 PTY；**先分配 worker 到会话 Job，再发送 create**。spawned 消息后保留真实 Shell 句柄，并在可接收用户输入之前将 Shell 绑定到嵌套生产者 Job。外层 Job 从 Shell 出生起覆盖它；嵌套 Job 覆盖其后由命令启动的后代。
- 关闭/自然结束时终止生产者 Job，**不先终止 worker、OpenConsole 和读流**；实际 EOF、全部输出消费 ACK、真实进程句柄退出码与最终 Job 空均成立，才发完成并释放系统资源。主进程/服务崩溃由上级 Job 的 KILL_ON_JOB_CLOSE 回收。未使用 node-pty 的裸 PID 列表清理或进程名批杀。
- 退出码来自已 signaled 的 ProcessHandle，包含真实 259；从不把未知原生回调猜为 0。失败不会改称正常退出；关闭失败保留窗格和错误。
- 应用退出统一执行确认、停止创建/输入、收敛在途创建、停止会话和服务、核查后退出；包含创建中会话的确认。窗口不静默藏到后台。

## 背压与尾输出

未确认数据每会话 **128 KiB**、最多 **64 个在途数据事件**，单传输块不超过 **16 KiB**；worker 待拆输出另有 **256 KiB** 硬界。xterm scrollback 为 **4,000 行**。UTF-16 切块不拆代理对，UTF-8 解码由 Node 流处理；ANSI 字节按序交 xterm，不自行解析屏幕。

xterm.write 回调确认 seq；broker 和 worker 校验累计 ACK 的单调性/范围，再恢复输出读取。暂停会沿有界转发管道传播。输入也限制 64 KiB，并检查底层输入流 writableLength，写入回调报告失败，不能无限累积粘贴；界面会提示过大/忙碌而不伪称写入成功。

node-pty 1.1.0 的原 conout 连接含 1000ms 定时销毁线程；M0 broker 也有短静默等待。M1 的局部 JS adapter 在加载 node-pty 前替换 ConoutConnection 转发契约：用真正源流结束和转发 writable finish，不按静默时长销毁。没有编辑 node_modules、替换 DLL 或安装编译工具。保留 Microsoft MIT 归属，分发 node-pty 原许可证。

排空的 30s 上限只界定**失败**，不是成功证据。worker/消费者崩溃时报告输出可能不完整，并回收进程；不承诺恢复崩溃前尚在被强制结束程序自身用户态缓冲中的数据。自然/主动关闭的完整数据集与真实打包 xterm 消费的三项哈希均已实测，见验收记录。

## 布局、焦点与主题

递归树局部替换/折叠，拖动按整个子树最小尺寸约束；窄窗或空间不足显示提示和当前窗格标签。xterm 由 session/pane 管理器持有稳定宿主：React 重排、叶节点换父层级、专注、放大及跨工作区隐藏不会 dispose 既有实例。关闭展示才 dispose。

ResizeObserver/FitAddon 合并尺寸，隐藏/零尺寸不发送，复显后 fit；产品浮层按状态处理 Esc，没有产品状态时 Esc/控制键交终端。输入型工具保存来源窗格并恢复焦点。IME 组合状态不触发产品快捷操作，但真正 Windows IME 体验仍待人工验。

`palette.mjs` 的 light/dark 是唯一颜色源，同时驱动 CSS 和 xterm theme；字体栈同样从原型提取。nativeTheme.updated 解析 system/light/dark；四组合测了页面颜色与终端真实像素。Chromium 同字体样本的实际字形诊断为 Consolas（22 字形）和 Microsoft YaHei（2 个中文字形），不是把 Cascadia 配置名当加载结果；这不替代人工 canvas/中文混排/缩放检查。

## 生产 IPC 与隐私

nodeIntegration=false、contextIsolation=true、sandbox=true；严格 CSP，sender、mainFrame 和精确本地文件 URL 校验。导航、新窗、webview 及不需要的权限拒绝。逐请求校验 schema、会话归属、generation、尺寸、输入大小、ACK 和状态；无任意可执行路径/env、文件读写、SQL 或通用执行接口。

PTY 用用户自身权限，不是命令安全沙箱。PowerShell 不加载个人 profile，PSReadLine 不向个人历史写入，应用不修改个人配置。不持久化终端全文，不采集使用遥测或剪贴板历史。剪贴板接口只服务用户主动终端复制/粘贴；自动测试未读用户真实剪贴板。

正式包无测试主入口、inspect/fault bridge 或外部调试端口。桌面开发 harness 是单独测试入口；正式包测试通过启动参数临时开启 **loopback CDP**，没有改包内容，退出即结束，不是产品默认能力。原生确认和 resize 只对保留句柄对应的本应用 PID 窗口操作。

## 与原型的差异及限制

1. 演示输入框换成 xterm，输出来自实际 Shell，原模拟日志/示例工作区不冒充真实数据；首次为空配置。
2. 原型辅助业务收缩为明确占位；搜索/快捷启动只打开工作区，不宣称完整能力。原有区域分工与唯一设置入口保留。
3. 删除演示六窗格上限；新增可解释的空间保护；原型无条件 Esc 截获改为有产品状态才截获。
4. 浏览器偏好存储改为独立 SQLite 配置；不记忆上次运行树。使用原生目录选择和退出确认，不画第二套入口。
5. 明确终端字号/密度/颜色；xterm CSS 原默认黑色视口由同源 token 覆盖，避免浅色终端底部黑块。
6. 仅目标机 Windows x64 / Windows PowerShell 验证；无跨机器保证、安装器/签名、完整传递许可正式审计或数日稳定性保证。12 轮资源测试不是长期性能结论。服务故障回收后需重开应用，不自动重建会话。
