# JianZJ-Hub · 工作站

> 代码工程名：**JianZJ-Hub**　｜　产品名：**工作站**　｜　GitHub：[JianZJ-75/JianZJ-Hub](https://github.com/JianZJ-75/JianZJ-Hub)

## 一句话定位

**把每天要用的东西聚到一个窗口里，让「切过去、找回来、记下来」这三件事都变成一步。**

一个本地优先、安静克制的桌面效率工具。首要目标是**自己用得爽**，次要目标才是当项目做。

## 当前状态

- **连续中文输入返修（2026-10-19）**：已原生复现并修正连续候选重复旧词的读取错位，上一轮快捷键根因结论撤回。新包/真实拼音及验收结果见 [返修证据](docs/m1/evidence/ime-continuous-20261019/README.md) 和 [最新程序](docs/m1/README.md)。

- **阶段**：M1 本轮已恢复原型式外壳、默认改为 Git Bash，并实际检查 Claude classic/fullscreen；等待本人再验，不进 M2。最新程序、截图和自查见 [Bash/TUI 交付](docs/m1/BASH-TUI.md)。
- 产品方向：终端为主工作区；M1 默认真实 Git Bash、多工作区、递归分屏与生命周期管理，辅助模块明确标注未接入。
- **体验入口**：见 [M1 运行与交付](docs/m1/README.md)、[实际验收记录](docs/m1/ACCEPTANCE.md)。开发运行：`npm run m1:build` 后 `npm run m1:start`；原 `npm run build` 仍是 M0 构建。
- 技术栈（已定）：Electron + TypeScript + electron-vite + electron-builder + better-sqlite3 + React。

## 目录结构

```
JianZJ-Hub/
├── README.md        # 本说明
├── .gitignore       # 忽略现有文档/原型 + 构建产物
├── docs/            # 旧设计资产忽略；docs/m0/、docs/m1/ 开发记录放行
├── prototypes/      # 设计原型（已 gitignore）
└── src/             # M0 验证与 M1 产品入口、服务和适配器
    ├── main/        # Electron 窗口 / 权限 / M0 验证入口
    ├── preload/     # 白名单 preload
    └── renderer/    # M0 探针与 M1 舒适版 React / xterm 工作区
```

> **说明**：旧 `docs/` 设计资产与 `prototypes/` 保持忽略；`docs/m0/`、`docs/m1/` 是已放行的开发记录。M1 基线的原始 HEAD 为 `31ce4c7`；工作站此前已合入 `main` 并推送 origin，源分支已删除；连续中文候选输入返修见 [最新证据](docs/m1/evidence/ime-continuous-20261019/README.md)，本轮新变更提交状态以 Git 为准；不将本地验证等同远端交付。认可原型仍通过飞书附件交接，见 [原型交接](docs/m0/PROTOTYPE-HANDOFF.md)。

## 开发与贡献

协作流程与验证矩阵见 [贡献指南](CONTRIBUTING.md)，各技术栈的编码与架构边界见 [代码规范](docs/CODE_STYLE.md)。

基础检查：`npm run check`（静态检查、首批文件格式检查、工具回归、现有类型检查与两组 Node 单元测试；不包含 GUI/原生 IME/正式包验收）。覆盖限制与新依赖导致的资源 receipt 失效说明见贡献指南。

## 文档

当前产品定义以[飞书 PRD](https://zenova-ai.feishu.cn/wiki/I3hlw2Bqqif9sVk1AOScsRJFnkg)和[飞书技术计划](https://zenova-ai.feishu.cn/wiki/NM5EwK5ObiCZFEklAHkcsBpBnAg)为准；本轮代码验证与交接见 [M0 记录](docs/m0/README.md)。其他本地 docs 设计资产保持忽略，不能假设 Git 克隆能获取它们。

## 下一步

M1 交付后停下等待本人体验与验收，不自动进入 M2。窗口关闭即退出，暂不做托盘；启动创建全新的普通终端，不恢复旧进程/运行树或重放命令。保存项目配置与偏好只是可选组织能力。M0 每会话独立原生 worker、真实句柄退出码与 Job 清理继续作为回归基线。

## M0 历史记录（以下保留收尾时口径）

## M0 技术验证（2026-10-14）

当前任务改为终端中心方案的兼容与关键风险验证，旧文档中的 WezTerm 依赖及“先做快捷启动”不作为本轮要求。
实际版本、运行命令、通过项、失败项、进程清理和最小打包证据见 [M0 记录](docs/m0/README.md)。可运行 M0 验证入口；阻塞项修复与证据见该记录，M1 仍需单独授权。

## GitHub 交付状态

此前 M0 基线已经提交；2026-10-15 只读查询确认远端 main 与本地 HEAD 均为 `524f107e93ec1782554f10b8c799d2cfca6a3497`。随后用户已明确授权提交并推送本轮 M0 收尾，不进入 M1。[交付前审计](docs/m0/DELIVERY-AUDIT.md) 保留当时的空仓库状态；[Git 交付记录](docs/m0/GIT-DELIVERY.md) 记录提交实施与证据保真规则。是否已推送以远端 main 的实际提交为准，不将本地验证或提交等同于远端交付。

## M0 收尾（2026-10-15）

准备与同机复现步骤见 [可复现说明](docs/m0/REPRODUCIBILITY.md)，当前实际进展见 [收尾报告](docs/m0/CLOSEOUT.md)，后续边界见 [M1 验收清单](docs/m0/M1-ACCEPTANCE.md)。本地验证、本地提交、远端上传三项分开报告，不以 push 作为技术验证通过条件。
