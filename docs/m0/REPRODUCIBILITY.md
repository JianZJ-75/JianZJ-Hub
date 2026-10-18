# M0 准备、打包与同机复现

范围：Windows x64，沿用 `package-lock.json` 固定版本，不安装全局依赖或源码编译工具链。**本轮实际复现状态见 [收尾报告](CLOSEOUT.md)，步骤存在不等于已运行通过。** 旧环境没有准备 receipt 时不要直接运行准备去覆盖它，使用新的空项目目录。

## 信任链与版本

固定资源及校验来源见 [`scripts/m0/resources.lock.json`](../../scripts/m0/resources.lock.json)：

- npm 锁文件为 resolved URL + SHA-512 SRI 的预期来源，使用 registry.npmjs.org；这是锁文件和 registry 信任链，不是第三方签名审计。
- Electron **44.7.2 win32-x64**：官方 Release API 与 SRI 保护的 npm 包 `checksums.json` 均提供 ZIP SHA-256 `10a89447ef64ac5cb9f782af48ffd83734a40ae91681259d1048ca3c9e6c5da4`。
- simple **0.7.1 Windows x64**：官方 Release API 资产 `360837918` 的 digest 提供 ZIP SHA-256 `7f03cc28cf307721f5621b5a52ef3bcb26c5215de012b09900492eb34d5bed0b`。不从下载文件本身生成“可信预期值”。
- simple LICENSE 来自该版固定源码提交 `4ed008934495fc55ff4bf6620bba58311988b23e`；cppjieba LICENSE 来自其 `src/CMakeLists.txt` 固定的 `194c144d8b5ed1baf3190d07c5226e804454ab47`。先按 Git tree/blob 元数据验证原文，再固定内容 SHA-256。许可的 SHA-256 是固定源码字节锁，不冒称上游发布独立 SHA-256 或签名。保留 simple 原文双许可，本项目选择 MIT。
- 上述上游官方 HTTPS、固定版本、锁文件及 Git 提交是明确的信任边界，不宣称跨来源独立认证或绝对真实性。

旧基线 `524f107` 不包含本轮新增准备入口。以下步骤以**包含本轮收尾变更、即本文件所在提交的完整工程**为输入；用户已授权提交并推送，但远端交付必须实际核对，不能只检出旧基线却声称已拥有本轮准备流程。

## 从干净工程开始

1. 准备只含仓库源码、package/lock、TS/Electron 配置、`scripts/m0/**`、`tests/m0/**` 的新目录；不复制 node_modules、out、release、旧 `.m0-scratch` 或个人缓存。不需要 prototypes 即可验证 M0。
2. 在新目录使用宿主 Node **22.23.2 x64** / npm **10.9.8**（本轮宿主基线），设置新的 npm 缓存，并避免个人 npmrc、NODE_PATH、Electron override/mirror 等干扰。不得将旧 cache 命中冒充干净下载。
3. 每条命令记录实际 cwd、起止时间、退出码和完整 stdout/stderr：

```text
npm ci --ignore-scripts --include=optional --registry=https://registry.npmjs.org --cache=.m0-scratch/cache/npm --no-audit --no-fund
npm run m0:prepare -- --allow-downloads
npm run m0:check
npm run typecheck
npm test
npm run build
node scripts/m0/run.mjs dev --mode=normal
npm run m0:package
node scripts/m0/run.mjs packaged --mode=normal
npm run m0:run
npm run m0:packaged
node scripts/m0/run.mjs dev --mode=concurrent-exit --repeat=2
node scripts/m0/run.mjs packaged --mode=concurrent-exit --repeat=2
```

新开一个 Windows PowerShell 进程，在上述**新项目目录**内先设置隔离 npm 配置（只影响此进程，不修改用户/系统配置；文件存在即停止，不覆盖）：

```powershell
New-Item -ItemType Directory -Force .m0-scratch | Out-Null
foreach ($name in @('npm-user.npmrc', 'npm-global.npmrc')) {
  $file = Join-Path .m0-scratch $name
  if (Test-Path -LiteralPath $file) { throw "Expected a fresh config path: $file" }
  New-Item -ItemType File -Path $file | Out-Null
}
$env:npm_config_userconfig = Join-Path (Get-Location) '.m0-scratch/npm-user.npmrc'
$env:npm_config_globalconfig = Join-Path (Get-Location) '.m0-scratch/npm-global.npmrc'
$env:npm_config_cache = Join-Path (Get-Location) '.m0-scratch/cache/npm'
foreach ($name in @('NODE_PATH', 'NODE_OPTIONS')) {
  if (Test-Path "Env:$name") { Remove-Item "Env:$name" }
}
```

