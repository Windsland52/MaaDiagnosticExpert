# MaaDiagnosticExpert

`MaaDiagnosticExpert` 采用混合语言 monorepo 结构：

- `packages/core` 使用 TypeScript，作为主体能力和本地 CLI 引擎
- `python/mcp` 计划使用 Python，作为 MCP server
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
├─ mcp/           # Python，MCP server
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
- `maa-log-analyzer-batch-input.schema.json`
- `maa-log-analyzer-runtime-input.schema.json`

生成命令：

```bash
pnpm contracts
```

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

## 当前优先级

1. 先做 `core`
2. 固化并扩展 `contracts`
3. 再做 `python/mcp`
4. 最后再做 `python/agent`
