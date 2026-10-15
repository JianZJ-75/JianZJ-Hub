# M0 收尾报告

日期：2026-10-15。**M0 收尾完成（本机/同机干净目录验证范围）。** 未进入 M1；本轮变更未提交、未推送，等待用户确认。不是独立机器验证或生产软件验收。

## 1. 结论与交付状态

- 本地分支 main，HEAD `524f107e93ec1782554f10b8c799d2cfca6a3497`，已有 e9c011f、524f107 两项提交。开始核对时工作区干净，当前工作区包含本轮未提交收尾变更。
- origin：`git@github.com:JianZJ-75/JianZJ-Hub.git`；本轮只读 `git ls-remote origin refs/heads/main` 退出 0，远端 main 为同一 SHA。见 [查询原件](evidence/closeout-20261015/reproduction/commands/remote-main-final/stdout.log.txt) 和 [命令记录](evidence/closeout-20261015/reproduction/commands/remote-main-final/command.json)。这是既有基线上传状态，不代表本轮变更已上传。
- **本地技术验证通过 / 本轮本地提交未执行 / 本轮远端上传未执行**，三者分开，不把 push 作为技术验证前提。
- 旧审计、旧失败、repair manifest 和历史清理记录不改写；新增证据使用新的目录和索引。

## 2. 认可原型交接

[原型获取说明](PROTOTYPE-HANDOFF.md) 提供 PRD revision 21、技术计划 revision 7、附件 token、获取命令、权限条件和离线打开步骤。本轮已下载飞书附件，71,609 字节，SHA-256 `1033c2dab321312f09ac220450d2fea7fbbf0f905ade18c450a5ed1281e6917a`，与本地逐字节一致。

静态核对无外部资源加载/其他本地文件依赖；示例网址不是运行依赖，系统字体仅回退。HTML 内容和 prototypes 忽略规则均未修改，无公开上传或其他原型入库。见 [比对与资源扫描](evidence/closeout-20261015/reproduction/prototype-verification.json)。

## 3. 同机干净目录实际结果

隔离根目录：`D:/Code/JianZJ-Hub-M0-repro-20261015-37002e9f/`。仅白名单导出的仓库文件和可验证上游资源作为项目输入；未复制原 node_modules、out、release 或个人缓存。npm 使用新 cache 和空的隔离 npmrc；Electron 使用项目内新缓存；builder 显式复用隔离 Electron dist。输入初稿、每次更新及最终清单均留存；[最终输入清单](evidence/closeout-20261015/reproduction/input-manifest-final.json) 与当前源文件一致性另由 preservation 复核。

下列命令的完整 argv、cwd、起止时间、退出码及 stdout/stderr 均见 [实际命令索引](evidence/closeout-20261015/reproduction/command-index.json) 和其 commands 子目录：

| 步骤 | 真实结果 | commands 下的证据标签 |
|---|---|---|
| npm ci，ignore-scripts + optional + 官方 registry + 新 cache | 退出 0 | `npm-ci` |
| Electron、node-pty/ConPTY、SQLite/simple、Koffi 准备 | 退出 0 | `preparation` |
| 离线检查与重复准备 | 均退出 0，有效 receipt 只校验，不下载/覆盖 | `check`、`prepare-idempotent`、`prepare-final` |
| typecheck | 退出 0 | `typecheck-final` |
| 单元测试 | **14/14，退出 0**（原 6 + 新 8） | `unit-final-source` |
| 构建 | 退出 0 | `build` |
| Windows x64 最小目录打包 | 退出 0 | `package-pathfix` |
| 原生、扩展、完整词典和许可证 | 22 项比对 + Electron 两份许可匹配；原生还核对实际 unpacked 字节 | `package-pathfix`、`package-verification.json` |
| 真实开发/打包 GUI normal | 均退出 0，实际点击、xterm 输入、PowerShell 返回并截屏 | `dev-normal`、`packaged-normal` |

