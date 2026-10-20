# 连续中文候选输入返修证据（2026-10-19）

## 用户反馈与上一轮判断错误

先输入“按这个”，再输入 `fangan+1`、`jixu+1`，预期“按这个方案继续”，实得“按这个这个这个”。上一轮 `465375d` 仅做快捷键旁路，没有解决此问题。

上一轮对返回值的解释错误：`keys()` 返回 `false` 时，`if (this.shortcut(e)) return false` 不会进入分支，因此不能据此认定候选键被自定义处理器吞掉。旧提交、用户失败反馈和运行证据保留；普通自动套件通过不等于连续真实输入法通过。

## 真正的原生复现

使用已有 `koffi` 调 Windows `SendInput`，仅给新建隔离工作站窗口发送固定的非敏感拼音/数字。每次按键前用 `GetForegroundWindow` 与 `GetWindowThreadProcessId` 核对窗口 PID，失焦就失败停止；只读取该窗口已选中的中文 HKL `8040804`，没有安装、启用或切换系统输入法，没有修改个人输入法配置。

原件：[修复前报告](runtime/ime-native-94897a6f-f9d5-457e-9d06-f88bf2d09a33/ime.json) · [受管理监督](runtime/ime-native-94897a6f-f9d5-457e-9d06-f88bf2d09a33/supervisor.json)。这是实际按键驱动产生的 Windows/Chromium 事件；报告保留各事件 `trusted` 的实际值，不把合成 CDP 输入混称为真实输入法。

| 次序 | 输入法提交内容 | 隐藏 textarea 值 | helper 起点 | xterm onData 实际发出 |
|---|---|---|---:|---|
| 1 | 按这个 | 按这个 | 0 | 按这个 |
| 2 | 方案 | 方案按这个 | 3 | 这个 |
| 3 | 继续 | 继续方案按这个 | 5 | 这个 |

每次候选提交后 textarea 的 `selectionStart/End` 实际为 0。xterm 6 的 `CompositionHelper` 在下一次 `compositionstart` 用旧 value.length 记录起点，假设新文本追加到末尾；但实际插入在旧值前面，延迟读取 substring 时错误取到了旧后缀“这个”。这发生在 renderer 的 onData 之前。main 转发、worker 接收及 Shell 接收 HEX 继续保留相同错误数据，排除“Claude TUI 单纯重绘显示重复”的解释。

## 最终实现范围

最终采用只读编辑区间视图：`installCompositionInput` 不清空、不移动原生 textarea/光标，不修改 CoreService，也不拦截或代发输入。

- compositionstart 的 host 捕获监听先于 xterm 的 textarea 监听：记录原生 selectionStart/End 与选区外的前后缀；helper 的 value getter 使用“旧虚拟前缀 + 本轮原生编辑区间”作为追加视图。
- 首次原生 input 前 getter 只返回旧基线；input 只设置 edited 标记，不写 DOM。这解决非空初始选区重复计入 helper.start 的问题，并让完全相同的合法新提交仍能被发送。
- 空 compositionend 恢复了原生选区时不重发旧词；原生 Enter/blur 清空后重置视图；非组合 229 差分也在原生编辑前锚定范围。
- xterm 原有 helper 仍是组合提交、延迟读取和 onData 的唯一权威；没有新增生产 timer，原始输入不被重发/替换/去重。
- 接缝限定于锁定的 xterm 6.0.0 私有 `_compositionHelper/_textarea`。没有编辑 node_modules 或引入依赖；升级 xterm 时须重新验证，不承诺所有版本/输入法通用。

`tests/m1/composition.test.mjs` 加载真实 pinned CompositionHelper，以可控任务队列做 **9 项**回归：旧 bug 前后对照、selection [0,0]/[0,1]/[1,2]/[0,3]、相同词替换与取消恢复、非 BMP、协议回复/其他用户来源、空提交后的 229 标点、多差分读取不产生 DEL、preinsert overlap，以及 Enter/blur 后新组合。最终路径没有任何异步 textarea 清理，先前清理方案的早清反例不再适用。

## 最终验证结果

[结构化汇总](verification-summary.json) 链接到每项原始报告，最终源码快照见 `source/`。

