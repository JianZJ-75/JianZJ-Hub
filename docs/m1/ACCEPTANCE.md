# M1 验收记录

> **最新默认口径和程序已更新**：打开即终端、项目可选、辅助默认收起。请以 [BASH-TUI.md](BASH-TUI.md) 的新EXE/截图为准；下文保留上一轮历史口径与证据，不作为本轮人工通过声明。

> **首轮人工体验未通过。** 本文保留首轮自动测试与待验记录，不改写旧结果；本次返修的实际结果及重新验收入口见 [REPAIR-20261015.md](REPAIR-20261015.md)。

> **2026-10-19 连续候选返修**：用户复验否定上一轮根因判断，`465375d` 未解决连续输入“这个”重复。现已用真实 Windows 拼音复现并定位 renderer 隐藏 textarea 起点错误；新的原生按键、三层输入字节与 Shell 接收证据见 [连续输入记录](evidence/ime-continuous-20261019/README.md)。本轮类型检查、35/35 单元、开发 11 个关卡、正式 EXE 9/9（含真实拼音）均通过；此前普通自动套件通过不能代表真实连续候选通过，最终本人手工体验仍待验。

日期：2026-10-15。范围是**目标机自动验证通过、可运行目录包已交付，人工体验仍待验**，不是跨机器、长期稳定性或完整产品验收。

## 自动结果

| 项目 | 实际结果 | 证据 |
|---|---|---|
| 类型检查 | 最终 `tsc --noEmit` 退出 0 | [最终复核命令](evidence/20261015/commands/final-typecheck-26fdbdbd-5969-4eb6-8317-9f9f70572c68/command.json) |
| 原 M0 单元 | **14/14**，退出 0 | unit-m0 stdout |
| M1 纯规则 | **13/13**，退出 0 | unit-m1 stdout；1000 步确定性分屏/关闭序列，>6 叶模型，无固定六窗格上限 |
| 完整 M1 开发验收入口 | **五个关卡全部监督通过** | [整套命令](evidence/20261015/commands/complete-dev-suite-63e0a092-bb34-4889-8de4-f31814101a33/command.json) |
| 真实桌面 | **13 个检查通过** | [desktop.json](evidence/20261015/runtime/desktop-normal-3dedad71-b547-4346-b156-b5aaf04bfc29/desktop.json) 与 supervisor |
| 高输出/隔离/回收 | **7 个检查通过** | [stress.json](evidence/20261015/runtime/stress-normal-7957d59c-27ca-484f-8c0c-c5cf3c0e5a00/stress.json) |
| 真实 EOF 与退出码 259 | 双会话自然退出/主动关闭通过 | [probe.json](evidence/20261015/runtime/probe-normal-5069d405-5444-4fad-80b4-dcbfd867fcd1/probe.json) |
| 服务故障 | Shell、原生 worker、子孙进程均结束；对照存活 | [fault.json](evidence/20261015/runtime/fault-service-fault-48228080-8ac1-4ab8-9bb5-dfc2dda6a024/fault.json) |
| 主进程崩溃 | 保留身份均结束；Job 空、无兜底残留、对照存活 | [supervisor.json](evidence/20261015/runtime/fault-main-crash-52d6fe7b-b23c-4aa1-83e8-c0fc8a30c847/supervisor.json)。应用码 1 是故障注入预期，监督码 0 |
| 原 M0 回归 | 开发/打包各五场景，共 **10 次监督通过** | [逐场景汇总](evidence/20261015/m0-regression.json)；不重新扩充 M0 或覆盖历史日志 |
| 正式目录打包 | 退出 0；9 项原生/许可内容同时比对 ASAR 与 unpacked；正式包不含测试入口 | [package-manifest](evidence/20261015/package-manifest.json)、[保真](evidence/20261015/preservation.json) |
| **最终正式包真实运行** | **6 个检查通过**，ASAR 未被测试改写 | [result.json](evidence/20261015/runtime/packaged-382be892-addf-4803-abf1-014024d2544b/result.json) |
| ZIP | 170,029,054 字节，生成退出 0，`7z t` 完整性检查退出 0 | [ZIP 校验原件](evidence/20261015/zip-test.stdout.log.txt) 与 package manifest |
| 最终身份复核 | **422 个身份，匹配存活 0，无法核查 0** | [cleanup.json](evidence/20261015/cleanup.json)。未按进程名或裸 PID 批杀 |

### 自动覆盖的内容

