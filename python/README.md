# Python Runtime

这个目录用于承载 Python 侧运行时：

- `mcp`
- `agent`

这两部分都不应重写 `core` 的领域逻辑，而应通过契约和本地运行时调用 `core`。