宿主实际 Node **22.23.2**、ABI **127**、N-API **10**；Electron **44.7.2**，内置 Node **24.21.0**、ABI **149**、N-API **10**；better-sqlite3 实际 SQLite **3.53.4**，node-pty **1.1.0**，ConPTY **1.23.251008001**，Koffi **3.3.3**，simple **0.7.1**。版本与原生加载路径均来自真实探针和报告，不以宿主 require 成功推导 Electron 兼容。

准备在宿主 Node 和 Electron Node 模式内分别实际加载 conpty、better-sqlite3、Koffi，执行 Koffi kernel32 调用和 SQLite/simple 中文/拼音/jieba 查询。随后 GUI 回归实际创建/关闭 PTY、输入输出和 resize。最终所有原生加载路径属于隔离项目，系统 DLL 除外；不引用原工程依赖。见 [准备凭据](evidence/closeout-20261015/reproduction/prepared.json)。

开发版和真实打包版截图均已打开查看：非空 M0 窗口，显示隔离 cwd 的 PowerShell 与 `M0_UI_17`。见 [查看记录](evidence/closeout-20261015/reproduction/gui-review.json)；真实 PNG 位于 runtime 子目录。没有把原型当运行截图，没有因 M0 页面/xterm 主题尚不同源而扩大为 M1 重绘。

磁盘量测时隔离根约 **1,420 MiB**（含项目、缓存及当时运行数据）；node_modules 654 MiB、npm cache 79 MiB、Electron cache 151 MiB、下载目录 26 MiB、out 2 MiB、release 436 MiB。见 [量测原件](evidence/closeout-20261015/reproduction/commands/disk-usage/stdout.log.txt)。这是该时点磁盘占用，不是网络流量或内存性能；没有将 cache 大小冒称精确下载量。未达到 4 GiB 预留上限，隔离环境、成功包、下载和失败日志均保留。

## 4. 完整 M0 回归与身份清理

因涉及全新原生准备，复跑完整五场景，不只 normal：

| 产物 | 场景 | 运行次数 | 结果 | 退出码解释 |
|---|---|---:|---|---|
{{CASE_ROWS}}

合计 **16 次监督运行**；并发自然退出为开发/打包各 **3 批 × 10 对**，合计 **60 对 / 120 次 Shell 退出**。各批验证唯一 exit、真实退出码 5、尾标记和其他会话存活。所有监督结果 pass、最终受管理 Job 空、`fallbackPids=[]`、对照进程存活。main-crash 应用码 1 是主动故障注入，不误报成正常退出 0，也不误判为监督失败。

最终按 **PID + 创建时间**复核 **{{IDENTITY_COUNT}} 个身份**：匹配存活 **0**、无法核查 **0**。PID 已复用身份单列且未误杀。测试与对照分别由自己的 Job/保留句柄管理，对照先验证存活再由 control Job 收尾；未按名称批量 kill。

- [逐场景汇总与原生路径](evidence/closeout-20261015/reproduction/regression-summary.json)
- [最终身份核查](evidence/closeout-20261015/reproduction/cleanup-verification.json)
- [完整原始 result/supervisor/PNG/stdout/stderr](evidence/closeout-20261015/reproduction/runtime/)
- [实际命令与退出码](evidence/closeout-20261015/reproduction/command-index.json)

## 5. 产物与完整性来源

下表路径相对于隔离 project，不是原工作区产物：

| 产物 | 字节数 | SHA-256 |
|---|---:|---|
{{ARTIFACT_ROWS}}

本轮隔离 `app.asar` 与旧 repair manifest 的 SHA-256 相同；不据此承诺 EXE、全部产物或跨机器逐字节一致。原工作区旧 out/ASAR、原型和历史证据另行复核保真。

预期值来源见 [资源锁](../../scripts/m0/resources.lock.json)、[来源元数据](evidence/closeout-20261015/reproduction/upstream-metadata/summary.json)：npm SRI 来自已有锁文件；Electron/simple ZIP 的预期 SHA-256 来自官方 Release 元数据，Electron 还与 npm 包 checksums 一致；许可来自固定提交的 Git blob，SHA-256 在验证固定内容后锁定，不冒称独立上游签名。许可按原文打包，simple 选择 MIT；完整传递依赖正式分发审计仍属后续。

