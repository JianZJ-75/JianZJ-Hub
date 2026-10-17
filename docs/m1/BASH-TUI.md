# M1 · 原型外壳、Git Bash 与 Claude TUI

**2026-10-17：本轮修复中文输入回显为八进制、候选数字/回车提交被吞，以及 Ctrl+V / Ctrl+Shift+V 粘贴失效的问题，并完成单元、开发 GUI 与正式包回归；不宣称 M1 全部人工验收通过。** 三个原有目标继续保持：认可原型式外壳；默认已有 Git Bash；实际验证 Claude 的 classic/fullscreen 界面并修复证实的字形问题。打开即终端、项目可选、辅助默认收起仍保留，不进入 M2。

## 本次应打开的程序

```text
D:\Code\JianZJ-Hub\release\m1\2026-10-17T15-00-23-185Z-bac9a883\win-unpacked\Workstation.exe
```

[打开新 EXE](../../release/m1/2026-10-17T15-00-23-185Z-bac9a883/win-unpacked/Workstation.exe) · [新包清单](../../release/m1/2026-10-17T15-00-23-185Z-bac9a883/manifest.json)

请先关闭旧版，再打开此新路径。包无签名/安装器，未发布或推送。

| 产物 | SHA-256 |
|---|---|
| Workstation.exe | `830bee7e746ac88e1dca384a47f8d59707bdf9addb42027ea9d2797c4a23e8da` |
| resources/app.asar | `3b4b5c69f4005294bbe77446ed62c91a2e92b5c170e451b5ec98348455005df3` |

[包清单](evidence/bash-tui-20261016/package-manifest.json)。本机已安装 Git for Windows，不需新增安装；**包不捆绑 Git Bash**，其他机器需要已有 Git for Windows。找不到会明确报告，不静默回退 PowerShell 或下载。

## 本轮 resize/输入竞态修复

新正式包（独立输出目录，未覆盖旧包）即上方“本次应打开的程序”。

**复现与定位证据**：保留的基线探针在“resize 回执后立即写入”条件下实际执行了 `rintf`，见 [baseline-failure/bash.json](evidence/resize-input-20261016/baseline-failure/bash.json)。同一服务链路的非 readline `cat` 读取器在相同 resize/输入时序中逐次收到完整 `P000`…字节；因此不是驱动未送达、renderer 未转发或 PTY 通道截断，而是 ConPTY resize 返回后交互式读取器尚未完成窗口尺寸事件处理的输入时序竞态。服务/worker 边界的 operation、请求序号、resize 尺寸和合成输入 UTF-8 字节记录在 [io-trace.jsonl](evidence/resize-input-20261016/fixed-final/io-trace.jsonl)；不采集真实用户输入。

**实际修复**：worker 在 `ResizePseudoConsole` 后、发送 resize ACK 前，通过同一个 PTY 输入句柄写入中性 NUL fence，并只在该 fence 的写回调成功后确认 resize。后续用户字节不被丢弃、截断、替换、补齐或重发；没有等待提示符、固定 sleep、识别命令内容、识别 Shell 或重建 Shell/xterm。该 fence 不来自用户输入，`cat` 回显验证中也没有出现额外 NUL。实现位于 `src/services/pty/workstation/worker.ts`，测试驱动只在隔离合成数据运行时启用边界追踪。

**验证**：开发 Bash 回归覆盖 100 次“resize 尚在进行时输入”和 200 次“收到 resize 回执后立即输入”，以及 40 次非 readline `cat` 输入字节检查，全部通过；GUI 开发入口用真实窗口尺寸变化和 Electron 原生键盘事件验证 `M1_GUI_RESIZE_42`；正式包用 CDP 键盘输入验证 `M1_PACKAGED_RESIZE_42`，见 [GUI 证据](evidence/resize-input-20261016/gui-dev/desktop.json) 和 [正式包证据](evidence/resize-input-20261016/packaged-final/result.json)。失败原件不删除。

## 本轮中文输入修复（2026-10-17）

现象：Microsoft 拼音输入 `nihao` 后，按数字选择候选为空；直接按回车时命令行回显为八进制 `\344\275\240\345\245\275`，命令不执行。

**定位到两处根因，均以真实 Shell 与字节链路实测确认：**

