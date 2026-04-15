# Contracts

这个目录用于存放跨语言共享的契约文件。

目标：

- 让 `packages/core` 成为契约唯一来源
- 让 `python/mcp` 和未来的 `python/agent` 不需要共享 TypeScript 类型
- 通过 JSON Schema 固化输入输出结构

计划放入：

- `core-result.schema.json`
- `profile.schema.json`
- `error.schema.json`

当前阶段先保留目录和职责说明，后续在 `core` 模型稳定后再生成具体 schema。
