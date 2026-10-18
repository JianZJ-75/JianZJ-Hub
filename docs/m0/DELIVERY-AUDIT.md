# M0 本地成果与 GitHub 交付核对

核对日期：2026-10-14。本次只读核对本地工程、历史运行证据、进程身份与公开 GitHub API，并整理本地文档；**没有重跑 M0，没有改产品需求或原型，没有进入 M1，没有暂存、提交、推送、修改 remote 或初始化 Git。**

**结论必须分开：本机 M0 最低运行验证及修复回归已通过；本地记录已写入 JianZJ-Hub；GitHub 交付尚未发生。** 原始输出留存仍存在下述历史缺口，不能称为“所有历史控制台字节均完整保存”。

## 1. 本轮操作绝对路径

本轮每个仓库命令均显式进入现有目录：

```text
D:/Code/JianZJ-Hub
```

这不是 D:/Code 父目录、另一个新项目或重新初始化的仓库。[本轮原始核对输出](audit-evidence/current/repository.txt)。

## 2. git rev-parse --show-toplevel

实际输出：

```text
D:/Code/JianZJ-Hub
```

## 3. git remote -v

实际输出：

```text
origin  https://github.com/JianZJ-75/JianZJ-Hub.git (fetch)
origin  https://github.com/JianZJ-75/JianZJ-Hub.git (push)
```

输出中的对齐空白在这里规范化；完整原样见 repository.txt。未修改 remote。

## 4. 当前分支与提交状态

`git branch --show-current`：

```text
main
```

`git rev-parse --verify HEAD` 实际失败：

```text
fatal: Needed a single revision
```

本地 main 尚无任何提交（unborn HEAD），不是有提交但忘了 push。

## 5. 当前工作区状态与远端

`git --no-optional-locks status --short --branch --untracked-files=all` 开头为：

```text
## No commits yet on main
?? .gitignore
?? README.md
?? docs/m0/README.md
...
?? package-lock.json
?? package.json
...
?? src/services/pty/m0.ts
?? src/services/pty/session.m0.ts
...
```

以上省略仅为说明；[完整状态](audit-evidence/current/repository.txt) 与 [完整文件清单](files.txt) 没有省略。代码和文档都是尚未暂存的 untracked 文件；不存在可引用的本地提交 SHA。

2026-10-14 09:53 UTC 的公开只读 API 结果：

- 仓库元数据 HTTP 200，`private: false`、`default_branch: "main"`、`size: 0`。
- `GET /repos/JianZJ-75/JianZJ-Hub/commits?sha=main&per_page=1` 返回 **HTTP 409**：

```json
{"message":"Git Repository is empty.","documentation_url":"https://docs.github.com/rest/commits/commits#list-commits","status":"409"}
```

[原始响应](audit-evidence/current/github-readonly.ndjson)。首次 curl 的 schannel TLS 请求失败返回 HTTP 000，之后只读 PowerShell 请求才成功；不把网络失败编造成 409。

**所以用户核对远端为空是正确的。任何本地测试通过、文件存在或打包存在，都不能称作 GitHub 上已经可审查或已交付。**

## 6. 本地 M0 成果是否存在

存在，均位于同一 JianZJ-Hub 根目录：

| 类别 | 位置 |
|---|---|
| 当前完整报告 | docs/m0/README.md |
| 修复前报告 | docs/m0/baseline-before-fix.md |
| 逐条命令与真实输出索引 | docs/m0/COMMAND-OUTPUTS.md |
| 版本及证据汇总 | docs/m0/evidence-summary.json、preparation.json |
| Electron 主进程与服务协调 | src/main/index.ts、m0-service.ts、m0-checks.ts |
| 真实 PTY broker 与单会话原生 worker | src/services/pty/m0.ts、session.m0.ts、lifecycle.mjs |
| Windows Job / 进程句柄 | src/adapters/windows/job-object.ts |
| SQLite/simple 服务 | src/services/data/m0.ts |
| preload 与最小真实 xterm 页面 | src/preload/、src/renderer/ |
| 测试与进程树 fixture | tests/m0/ |
| 自动运行及打包脚本 | scripts/m0/run.mjs、package.mjs |
| 精确依赖与构建配置 | package.json、package-lock.json、electron.vite.config.ts、electron-builder.m0.json、tsconfig.json |
| 原始最终回归证据 | docs/m0/evidence/fix/ |
| 本轮整理的全部留存历史证据 | docs/m0/audit-evidence/ |
| 实际最小打包产物 | release/m0/win-unpacked/JianZJ Hub M0.exe（忽略，不会默认提交） |

本轮从 scratch 逐字节归档 **410 个已有证据文件、59 次监督运行、43 份留存命令日志**，约 5.3 MB，覆盖成功和失败；不是重新生成测试输出。哈希清单为 [audit-evidence/manifest.json](audit-evidence/manifest.json)。只复制本轮测试明确产生的结果、日志、截图和 child/grandchild 记录，未复制浏览器 userData、私有会话、依赖目录、缓存或外部下载包。