1. **启动的 Shell 没有 UTF-8 locale。** 打包版从资源管理器启动时，进程环境没有 `LANG`/`LC_ALL`/`LC_CTYPE`；Git Bash 的 readline 按单字节 locale 回显，把正确的 UTF-8 字节显示成八进制。同一输入字节在无 locale 时回显 `\344\275\240\345\245\275`，设置 `LC_ALL=C.UTF-8` 后回显“你好”。见 [前后对照](evidence/ime-20261017/shell-locale-before-after.txt)。
2. **自定义按键处理器吞掉输入法提交键。** `terminals.ts` 对所有 `isComposing`/`keyCode===229` 的 keydown 返回 `false`，使 xterm 的 `_keyDown` 提前中止、不再调用 `CompositionHelper.keydown()`；于是回车提交键没有作为 `\r` 发给 Shell，数字选择候选的提交路径也被跳过。xterm 自带逻辑已对 229 返回 `false`，应用的重复拦截破坏了标准 IME 路径。

**修复：** `shell.ts` 在 Git Bash 启动环境中，若没有 UTF-8 locale 则设置 `LC_ALL=C.UTF-8`，已有 UTF-8 locale 时不覆盖；`terminals.ts` 删除对输入法组合键的提前拦截，交给 xterm `CompositionHelper`，产品快捷键（Ctrl+C / Ctrl+Shift+V 等）仍保留。未丢弃、截断、替换或重发用户输入，未识别提示符/命令，未固定 sleep，未重建 Shell 或 xterm。详见 [证据说明](evidence/ime-20261017/README.md)。

## 本轮粘贴修复（2026-10-17）

现象：新包中 **`Ctrl+V` 和 `Ctrl+Shift+V` 都无法粘贴**。

**定位到两处根因，均以真实 Electron 剪贴板与真实按键实测确认：**

1. **Electron 44 的 clipboard API 是异步的，`app.ts` 未 `await`（主因）。** 本版本 `clipboard.readText(): Promise<string>`、`writeText(): Promise<void>`（`electron.d.ts:7035,7045`）。`app.ts` 把 `clipboard.readText()` 当同步用，拿到的其实是 Promise，`typeof result !== 'string'` 恒真，`clipboardRead` 永远抛 `INVALID_CLIPBOARD_TEXT`；`clipboardWrite` 的 `writeText` 也未 await，复制可能未完成即返回。实测：未 await 为 `"[object Promise]"`，await 后得到字符串 `"M1_CLIPBOARD_PROBE"`。与窗口焦点无关——窗口聚焦时 `WINDOW_NOT_FOCUSED` 守卫是通过的。
2. **`Ctrl+V` 没有接线。** `terminals.ts` 之前只拦截 `Ctrl+Shift+V`；`Ctrl+V` 交给 xterm 后变成 `\x16`（readline quoted-insert），且 xterm 对 keydown 调用了 `preventDefault`，浏览器原生 `paste` 也不会触发。

**修复：** `app.ts` 改为 `await clipboard.readText()` / `await clipboard.writeText(...)`；`terminals.ts` 将粘贴拦截扩展为 `Ctrl+V` 与 `Ctrl+Shift+V` 共用 `clipboardRead → term.paste`。未丢弃、截断、替换或重发用户输入，未识别提示符/命令，未固定 sleep，未重建 Shell 或 xterm；焦点守卫与 IPC 白名单不变。详见 [证据说明](evidence/paste-20261017/README.md)。

## 1. 外壳回到认可原型，而不是再画一版

移除了上一轮压平/压缩的 terminal-first CSS 覆盖，复用保留的 `comfort.css`：外侧留白、圆角、分屏边界、活动窗格焦点、侧栏/标题栏/工具栏和抽屉恢复原型式分工与比例。没有改原型 HTML；71,609字节及 SHA-256 `1033c2dab321312f09ac220450d2fea7fbbf0f905ade18c450a5ed1281e6917a` 保持一致。

[原型同条件图](evidence/bash-tui-20261016/runtime/visual-normal-1168631d-d411-429c-8f69-e2b25a851061/prototype-matched.png) · [实际应用同条件图](evidence/bash-tui-20261016/runtime/visual-normal-1168631d-d411-429c-8f69-e2b25a851061/application-matched.png)

