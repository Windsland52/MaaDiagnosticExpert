# Contracts

这个目录存放由 `packages/core` 自动生成的跨语言 JSON Schema。

当前原则：

- `packages/core` 内的 `zod` schema 是唯一来源
- `contracts/*.schema.json` 是跨语言消费物，不手写维护
- `python/mcp` 和未来的 `python/agent` 只依赖这里的 schema 与 `core` runtime

当前已生成：

- `core-result.schema.json`
- `error.schema.json`
- `profile.schema.json`
- `maa-log-analyzer-batch-input.schema.json`
- `maa-log-analyzer-runtime-input.schema.json`

生成命令：

```bash
pnpm contracts
```

或：

```bash
pnpm --filter @maa-diagnostic-expert/core run generate:contracts
```

下一步可以继续补：

- 通用错误契约
- 更细粒度的子模型契约
- schema 版本发布约定
