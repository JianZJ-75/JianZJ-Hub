# 已认可原型交接

核对日期：2026-10-15。**不修改 HTML，不改变 `prototypes/` 忽略策略，不将原型公开上传或纳入本轮 Git 交付。**

## 唯一版本与获取

- 飞书 PRD：[4 · PRD 与交互原型 · 终端中心舒适版](https://zenova-ai.feishu.cn/wiki/I3hlw2Bqqif9sVk1AOScsRJFnkg)，本轮读取 revision **21**，末节“舒适版截图与原型附件”。
- 技术计划：[技术计划](https://zenova-ai.feishu.cn/wiki/NM5EwK5ObiCZFEklAHkcsBpBnAg)，本轮读取 revision **7**，第 5、13 节。
- 附件：`workstation-comfort.html`；file token：`O7q5bB2W7ooAKsxtRrgcyYj4nxd`。
- 本地位置：`prototypes/comfort-redesign/workstation-comfort.html`，未跟踪，被 `.gitignore` 的 `prototypes/` 忽略。
- 文件大小：**71,609 字节**。
- SHA-256：`1033c2dab321312f09ac220450d2fea7fbbf0f905ade18c450a5ed1281e6917a`。

本轮已实际下载飞书附件，下载命令退出 **0**，与本地文件 **SHA-256 相同且逐字节一致**。不是仅凭同名同大小推断对应。下载日志见 `evidence/closeout-20261015/reproduction/commands/prototype-download/`（最终归档）；原型本体不归档入仓库。

下一位执行者需要飞书文档访问权限：在 PRD 的上述章节下载附件，在一个新的空目录保存，然后运行：

```powershell
(Get-FileHash -Algorithm SHA256 .\workstation-comfort.html).Hash.ToLowerInvariant()
```

结果必须等于上述 SHA-256，再用浏览器直接打开。也可从新的空目录执行已认证的 CLI：

```text
lark-cli docs +media-download --token O7q5bB2W7ooAKsxtRrgcyYj4nxd --output workstation-comfort.html --as user
```

CLI 路径参数使用当前目录内相对路径；不能假设 token 绕过权限。附件无法访问、被替换或哈希不匹配时，停止认定为本交接版本，联系文档维护者；不要修改 HTML 来“对齐”。

## 资源依赖和隐私边界

本轮静态核查 HTML：CSS、JavaScript 内联；无外部脚本、样式表、图片、iframe、字体文件、模块导入或网络请求加载路径，无其他本地资源依赖。`https://example.com/docs` 是启动项示例数据，不是运行依赖；示例 Windows 项目路径也不用于读取本机文件。字体栈使用系统字体回退，不保证其他机器已安装同一种字体。

该文件是浏览器交互演示，不是真实 PTY 产品或 M0 运行证据。不要输入敏感资料；浏览器中草稿/偏好可能尝试本地保存。未另行做跨浏览器、可访问性或 M1 真实终端体验验收。

未来如需改为 Git 管理，应再取得用户授权，仅精确放行该 HTML 及确有必要的资源，不能放开整个 prototypes，也不收录失败版本或私人资产。