对照使用同一1440×900内容区、DPR=1、浅色、14px、相同新建左右布局。为比较同状态，应用主动展开辅助区；**默认启动依然收起**。侧栏、顶栏、工具栏、终端主区、抽屉、工具轨、pane头/底的宽高、padding、圆角、背景和字号逐项断言一致，见 [量测](evidence/bash-tui-20261016/runtime/visual-normal-1168631d-d411-429c-8f69-e2b25a851061/visual.json)。

原型有三个演示项目及模拟输出，产品只列真实配置/临时终端、不造假项目或预置终端日志。真实终端正文仍按设备网格渲染：14px默认，舒适目标1.35、紧凑1.25，DPR1舒适格高19px；不把原型普通文本框的CSS行高直接复制给xterm。本文只说明已修的外壳偏离，不用量测相同替代本人视觉认可。

## 2. 默认是 Git Bash，跨盘不再要求 PowerShell 语法

产品使用本机已存在的固定可执行文件：

```text
C:\Program Files\Git\bin\bash.exe
GNU bash 5.3.15(2)-release
```

不是 `C:\Windows\System32\bash.exe` 的 WSL 启动器，不通过含糊的 `bash` 命令猜路径。启动和分屏都新建 Git Bash；已有保存项目也按新默认打开，不恢复旧进程。

实际验证：

```bash
cd /d/Code
cd /c/Users/Administrator
cd /; cd c
pwd
```

`/c`、`/d`、中文/含空格目录和真实算术输出均通过。`stty size` 从实际tty读取尺寸，与底栏/xterm/Fit/已应用PTY值一致，不只读可能尚未刷新的Bash `COLUMNS`缓存。Bash自然退出验证码7；保留的PowerShell内部回归仍验证真实DWORD退出码259，不把Bash的POSIX退出码语义混称为PowerShell语义。

[Git Bash 四项实测](evidence/bash-tui-20261016/runtime/bash-normal-7679b890-2a0c-4e52-bdce-e0beb9c30d20/bash.json)：跨盘/中文目录、tty尺寸、16,000条完整输出与中文尾行、子孙进程回收且其他会话存活。

- 使用应用生成的独立rc，**不加载个人profile/.bashrc或私人历史，不创建alias**；个人Bash提示符/alias/profile定制不会自动带入。当前会话历史在内存中，HISTFILE指向 `/dev/null`，不写个人历史。
- 仅在Shell的环境副本中加入既有Git工具路径与此前确认的原生Claude优先路径。TERM如实为xterm-256color、TERM_PROGRAM为JianZJ-Hub、COLORTERM为truecolor，不伪装WezTerm。
- 主进程固定产品Shell，preload没有任意exec/env/Shell路径接口。内部PowerShell枚举只为保留原生命周期回归，产品不提供静默PS回退。
- 受管理worker、Job、保留进程句柄、真实退出码、EOF/ACK排空与关闭失败保留窗格机制继续使用；PTY不是命令安全沙箱。

## 3. 真正检查 Claude 界面，不再只测 --version

用户图中的WezTerm明确提示已降级到classic；工作站图则是fullscreen式底部输入布局。本轮在**两边分别运行同一个已安装Claude Code 2.1.300的两种模式**，不通过修改个人配置强行变成同一种，也不把不同模式的布局差异判为同一个渲染故障。

### 同模式实际截图

| 模式 | 本应用真实进程 | WezTerm真实进程 |
|---|---|---|
| classic | [普通缓冲区、输入区在输出后](evidence/bash-tui-20261016/runtime/tui-classic-be4b0ef7-aac1-4b9f-bd3e-d191dd38a0f7/02-ui.png) | [同模式WezTerm](evidence/bash-tui-20261016/runtime/wez-tui-classic-ea802680-1c40-475b-87a0-68640b9bd437/02-ui.png) |
| fullscreen | [替代缓冲区、输入固定在底部](evidence/bash-tui-20261016/runtime/tui-fullscreen-e0ace090-c279-48fa-98ed-acd43b543ae9/02-ui.png) | [同模式WezTerm](evidence/bash-tui-20261016/runtime/wez-tui-fullscreen-38119692-caaa-432d-baed-9bcd60c36212/02-ui.png) |

对照均141列×33行、14px、浅色、Consolas/Microsoft YaHei、19px格高；WezTerm字号为10.5pt@96dpi。原生整像素字宽与Chromium小数字宽不同，不声称整窗逐像素相同。Claude Logo自身有动画，相位不同不是新的静态渲染缺陷。