Electron override、镜像、目标架构和 build-from-source 干扰项由准备脚本在**其子进程环境**中移除，固定 win32/x64；不会写入用户配置。上述缓存位置相对于新项目；本轮实跑 harness 使用隔离根的 sibling cache，二者均为新目录，实跑路径以 command.json 为准。

`--allow-downloads` 必须由执行者在知晓来源和下载内容后显式授权；没有该参数，缺少准备记录时拒绝联网。准备成功生成 `.m0-scratch/prepared.json`，离线 `m0:check` 重新核对资源哈希、许可、模块版本和 PE x64 架构，不下载、不写文件。重复准备遇有效 receipt 仅检查；发现未知已有资源时拒绝覆盖，建议保留失败目录并另建干净目录，不删除旧环境。

## 原生准备策略

- `npm ci --ignore-scripts` 不代表 Electron 兼容已验证。显式执行 Electron npm 包的 `install.js`，使用项目内 `.m0-scratch/cache/electron`，校验官方 SHA-256。
- node-pty **1.1.0**：使用包内 `prebuilds/win32-x64`，显式运行 `prebuild.js` 和 `post-install.js`，准备包内 ConPTY **1.23.251008001** DLL/OpenConsole。不执行失败后 `node-gyp rebuild` 的回退链。
- better-sqlite3 **13.0.3**：当前包自带 `prebuilds/win32-x64.node`，由包内 binding loader 选择，无需旧版 prebuild-install 重建流程。
- Koffi **3.3.3**：必须安装固定 optional 包 `@koromix/koffi-win32-x64@3.3.3`，实际调用 kernel32 核验；不执行可能编译的通用 cnoke fallback。
- 宿主 Node 和 Electron 的 Node 模式分别实际加载原生模块、调用 Koffi、执行 SQLite/simple 中文/拼音/jieba 查询并记录真实版本和加载路径；真实 PTY 创建、输入输出和退出由原有 Electron GUI 回归证明。
- simple ZIP 先校验再使用 Node 内建 zlib 解析/解压；检查 ZIP 中央目录、局部条目、路径、长度和 CRC，拒绝越界/链接/Windows 保留路径；每次下载独立新目录，解释器与下载内容分离。不改变 PowerShell 执行策略。
- `npmRebuild:false` 保留。打包前校验准备 receipt 和构建输出；builder 显式复用当前隔离项目已校验的 Electron dist，`--dir --publish never`。打包后比对原生二进制、simple 完整词典、扩展与许可及 Electron 许可，再运行真实产物。未签名，不生成安装器，不安装到系统。

缺模块、缺 optional 包、错版本/架构、资源/许可缺失、哈希不匹配、原生加载不兼容均非零退出，并报告阶段、路径和预期/实测值；不能静默换版本/镜像或安装编译工具链。

## 隔离边界与过程留存

本轮隔离位置为 `D:/Code/JianZJ-Hub-M0-repro-20261015-37002e9f/`；project、intake、harness、cache、evidence 分离。白名单导出的每个输入记录哈希；源码改正时另记输入更新，不悄悄替换。仅宿主 Node/npm、Windows 和系统 DLL 复用，依赖、资源、运行数据与产物均须来自隔离目录。

这是**同机干净目录复现**，不是独立机器验证。预计下载 0.3–0.8 GiB、新增 2–3 GiB、预留 4 GiB；实际量测和结果归档后见收尾报告。不删除现有依赖、cache、成功包、失败日志或历史证据。

完整回归复用 `run.mjs` 的五场景与身份清理，开发和打包各 3×10 对并发退出。main-crash 的应用码 1 是预期注入，不代表监督失败；要求监督通过、最终 Job 空、fallbackPids 空、对照存活，最后按 PID + 创建时间复核。

历史安装输出不完整仍是历史限制，不重装旧环境来补造。完整分发许可审计、签名安装器与 M1 用户体验验收不在本轮范围。
