# Python MCP

这里将放置 Python 版 MCP server。

职责：

- 暴露 MCP tools
- 调用本地 `core` CLI / 本地运行时
- 按 `contracts` 中的 schema 解析和返回结果

不负责：

- 重写 `core` 的诊断逻辑
- 实现本地 agent
