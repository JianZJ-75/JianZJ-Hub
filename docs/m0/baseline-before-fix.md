# M0 兼容与关键风险验证

日期：2026-10-14。**本轮验证已执行并收尾，但 M0 放行失败：暂不能进入 M1。**

基础原生加载、真实 PTY、中文搜索、最小打包和受管理进程清理已有实测证据；node-pty 多会话并发自然退出仍会发生原生服务崩溃。不能用最近一次偶然通过覆盖先前失败。

## 1. 基线与执行边界

- 实际仓库：`D:/Code/JianZJ-Hub`；origin：`https://github.com/JianZJ-75/JianZJ-Hub.git`。
- 当前 `main` 无提交。未初始化新仓库，未提交、推送、拉取或切换分支。原有六个未跟踪文件保留，README 与忽略规则在其基础上修改。
- 已完整读取飞书 PRD revision **21**、技术设计 revision **6**。
- 唯一认可原型：`prototypes/comfort-redesign/workstation-comfort.html`，71,609 字节；SHA-256 `1033c2dab321312f09ac220450d2fea7fbbf0f905ade18c450a5ed1281e6917a`，与本地附件校验副本相同。已阅读全部 HTML、CSS、JS，未改原型或使用 theme-v4。
- 最新要求优先；旧 PRODUCT.md 的“不内嵌终端 / 依赖 WezTerm”、旧 README 的“先做快捷启动”不用于当前实施。
- 代码仅为 M0 验证入口，**不是舒适版迁移或产品验收**。未开发递归分屏、辅助模块、审批、通知接入或会话恢复。
- 安装及执行官方依赖脚本、原生 DLL 与专属测试进程经用户确认。未安装全局包或系统工具链；未改 PATH、自启或持久执行策略；未进行飞书写入或发布。

## 2. 实际版本及依据

| 组件 | 本轮实际版本 |
|---|---|
| 本机 Node / npm | 22.23.2 x64 / 10.9.8；宿主 ABI 127 |
| Windows / 首个 Shell | Windows 11 Enterprise LTSC 2024 build 26100 / 系统 Windows PowerShell 5.1 |
| Electron | 44.7.2；实际主进程与 utilityProcess：Node 24.21.0、ABI 149、N-API 10、Chromium 152.0.7977.149 |
| node-pty / ConPTY | 1.1.0；`useConpty: true, useConptyDll: true`，包内 ConPTY 1.23.251008001 |
| better-sqlite3 / SQLite | 13.0.3 / 实际查询返回 3.53.4 |
| simple | 0.7.1，官方 Windows x64 DLL 与词典 |
| Koffi | 3.3.3，Windows x64 平台预编译依赖 |
| xterm / fit | @xterm/xterm 6.0.0 / @xterm/addon-fit 0.11.0 |
| React / React DOM | 19.3.0 / 19.3.0 |
| 构建工具 | electron-vite 5.0.0、Vite 7.3.7、React 插件 5.2.0、TypeScript 7.0.2、electron-builder 26.15.3 |

选择依据为本轮官方 npm 元数据、对应源码与发布资产，而非旧研究数字。electron-vite 5 的 peer 范围不包含 Vite 8，因此没有直接组合各包 latest。类型声明版本见 package-lock.json 和 preparation.json。

**本轮实际使用包内预编译原生模块，没有源码重编译，也不需要 MSVC/Python/Windows SDK。** 这仅证明本机、所选版本和已执行路径；不证明任意版本、平台或运行场景兼容。

simple 压缩包 SHA-256：`7f03cc28cf307721f5621b5a52ef3bcb26c5215de012b09900492eb34d5bed0b`，下载后校验通过。上游许可证允许 MIT 或 GPL-3.0-or-later 二选一，本轮按 MIT 使用，产物携带原文；另携带 cppjieba 上游 MIT 文本。这不是全部传递依赖的正式分发许可审计，M5 前仍须核对完整清单。

## 3. 通过、失败、未验证

### 已通过的路径

