# M0 兼容与关键风险验证

更新日期：2026-10-15。**524f107 的 M0 核心技术基线及独立复验通过；本轮交付一致性与同机干净目录复现收尾已完成，实际范围见 [收尾报告](CLOSEOUT.md)。尚未进入 M1，仍等待用户明确确认。**

第 2～7 节的修复实现、命令和旧资源量测属于 2026-10-14 历史修复阶段，不将其中“本次”误解为本轮 2026-10-15 收尾。旧审计与原始证据保持原样。

旧失败、旧运行报告与修复过程错误均保留。当前结论不是终端体验或完整产品验收，也不是所有机器、负载与 Shell 的兼容保证。


交付状态核对：[本地与 GitHub 交付审计](DELIVERY-AUDIT.md)；[逐条命令与完整留存输出](COMMAND-OUTPUTS.md)。该链接记录提交授权前的核对时点：当时 GitHub main 为空（HTTP 409），本地无提交。后续已获授权进行 M0 提交，见 [Git 交付记录](GIT-DELIVERY.md)；远端是否完成以实际 main 引用核验为准。早期输出留存和进程名称快照的缺口在审计中单列。

## 1. 当前基线与版本

- 2026-10-15 核对：仓库 `D:/Code/JianZJ-Hub`，分支 `main`，HEAD `524f107e93ec1782554f10b8c799d2cfca6a3497`，origin `git@github.com:JianZJ-75/JianZJ-Hub.git`。开始核对时工作区干净，已有 `e9c011f`、`524f107` 两项本地提交。`git ls-remote origin refs/heads/main` 退出 0，远端同一 SHA；仅代表核查时基线上传情况。本轮技术验收时尚未提交、推送；随后用户已明确授权交付收尾变更。收尾代码以本文件所在提交为准，远端上传仍需独立核对，与技术验证结果分开。
- 材料基线：已读取的飞书 PRD revision 21、技术设计 revision 7（2026-10-15 已读取新增收尾节）；唯一认可原型 `prototypes/comfort-redesign/workstation-comfort.html`。本轮未改原型、未开发产品分屏或辅助模块。
- Windows 11 Enterprise LTSC 2024 build 26100；系统 Windows PowerShell 5.1；宿主 Node 22.23.2 x64 / npm 10.9.8。
- Electron **44.7.2**，实际 Node **24.21.0**、ABI **149**、N-API **10**；node-pty **1.1.0**；包内 ConPTY **1.23.251008001**；better-sqlite3 **13.0.3**（实际 SQLite **3.53.4**）；simple **0.7.1**；Koffi **3.3.3**。
- xterm 6.0.0 / fit 0.11.0；React 19.3.0；electron-vite 5.0.0 / Vite 7.3.7 / React 插件 5.2.0；TypeScript 7.0.2；electron-builder 26.15.3。完整精确版本见 package-lock.json。
- 本次修复**没有更换依赖版本、新增 npm 包、下载新运行时或安装系统编译工具链**，继续复用已验证的预编译模块。原选型来源与安装过程见 [旧基线报告](baseline-before-fix.md)。

## 2. 问题排查：区分两种失败

### A. 共享原生进程故障

旧实现把多个 node-pty 会话放进同一个 utilityProcess。并发自然退出时确有一次服务以 `3221225477 / 0xC0000005`（访问冲突）退出，且终端 exit 事件缺失；开发故障证据见 `evidence/dev-concurrent-exit-c54361d4-aa28-432d-8cdc-2791405e79c8-failure.json`。

上游 `node_modules/node-pty/src/win/conpty.cc` 中，原生退出线程修改共享的 `ptyHandles` 容器，这是并发风险线索。未安装原生调试工具、未采集原生栈，因此不把该容器宣称为已经确认的崩溃根因；也没有修改 node_modules 或自编译上游代码。

**修复采用进程隔离**：每个 worker 一生只创建一个原生 PTY，从应用集成上移除多会话共享原生状态，并将单个 worker 故障限制到对应会话。

### B. 管道关闭时退出码尚未到达

