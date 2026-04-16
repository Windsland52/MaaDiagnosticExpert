# MaaDiagnosticExpert

`MaaDiagnosticExpert` 采用混合语言 monorepo 结构：

- `packages/core` 使用 TypeScript，作为主体能力和本地 CLI 引擎
- `python/mcp` 使用 Python，作为 MCP 适配层
- `python/agent` 计划使用 Python，作为后置的本地 agent

## 项目定位

这个项目不是一个内置对话助手，而是一个面向 Maa 应用排障的能力底座。

它的职责是：

1. 接住底层工具结果或原始输入。
2. 将日志分析、源码查询、文件证据整理成统一诊断对象。
3. 提供本地、无 API Key 的 retrieval 能力。
4. 输出结构化 JSON 和 markdown 报告。
5. 通过 `MCP` 或未来的本地 `agent` 被其他系统消费。

它不直接负责：

- issue 页面抓取
- 多轮用户对话
- 云端 LLM 推理
- 需要配置 API Key 的生成式能力

## 仓库划分

```text
packages/
└─ core/          # TypeScript，诊断能力主体与本地 CLI 引擎
python/
├─ mcp/           # Python，MCP 适配层
└─ agent/         # Python，后置的本地 agent
contracts/        # 跨语言共享的 JSON schema / profile schema
```

### `@maa-diagnostic-expert/core`

负责：

- 领域模型：`Reference / Observation / Finding / Report / Profile`
- 结构化成功 / 失败输出：`CoreResult / CoreError`
- 工具结果归一化
- retrieval
- profile / skill
- JSON / markdown 渲染
- 可选的底层工具 wrapper
- 本地 CLI / 本地运行时入口

约束：

- 不依赖 `MCP`
- 不依赖 LLM API
- 不依赖外部 agent runtime

说明：

- 开发阶段需要 Node.js
- 当前因为直接依赖 `MaaLogAnalyzer` 的可复用包，开发基线为 `Node.js 24+`
- 发布阶段目标是将 `core` 打包为本地可执行 CLI，引导 `python/mcp` 与未来的 `python/agent` 直接调用

### `python/mcp`

负责：

- MCP tool schema
- MCP server 生命周期
- 调用本地 `core` 运行时
- 暴露 `core` 能力

约束：

- 只依赖 `core` 的契约和本地运行时
- 不承载 agent 逻辑

当前状态：

- 已有第一版 Python runtime wrapper
- 已能调用 `core` CLI 并解析 `CoreError`
- `python/mcp` 按 `uv` 管理，并可构建为独立 Python 包
- 已接入官方 Python `mcp` SDK，并提供 stdio MCP server
- 后续如需 Inspector / Streamable HTTP 等形态，再在这层扩展
- 当前对子进程 stdio 互操作仍视为实验态，测试主覆盖先以官方 session 的进程内链路为准

### `python/agent`

负责：

- 本地 agent workflow
- prompt / strategy
- 本地模型接入
- 多步诊断流程

约束：

- 只依赖 `core` 的契约和本地运行时
- 不反向污染 `core`

### `contracts`

负责：

- 跨语言共享 schema
- `core` 输出结构定义
- profile 配置结构定义
- 错误结构和版本约定

当前已由 `core` 自动生成第一批 contract：

- `core-result.schema.json`
- `error.schema.json`
- `profile.schema.json`
- `profile-catalog.schema.json`
- `runtime-info.schema.json`
- `corpus-catalog.schema.json`
- `corpus-search-input.schema.json`
- `corpus-search-result.schema.json`
- `maa-log-analyzer-batch-input.schema.json`
- `maa-log-analyzer-runtime-input.schema.json`

生成命令：

```bash
pnpm contracts
```

Python MCP 测试：

```bash
pnpm run test:python-mcp
```

从仓库根目录直接启动 Python MCP stdio server：

```bash
pnpm run run:python-mcp-server
```

Python MCP 锁定与构建：

```bash
pnpm run lock:python-mcp
pnpm run build:python-mcp
```

## 运行时发现

外部 agent / MCP client 不应该硬编码本项目当前支持的命令、profile 或 contract。

推荐先做运行时发现，再决定后续调用：

```bash
pnpm run run:core-cli -- describe-runtime
pnpm run run:core-cli -- list-builtin-profiles
pnpm run run:core-cli -- list-builtin-corpora
```

其中：

- `describe-runtime` 返回运行时名称、版本、命令列表、适配器列表、contract 列表
- `list-builtin-profiles` 返回内置 profile 目录，便于外部系统决定默认策略或做参数校验
- `list-builtin-corpora` 返回内置本地 corpus 目录，便于外部系统决定检索范围

如果要做确定性的本地文档检索：

```bash
pnpm run run:core-cli -- search-local-corpus --input /path/to/search-input.json
```

对应输入 contract：

- `contracts/corpus-search-input.schema.json`

对应输出 contract：

- `contracts/corpus-search-result.schema.json`

如果走 Python MCP 包装层，也提供了同名工具：

```bash
pnpm run run:python-mcp-cli -- invoke --tool describe_runtime
pnpm run run:python-mcp-cli -- invoke --tool list_builtin_profiles
pnpm run run:python-mcp-cli -- invoke --tool list_builtin_corpora
pnpm run run:python-mcp-cli -- invoke --tool search_local_corpus --input /path/to/search-input.json
```

这两项能力的目标不是“分析日志”，而是让外部系统先识别：

1. 当前本地 runtime 是什么版本
2. 当前暴露了哪些确定性能力
3. 当前有哪些可消费 contract
4. 当前有哪些内置 profile
5. 当前有哪些内置 corpus

## 依赖方向

```text
python/mcp   -> core runtime + contracts
python/agent -> core runtime + contracts
core         -> nobody
```

## 当前建议目录

```text
.
├─ contracts/
├─ docs/
├─ packages/
│  └─ core/
│     └─ src/
├─ python/
│  ├─ mcp/
│  └─ agent/
├─ package.json
├─ pnpm-workspace.yaml
└─ tsconfig.base.json
```

## 文档

- [docs/core-domain-model.md](/mnt/c/github/MaaDiagnosticExpert/docs/core-domain-model.md)
- [docs/monorepo-architecture.md](/mnt/c/github/MaaDiagnosticExpert/docs/monorepo-architecture.md)
- [docs/package-boundaries.md](/mnt/c/github/MaaDiagnosticExpert/docs/package-boundaries.md)
- [docs/python-mcp-stdio-investigation.md](/mnt/c/github/MaaDiagnosticExpert/docs/python-mcp-stdio-investigation.md)
- [docs/quickstart-log-analysis.md](/mnt/c/github/MaaDiagnosticExpert/docs/quickstart-log-analysis.md)

## 快速上手

最短可跑通路径见：

- [examples/log-analysis/README.md](/mnt/c/github/MaaDiagnosticExpert/examples/log-analysis/README.md)
- [docs/quickstart-log-analysis.md](/mnt/c/github/MaaDiagnosticExpert/docs/quickstart-log-analysis.md)

## 当前优先级

1. 先做 `core`
2. 固化并扩展 `contracts`
3. 再做 `python/mcp`
4. 最后再做 `python/agent`