| 验证项 | 可观察证据 |
|---|---|
| 原生基础加载 | Electron 主进程加载 Koffi / better-sqlite3；PTY utilityProcess 实际加载 conpty.node；数据 utilityProcess 加载 SQLite 与 simple.dll。保存实际运行时版本和 native 加载路径。 |
| 真实输入输出 | 点击真实 Electron 页面按钮启动 Shell，通过 xterm 键盘输入 `Write-Output ("M0_UI_"+(10+7))`，收到实际 `M0_UI_17`；另收到 `M0_中文_42`，不是预置输出。截图已查看。 |
| resize | 调整为 111×37，Shell 的 `$Host.UI.RawUI.WindowSize` 实际返回 `M0_SIZE_111x37`。包含中文和空格的真实 cwd。 |
| 单会话关闭 | Shell、子 Node、detached 孙 Node 均结束；重复关闭幂等；该会话新增的 ConPTY 包装 PID 从服务 Job 中消失。 |
| 其他会话隔离 | 关闭一个会话后另一个继续计算并输出 `M0_SURVIVOR_42`。 |
| 正常退出 | 单个 Shell `exit 7` 返回真实退出码，后续输入被拒绝，不重建或重放；主动服务关闭按顺序等待各会话退出事件，进程树清空。 |
| 服务和主进程故障回收 | 分别终止本轮 PTY utilityProcess、只终止本轮 Electron 主进程；受管理 Shell 与子孙进程结束，监督 Job 中无包装进程残留。 |
| 不误杀对照进程 | 已通过的场景中，本轮独立对照 PowerShell 在应用清理后仍存活，随后由自己的 Job 清理；未按进程名称批量终止。 |
| SQLite / FTS | 内存数据库创建 FTS5(simple)，中文 `中文`、拼音 `zjl`、jieba `中文搜索` 均命中本轮测试文本。 |
| 最小打包 | Windows x64 未安装目录实际运行；原生模块置于 app.asar.unpacked，simple/词典/许可/测试 fixture 置于 resources。实际 cwd 为独立测试目录，不以源码 cwd 启动。 |
| 打包二进制一致性 | conpty.node、better-sqlite3、Koffi 和 simple.dll 的安装版/打包版 SHA-256 相同，详见 evidence-summary.json。 |
| 基础输入校验 | `npm test`：3/3 通过；拒绝无效尺寸、非法会话标识与过大 UTF-8 输入；集成拒绝旧 generation。 |
| 最终历史隔离设置 | 最终打包测试通过：`Get-PSReadLineOption` 返回 SaveNothing 且历史路径位于测试 cwd，不打开个人历史文件。 |

### 仍失败：并发自然退出，阻塞 M1

两个会话通过同一个 Windows Event 同步执行 `exit 5`：真实进程结束，但缺少对应 terminal exit 事件；PTY utilityProcess 以 **3221225477 / 0xC0000005（访问冲突）** 结束。监督程序收到退出事件超时并正确返回非零，未伪造退出成功。

- 开发产物三个独立并发测试：**失败、失败、通过**；最后一次通过了三对退出，但此前失败仍成立。
- 打包产物两个并发测试：**失败、失败**，最后一次在最终历史隔离版本中仍复现。
- 核心证据：`evidence/packaged-concurrent-exit-result.json` 的 `concurrentFailure`、`cleanup.exitCode` 与 supervisor 非零结果；两个开发失败 JSON 也已归档。
- 主动串行关闭已通过，但**不能控制用户/CLI 自身同时自然退出**，因此并未消除关键风险。
- 上游 `node-pty/src/win/conpty.cc` 的退出线程操作共享 `ptyHandles`，代码是并发风险线索；本轮未做原生堆栈诊断，**不把它写成已证实根因**。
- 故障仍可能使同服务其他终端失效。这不满足 M1 多会话可靠性门槛，不能把服务异常后的 Job 回收称作正常终端体验。

### 未验证 / 本轮不做