需要纠正旧报告的合并表述：旧打包版两次并发失败**不都是服务崩溃**。最后一次证据中服务清理退出码为 0，两个终端都有 exit 事件，但其中一个 `exitCode` 缺失。

本轮阅读实际安装的 `node-pty/lib/windowsTerminal.js` 与 `windowsPtyAgent.js`，确认：socket close 时触发 exit 并读取 `_agent.exitCode`，而该值由独立的原生退出回调设置。两个事件顺序没有可靠绑定，因此不能把 socket close 的暂空值作为最终退出码。

**修复采用真实 Windows 句柄**：broker 在 Shell 创建后保留 ProcessHandle；WaitForSingleObject 确认该句柄已 signaled 后，调用 GetExitCodeProcess 读取最终 DWORD。事件标记 `exitCodeSource: 'process-handle'`，不使用猜测、固定 0、超时补值或重新查询复用的 PID。

真实 `exit 259` 也已验证：259 在已 signaled 的进程上是合法退出码，不能仅因它等于 STILL_ACTIVE 常量就判断进程未结束。

## 3. 具体修复

### 每会话原生 worker

- `src/services/pty/m0.ts` 改为 broker，只维护会话注册表、请求路由、Job 所有权与生命周期；**不再加载 node-pty**。
- 新增 `src/services/pty/session.m0.ts`：一个 worker 一个真实 PTY，负责输入、输出、resize 和启动握手。worker 使用 Electron 自带 Node 运行，不依赖系统 Node。
- worker 在允许创建 Shell 之前已绑定到本会话 Job。Shell、ConPTY 包装进程、子进程和 detached 孙进程通过继承被管理。避免原先 Shell 先启动、随后才绑定的窗口。
- 正常自然退出后先收尾短 M0 输出、让 worker 正常退出 0，再核查/清空该会话 Job，并发送一次真实 exit。
- 关闭单会话仅终止其 Job；其他 worker 与 broker 保持运行。异常 worker 发出 fault，并保持 failed，不再被清理过程改写为正常 exit。
- 服务退出等待正在创建的会话握手结算，拒绝继续创建后再清理；避免握手与 Job/句柄释放相互覆盖。
- `lifecycle.mjs` 集中创建、关闭、失败与结束状态，验证幂等和退出事件唯一性。

### 证据与测试修正

- 加入单个 worker 故障隔离、并发创建/关闭、无效 cwd 创建清理、退出码 259、创建期间服务退出测试。
- 并发自然退出每批十对，每次都校验：两会话各一次 exit、真实码 5、最后一段 `M0_LAST_42` 未丢失、worker 正常退出 0、Job 空、broker 存活、另一会话仍能输出 `M0_STILL_ALIVE_42`。
- 截图等待窗口绘制后有限重试，保留真实 UnknownVizError；不把终端测试失败吞掉或用模拟图替代。最终实际打包截图已打开查看。
- 监督脚本增加有界 `--repeat` 和 mode 校验；测试均保留独立 PID/创建时间及外部对照进程。

## 4. 实际验证结果

| 验证项 | 开发版 | Windows x64 打包版 |
|---|---|---|
| Electron / 原生模块与 SQLite-simple 加载 | 通过 | 通过 |
| 真实 xterm 输入、PowerShell 运算与中文输出 | 通过 | 通过 |
| resize，Shell 实测 111×37 | 通过 | 通过 |
| PSReadLine SaveNothing / 测试本地历史路径 | 通过 | 通过 |
| 无效尺寸、旧 generation 拒绝 | 通过 | 通过 |
| 单会话关闭、子孙进程及包装进程清理、幂等 | 通过 | 通过 |
| 其他会话继续交互 | 通过 | 通过 |
| 自然退出码 7、退出后禁止输入、不恢复 | 通过 | 通过 |
| 并发创建 / 并发关闭，另一会话不受影响 | 通过 | 通过 |
| 无效 cwd 创建失败只清理自己的 worker | 通过 | 通过 |
| 已结束进程的真实退出码 259 | 通过 | 通过 |
| 创建握手期间服务退出，创建被拒绝且无残留 | 通过 | 通过 |
| 单个 native worker 故障、fault 反馈与隔离 | 通过 | 通过 |
| utilityProcess 服务终止后的进程树回收 | 通过 | 通过 |
| Electron 主进程终止后的回收 | 通过 | 通过 |
| 并发自然退出：3 批 × 每批 10 对 | **30 对通过** | **30 对通过** |
| 独立对照进程未误杀、App Job 最终清空 | 通过 | 通过 |

