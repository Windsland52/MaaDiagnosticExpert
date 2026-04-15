# Core CLI

这里将放置 `core` 的本地 CLI / 本地运行时入口。

目标：

- 让 `python/mcp` 和未来的 `python/agent` 可以直接调用 `core`
- 固化 JSON 输入输出协议
- 避免 Python 侧重写核心逻辑