**已证实并修复的字形问题**：xterm DOM renderer将部分Unicode块字符回退到宽中文字体，再用负letter-spacing压成一格，造成Logo黑缝/分割。`block-glyphs.mjs`在实际onRender范围内按Unicode Block Elements的半格/八分格/象限几何绘制，覆盖完整设备格，保留ANSI颜色、背景和原始文本。不是硬编码Claude Logo、替换图片或改终端输出；复制/选择仍以xterm缓冲区为准。普通文本、阴影字符等仍交原渲染器，不声称支持所有字体/符号等同WezTerm。

### 实际交互检查

开发真实窗口两种模式都进行了：启动到主界面、粘入中英草稿但不提交、Ctrl+U清除、打开/退出本地主题菜单、窗口resize、分屏、放大还原、本地`/exit`返回原Bash，再执行算术标记。验证缓冲区类型保持正确，Shell/其他窗格不丢失。

最终**未改写ASAR的正式包**另外实际运行两种模式，检查编辑/清除、块字格绘制和退出恢复：[正式包classic](evidence/bash-tui-20261016/runtime/packaged-7623a8ea-29cd-4205-ac2f-ad0f9f117aeb/claude-classic.png) · [正式包fullscreen](evidence/bash-tui-20261016/runtime/packaged-7623a8ea-29cd-4205-ac2f-ad0f9f117aeb/claude-fullscreen.png)。开发harness用Electron原生键事件；外部CDP正式包harness补充使用xterm公开input/paste API，不将它们冒称为真实人工输入法。

测试使用全新cwd/home/CLAUDE_CONFIG_DIR、`--bare`、假测试API key和绑定127.0.0.1的本地拒绝服务器；禁非必要流量/更新。正式包夹具只在新隔离配置中预置该测试目录信任及假key批准，避免初始化提示的外部CDP时序问题；没有改本人配置/凭据。**所有通过的TUI报告中API请求记录均为零，未提交模型提示词、未做真实登录或读取私人会话。** 假本地key并不代表真实认证成功，API/真实任务运行仍未验。

## 交付前自查结果

| 项目 | 本轮结果 |
|---|---|
| 类型检查、脚本语法 | 通过 |
| M1单元 | 25/25（新增 UTF-8 locale 判定与 Git Bash 启动 locale 回退） |
| 中文输入（本轮） | 单测通过；开发 GUI CJK 检查通过并断言回显不出八进制；Shell 前后对照见 [证据](evidence/ime-20261017/README.md)；正式包 7/7 通过 |
| 粘贴（本轮） | 新增常驻回归 `paste`：真实剪贴板往返、真实 `Ctrl+V`/`Ctrl+Shift+V` 粘贴并执行，修复前 `INVALID_CLIPBOARD_TEXT` 失败、修复后通过；见 [证据](evidence/paste-20261017/README.md) |
| Bash真实桌面 | 17项通过，含默认直用、可选项目、焦点、布局、主题和实际tty尺寸 |
| 完整M1开发入口 | probe、desktop、stress、bash、paste、visual、classic/fullscreen、service-fault、main-crash 通过；本轮 desktop 19/19 通过（含此前偶发的 `exact_46` 几何探针） |
| 正式目录包实际运行 | 7项通过，含真实Bash高输出、真实Claude两种模式、原生退出确认和重启新会话 |
| WezTerm对照 | classic/fullscreen均完成启动、草稿编辑/清除、本地菜单、resize和退出；独立mux/class/config |
| M0回归 | 开发/打包各5场景通过；历史源码/证据不改 |
| ZIP与原生资源 | 生成/完整性检查，原生二进制与许可证哈希核对通过 |

[命令索引](evidence/bash-tui-20261016/command-index.json) · [正式包七项原件](evidence/bash-tui-20261016/runtime/packaged-7623a8ea-29cd-4205-ac2f-ad0f9f117aeb/result.json) · [M0汇总](evidence/bash-tui-20261016/m0-regression.json) · [源码清单](evidence/bash-tui-20261016/source-manifest.json) · [最终身份核对](evidence/bash-tui-20261016/cleanup.json)。

自查不只看脚本码：已实际打开启动、原型/应用配对、classic/fullscreen、正式包TUI截图查看，确认不空白、Logo缝隙修复、两种模式位置符合其行为。正式包ASAR测试前后哈希一致，正式bridge不含故障注入/通用执行或测试主入口。

