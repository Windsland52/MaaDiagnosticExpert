# Python Runtime

这个目录用于承载 Python 侧运行时：

- `mcp`
- `agent`

这两部分都不应重写 `core` 的领域逻辑，而应通过契约和本地运行时调用 `core`。

当前进度：

- `python/mcp` 已有第一版 SDK 无关运行层
- `python/mcp` 已切到 `uv` 管理，并按未来 PyPI 发布补齐基础元数据
- `python/agent` 仍保持占位
