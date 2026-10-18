# JianZJ-Hub · 工作站

> 代码工程名：**JianZJ-Hub**　｜　产品名：**工作站**　｜　GitHub：[JianZJ-75/JianZJ-Hub](https://github.com/JianZJ-75/JianZJ-Hub)

## 一句话定位

**把每天要用的东西聚到一个窗口里，让「切过去、找回来、记下来」这三件事都变成一步。**

一个本地优先、安静克制的桌面效率工具。首要目标是**自己用得爽**，次要目标才是当项目做。

## 当前状态

- **阶段**：M0 阻塞已修复并完成开发/打包复验；是否进入 M1 等待用户明确确认。
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

> **说明**：旧 `docs/` 设计资产与 `prototypes/` 保持忽略；`docs/m0/` 是已放行的开发记录。尚未进行 Git 提交或推送。

## 文档

产品定义、技术选型、决策记录等完整内容见 [`docs/`](docs/README.md)。

## 下一步

M0 已采用每会话独立原生 worker 和 Windows 句柄退出码，重复并发退出门槛已通过。获得用户明确确认后才进入 M1，不自动开发后续模块。

## M0 技术验证（2026-10-14）

当前任务改为终端中心方案的兼容与关键风险验证，旧文档中的 WezTerm 依赖及“先做快捷启动”不作为本轮要求。
实际版本、运行命令、通过项、失败项、进程清理和最小打包证据见 [M0 记录](docs/m0/README.md)。可运行 M0 验证入口；阻塞项修复与证据见该记录，M1 仍需单独授权。

## GitHub 交付状态

M0 已获授权仅提交并推送到 main，不进入 M1。[交付前审计](docs/m0/DELIVERY-AUDIT.md) 保留当时的空仓库状态；[Git 交付记录](docs/m0/GIT-DELIVERY.md) 记录提交实施与证据保真规则。是否已推送以远端 main 的实际提交为准，不将本地验证或提交等同于远端交付。