完整中文输入法候选、全屏程序、长日志/背压、持续交互体验、Ctrl+C 与应用焦点、目标显示缩放、递归分屏、主题四组合、托盘关闭交互、持久化数据库/备份恢复、真实 CLI 事件、其他 Shell、其他电脑与 Windows 版本、权限提升/通过系统代理启动的脱离进程、安装器/签名/安装后无开发环境验收、完整许可审计。

这些既不是失败替代项，也不是已验收能力。M0 界面只有最小 xterm 测试区，不能当作产品界面交付。

## 4. 实际命令与结果

所有项目命令在 `D:/Code/JianZJ-Hub` 下执行；包来源显式为官方 registry，缓存限于项目 `.m0-scratch/cache/`。

| 命令或操作 | 结果 |
|---|---|
| `npm install --ignore-scripts --save-exact --registry=https://registry.npmjs.org --cache=.m0-scratch/cache/npm --no-audit --no-fund` | 成功，先不执行安装脚本。 |
| 同参数 `npm install --save-dev ... @types/node@22 @types/react@19 @types/react-dom@19 @types/better-sqlite3` | 成功，精确版本进入锁文件。 |
| `electron_config_cache=... node node_modules/electron/install.js` | 明确追加授权后成功，下载项目运行时。 |
| `node node_modules/node-pty/scripts/prebuild.js` / `post-install.js` | 成功，检查预编译目录和准备包内 ConPTY 资源。 |
| 官方 simple ZIP 下载、`sha256sum -c`、`unzip` | 成功，独立目录下载/解压，未从下载目录启动解释器。 |
| `npm run typecheck` | 最终通过；首次缺 CSS 类型引用，已使用 Vite 官方类型引用修正。 |
| `npm test` | 3/3 通过；只证明所列输入校验。 |
| `npm run build` | 最终成功。 |
| `npm run m0:package` | 成功，实际执行 electron-builder `--win --x64 --dir --publish never --config electron-builder.m0.json`；npmRebuild=false。 |
| `npm run m0:run` | 最后一次开发场景通过；不能覆盖此前并发自然退出失败。 |
| `npm run m0:packaged` | 最终正常/服务故障/主进程故障通过，随后并发自然退出失败，整个命令退出 1。 |
| `node scripts/m0/run.mjs dev或packaged --mode=normal/service-fault/main-crash/concurrent-exit` | 独立场景探针；运行历史逐次保留于 evidence-summary.json。 |

安装输出含上游传递依赖弃用警告；builder 提示缺 author 和未进行代码签名。这些没有被当作 M0 验证失败，也不代表正式分发准备完成。

初期真实失败均保留：GPU capturePage 的 UnknownVizError（M0 改用软件渲染后可截图）；启动门释放过早（改为等待 Shell 握手）；Windows 默认禁用 ps1（改用产物内 Node fixture，未放宽策略）；把 app.asar 当 cwd 的 error 267（修正为真实测试目录）；并行主动关闭崩溃（串行关闭规避）；并发自然退出崩溃（**未解决**）。原始临时日志保留，关键最终证据进入本目录。

## 5. 文件与运行方式

修改：`.gitignore`、根 README、src/README。

新增正式成果：package.json / package-lock.json、tsconfig.json、electron.vite.config.ts、electron-builder.m0.json；src/main/index.ts / m0-service.ts / m0-checks.ts；src/preload/index.ts；src/renderer/index.html / m0.tsx / m0.css / vite-env.d.ts；src/services/pty/m0.ts、src/services/data/m0.ts；src/adapters/windows/job-object.ts；src/shared/m0-protocol.ts / validation.mjs；scripts/m0/run.mjs / package.mjs；tests/m0/validation.test.mjs / process-tree.mjs；本目录全部记录与证据。

`.gitignore` 仅放行 docs/m0/，旧文档与原型继续忽略；原 `data/` 无锚点会误忽略正式 src/services/data，已改为根目录 `/data/`。临时 `.m0-scratch/`、node_modules、out、release 不纳入 Git。旧未提交内容未整体覆盖。完整当前文件清单见 files.txt。

