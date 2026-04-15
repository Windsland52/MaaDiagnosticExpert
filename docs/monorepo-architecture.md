# Monorepo 架构

## 1. 总目标

仓库采用混合语言结构：

1. `packages/core`
2. `python/mcp`
3. `python/agent`
4. `contracts`

其中只有 `core` 是必须先完成的主体能力包。

## 2. 模块职责

### 2.1 core

`packages/core` 是确定性诊断能力包。

它负责：

- 统一领域模型
- 组织底层工具结果
- 本地 retrieval
- profile / skill
- 输出结构化结果和 markdown 报告
- 提供本地 CLI / 本地运行时入口

它不负责：

- MCP transport
- 用户对话
- prompt
- 任何需要 API Key 的 LLM 能力

### 2.2 mcp

`python/mcp` 是 `core` 的协议适配层。

它负责：

- 定义 MCP tools
- 启动 server
- 调本地 `core` CLI / 本地运行时
- 把 `core` 结果转成 MCP 返回值

它不负责：

- 改造 `core` 领域模型
- 实现本地 agent 逻辑
- 提供额外推理能力

### 2.3 agent

`python/agent` 是后置的本地智能层。

它负责：

- tool selection
- workflow
- 本地模型接入
- 最终自然语言回答

它不负责：

- 修改 `core` 的对象模型
- 充当 `MCP` transport

### 2.4 contracts

`contracts` 用于承载跨语言共享 schema。

它负责：

- `core` 输出结构定义
- profile schema
- 错误结构
- 版本约定

当前实现方式：

- schema 源头放在 `packages/core` 的 `zod` 模型
- 通过 `pnpm contracts` 自动生成到仓库根目录 `contracts/`
- Python 包只消费生成结果，不共享 TypeScript 类型

## 3. 依赖原则

依赖方向固定如下：

```text
python/mcp   -> core runtime + contracts
python/agent -> core runtime + contracts
```

禁止出现：

```text
core           -> python/mcp
core           -> python/agent
python/agent   -> python/mcp
```

`python/agent -> python/mcp` 不是绝对技术上禁止，而是架构上不推荐。  
本地 agent 应直接调用 `core` 运行时，不要绕一层协议调用自己。

## 4. Monorepo 结构

```text
.
├─ contracts/
├─ docs/
├─ packages/
│  └─ core/
│     ├─ src/
│     │  ├─ models/
│     │  ├─ cli/
│     │  ├─ adapters/
│     │  ├─ retrieval/
│     │  ├─ profiles/
│     │  └─ renderers/
│     ├─ package.json
│     └─ tsconfig.json
├─ python/
│  ├─ mcp/
│  └─ agent/
├─ package.json
├─ pnpm-workspace.yaml
└─ tsconfig.base.json
```

## 5. 分阶段实施

### 阶段 1

先做 `core`：

- 模型
- retrieval
- 报告渲染
- profile
- 工具结果归一化

### 阶段 2

固化并扩展 `contracts` 与 `core` CLI：

- 已有第一批跨语言 schema
- 后续继续补错误契约和更多 adapter 入参契约
- 固化 `core` 本地运行时入口

### 阶段 3

再做 `python/mcp`：

- 暴露常用工具
- 让外部 agent 可以直接消费 `core`

### 阶段 4

最后做 `python/agent`：

- 本地 agent
- 本地模型
- 多步分析流程

## 6. 当前依赖策略

### core

允许：

- `typescript`
- `zod`
- `yaml`
- `jsonc-parser`
- `fflate`
- `fast-glob`
- `pino`

禁止：

- `langchain`
- `openai`
- 向量数据库 SDK
- 任何需要配置 API key 的依赖

### mcp

允许：

- Python MCP SDK
- `core` runtime
- `contracts`

### agent

后置决定。

允许未来接入：

- 本地 agent framework
- 本地模型 runtime
- prompt 模板
- `core` runtime
- `contracts`

## 7. 输出策略

`core` 对外至少能产出：

1. 原始工具结果
2. 结构化诊断元信息
3. retrieval hits
4. markdown 报告

`python/mcp` 和 `python/agent` 都只是在不同消费场景下包装这些输出。
