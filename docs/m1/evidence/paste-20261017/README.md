# 粘贴失效修复证据（2026-10-17）

## 现场症状

用户在新包中反馈：**`Ctrl+V` 与 `Ctrl+Shift+V` 都无法粘贴**。

## 根因（两处，均已实测定位）

### 1. Electron 44 的 clipboard API 是异步的，`app.ts` 未 `await`（主因）

Electron 44.7.2 的类型定义（`node_modules/electron/electron.d.ts:7035,7045`）：

```ts
readText(): Promise<string>
writeText(text: string): Promise<void>
```

而 `src/main/workstation/app.ts` 把它们当同步调用：

```ts
result = clipboard.readText();                       // 拿到的是 Promise
if (typeof result !== 'string') throw new Error('INVALID_CLIPBOARD_TEXT')  // 恒真
...
clipboard.writeText(p.text)                          // 写入未完成即返回
```

因此 `clipboardRead` **永远**抛 `INVALID_CLIPBOARD_TEXT`，粘贴彻底失效；`clipboardWrite`
（Ctrl+C 复制）也可能在写入完成前就返回，复制同样不可靠。该问题与窗口焦点无关——
焦点守卫 `WINDOW_NOT_FOCUSED` 在窗口聚焦时是通过的，真正卡住的是拿 Promise 当字符串。

实测（同一 Electron、窗口已聚焦）：

| 调用 | 结果 |
|---|---|
| `clipboard.readText()`（未 await） | `typeof === "object"`，`"[object Promise]"` |
| `await clipboard.readText()` | `string`，`"M1_CLIPBOARD_PROBE"` |

### 2. `Ctrl+V` 根本没有接线，被 xterm 当作文本输入

`terminals.ts` 之前只拦截 `Ctrl+Shift+V`。`Ctrl+V` 交给 xterm 后变成 `\x16`
（readline 的 quoted-insert），不会粘贴，而且 xterm 对 keydown 调用了 `preventDefault`，
浏览器原生 `paste` 事件也不会触发——两条粘贴路径都不通。

## 修复

- `src/main/workstation/app.ts`：`clipboardRead` 改为 `await clipboard.readText()`，
  `clipboardWrite` 改为 `await clipboard.writeText(...)`。
- `src/renderer/workstation/terminals.ts`：把粘贴拦截从仅 `Ctrl+Shift+V` 扩展为
  `Ctrl+V` 与 `Ctrl+Shift+V` 共用同一条 `clipboardRead → term.paste` 路径
  （排除 Alt/Meta 组合），并 `preventDefault` 阻止 xterm 把它当 `\x16`。

没有丢弃、截断、替换或重发用户输入；没有识别提示符或命令内容；没有固定 sleep；
没有重建 Shell 或 xterm；焦点守卫与 IPC 白名单保持不变。

## 验证

新增常驻回归 `tests/m1/paste.ts`（已接入 `npm run m1:test:dev`），用真实窗口焦点
（`app.focus({steal:true})`）、真实剪贴板与真实 `Ctrl+V` / `Ctrl+Shift+V` 按键：

| 断言 | 修复前 | 修复后 |
|---|---|---|
| `clipboardWrite → clipboardRead` 往返 | `INVALID_CLIPBOARD_TEXT`（[before-fix.json](before-fix.json)） | 返回字符串 `M1_COPY_ROUNDTRIP`（[after-fix.json](after-fix.json)） |
| 真实 `Ctrl+Shift+V` 粘贴并执行 | 失败 | `M1_PASTE_SV_42` ✔ |
| 真实 `Ctrl+V` 粘贴并执行 | 失败（`\x16`） | `M1_PASTE_CV_42` ✔ |
| 窗格残留错误 | `INVALID_CLIPBOARD_TEXT` | 无 |

- 单元回归 `npm run m1:test`：25/25 通过。
- 开发桌面套件 `desktop`：19/19 通过（含此前的几何校验）。
- 正式包接受检查：7/7 通过（见交付文档的包路径与 SHA-256）。

## 边界

- 真实剪贴板读取要求窗口聚焦，这是既有的安全守卫；本修复不放松该守卫。
- 自动化用真实 Electron 剪贴板与真实按键验证；最终仍建议用户在新包中用真实
  Microsoft 拼音/任意文本复核一次 `Ctrl+V` / `Ctrl+Shift+V`。