| 项目 | 实际结果 | 原件 |
|---|---|---|
| 类型检查 | 退出 0 | 见结构化汇总中的 typecheck |
| 工作站单元 | **35/35**，含 9 项实际 helper 回归 | 见结构化汇总中的 unit |
| 原技术基线单元 | **14/14** | 见结构化汇总中的 m0Unit |
| 完整开发套件 | **11 个受管理关卡全部通过**，desktop/stress/bash/paste/ime/visual/两种 TUI/两种故障/退出探针 | 见结构化汇总中的 development |
| 最终原生拼音 | **4/4**，含连续候选、取消/退格/空格/同词/数字、零间隔连续候选、Enter | [原件](runtime/ime-native-96bb7423-61ed-41ae-b59b-adfd0b71c067/ime.json) |
| 正式 EXE | **9/9**，含 CDP 与真实 Windows 拼音，ASAR 未改写，兜底为空 | [result.json](runtime/packaged-a3c12ae9-2544-4a1d-8b1e-615435425267/result.json) |
| ZIP | 生成及 `7z t` 退出 0 | [校验原件](zip-test.stdout.log.txt) |
| 进程身份复核 | 413 个保留身份，匹配存活 0、无法核查 0 | [cleanup.json](cleanup.json) |

身份复核中一次 OpenProcess 被拒绝，随后用只读 CIM 查询确认该 PID 的创建时间已远晚于所保留身份，是 PID 复用而非测试进程存活；原拒绝记录见 [首次复核](cleanup-before-cim-recheck.json)，补充证据见 [创建时间复核](identity-recheck-42676.json)。没有操作或结束这个后来复用 PID 的进程。

正式包真实拼音的 onData 为 `["按这个", "方案", "继续"]`；UTF-8 合并为 `e68c89e8bf99e4b8aae696b9e6a188e7bba7e7bbad`。原生 textarea 仍是“继续方案按这个”，证明最终实现没有清空/重排原生内容；Shell 实际输出 `PACK_IME_native_按这个方案继续`。见 [正式包截图](runtime/packaged-a3c12ae9-2544-4a1d-8b1e-615435425267/ime-native.png)。

开发原生与 CDP 回归逐段对比 onData → main write → worker HEX → Shell read HEX。正式包从原样 ASAR 启动，通过临时 loopback CDP 观测，不添加产品调试接口。生产构建/包清单明确拒绝 paste/ime 等测试入口。

## 保留的失败与边界

- 初次原生测试失焦，前台 PID 非本应用，按键守卫停止；没有绕过守卫继续发送。
- 修复前确实复现“按这个这个这个”，原件见上方。
- 移动 caret、提交后清空 textarea 等中间试验已舍弃。清理方案还暴露协议回复、空提交、多个待执行读取等竞态，以及零间隔输入中首字母未生成预期 DOM 事件的失败。最终不改原生 value/caret、不改 CoreService、不加生产 timer，实际 helper 9 项和原生多轮回归覆盖相关边界；这些中间失败报告仍保留。
- 已采集的测试脚本异常、过早匹配回显 marker、未等待 Shell READY 的 CDP/原生混合注入、窗口未置前导致焦点/截图失败均保留。早期未独立完整采集的脚本编译/转义错误只留在会话中，不补造原始日志。最终夹具通过真实 Shell READY 与实际绘制条件同步，不在生产输入路径中加等待。
- desktop 的失败截图异常曾导致错误收尾等待监督超时；失败截图现在是尽力采集，不阻断 Job 回收，原焦点/布局断言不放宽。
- visual/TUI 截图曾返回 `UnknownVizError`；最终测试先将本应用窗口置前并等待实际绘制帧再截图，原型 SHA-256 与几何断言不变，最终完整套件通过，前面的失败报告不改写。
- 原生模式要求本机已有中文输入法，且每次发送前核对本测试持有身份对应的窗口 PID；不切换系统键盘设置，不附着本人已有终端。普通 CDP 组合测试不冒充原生 IME。
- 未读取私人 CLI 会话/配置/凭据或剪贴板，没有向模型提交任务；两种 CLI 模式仅使用隔离配置、假本地 key 与拒绝服务器，最终请求记录为空。
- 结论限定于当前锁定 xterm、已验证的原生编辑范围/输入序列和本机环境，不扩大为所有输入法或任意 DOM 编辑都正确。最终本人手工体验仍待确认。

## 重现命令

Git Bash 中执行（原生模式会聚焦自己的隔离窗口，不要在该测试窗口输入个人内容）：

```text
npm run typecheck
npm run m1:test
npm run m1:test:dev
node scripts/m1/probe-run.mjs ime native
npm run m1:build
npm run m1:package
M1_NATIVE_IME=1 npm run m1:test:packaged
node scripts/m1/zip.mjs
```

`m1:test:dev` 注册 CDP 组合回归；原生拼音显式执行，不为其他机器偷偷安装或切换输入法。正式包默认验收 8 项，显式设置 `M1_NATIVE_IME=1` 增加真实拼音为本轮的 9 项。`out/` 和 `.m1-scratch/` 清理后须按构建/打包流程重新生成测试入口与 latest-package.json。

[包清单](package-manifest.json) · [命令索引](command-index.json) · [源码哈希](source-manifest.json) · [保真检查](preservation.json) · [归档文件哈希](archive-index.json)