最终并发门槛合计 **60 对、120 次真实 Shell 退出**，所有这六批 worker 的自然退出码均为 0，没有 worker/broker 访问冲突、丢 exit、重复 exit、错误 Shell 码或存活会话失效。六批原始 native 回调码本身也均为 5；仍以 pinned handle 作为权威，不能据此删除旧版回调排序失败证据。

`npm run typecheck` 通过；`npm test` **6/6** 通过；构建与最小打包通过。所有上述最终场景的监督程序退出 0；main-crash 场景中应用被测试主动终止的退出码 1 是预期，是否通过由进程树与对照断言决定，不把它误报成应用正常退出。

### 修复期间失败与处理

- 首次真实 GUI 验证：capturePage 返回 UnknownVizError。保留原结果，等待实际窗口绘制并重试后成功。
- 新增无效 cwd 测试发现创建失败清理可能在 Job 已终止 worker 后重复 TerminateProcess，得到 Win32 5。改为仅在 **Job 绑定失败**时直接终止已保留句柄的本轮 worker；绑定成功走 Job + wait，不重复 kill。开发/打包无效 cwd 回归通过。
- 添加测试时出现字符串 CR 转义编译错误，未运行受影响版本；修正后 typecheck 通过。
- 以上早期运行失败归档于 `evidence/fix/attempt-*`；旧 M0 失败记录仍位于 `evidence/`，没有拿最后一次成功覆盖历史。

## 5. 执行命令与证据

项目命令工作目录 `D:/Code/JianZJ-Hub`：

```text
npm run typecheck
npm test
npm run build
npm run m0:run
npm run m0:package
npm run m0:packaged
node scripts/m0/run.mjs dev --mode=concurrent-exit --repeat=2
node scripts/m0/run.mjs packaged --mode=concurrent-exit --repeat=2
node scripts/m0/run.mjs dev --mode=normal
node scripts/m0/run.mjs packaged --mode=normal
```

最后两个 normal 单独验证最终构建新增的“创建期间服务退出”断言，均成功。最终类型检查和六个单测再次执行通过。

证据入口：

- `evidence-summary.json`：旧版历史保持不变，新增 `repair` 记录十种最终场景、六批重复并发结果和源码/产物 SHA-256。
- `evidence/fix/*result.json`：逐项真实运行结果、Shell/worker 身份、加载路径、回调原值和状态。
- `evidence/fix/*supervisor.json`：App/control 进程身份、退出状态、回收核查。
- `evidence/fix/typecheck.txt`、`unit.txt`、`build.txt`、`package.txt`：实际工具输出。
- `evidence/fix/packaged-gui.png`：已查看的真实 Electron/xterm 截图，不是原型或生成图。
- `cleanup-verification.json`：最终身份复核。
- `baseline-before-fix.md`：修复前报告存档；其中旧并发失败的概括表述以本报告第 2 节的区分为准。

打包路径仍为 `release/m0/win-unpacked/JianZJ Hub M0.exe`。新 worker 已加入 electron-vite 入口，现有 `out/**` 打包规则实际包含 `pty-session.js`，原生 unpack 与 simple 资源规则复用。没有生成安装器、安装到系统、签名或发布。

## 6. 文件变更

新增：

- `src/services/pty/session.m0.ts`
- `src/services/pty/lifecycle.mjs`
- `tests/m0/lifecycle.test.mjs`
- `docs/m0/baseline-before-fix.md`
- `docs/m0/evidence/fix/`（本轮正式证据）

修改：

