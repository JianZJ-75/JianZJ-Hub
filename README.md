# JianZJ-Hub · 工作站

> 代码工程名：**JianZJ-Hub**　｜　产品名：**工作站**　｜　GitHub：[JianZJ-75/JianZJ-Hub](https://github.com/JianZJ-75/JianZJ-Hub)

## 一句话定位

**把每天要用的东西聚到一个窗口里，让「切过去、找回来、记下来」这三件事都变成一步。**

一个本地优先、安静克制的桌面效率工具。首要目标是**自己用得爽**，次要目标才是当项目做。

## 当前状态

- **阶段**：M0 核心技术基线已通过；2026-10-15 交付一致性与同机干净目录复现收尾已完成。未进入 M1，等待用户明确确认。
- 产品方向：终端为主工作区，辅助能力围绕终端服务；当前代码仅为 M0 最小探针，不是完整产品。
- 技术栈（已定）：Electron + TypeScript + electron-vite + electron-builder + better-sqlite3 + React。

## 目录结构

```
JianZJ-Hub/
├── README.md        # 本说明
├── .gitignore       # 忽略现有文档/原型 + 构建产物
├── docs/            # 旧设计资产忽略；docs/m0/ 开发记录放行
├── prototypes/      # 设计原型（已 gitignore）
└── src/             # M0 验证入口、原生服务与适配器
    ├── main/        # Electron 主进程 / 验证协调
    ├── preload/     # 白名单 preload
    └── renderer/    # React / xterm 最小验证界面
```

> **说明**：旧 `docs/` 设计资产与 `prototypes/` 保持忽略；`docs/m0/` 是已放行的开发记录。收尾验收起点的本地/远端 main 均为 `524f107`；随后用户已明确授权提交并推送本轮收尾。本轮交付内容以本文件所在提交为准，远端完成状态须独立核对引用。认可原型仍通过飞书附件交接，见 [原型交接](docs/m0/PROTOTYPE-HANDOFF.md)。

## 文档

当前产品定义以[飞书 PRD](https://zenova-ai.feishu.cn/wiki/I3hlw2Bqqif9sVk1AOScsRJFnkg)和[飞书技术计划](https://zenova-ai.feishu.cn/wiki/NM5EwK5ObiCZFEklAHkcsBpBnAg)为准；本轮代码验证与交接见 [M0 记录](docs/m0/README.md)。其他本地 docs 设计资产保持忽略，不能假设 Git 克隆能获取它们。

## 下一步

M0 已采用每会话独立原生 worker 和 Windows 句柄退出码，重复并发退出门槛已通过。获得用户明确确认后才进入 M1，不自动开发后续模块。

## M0 技术验证（2026-10-14）

当前任务改为终端中心方案的兼容与关键风险验证，旧文档中的 WezTerm 依赖及“先做快捷启动”不作为本轮要求。
实际版本、运行命令、通过项、失败项、进程清理和最小打包证据见 [M0 记录](docs/m0/README.md)。可运行 M0 验证入口；阻塞项修复与证据见该记录，M1 仍需单独授权。

## GitHub 交付状态

此前 M0 基线已经提交；2026-10-15 只读查询确认远端 main 与本地 HEAD 均为 `524f107e93ec1782554f10b8c799d2cfca6a3497`。随后用户已明确授权提交并推送本轮 M0 收尾，不进入 M1。[交付前审计](docs/m0/DELIVERY-AUDIT.md) 保留当时的空仓库状态；[Git 交付记录](docs/m0/GIT-DELIVERY.md) 记录提交实施与证据保真规则。是否已推送以远端 main 的实际提交为准，不将本地验证或提交等同于远端交付。

## M0 收尾（2026-10-15）

准备与同机复现步骤见 [可复现说明](docs/m0/REPRODUCIBILITY.md)，当前实际进展见 [收尾报告](docs/m0/CLOSEOUT.md)，后续边界见 [M1 验收清单](docs/m0/M1-ACCEPTANCE.md)。本地验证、本地提交、远端上传三项分开报告，不以 push 作为技术验证通过条件。