## 失败保留与尚未解决/人工待验

- 早期TUI观察曾停在初始化提示，或选择了默认“不信任”而退出；这些不计为完整UI验收。后续开发/WezTerm使用实际菜单交互，正式包使用明确隔离夹具初始化。失败图/日志保留，不改写成通过。
- 外部CDP注入、测试脚本转义/字符串替换及窗口尺寸事件时序出现过失败；修正驱动并保留原件。测试中一次快速输入丢了环境赋值首字符，导致夹具EXE误以GUI方式启动，出现隔离缓存错误；所属Job已清理，不涉及本人配置。最终针对性 GUI resize/input 检查通过；同次完整 desktop 套件随后在既有 `window_small` 几何探针出现旧尺寸 `R_GEOM_first`，保留于 [gui-final-failure](evidence/resize-input-20261016/gui-final-failure/desktop.json)，不计为本竞态的失败或整套 GUI 全通过。
- **resize/输入竞态已由本轮修复并自动回归确认**：基线失败原件仍保留；现在 worker 在 resize ACK 前完成 PTY 输入 fence，开发服务链路、GUI 原生键盘路径和正式包 CDP 键盘路径均通过，不再以等待提示符作为测试条件。真实人工连续缩放、IME 和其他全屏程序仍属于人工待验，不能由这些合成探针替代。
- **中文输入回显/提交已由本轮修复**：根因是无 UTF-8 locale 与自定义按键处理器拦截输入法组合键，已改为注入 `LC_ALL=C.UTF-8` 并交由 xterm `CompositionHelper` 处理。证据与前后对照见 [ime-20261017](evidence/ime-20261017/README.md)。合成事件能证明字节与回显路径正确，但**不能替代真实 Microsoft 拼音的组合/候选操作**，需用新包人工复核。
- **粘贴已由本轮修复**：根因是 Electron 44 的 `clipboard.readText()/writeText()` 返回 Promise 而 `app.ts` 未 `await`，加上 `Ctrl+V` 未接线。已改为 await 异步剪贴板 API，并让 `Ctrl+V` 与 `Ctrl+Shift+V` 共用 `clipboardRead → term.paste`。新增常驻回归 `paste` 以真实剪贴板与真实按键验证，前后对照见 [paste-20261017](evidence/paste-20261017/README.md)。真实剪贴板读取仍要求窗口聚焦，这是既有守卫，未放松。
- **desktop 开发套件**在本轮 19/19 通过（含此前偶发的 `exact_46` resize 几何探针）；此前偶发失败的原件仍保留，不改写为通过。
- 外壳已恢复、默认Bash与两种TUI已实测；原生与DOM的字体栅格、扩展键协议等仍不等同。未实现WebGL新依赖或硬嵌WezTerm；没有默认强制Claude使用classic/fullscreen，个人选择不改。
- **人工待验**：本人是否接受新视觉；真实中文IME组合/候选、连续resize输入、真实Ctrl+C中断、复制粘贴/鼠标选择、长日志阅读/历史重排、实际联网CLI任务及其他全屏程序、真实Windows主题切换与物理DPI。自动CJK粘入不是IME验收，假key下启动不是登录验收。

## 变更与清理边界

主要新增/修改：Windows受控`shell.ts`、PTY worker/broker的Shell元数据、main默认Shell、main IPC 的异步剪贴板修复（`app.ts`）、终端粘贴快捷键（`terminals.ts`）、React标签和原型CSS覆盖移除、块字形适配；新增Bash/粘贴/视觉/TUI用例和WezTerm对照驱动。每会话独立原生worker、Job/句柄清理、背压与EOF机制沿用，不把PTY称为安全沙箱。

所有成功监督关卡最终Job空、无兜底残留、独立对照存活；WezTerm参照各自Job最终也为空。最终按PID+创建时间复核 **487个已留存身份：匹配存活0、无法核查0，4个PID已复用且按创建时间区别、未误杀**；见cleanup，不按名称杀进程。正常关闭释放注册表/句柄/worker/xterm；失败进程强制收尾时可能保留无敏感内容的独立启动rc/夹具/日志在本轮scratch，保留不等于后台运行。旧包和失败证据不删除。

没有新增依赖/下载、安装全局工具、改系统/用户PATH、profile或执行策略，没有提交/推送或进入M2。当前工程仍在原main工作树，等待本人验收。
