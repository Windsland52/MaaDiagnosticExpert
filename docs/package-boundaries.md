# 包边界

## core

### 目标

`core` 提供稳定、确定性的 Maa 诊断能力，并作为本地 CLI 引擎对外运行。

### 输入

- 原始日志/zip/目录/源码路径
- 底层工具的原始结果
- profile 配置

### 输出

- `rawToolResults`
- `diagnosticMeta`
- `retrievalHits`
- `report`

### 公开 API 草案

- `normalizeToolResult()`
- `buildObservations()`
- `buildFindings()`
- `searchKnowledge()`
- `renderReport()`
- `runCli()`

## python/mcp

### 目标

让外部 agent 以 MCP tools 方式调用本地 `core` 运行时。

### 输入

- MCP 请求

### 输出

- `core` 结果的 MCP 形式包装

### 公开工具草案

- `normalize_tool_result`
- `search_knowledge`
- `render_report`
- `load_profile`

## python/agent

### 目标

在本地运行一个依赖 `core` 的 Maa 诊断 agent。

### 输入

- 用户问题
- `core` 返回的结果

### 输出

- 自然语言分析结果
- 下一步工具调用建议

### 说明

`python/agent` 当前后置，不进入 MVP。

## contracts

### 目标

定义跨语言共享 schema。

### 范围

- `CoreResult`
- profile
- 当前已补 `maa-log-analyzer` 两条主输入契约
- error 仍可后续补充
