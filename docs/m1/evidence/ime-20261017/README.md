# 中文输入修复证据（2026-10-17）

## 现场症状

- Microsoft 拼音输入 `nihao`，按数字选择候选：终端里没有出现任何字符（空）。
- 直接按回车提交：命令行回显为八进制 `\344\275\240\345\245\275`（截图中的 `o344\275\240\345\245\275…`），命令没有执行。

## 根因（两处，均已实测定位）

### 1. 启动的 Shell 没有 UTF-8 locale（回显八进制）

打包版从资源管理器启动时，进程环境里没有 `LANG`/`LC_ALL`/`LC_CTYPE`。Git Bash 的
readline 因此按单字节 locale 处理，虽然收到的字节是正确 UTF-8，回显时却逐字节显示为
`\344\275\240`。字节本身与命令执行都正确，只有回显被转义。

实测（同一 Shell、同一 ConPTY、同一输入字节）：

| 条件 | 命令行回显 |
|---|---|
| 无 UTF-8 locale（修复前） | `BEG_\344\275\240\345\245\275`（八进制） |
| `shellLaunch` 注入 `LC_ALL=C.UTF-8`（修复后） | `BEG_你好` |
| 显式 `LANG=zh_CN.UTF-8`（保留） | `BEG_你好` |

原始输出见 [shell-locale-before-after.txt](shell-locale-before-after.txt)。`<BS>` 表示反斜杠，
`<U+4f60><U+597d>` 即“你好”。

### 2. 自定义按键处理器吞掉了输入法提交键（数字选择为空、回车未提交）

`terminals.ts` 对**所有** `isComposing` / `keyCode===229` 的 keydown 返回 `false`。xterm 的
`_keyDown` 在自定义处理器返回 `false` 时直接中止，因此不会调用
`CompositionHelper.keydown()`：

- 输入法用回车提交时，提交键被吞掉，`\r` 从未发给 Shell；
- 用数字选择候选时，提交路径同样被跳过，候选文本没有落到终端。

xterm 的 `CompositionHelper` 自身已经正确处理：对输入法消费的键（229）返回 `false`，
对其余提交键调用 `_finalizeComposition`。应用的重复拦截破坏了这条标准路径。

## 修复

- `src/adapters/windows/workstation/shell.ts`：Git Bash 启动时，若环境里没有 UTF-8 locale，
  设置 `LC_ALL=C.UTF-8`；已有 UTF-8 locale 时不动（新增 `utf8-locale.mjs` 判定函数）。
- `src/renderer/workstation/terminals.ts`：删除对 `isComposing`/229 的提前 `return false`，
  交由 xterm 的 `CompositionHelper` 处理；Ctrl+C / Ctrl+Shift+V 等产品快捷键保持拦截。

没有丢弃、截断、替换或重发用户输入；没有识别提示符或命令内容；没有固定 sleep；
没有重建 Shell 或 xterm。

## 验证

- 单元回归：`npm run m1:test`（25/25 通过），新增
  `locale-free Git Bash env is given a UTF-8 ctype; an existing UTF-8 locale is preserved`
  与 `Git Bash launch forces a UTF-8 locale when none is set, but never overrides an explicit one`。
- 开发 GUI：`tests/m1/desktop.ts` 的
  `CJK input, Ctrl+V paste and Shell cwd update reach the real terminal` 通过；新增断言
  终端回显中**不出现** `M1_CJK_\344`（八进制），并确认粘贴文本可执行。
- 字节链路：io-trace 中写往 Shell 的字节为
  `7072696e746620274d315f434a4b5fe4b8ade696875c6e27`，其中 `e4b8ade69687` 即“中文”，
  说明传输层本来就是正确的 UTF-8。
- 正式包：见交付文档中的包路径与 SHA-256；官方 7 项接受检查通过，原件见
  [packaged-result.json](packaged-result.json)（`archiveUnmodified: true`，兜底进程为空）。

## 边界

- 本证据只覆盖中文输入的显示与提交路径；不改变默认 Git Bash、打开即用流程或 IPC 白名单。
- 输入法数字选择/回车提交在真实 Microsoft 拼音下的现象需用户用新包复核；自动化只能以
  合成事件与 Shell 级字节验证，不能完全替代真实 IME。