- 当前叶节点右/下嵌套、比例最小尺寸、关闭补位/空树、已有 xterm DOM 实例及会话身份保持；实际鼠标拖动后 Shell 的 `$Host.UI.RawUI.WindowSize` 与 cols/rows 一致。
- 改名、单窗格关闭和其他会话继续运行；注入一次终止失败后窗格/会话均保留，再重试成功；窄窗提示与单窗格切换，隐藏会话不发送零尺寸。
- 多工作区切换保持旧 Shell 与 xterm；辅助 textarea 获得焦点，收起后回到原窗格；放大还原/专注均不销毁会话；无产品层时实际 Esc/Ctrl+C 字节到终端服务。
- generation、重复关闭、无效尺寸/输入/目录规则、额外 schema 字段、任意会话标识；bridge 不暴露 Node/原始 IPC；新窗和导航被拒。sender/mainFrame/精确 URL 的伪造对象负面用例在纯规则测试覆盖；没有将它写成另一个真实生产窗口的渗透测试。
- worker 故障只回收自己的 Job，其他会话继续输出；M1 自己的双会话并发自然退出分别得到 5/7，唯一 exit，输出不串会话。
- 正式 EXE 从未修改的 ASAR 启动，创建/分屏/输入/主题/resize/关闭走实际产品界面；原生退出对话框实际出现，由只针对本应用保留 PID 窗口的 Win32 测试驱动点确认；全部子树结束；重启保留配置但终端数为 0。

### 高输出、尾输出与资源数字

自然退出、主动关闭各输出 **16,000 条可计算记录**，逐条提取并校验完整顺序；期望/实测记录 SHA-256 均为：

```text
523fb0e148369899a3a413b7968e4e30642f2662dc934bde8bfe00036498f0c5
```

中文尾行同样存在；暂停/慢消费后峰值 **118,784 字节**，低于 131,072 字节信用上限。不是仅检查最后 marker。测试直接写 ConPTY，不把 PowerShell 上游管道尚未输出的缓存当成 PTY 尾数据。

**最终正式包另外让真实 xterm 消费相同 16,000 条记录并得到相同完整哈希/中文尾行**，消费者不是测试脚本代 ACK；应用实际 xterm.write 回调在确认。见 [高输出截图](evidence/20261015/runtime/packaged-382be892-addf-4803-abf1-014024d2544b/high-output.png)，不是原型或预置日志。

12 轮创建/关闭后 broker 活跃会话始终回到基线 1（保留的对照会话），每个结束 Job 均空；broker 系统句柄从 **332 → 328**。随后服务停止，所有保留 Shell 身份结束。这是短轮次观察，不宣称 JS GC、内存或数日运行永无泄漏。

### 主题与字体

显式 light/dark、system+light/system+dark 及运行中 nativeTheme 更新均测试。终端实际采样 BGRA：浅色 `[254,252,251,255]`，深色 `[39,31,27,255]`；页面 token 分别为 `#fbfcfe`/`#1b1f27`。采样等待实际绘制条件，不把关闭模态前的遮罩帧当结果。

自动测试通过 Electron **应用进程级** nativeTheme.themeSource 发出更新，未修改 Windows 主题设置。真实操作系统偏好切换及不同 DPI 仍人工待验。

同字体栈样本的 Chromium 字体诊断：Consolas 22 字形、Microsoft YaHei 2 字形。只证明这个样本的实际回退，不宣称 Cascadia 已安装/使用，也不替代终端中文 IME/全屏程序体验。

## 实际执行命令

以下入口在仓库根目录执行；完整 argv/cwd/时间/退出码/stdout/stderr 见 [命令索引](evidence/20261015/command-index.json)。归档日志加 `.txt` 后缀以绕开通用日志忽略规则，**内容字节不转换**。

```text
node scripts/m1/record.mjs typecheck node_modules/typescript/bin/tsc --noEmit
node scripts/m1/record.mjs unit-m0 --test tests/m0/*.test.mjs
node scripts/m1/record.mjs unit-m1 --test tests/m1/*.test.mjs
node scripts/m1/record.mjs complete-dev-suite scripts/m1/test.mjs dev
node scripts/m1/record.mjs m0-dev scripts/m0/run.mjs dev
node scripts/m1/record.mjs m0-packaged scripts/m0/run.mjs packaged
node scripts/m1/record.mjs build-product node_modules/electron-vite/bin/electron-vite.js build --config electron.vite.m1.config.ts
node scripts/m1/record.mjs package scripts/m1/package.mjs
node scripts/m1/record.mjs final-packaged-suite scripts/m1/test.mjs packaged
node scripts/m1/record.mjs zip scripts/m1/zip.mjs
node scripts/m1/record.mjs archive-evidence scripts/m1/archive-evidence.mjs
```