核对源码/构建产物与修复门槛保存的 8 项 SHA-256 均一致，本次没有用改过但没测试的源码替代已验版本。

## 7. 实际执行命令和真实输出

[COMMAND-OUTPUTS.md](COMMAND-OUTPUTS.md) 列出每份留存输出对应的命令，链接到**未截断、未去警告和未删失败的原始内容**；还列出每次运行的 supervisor/result/stdout/stderr。以下只是关键命令的输出摘录，不能代替该索引：

| 实际命令 | 实际观察到的输出/结果 | 完整留存输出 |
|---|---|---|
| npm install --ignore-scripts 等项目内安装 | `added 362 packages in 35s`；存在 deprecated 警告，未隐藏 | audit-evidence/commands/baseline/install.log.txt |
| 项目内类型声明安装 | `added 6 packages, and changed 2 packages in 5s` | audit-evidence/commands/baseline/types-install.log.txt |
| Electron 官方 install.js | 成功；独立日志 0 字节，不伪造输出 | audit-evidence/commands/baseline/electron-install.log.txt |
| npm run typecheck | `> tsc --noEmit`，最终无诊断 | evidence/fix/typecheck.txt |
| npm test | `# tests 6`、`# pass 6`、`# fail 0` | evidence/fix/unit.txt |
| npm run build | 生成 index.js、pty-service.js、pty-session.js、data-service.js、job-adapter.js、preload 和 renderer | evidence/fix/build.txt |
| npm run m0:run | normal / worker-fault / service-fault / main-crash / concurrent-exit 的最终监督结果均 pass | audit-evidence/commands/fix/dev-final.log.txt |
| npm run m0:package | `electron-builder version=26.15.3`、`platform=win32 arch=x64 electron=44.7.2`；保留未签名和缺 author 警告 | evidence/fix/package.txt |
| npm run m0:packaged | 从实际打包 EXE 跑五类场景，最终监督结果均 pass | audit-evidence/commands/fix/packaged-final.log.txt |
| dev --mode=concurrent-exit --repeat=2 | 两个独立批次 pass，每批十对；和完整回归内的一批合计开发版 30 对 | audit-evidence/commands/fix/dev-repeat.log.txt |
| packaged --mode=concurrent-exit --repeat=2 | 两个独立批次 pass，每批十对；和完整回归内的一批合计打包版 30 对 | audit-evidence/commands/fix/packaged-repeat.log.txt |
| dev / packaged --mode=normal 最终补验 | 创建握手期间服务退出的断言通过，所有剩余会话树结束 | audit-evidence/commands/fix/*shutdown-handshake.log.txt |

真实 Shell 输出包括 `M0_UI_17`、`M0_中文_42`、`M0_SIZE_111x37`、`M0_SURVIVOR_42`、`M0_LAST_42`；都来自测试脚本输入后的实际 PTY 输出，不是预置屏幕内容。SQL 实际返回 SQLite 3.53.4，中文、拼音与 jieba 查询各命中一条测试文本。

### 证据缺口，不补造

- node-pty prebuild/post-install 的完整 stdout 没有单独落盘；只保留会话摘录、实际文件与后续运行证据。
- simple curl/unzip 的全部进度、宿主一次性包导入检查及许可证下载等，也没有完整独立控制台日志。
- 部分日志名反复使用，只有最后留存内容，不能复原每次历史调用的全部字节。
- 这些是**日志留存缺口**，不是把未运行项目声称已运行；正式 Electron 内运行证据、故障证据、最终打包实际运行与监督 JSON 均存在。

若要求每一条准备命令也有完整可脱离会话核对的原始输出，当前不满足这一更严格证据要求。下一条最小动作是另行明确批准需要补验的步骤，开启独立时间戳/退出码日志后重做那几个步骤，并标记为“新增补验”，不能冒充旧输出。本次未擅自重新下载/安装。

## 8. 通过、失败、未验证

### 本机最终通过

| 最低验收内容 | 最终结果及运行证据 |
|---|---|
| Electron、Node、原生模块和目标运行时兼容 | Electron 44.7.2 实际 Node 24.21.0 / ABI 149；主进程、PTY worker、数据服务均有 native 路径与实际操作 |
| node-pty 启动真实 Shell | 启动系统 Windows PowerShell 5.1，记录真实 PID/创建时间 |
| 输入、输出、resize | GUI/xterm 输入计算得真实输出；Shell 观察到 111×37 |
| 单会话真实结束 | 对应 Shell、child、detached grandchild 句柄结束；另一个会话继续工作 |
| Windows 子进程树清理 | Job 成员包含 Shell/worker/包装进程/子孙；单关闭、服务故障、主进程故障均核查 Job 空，对照存活 |
| SQLite 与中文搜索加载 | SQLite 3.53.4；simple 中文、拼音、jieba 实际查询命中 |
| 原生模块进入最小包并加载 | 实际运行 win-unpacked EXE，加载包内 native 和 resources/simple，并重做终端/清理测试 |

补充通过：单个 worker 故障隔离；并发创建/关闭；无效 cwd 清理；真实退出码 7 和 259；创建期间退出；PSReadLine 历史隔离；开发与打包各 30 对并发自然退出，共 **120 次 Shell 退出**；所有六批都验证唯一 exit、真实码、尾输出、worker 正常结束、存活会话和 Job 清空。

### 历史失败保留

- 原共享原生进程发生过 0xC0000005；部分旧并发运行丢事件/退出码。并非每个旧打包失败都是服务崩溃。
- GPU 截图 UnknownVizError、启动门早释放、app.asar 用作 cwd 引发 267、ps1 被系统策略阻止、创建失败清理重复终止的 Win32 5。
- 修复后已复验相关最终路径，旧错误没有被删除或改成 pass。

### 未验证

其他机器/Windows/Shell；中文输入法、全屏程序、Ctrl+C 与完整复制粘贴；高输出背压/长日志无丢字；长时间实际工作与每 worker 成本；M1 的递归分屏/主题/焦点；托盘产品交互；全新 clone 后无开发环境/无缓存复现；安装器/签名/完整许可审计；原生崩溃的调试栈级根因。

**GitHub commit/push 交付没有执行，不可标记为通过。**

## 9. 测试进程名称、清理与核对方式

### 启动映像与角色

| 映像名/角色 | 证据与边界 |
|---|---|
| node.exe：宿主监督器、npm 工具 | 使用已核对的 `D:/Program Files (x86)/nodejs/node.exe`，脚本运行后退出；不当成终端树清理证据 |
| electron.exe：开发版主进程、utilityProcess、renderer/GPU、每会话 worker | 来自项目 Electron 运行时；worker 只在子进程环境启用 ELECTRON_RUN_AS_NODE |
| JianZJ Hub M0.exe：打包版对应进程 | 实际由 release/m0/win-unpacked 启动，主进程记录在 supervisor.json |
| powershell.exe：受管理真实 Shell、独立对照 Shell | 使用系统 WindowsPowerShell/v1.0 路径；SessionInfo 与 control 记录 PID/创建时间 |
| electron.exe / JianZJ Hub M0.exe：测试 child 与 detached grandchild | process-tree.mjs 使用 `process.execPath` 递归启动；不是泛称的独立 node.exe 子进程 |
| ConPTY 包装进程 | 包中有 conpty.dll/OpenConsole.exe；历史记录核对了 Job PID 和其消失，**没有逐包装 PID 保存可执行映像名快照**，不能事后声称逐个确认叫 OpenConsole.exe 或 conhost.exe |

这些映像名称以真实启动路径、脚本和测试结果为依据；不把它们伪装成历史每个 PID 的 Win32 映像查询快照。若验收必须要逐 PID 名称/映像路径，最小补验是增加 GetProcessImageName/QueryFullProcessImageName 快照并重跑一次目标树场景，需作为新补验记录。本次没有凭名字批量终止进程。

### 实际清理判定

运行期间：保留 Windows 进程句柄与 GetProcessTimes 创建时间；核对 Job Object 成员含 child/grandchild；结束后等待句柄 signaled、Job 成员清空。对照 PowerShell 属于独立 Job，确认它在 App 清理后仍存活，然后单独回收。

一个最终打包实例：主进程 PID 146464，control PID 146864；`afterAppExit: []`、`controlSurvived: true`、`status: pass`。main-crash 场景还明确跟踪 Shell 133344、child 148884、grandchild 138184，均等待退出后才判通过；详见 evidence/fix/packaged-main-crash-supervisor.json 的创建时间身份，不能只凭这些 PID 在未来直接 kill。

本次重新只读核对 **879 个历史 PID＋创建时间身份**：867 个 PID 不存在，8 个句柄可读但创建时间不同，4 个身份的 PID 句柄返回 Win32 5。后者经限定 PID 的 CIM 创建时间核对，证明这些 PID 当前属于后来启动的系统服务，均不是原测试身份。最终：**无匹配存活身份、无未核验身份**。未终止这些已复用 PID，也未提高权限。

[逐身份结果](audit-evidence/current/process-check.json)、[CIM 佐证](audit-evidence/current/protected-pid-metadata.json)。

## 10. 是否写入 JianZJ-Hub、还缺什么授权

- **是，已写入本地 JianZJ-Hub 根目录下的正式代码、测试、锁文件与 docs/m0；本次又补齐了全部留存原始输出归档。**
- **否，尚未写入 GitHub。** 远端为空；无本地提交、暂存或 push，不能给出提交 SHA/远端代码链接。
- 正式成果与证据不只放在 scratch；scratch 中仍保留缓存、下载和临时输出。node_modules、out、release 与下载包保持忽略，不会默认一并提交。
- 早期 PSReadLine 隔离缺口仍在主报告保留，未读取私人历史去追溯，也不把当前隔离设置反写成早期从未触及历史。
- 当前本地最低运行验证通过；尚未完成 GitHub 交付，且没有消除上述证据留存/未验范围限制。

**现在停在本地整理完成的位置。要让 GitHub 可审查，仍需要用户明确授权 commit 与 push（及相应目标分支/交付方式）；授权前不进行 Git 写操作。M1 继续等待独立确认。**
