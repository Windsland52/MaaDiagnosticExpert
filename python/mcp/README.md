# Python MCP

这里放置 Python 侧的 MCP 适配层。

职责：

- 暴露 MCP tools
- 调用本地 `core` CLI / 本地运行时
- 按 `contracts` 中的 schema 解析和返回结果

不负责：

- 重写 `core` 的诊断逻辑
- 实现本地 agent

当前阶段已落地：

- `src/maa_diagnostic_mcp/runtime.py`
  - 调用本地 `packages/core/dist/cli.js`
  - 统一加 `--json-error`
  - 解析 `CoreResult` / `CoreError`
- `src/maa_diagnostic_mcp/tools.py`
  - 提供 tool registry
  - 同时承载 CLI 视图和官方 MCP `Tool` 定义
- `src/maa_diagnostic_mcp/cli.py`
  - 提供包内 CLI 入口
  - 支持列工具、查看 contract、直接调用 tool
- `src/maa_diagnostic_mcp/server.py`
  - 基于官方 `mcp` Python SDK 提供 stdio server
  - 通过官方 server 生命周期暴露 `tools/list`、`tools/call`
- `tests/test_runtime.py`
  - 覆盖基础运行链路
- `src/maa_diagnostic_mcp/_bundled_contracts/*.json`
  - 构建时生成的 contract 快照
  - 随 wheel/sdist 分发
  - 脱离仓库根目录时作为 contract fallback

当前额外暴露的发现型工具：

- `describe_runtime`
  - 返回本地 `core` runtime 的名称、版本、命令、适配器、contract
- `list_builtin_profiles`
  - 返回本地 `core` 暴露的内置 profile 清单
- `list_builtin_corpora`
  - 返回本地 `core` 暴露的内置 corpus 清单
- `prepare_builtin_corpora`
  - 预构建本地 corpus 索引，后续 `search_local_corpus` 会优先复用缓存
- `search_local_corpus`
  - 返回确定性的本地文档检索命中结果
- `run_diagnostic_pipeline`
  - 串联 `maa-log-analyzer`、`maa-support-extension` 和本地 corpus retrieval，输出合并后的 `CoreResult`

当前内置 corpus 已包含 `maafw-docs`，对应仓库内的 `sample/MaaFramework/docs`。

当前执行型工具还包括：

- `run_filesystem_runtime`
  - 扫描本地目录中的 `config/*`、`on_error/*`、日志等文件证据
- `normalize_filesystem_result`
  - 把外部系统已经采集好的文件扫描结果归一化成 `CoreResult`

建议外部系统接入时先调这些发现型 tool，再决定后续如何调用执行型 tool。

当前约束：

- 依赖本机可用的 `node`
- 依赖已构建好的 `packages/core/dist/cli.js`
- 依赖官方 `mcp==1.27.0`
- 如果不在仓库根目录下运行，需要显式设置：
  - `MAA_DIAGNOSTIC_CORE_CLI_JS=/path/to/packages/core/dist/cli.js`
  - 或 `MAA_DIAGNOSTIC_CORE_BIN=/path/to/core-binary`
- 当前对子进程 stdio 互操作仍视为实验态，稳定测试先覆盖官方 session 的进程内链路

## 开发方式

这个包现在按 `uv` 管理。

常用命令：

```bash
uv lock
uv run --no-build-isolation python -m unittest discover -s tests -v
pnpm run sync:python-mcp-contracts
```

说明：

- `_bundled_contracts/` 不提交到 git
- `pnpm run build:python-mcp` 会先自动执行一次 sync，再进行 `uv build`

如果要从仓库根目录执行：

```bash
uv run --directory python/mcp --no-build-isolation python -m unittest discover -s tests -v
```

如果只想跑当前仓库内的单元测试，而不触发项目可编辑安装，可以用：

```bash
uv run --no-project python -m unittest discover -s tests -v
```

如果在仓库内直接调包内 CLI，也需要显式把 `src` 放进 `PYTHONPATH`：

```bash
PYTHONPATH=src uv run --no-project python -m maa_diagnostic_mcp list-tools
```

## 构建与发布

本包已经补齐了基础 PyPI 元数据：

- 包名：`maa-diagnostic-expert-mcp`
- License：`MIT`
- `Typing :: Typed`
- `Homepage / Repository / Issues`

本地构建：

```bash
uv build
```

安装后可直接使用：

```bash
maa-diagnostic-mcp list-tools
maa-diagnostic-mcp show-contract --name core_error
maa-diagnostic-mcp invoke --tool empty_result --profile-id generic-maa-log
maa-diagnostic-mcp-server
```

仓库内直接起 stdio server：

```bash
PYTHONPATH=src uv run --no-project python -m maa_diagnostic_mcp serve-stdio
```

默认发布路径改为 GitHub Actions + PyPI Trusted Publishing。

对应 workflow：

- `.github/workflows/python-mcp-build.yml`
  - 先生成包内 `_bundled_contracts/`
  - 负责构建 `packages/core`
  - 运行 `python/mcp` 单测
  - 构建 `python/mcp/dist/*`
  - 上传 `python-mcp-dist` artifact
- `.github/workflows/python-mcp-publish.yml`
  - 手动输入一个 build run id
  - 从该 run 下载 `python-mcp-dist`
  - 通过 OIDC / Trusted Publishing 上传到 `testpypi` 或 `pypi`

推荐发布步骤：

1. 修改 `python/mcp/pyproject.toml` 中的版本号
2. 如果 `contracts/` 有变化，先执行 `pnpm contracts` 和 `pnpm run sync:python-mcp-contracts`
3. 合并到 `main`
4. 等待 `python-mcp-build` 成功
5. 在 Actions 页面手动运行 `python-mcp-publish`
6. `publish-to=testpypi` 先做一次预发布验证
7. 验证无误后，再用新的 run 或同一个 run 发布到 `pypi`

在 PyPI / TestPyPI 侧需要预先配置 Trusted Publisher，至少要对齐这些字段：

- Owner/Repository: `Windsland52/MaaDiagnosticExpert`
- Workflow file: `.github/workflows/python-mcp-publish.yml`
- Environment:
  - TestPyPI 用 `testpypi`
  - PyPI 用 `pypi`

本地仍然可以执行：

```bash
uv build
```

`uv publish` 只建议作为人工兜底，不建议作为默认发包路径，也不建议长期保管 API token。

## 运行测试

```bash
uv run python -m unittest discover -s tests -v
```

说明：

- `uv.lock` 已提交，作为 Python 侧依赖锁文件
- 仓库根脚本默认把 `uv` 缓存放在 `.uv-cache/`
- `uv build` 在冷缓存环境下会先解析并获取 `build-system.requires`
- 根目录脚本 `pnpm run test:python-mcp` 使用 `uv run --no-project`，目的是让仓库内单测在更少外部前提下也能跑通

如需覆盖默认 CLI 路径，可设置：

```bash
export MAA_DIAGNOSTIC_REPO_ROOT=/path/to/MaaDiagnosticExpert
export MAA_DIAGNOSTIC_CORE_BIN=/path/to/core-binary
export MAA_DIAGNOSTIC_CORE_CLI_JS=/path/to/cli.js
export MAA_DIAGNOSTIC_NODE_BIN=node
```
