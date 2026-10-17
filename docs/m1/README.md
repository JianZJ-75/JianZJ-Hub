# M1 · Git Bash 与原型式工作区

**打开即新终端、项目可选、辅助默认收起。** 这是本人已确认的新默认方式，仍在M1等待人工再验，不进入M2。最新截图、WezTerm实际参照、测试、限制和哈希见 [终端优先交付](BASH-TUI.md)。

## 本次应打开的程序

```text
D:\Code\JianZJ-Hub\release\m1\2026-10-17T15-00-23-185Z-bac9a883\win-unpacked\Workstation.exe
```

[打开新EXE](../../release/m1/2026-10-17T15-00-23-185Z-bac9a883/win-unpacked/Workstation.exe) · [完整ZIP](../../release/m1/2026-10-17T15-00-23-185Z-bac9a883/Workstation-M1-win32-x64.zip)

| 产物 | SHA-256 |
|---|---|
| Workstation.exe | `830bee7e746ac88e1dca384a47f8d59707bdf9addb42027ea9d2797c4a23e8da` |
| resources/app.asar | `3b4b5c69f4005294bbe77446ed62c91a2e92b5c170e451b5ec98348455005df3` |
| Workstation-M1-win32-x64.zip | `5aa4366a4310f195017225e369f862304e1d7951f7dc137bcb2c049c6153eae8` |

旧包全部保留，请不要再打开早先的 `2026-10-15`、`2026-10-16` 以及 `13-11-56-641Z-721bbec8` 版本判断本轮效果。目录包无签名、无安装器，必须完整解压，不能只复制EXE。

## 直接使用

1. 打开应用，自动出现用户主目录中的**全新 Git Bash**，焦点直接在终端；不需要先选项目或目录。
2. 直接输入命令；需要其他目录时使用 `cd`。
3. 点击新建终端或 `Ctrl+Shift+T`，无需表单直接创建。右/下分屏、拖比例、双击名称改名、放大/还原仍可用。
4. 项目是可选的目录组织：左侧保存/打开项目不终止普通终端，点击“终端”可回切。新项目表单不是打开普通终端的前提。
5. 辅助工具默认收起，主动打开才显示演示占位；没有速记/待办/剪贴板历史/通知生产业务。唯一设置入口仍在右侧。
6. 窗口×或底部“关闭工作站”确认后结束受管理会话，暂不做托盘。关最后一个pane后可直接新建，不自动补开；重启应用创建**新的home Shell**，不恢复旧进程、运行树或重放命令。

本机默认使用已有 `C:/Program Files/Git/bin/bash.exe`，不读取个人profile/.bashrc或历史；包不捆绑Git for Windows，其他机器缺少时明确报错，不回退PS或自动安装。

字号仍14px，可调12–18；舒适/紧凑、浅/深/跟随系统保留。本轮外壳已恢复认可原型的间距、圆角与分屏边界；终端正文单独校准字格，Claude两种模式均实际验证。主进程单独管理普通临时归属，不向renderer开放任意exec/cwd/env；PTY仍运行于用户权限，不是命令安全沙箱。

已确认的CLI兼容仅在工作站新Shell的环境副本中优先已有原生Claude，不改系统/用户PATH、执行策略或profile。缺EXE不自动下载；可用`claude.cmd`显式调用。测试只做隔离版本/帮助命令，未登录、联网运行任务或读取私人会话。

## 开发与验证

在仓库根目录使用现有已验依赖：

```text
npm run typecheck
npm test
npm run m1:test
npm run m1:test:dev
npm run m1:build
npm run m1:start
npm run m1:package
npm run m1:test:packaged
node scripts/m1/zip.mjs
```

- 原`npm run build`/`m0:*`仍对应M0；M1输出为`out/m1`、`release/m1`。
- 开发测试生成独立测试入口；正式打包前重跑`m1:build`。包脚本发现测试入口会拒绝，正式bridge无通用debug/exec能力。
- 打包离线校验并在新暂存目录复用已验M0资源；本机默认源为`D:/Code/JianZJ-Hub-M0-repro-20261015-37002e9f/project`。其他环境通过`M1_RESOURCE_SOURCE`指定具有有效receipt的工程；缺资源先报告，不自动下载/安装或覆盖旧缓存。
- 普通运行的cwd由主进程取得用户home；测试通过已有`JIANZJ_M1_DATA`进程覆盖同时隔离测试home，不修改用户home配置。
- 偏好/项目配置在Electron userData的`workstation.sqlite`，原有“使用说明”显示实际位置；不保存终端全文、进程或命令重放队列。测试数据在`.m1-scratch`。
- 使用窗口正常关闭，测试由自有Job收尾；**禁止按powershell/electron/node进程名批量kill**。

## 验收状态

新默认启动、尺寸同步、分屏/项目切换、背压/尾输出、故障清理、主题及正式包已自动复测。最近三轮问题已定位并修复：

- **resize 与输入竞态**（2026-10-16）：resize ACK 前写入中性 NUL fence，输入不再丢首字符。见 [证据](evidence/resize-input-20261016/)。
- **中文输入**（2026-10-17）：注入 `LC_ALL=C.UTF-8` 解决八进制回显；删除自定义按键处理器对输入法提交键的拦截，交回 xterm `CompositionHelper`。见 [证据](evidence/ime-20261017/)。
- **粘贴**（2026-10-17）：Electron 44 的 `clipboard.readText()/writeText()` 为异步，主进程未 `await` 导致恒抛 `INVALID_CLIPBOARD_TEXT`；`Ctrl+V` 也未接线。已改为 await，并让 `Ctrl+V`/`Ctrl+Shift+V` 共用粘贴路径。见 [证据](evidence/paste-20261017/)。

最新自动结果：类型检查通过；M1 单元 25/25；开发桌面套件 19/19；正式包验收 7/7、`archiveUnmodified: true`、兜底进程为空。具体命令、失败记录与边界见 [BASH-TUI.md](BASH-TUI.md)。**视觉是否满意、真实 IME 组合/候选、人工复制粘贴与鼠标选择、全屏程序及 Windows 跟随系统主题仍待本人确认/人工复核**，不由自动脚本替代。

更早的实现和对照保留在 [历史返修](REPAIR-20261015.md)、[原型对照](REPAIR-COMPARISON.md)、[历史验收](ACCEPTANCE.md)；旧“先项目”和“默认抽屉”口径已被取代，不能再作为产品要求。M0代码、原型、旧证据和回退包未覆盖；M1 代码已提交到分支 `m1-delivery` 并推送 origin（`main` 仍停在 `31ce4c7`，未改动）。
