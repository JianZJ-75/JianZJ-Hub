# M0 Git 交付记录

日期：2026-10-14。用户已明确授权提交并推送到远端 main，范围仅 M0，不进入 M1。另已明确授权使用本地临时交付分支完成证据保真补提交，再将 main 快进，最终仅推送 main。

## 已发生的提交与首次推送

- 原本地 main 是无提交的初始分支。
- 首个 M0 提交：`f26c0c175954953b5b43bd5377039ae156369080`，标题 `Deliver M0 compatibility validation`，包含 522 个文件。
- 首次 `git push origin main` 未成功，退出 128：凭据对话无法完成、无可用 TTY、无法读取 GitHub 用户名。
- 随后的公开 API 仍返回 HTTP 409 空仓库。不能把该次本地提交描述成 GitHub 交付成功。
- `git credential-manager github list` 未列出账号，环境未提供 GH_TOKEN/GITHUB_TOKEN。需要完成 GitHub 交互登录；不关闭 TLS 校验、不改用其他仓库，也不将令牌写入文件或提交。

## 证据字节保真修复

首次提交后，逐项读取 Git blob 并与归档 manifest 的 SHA-256 比较，发现 410 个归档文件中有 61 个被 Git 的文本换行规范化改变了字节。工作区原始证据没有改变，测试结论没有重写。

本地临时分支 `m0-delivery` 从上述首提交创建。新增项目 `.gitattributes`：

- 常规源码和文档采用 LF，避免后续跨平台 checkout 造成源文件哈希漂移。
- `docs/m0/audit-evidence/**` 与 `docs/m0/evidence/**` 使用 `-text`，按原始字节存储；不删尾空格、空行、ANSI 序列或失败信息。
- 使用 `git add --renormalize` 将原始证据重新加入索引，不改变用户全局 Git 配置。

推送前要求 Git 索引/提交内全部 410 个归档文件与 manifest 匹配；同时核对当前审计文件的哈希。原始证据的空行、尾空格仍会被普通 whitespace 检查指出，这是保真的数据，不是要自动格式化的源码。未跳过提交钩子或签名。

## main 交付验收

最终只向 `origin` 的 `refs/heads/main` 推送，不发布临时分支，不 force push，不进入 M1。

是否推送完成，必须在实际推送之后核对远端 main 的提交是否与本地最终 main 一致，并核对公开 GitHub API/代码内容可读。授权、本地 commit、进程退出或本文件存在都不能代替这项远端验证。本记录不预先把尚未核验的推送写成成功。

`DELIVERY-AUDIT.md`、其 HTTP 409 响应及无 HEAD 的 Git 输出属于授权前的历史证据，保留原时点，不因后续提交而删改。
