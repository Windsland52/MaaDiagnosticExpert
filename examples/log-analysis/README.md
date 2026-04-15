# Log Analysis Example

这个目录给出当前最短可跑通路径：

1. 日志目录 / zip
2. `run-mla-runtime`
3. 输出 `CoreResult`
4. 渲染 markdown 报告

## 1. 准备输入

复制并修改：

- `mla-runtime-input.template.json`

需要替换的字段：

- `session_id`
- `inputs[0].path`
- `inputs[0].kind`
- `queries.raw_lines.task_id`

`kind` 当前支持：

- `file`
- `folder`
- `zip`

## 2. 运行 core CLI

先构建：

```bash
pnpm build
```

再运行：

```bash
pnpm run run:core-cli -- run-mla-runtime \
  --input examples/log-analysis/mla-runtime-input.template.json \
  --with-report \
  --output /tmp/maa-core-result.json
```

## 3. 渲染 markdown 报告

```bash
pnpm run run:core-cli -- render-report \
  --input /tmp/maa-core-result.json \
  --output /tmp/maa-report.md
```

## 4. 用 Python MCP CLI 走同一路径

```bash
pnpm run run:python-mcp-cli -- invoke \
  --tool run_mla_runtime \
  --input examples/log-analysis/mla-runtime-input.template.json \
  --with-report
```

如果只想看看当前有哪些 Python 侧 tool：

```bash
pnpm run run:python-mcp-cli -- list-tools
```

## 5. 失败时怎么看

`core` CLI 失败时可直接加：

```bash
pnpm run run:core-cli -- run-mla-runtime \
  --input examples/log-analysis/mla-runtime-input.template.json \
  --json-error
```

失败输出会符合：

- `contracts/error.schema.json`

成功输出会符合：

- `contracts/core-result.schema.json`