资源来源归档副本仅省略临时重定向 URL 的查询/fragment 凭据，并注明省略；原始 sidecar 留在隔离 intake，下载字节、固定 URL、预期/实测哈希不变。没有删改旧证据或伪造 stdout。

## 6. 失败与修复记录（未掩盖）

| 失败/限制 | 实际结果与处理 |
|---|---|
| 初始证据记录器缺少 commands 父目录 | 退出 1，创建该新目录后采集成功；没有应用运行。原始 stdout 未独立留存，只有事实记录，不补造 |
| 大 heredoc 的 shell 解析/反斜线语法错误 | 写入阶段退出 2 / node 语法检查退出 1；改用可靠写入及 path.sep，语法检查通过。未执行受影响应用；缺失原始日志不伪造 |
| 初版新增单测 ZIP 夹具未载程序集 | 退出 1，6/7；原始 runner 输出保留在 `commands/unit-initial/` |
| 隔离单测受 PowerShell 脚本执行策略阻止 | 退出 1，12/13；改用 Node 内建 ZIP 解析，不修改/绕过执行策略；原件在 `commands/preparation-unit/`，最终 14/14 |
| 下载和执行原生代码的工具门禁 | 没有绕过；用户显式授权命名上游版本后执行成功；见 `permission-blocks.json` |
| 首次打包后的 asar 校验路径使用 POSIX 分隔符 | builder 自身成功，但 package 检查退出 1；修正 Windows 路径并额外核对真实 unpacked 文件后退出 0。失败在 `commands/package/`，成功在 `commands/package-pathfix/`；未修改 PTY 或依赖 |
| builder 提示 author 缺失、未签名 | 警告原样保留；M0 仅目录包，不生成安装器、不发布、不谎称已签名 |

上述 `commands/` 和 JSON 路径均位于 `evidence/closeout-20261015/reproduction/`。实施阶段未独立留存原始输出的失败如实标注，不能与完整日志等同。

## 7. 历史验收与本轮变化

五份 `.m0-scratch/acceptance-*.log` 全部存在且 pass；八项 repair.manifest 哈希本轮匹配。原始日志和关联文件逐字节归档到 [independent-acceptance](evidence/closeout-20261015/independent-acceptance/manifest.json)，核对结果见 [existing-baseline-verification](evidence/closeout-20261015/reproduction/existing-baseline-verification.json)。历史外层命令/退出码没有记录的项目写“未留存”，不从应用码反推历史命令码 0。历史安装日志缺口仍保留，没有重装原环境来补造完美历史。

本轮仅修改当前 README、M0 当前索引、package scripts 和打包脚本；新增准备/预检/探针/ZIP 模块、8 个准备测试、交接文档及新证据。package-lock、依赖版本、builder 配置、原 PTY broker/session/lifecycle、Job adapter、应用源码和旧审计未改。源文件与被测输入一致性、旧资产保真见 [preservation](evidence/closeout-20261015/reproduction/preservation.json)。所有新证据长度/哈希见 [总清单](evidence/closeout-20261015/manifest.json)。

## 8. 未验证项与 M1 建议

**建议批准进入 M1，但必须由用户明确放行，本轮不执行。** M1 继承每会话一个原生 worker；[M1-ACCEPTANCE.md](M1-ACCEPTANCE.md) 已登记：背压和可靠尾输出排空、已结束会话/句柄/监听器释放、IME/Ctrl+C/全屏程序、递归分屏/焦点/尺寸、页面与 xterm 同源主题、生产 IPC 权限和输入校验。没有悄悄实现这些范围。

本轮未做独立机器/其他系统和 Shell 验证，未做长时负载/性能保证、正式分发许可审计、安装器/签名，不把一次本机复现升级为跨机器保证。通过、实施期间失败、未验证项已分开；Git 提交/推送和 M1 放行均等待用户确认。