- `src/services/pty/m0.ts`：broker 和会话 Job/状态/路由。
- `src/adapters/windows/job-object.ts`：GetExitCodeProcess 与真实句柄退出码。
- `src/shared/m0-protocol.ts`：fault 与退出码来源字段。
- `src/main/m0-service.ts`：转发 fault。
- `src/main/m0-checks.ts`：加强回归与截屏验证。
- `src/renderer/m0.tsx`：显示会话 fault，不改变产品界面。
- `electron.vite.config.ts`：worker 构建入口。
- `scripts/m0/run.mjs`：worker-fault、repeat、mode 验证与压力测试监督时间界限。
- 根 README、本报告、evidence-summary、cleanup-verification、files.txt。

package.json、锁文件、原生依赖版本、Windows 系统设置均未变。完整当前未提交文件清单见 files.txt；项目原本无提交，不能把 git status 中所有文件都误称本次修复新增。

## 7. 清理与隐私

截至 2026-10-14 09:00:45 UTC，累计核对 **879 个本轮与前轮 PID + 创建时间身份**，没有匹配的存活身份，未出现无法核查身份。该复核包含 worker 身份，不只看 Shell PID。测试监督层兜底仅针对自己的 Job；未按名称批量结束任何程序。

资源保留：node_modules 约 654 MiB，.m0-scratch 约 771 MiB，out 约 1.1 MiB，release/m0 约 436 MiB，本报告归档时 docs/m0 约 1.4 MiB（文档继续更新后略增）。这些是本机磁盘量测，不是运行时内存或性能预算。旧 ZIP、词典、许可证、缓存和失败日志暂留，未清理用户共享缓存。

没有安装全局包/系统工具链、改 PATH、自启、持久执行策略或个人终端配置，没有启动剪贴板采集、读取私人 CLI 会话、接管审批。worker 的 ELECTRON_RUN_AS_NODE 仅设置在本轮子进程环境，传给真实 Shell 前移除。

**前轮隐私限制仍保留：**最早测试只用 -NoProfile，没有显式禁用 PSReadLine 历史。是否由 Shell 自身触及默认个人历史没有核验；未读取或清理个人历史正文。当前 worker 继续采用 SaveNothing 与本轮测试历史路径，并以实际选项验证。不能把当前修复反写成早期测试从未触及历史。

## 8. 遗留风险与 M1 建议

本机重复回归已关闭原 M0 阻塞，**建议可以在用户确认后进入 M1**。不是已自动授权，也不是 M1 完成。

仍需后续验证：

- 每会话多一个 Node worker 的真实 CPU/内存与启动成本；没有编造数字或承诺性能上限。
- 当前结束会话的诊断注册信息/句柄保留到服务退出，M1 需要明确用户关闭窗格后的资源释放与留存上限。
- 退出后的短输出有有界 drain 时间；本轮验证了最后一段测试输出，没有完成长日志/高输出背压及无丢字验收。
- 原生 DLL 的其他负载或单会话异常仍可能发生；本轮证明的是隔离后故障不会拖垮同服务其他会话，不代表上游原生库所有缺陷均消失。
- 每轮 startup 的通用超时、工具能力、授权边界不扩大；不自动安装编译工具，不自动换版本或恢复进程。
- 中文输入法、Ctrl+C、选择/复制粘贴、全屏程序、字体/显示缩放、焦点/递归分屏、主题组合、真实长时间工作体验属于 M1，仍未验收。
- 其他 Shell/电脑/Windows 版本、跨权限或系统代理脱离进程、托盘交互、安装器/签名、完整分发许可审计仍未验证。

后续如需手动查看仅 M0 验证入口：`node scripts/m0/run.mjs dev --interactive`；关闭窗口触发服务及会话树清理。UI 不是已认可舒适版的重新设计或替代。

## 9. 2026-10-15 收尾交接

- [收尾报告与本轮实际结果](CLOSEOUT.md)
- [干净工程准备、打包与复现](REPRODUCIBILITY.md)
- [认可原型获取与 SHA-256](PROTOTYPE-HANDOFF.md)
- [M1 验收任务，不在 M0 实现](M1-ACCEPTANCE.md)

`DELIVERY-AUDIT.md`、`GIT-DELIVERY.md` 和旧命令索引记录各自历史时点，不能拿当时空仓库/推送失败推断当前 main，也不因当前远端已存在基线而改写旧失败。
