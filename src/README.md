# src · 工作站

M0 探针和 M1 产品入口独立：

- `main/index.ts`、`preload/index.ts`、`renderer/m0.*`：原 M0 验证，不当作产品页。
- `main/m1.ts`、`main/workstation/`：M1 窗口、权限路由和生命周期。
- `preload/workstation.ts`：生产白名单 bridge。
- `renderer/workstation/`：认可舒适版的 React 迁移与独立 xterm 实例管理。
- `core/layout/`：不依赖 Electron/React 的递归树规则。
- `services/pty/workstation/`：broker + 每会话一个原生 worker；会话 Job 包住 worker，嵌套生产者 Job 包住 Shell 和后续子进程，排空时保留读流。
- `services/data/workstation.ts`：仅工作区和偏好配置，SQLite 单写；无 M2 辅助业务。
- `adapters/windows/job-object.ts`：保留 M0 验证过的 Job/固定进程句柄；`workstation/` 是产品专用 conout EOF 适配。

- `renderer/workstation/geometry.mjs`：按设备字格校准原型 CSS 行距，串行/合并 resize，并发布已应用尺寸；首次创建等待有效宿主量测。
- `adapters/windows/workstation/cli-environment.mjs`：经确认只在 Shell 的环境副本里优先已有原生 Claude，不改系统/用户 PATH、执行策略或 profile。

`npm run build` 仍构建 M0；产品用 `npm run m1:build`，输出 `out/m1`，打包输出 `release/m1`。详见 [M1 记录](../docs/m1/README.md)。没有托盘、自启、全局热键、自动会话恢复、剪贴板历史采集或通用 IPC exec。

本轮默认Shell由Windows受控`shell.ts`发现已有Git for Windows并生成独立启动rc；不加载个人profile/历史、不自动回退PowerShell。产品外壳恢复comfort.css原型基线，`block-glyphs.mjs`按Unicode几何绘制DOM块字符，真实Claude两种TUI见tests/m1/tui.ts和正式包驱动。最新入口见docs/m1/BASH-TUI.md。
