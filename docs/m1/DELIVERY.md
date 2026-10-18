# M1 交付与清理记录

> **最新默认口径和程序已更新**：打开即终端、项目可选、辅助默认收起。请以 [BASH-TUI.md](BASH-TUI.md) 的新EXE/截图为准；下文保留上一轮历史口径与证据，不作为本轮人工通过声明。

> 下文是首轮包的历史交付记录；该包保留回退，但人工体验未通过。**本次应打开的新 EXE** 在 [返修交付记录](REPAIR-20261015.md#本次应打开的程序)；不要将下文旧路径误认为本轮返修包。

日期：2026-10-15。最终产物已实际启动、真实输入输出、高输出完整哈希、原生退出确认与重启不恢复会话通过。本人体验清单仍待验。本轮没有 Git 提交、推送或进入 M2。

## 最终可运行产物

目录相对仓库根：

```text
release/m1/2026-10-15T10-41-08-977Z-3863d86b/
├── win-unpacked/Workstation.exe
├── win-unpacked/resources/app.asar
├── Workstation-M1-win32-x64.zip
├── START-HERE.txt
└── manifest.json
```

| 文件 | 字节数 | SHA-256 |
|---|---:|---|
| Workstation.exe | 245590016 | `ff7937d4ed9ba1111b3b4a28886f89e242793b49620258125c6bf12181c69d0d` |
| resources/app.asar | 1676144 | `9fde36dea5a07ff9af8c135b7c1d66d115a68a727078e3c192f39fb1b82abf42` |
| Workstation-M1-win32-x64.zip | 170029054 | `249843e30c8c79f63a2eb7fe67a7a2aa21ee0d6211423b2b8b45711d19ee4c66` |

ZIP 约 162.15 MiB，使用项目现有离线压缩二进制生成，`7z t` 退出 0。ZIP 内含完整 win-unpacked 目录与说明，不能只搬移 EXE。原生与许可证清单见 [实际包 manifest](evidence/20261015/package-manifest.json)。包内 438 个 ASAR 条目，无 probe/desktop/stress/fault 测试入口，也没有开发编译器或 electron-builder 文件。

此目录包没有签名/安装器，图标和部分 EXE 元数据仍沿用 Electron；没有修改系统安全策略以隐藏该事实。实际打包日志中的 author 缺失/未签名及依赖引用提示保留，不当成已经完成正式发行审计。

## 运行与停止

- 本机直接运行上方 `win-unpacked/Workstation.exe`，或者完整解压 ZIP 后运行。
- 新建配置选择已有目录，等待“创建中”完成再输入；当前 Shell 是已实测的 Windows PowerShell 5.1.26100.9444。
- 窗口 × /“关闭工作站”走统一原生确认与清理。确认前可继续工作；清理失败保留窗口和错误，不静默驻留托盘。无运行会话时直接正常退出。
- 不需要手动按进程名 kill；不要使用 taskkill /IM powershell.exe、electron.exe 或 node.exe 清理它。
- 用户可另行将 ZIP 复制到自己选择的位置；本轮未上传它或公开原型，未 push 源码。

## 测试与证据交接

- [自动通过/人工待验/失败历史](ACCEPTANCE.md)。最终正式包 [运行原件](evidence/20261015/runtime/packaged-382be892-addf-4803-abf1-014024d2544b/result.json) 明确记录 ASAR 未修改、对照存活、最终 fallbackPids 为空。
- [完整命令索引](evidence/20261015/command-index.json)：归档与最终类型复核共 42 项 recorder 命令；每项有实际 argv、cwd、时间、退出码及 stdout/stderr。归档命令自身随后产生的 recorder 原件仍在 `.m1-scratch/commands/archive-evidence-*/`，不假称自包含于它执行中的索引。
- [证据字节清单](evidence/20261015/file-manifest.json)：260 份复制原件，包含失败轮次和 10 份 M0 回归监督文件；另有总索引、保真、清理、产物和源码清单。日志只是改名加 `.txt`，原始字节保留，`.gitattributes` 禁止证据换行转换。
- [源码清单](evidence/20261015/source-manifest.json) 和 [M0/原型保真](evidence/20261015/preservation.json)。前期未独立采集的失败不补造 stdout，见验收文档说明。
- 已实际打开最终开发 workspace、正式包 workspace/high-output 截图查看：非空真实程序、实际 PowerShell 输入和日志尾行，不是原型截图。截图只证明当时渲染，不代替人工 IME/全屏程序体验。

## 进程与临时资源

- 最终按 **PID + 创建时间**核对 422 个有身份记录的进程：**匹配存活 0、无法核查 0**，见 [cleanup.json](evidence/20261015/cleanup.json)。成功的 M1 各监督关卡均 Job 空、fallbackPids 为空、独立对照存活；M0 本轮 10 场景同样通过。主进程崩溃应用码 1 为预期，不重写成正常退出。
- 自然退出/关闭即释放 broker 活跃注册表、进程/Job 句柄、worker、pending 和订阅；renderer 关闭窗格释放 xterm；结束展示只保留有限内容，不持有已结束系统资源。12 轮 broker 句柄 332→328，属于有限轮次观察。
- 首轮误定向的 `D:/out/m1/renderer/index.html` 已按已读文件 SHA-256 精确核对后删除；只移除其空父目录，无未知文件删除。没有清除原 M0 缓存、成功包或历史失败证据。
- `.m1-scratch` 留存本轮隔离 userData、非敏感夹具、成功/失败日志以及两轮离线打包暂存；`release/m1` 留存初轮和最终候选。**保留不等于仍在运行**，不擅自删除以追求空目录。
- `du -sk` 的本轮快照：`.m1-scratch` 1,489,035 KiB，`release/m1` 999,876 KiB，归档 evidence 4,016 KiB；这是磁盘占用，不是下载量、内存或性能数字。后续如本人确认可删除命名的暂存目录，再另做精确清理；保留最终包与证据。

## 环境与系统改动

依赖/锁文件没有升级；新增依赖和下载均未执行。离线打包先核对原 M0 同机复现项目有效 receipt（SHA-256 `ee8c9670a05b8505eb67f9885cb2a86af2de66096be3a2af424b4a92dda0a351`）、原生资源/许可和 package-lock，再复制到新暂存目录，builder 复用已校验 Electron distribution。没有重装当前环境、编译原生库或伪称独立机器复现。

未安装全局工具、修改 PATH、执行策略、个人终端配置、自启或真实 Windows 主题；未采集真实剪贴板或读取私人会话。测试 NativeTheme 变化只在应用进程中，调试端口只在测试启动的 loopback 生命周期内。

## 回滚与后续

M1 输出、数据与 M0 分离；保留 M0 原入口/包与原型。可使用原 M0 命令复验，不能 `git reset --hard`/`git clean` 删除用户改动或旧数据。M1 SQLite 用户配置回退前另备份，不让不兼容旧版本盲开新 schema。

当前 HEAD 仍是 `31ce4c7`、main；变更留在工作树，**没有提交或推送**。本人确认 M1 体验结果后再决定返修、清理、提交/推送及是否放行下一阶段；不自动进入 M2。
