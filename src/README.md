# src · M0 验证代码

> 已加入 M0 最小验证入口、PTY 与数据服务，以及 Windows 生命周期适配。仅用于风险验证，尚未实现产品工作区。

```
src/
├── main/        # Electron 主进程（窗口、托盘、全局快捷键、数据层驱动）
├── preload/     # 预加载脚本（主进程 <-> 渲染层 桥）
└── renderer/    # React 渲染层（主窗口 UI、浮层）
```

技术栈（已定）：Electron + TypeScript + electron-vite + electron-builder + better-sqlite3 + React。
详见 [docs/](../docs/)。
