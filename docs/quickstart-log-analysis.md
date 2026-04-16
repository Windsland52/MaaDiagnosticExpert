# 快速上手：从日志到报告

这是当前仓库里最短、最稳定的一条实战路径。

目标：

1. 输入一份 Maa 日志目录或 zip
2. 通过 `core` 直接调用 MLA
3. 产出统一 `CoreResult`
4. 再渲染 markdown 报告

## 前提

- 已安装 `Node.js 24+`
- 仓库根目录执行过：

```bash
pnpm build
```

如果要走 Python 包装层：

- 已安装 `uv`

## 第零步：先做运行时发现

如果你是从外部 agent、MCP client 或 CI 集成这个项目，建议不要先假定命令、profile 和 contract 已知。

先运行：

```bash
pnpm run run:core-cli -- describe-runtime
pnpm run run:core-cli -- list-builtin-profiles
pnpm run run:core-cli -- list-builtin-corpora
```

这一步可以拿到：

- 当前 `core` runtime 名称和版本
- 当前支持的命令和适配器
- 当前可用的 contract 文件名
- 当前内置 profile 清单
- 当前内置 corpus 清单

如果走 Python 包装层，对应命令是：

```bash
pnpm run run:python-mcp-cli -- invoke --tool describe_runtime
pnpm run run:python-mcp-cli -- invoke --tool list_builtin_profiles
pnpm run run:python-mcp-cli -- invoke --tool list_builtin_corpora
```

如果在进入正式日志分析前，想先用仓库内文档做一次确定性背景检索，可以再执行：

```bash
pnpm run run:core-cli -- search-local-corpus --input /path/to/search-input.json
```

输入结构见：

- [corpus-search-input.schema.json](/mnt/c/github/MaaDiagnosticExpert/contracts/corpus-search-input.schema.json)

## 第一步：准备输入模板

参考：

- [mla-runtime-input.template.json](/mnt/c/github/MaaDiagnosticExpert/examples/log-analysis/mla-runtime-input.template.json)

至少要改这几个值：

- `session_id`
- `inputs[0].path`
- `inputs[0].kind`
- `queries.raw_lines.task_id`

## 第二步：生成 `CoreResult`

```bash
pnpm run run:core-cli -- run-mla-runtime \
  --input examples/log-analysis/mla-runtime-input.template.json \
  --with-report \
  --output /tmp/maa-core-result.json
```

输出是结构化 JSON，符合：

- [core-result.schema.json](/mnt/c/github/MaaDiagnosticExpert/contracts/core-result.schema.json)

## 第三步：渲染报告

```bash
pnpm run run:core-cli -- render-report \
  --input /tmp/maa-core-result.json \
  --output /tmp/maa-report.md
```

默认会产出一个最小 markdown 报告，至少包含：

- Summary
- Observations
- Findings
- Retrieval Hits
- Missing Evidence

## 第四步：如果想走 Python 包装层

直接调用 Python MCP wrapper：

```bash
pnpm run run:python-mcp-cli -- invoke \
  --tool run_mla_runtime \
  --input examples/log-analysis/mla-runtime-input.template.json \
  --with-report
```

查看工具列表：

```bash
pnpm run run:python-mcp-cli -- list-tools
```

如果要把它当成 stdio MCP server 给外部 agent 接：

```bash
pnpm run run:python-mcp-server
```

## 第五步：失败时怎么看

如果命令失败，先看结构化错误：

```bash
pnpm run run:core-cli -- run-mla-runtime \
  --input examples/log-analysis/mla-runtime-input.template.json \
  --json-error
```

失败输出符合：

- [error.schema.json](/mnt/c/github/MaaDiagnosticExpert/contracts/error.schema.json)

## 当前适合拿来做什么

- 验证一份日志目录/zip 能否被稳定解析
- 把 MLA 原始能力包装成统一 `CoreResult`
- 给外部 agent / MCP / CI 提供稳定 JSON
- 先跑通“日志 -> 结果 -> 报告”的主链路

## 当前还不解决什么

- 自动抓 issue 页面
- 多轮对话分析
- 基于 RAG 的文档增强推理