```text
npm run typecheck
npm test
npm run build
npm run m0:run                 # 全部场景，已知并发风险可能使其非零
npm run m0:package
npm run m0:packaged            # 最终复验中退出 1，不应当预期“全部通过”
node scripts/m0/run.mjs dev --interactive
```

手动入口仅用于探针。关闭窗口触发本轮服务清理；自动探针有进程身份监督与专属 Job 兜底。完整窗口关闭/托盘产品交互未决，不从探针行为推定已获批准。

打包产物：`release/m0/win-unpacked/JianZJ Hub M0.exe`。没有生成安装器、创建快捷方式、安装到系统或对外发布。

## 6. 资源与隐私边界

- 已检查 **225 个本轮 PID + 创建时间身份**，未发现匹配的存活身份，也没有不可核查记录，见 cleanup-verification.json。所有 supervisor 的 fallback 清理针对其 Job 成员；不扫进程名。PID 被复用不会被当作本轮残留。
- 保留正式源代码、测试、锁文件、文档；暂留 node_modules（约 654 MiB）、.m0-scratch（早期量测约 568 MiB，含缓存/下载/每轮 userData 和失败日志）、out（约 1.1 MiB）、release/m0（约 436 MiB）。反复测试后临时目录大小会变化，这不是性能预算。
- 搜索扩展与许可单独下载目录，安装/打包缓存项目内；不清理用户共享缓存。未使用 Python、未安装系统编译工具、未更新 lark-cli。
- obsolete process-tree.ps1 是本轮自建文件，已移除；最终 fixture 为产物内 process-tree.mjs，不依赖系统 Node。测试 Shell 的 ELECTRON_RUN_AS_NODE 仅是该进程树的环境值，不改个人环境。
- 没有启动剪贴板采集、读取私人 CLI 会话、接管审批或采集遥测。保留的终端日志仅包含本轮人工构造命令和测试内容。
- **早期 PSReadLine 隔离缺口：**最初仅用 -NoProfile，未显式关闭历史功能；不能据此保证 PowerShell 自身未触及默认个人历史。未读取或清理个人历史正文，所以影响范围仍未核验。最终入口已设置 SaveNothing 和独立测试历史路径，并实测选项。这项隐私限制不应从记录中删掉。
- 后续可按清单清理 `.m0-scratch/`、out、release/m0 和项目 node_modules；清理前确保无手动探针运行。不要删除 docs/m0 证据或执行 git clean/reset。

## 7. M1 放行建议

**暂不进入 M1。** 先在 M0 风险修复批次中处理并发自然退出：优先核对上游修复版本及复现条件，必要时评估每会话独立原生进程隔离。升级版本、修改服务粒度、源码补丁或安装编译工具链先对齐范围，不偷偷改栈或凭一次通过放行。

建议复验门槛：开发与打包产物上，并发自然退出连续复测不丢 exit、不导致服务崩溃、不影响其他会话；正常关闭和故障回收仍通过；真实加载路径、清理身份与失败输出继续保留。满足后再由用户明确确认进入 M1。

## 来源与证据索引

- [当前 PRD](https://zenova-ai.feishu.cn/wiki/I3hlw2Bqqif9sVk1AOScsRJFnkg)、[技术设计](https://zenova-ai.feishu.cn/wiki/NM5EwK5ObiCZFEklAHkcsBpBnAg)。
- [Electron 原生模块](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)、[utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process)、[实际发布索引](https://releases.electronjs.org/releases.json)。
- [node-pty 1.1.0](https://github.com/microsoft/node-pty/tree/v1.1.0)、[better-sqlite3 13.0.3](https://github.com/WiseLibs/better-sqlite3/tree/v13.0.3)、[simple 0.7.1](https://github.com/wangfenjin/simple/releases/tag/v0.7.1)、[Windows Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)。
- evidence-summary.json：每轮状态、最终证据目录、原生二进制哈希；evidence/：最终结果、监督报告、失败历史、构建输出和已查看的真实截图；cleanup-verification.json：最终身份清理复核。
