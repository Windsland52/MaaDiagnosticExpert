# Log Analysis Example

这个目录给出三条可直接照着改路径运行的路径：

1. `MLA-only`
2. `filesystem-only`
3. `full diagnostic pipeline`

## 参数说明

示例里的命令会写成：

```bash
pnpm run run:core-cli -- run-mla-runtime ...
```

这里中间的 `--` 是 `pnpm run` 的参数分隔符，用来把后面的参数转发给 `core` CLI。

如果你直接运行：

```bash
node packages/core/dist/cli.js run-mla-runtime ...
```

就不需要这个分隔符。

## 1. 准备输入

复制并修改以下模板之一：

- `mla-runtime-input.template.json`
- `filesystem-runtime-input.template.json`
- `diagnostic-pipeline-input.template.json`

`MLA` 模板至少要替换的字段：

- `session_id`
- `inputs[0].path`
- `inputs[0].kind`
- `inputs[0].focus`
- `queries.raw_lines.task_id`

`kind` 当前支持：

- `file`
- `folder`
- `zip`

当 `kind=folder` 时，默认还是按 MLA 现有目录加载逻辑解析主日志和滚动日志。

如果一个日志目录里混入了多次历史运行，建议不要直接靠 `task_id` 硬查，而是先在 `inputs[0].focus` 里补用户描述能提供的锚点，例如：

- `keywords`
- `started_after`
- `started_before`

这样可以先把 session 收窄到更相关的日志文件，再做 `task_id` 查询。

如果你已经在仓库里的 `sample/MaaLogAnalyzer` 改了 `maa-log-parser` / `maa-log-tools`，先执行：

```bash
pnpm run build:sample-mla
```

之后当前项目的 `MLA runtime` 会优先加载 `sample/MaaLogAnalyzer/packages/*/dist`，不用等 npm 发版。

如果要指向别的本地 MLA checkout，可以设置：

```bash
MAA_DIAGNOSTIC_LOCAL_MLA_ROOT=/abs/path/to/MaaLogAnalyzer
```

`filesystem` 模板至少要替换的字段：

- `roots[0]`

`diagnostic pipeline` 模板至少要替换的字段：

- `filesystem.input.roots[0]`
- `mla.input.session_id`
- `mla.input.inputs[0].path`
- `mse.input.project.project_root`

`mse.input.project.project_root` 可以直接指向软链接目录，例如仓库里的 `sample/MaaEnd`。

## 0. 先确认本地 runtime 能力

如果这条链路是被外部 agent 或 CI 调用，建议先做一次发现：

```bash
pnpm run run:core-cli -- describe-runtime
pnpm run run:core-cli -- list-builtin-profiles
```

这样可以先确认：

- 当前本地 `core` 是否已构建
- 当前支持哪些命令
- 当前有哪些内置 profile
- 当前有哪些 contract 可用来做结果校验

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

如果你只想先确认 `config/*`、`on_error/*`、日志文件这些文件证据：

```bash
pnpm run run:core-cli -- run-filesystem-runtime \
  --input examples/log-analysis/filesystem-runtime-input.template.json \
  --with-report \
  --output /tmp/maa-filesystem-result.json
```

如果你想直接跑全链路：

```bash
pnpm run run:core-cli -- run-diagnostic-pipeline \
  --input examples/log-analysis/diagnostic-pipeline-input.template.json \
  --with-report \
  --output /tmp/maa-diagnostic-result.json
```

## 3. 渲染 markdown 报告

```bash
pnpm run run:core-cli -- render-report \
  --input /tmp/maa-core-result.json \
  --output /tmp/maa-report.md
```

默认 markdown 模板会额外强调两件事：

- `Task Semantics`
  这里会明确说明 task 的 success/failure 以 MaaFramework 的 task 生命周期为准，不能把中间某个 `Node.*.Failed` 直接翻译成 task-level 冲突。
- `Screenshot Evidence`
  这里会分开写：
  - bundle 里是否存在截图文件
  - MLA 是否把截图匹配到了当前 focus 的 task/node

如果 bundle 有截图但 `MLA-Matched Screenshots For Current Scope = 0`，就不应该把那张图直接当作本次复现的现场证据。

## 4. 用 Python MCP CLI 走同一路径

```bash
pnpm run run:python-mcp-cli -- invoke \
  --tool run_mla_runtime \
  --input examples/log-analysis/mla-runtime-input.template.json \
  --with-report
```

`filesystem` 对应：

```bash
pnpm run run:python-mcp-cli -- invoke \
  --tool run_filesystem_runtime \
  --input examples/log-analysis/filesystem-runtime-input.template.json \
  --with-report
```

完整诊断流水线对应：

```bash
pnpm run run:python-mcp-cli -- invoke \
  --tool run_diagnostic_pipeline \
  --input examples/log-analysis/diagnostic-pipeline-input.template.json \
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