开发套件内部以 `M1_TEST_BUILD=1` 构建独立测试入口，再运行 probe、desktop、stress、service-fault、main-crash；正式包重新不带该变量构建。正式包自动化临时用 loopback CDP 启动，未添加生产测试接口，未改 ASAR。目录包本身正常启动不启用该端口。

## 失败与修复（保留，不抹去）

- 初始长 heredoc 引号失败、首次类型检查 Socket 选项不兼容、早期测试误用 TypeScript 7 非公开 JS API：修正后类型与单元测试全通过。前期只留在会话输出，未独立采集 stdout 的部分不补造日志。
- 首轮 renderer outDir 相对路径写到 `D:/out/m1/renderer`：改为绝对项目输出；检查那份空壳 HTML 哈希后只删除本轮文件及空目录，见 [清理记录](evidence/20261015/initial-build-output-cleanup.json)。未删除未知文件。
- 首轮桌面测试把订阅取消函数作为 executeJavaScript 返回值，Electron 无法 clone；改为返回普通值。失败收尾揭示 Service 重入回收竞态，改为串行幂等清理并区分有意停止。
- 压力夹具最初通过 GUI EXE 的异步调用导致 Shell 提前结束；之后管道夹具遇到 Windows PowerShell 解码/上游缓存边界。最终改为 `Start-Process -NoNewWindow` 直接写 ConPTY并等待，保留相同 16,000 条完整校验，没有删除失败记录或降低期望条数。
- 主题像素测试首次采到正在消失的模态遮罩：改为等待实际绘制；窄窗仅隐藏其他 pane 而没有提示的问题增加明确窄窗状态。xterm 原默认黑视口已按统一 palette 覆盖。
- 外部 CDP 的 insertText 不等于 xterm 键盘字符事件；驱动改用 char/Enter；还修正了仅按“已有 sessionId”就输入、未等创建状态结束的竞态。正式包 Browser.getWindowForTarget 不可用，改用限定本应用 PID 的 Win32 resize。未加生产绕过接口。
- ZIP 首次查找不存在的 7zip-bin，退出 1；改用锁定项目现有 electron-winstaller 的 7z-x64.exe，未安装或下载新工具；生成与完整性检查最终均通过。

失败的 runtime/command 原件也在 evidence 中。最终选择的是明确标识的通过轮次，不将旧失败报告覆盖成成功。当前自动验收没有遗留失败门槛；未验范围如下。

## 人工待验

以下均为 **待验**。脚本输入、截图和自动字节验证不能替代真实人工操作；自动验收没有读取私人会话或真实剪贴板历史。

| 项目 | 建议操作 | 当前状态 |
|---|---|---|
| 真实中文 IME 组合输入 | 用本人输入法切换候选、组词、退格、回车；重点验证 `fang'an` 后按 `1` 得到“方案”，再输入“继续”得到“按这个方案继续”；打开/退出抽屉和改名控件，确认不误提交/丢字 | 待验（上一轮快捷键结论撤回；本轮真实 Windows 拼音连续输入对照已建立，见 ime-continuous-20261019；最终本人体验仍待） |
| 中英文混排与字体 | 中英文、数字/标点、表格对齐；本人常用 Windows 缩放/DPI、字号 12–18、舒适/紧凑 | 待验 |
| Ctrl+C 真实中断 | 运行可中断长任务并手动中断；有选区时复制/无选区时中断的约定是否符合预期 | 待验（自动已验证 \x03 到达，不等同人工） |
| 复制粘贴与鼠标选择 | 手动选择、Ctrl+C 复制、Ctrl+V / Ctrl+Shift+V 粘贴、多行/中文/括号粘贴；勿用敏感内容 | 待验（真实剪贴板往返与两种快捷键已修复并自动验证，见 paste-20261017；人工复验仍待） |
| 长日志滚动 | 真实阅读、滚轮、回到底部、选择跨行、输出中分屏/resize；注意 scrollback 上限 4,000 行 | 待验（自动已核对真实 xterm 16,000 条消费） |
| 实际全屏终端程序 | 使用本人**已有**程序，进入、resize、切换/放大、退出后 Shell 恢复；没有程序时先另行确认，不偷偷安装 | 待验 |
| 真实 OS 主题动态变化 | 应用选跟随系统，手动切 Windows 浅/深，检查全部显示及隐藏终端恢复后的主题 | 待验（应用级 nativeTheme 组合自动通过） |

## 下一步与未覆盖范围

先本人体验并验收 M1，发现问题继续 M1 返修，不自动进入 M2。其他 Windows/机器/Shell、数日稳定性、完整发行许可审计、签名/安装器未验证；没有把本机成功扩大成普遍保证。
