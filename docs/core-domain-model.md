# Core 领域模型

## 1. 目标

`core` 的对象模型要先于工具接入稳定下来。

这样后面无论是：

- `MaaLogAnalyzer`
- `maa-support-extension`
- 文件系统读取
- `mcp`
- `agent`

都围绕同一套输出结构工作，而不是边接边改。

## 2. 最核心的对象

### 2.1 Reference

`Reference` 表示证据实际指向哪里。

典型场景：

- 某一行日志
- 某个源码文件位置
- 某张图片
- 某个工具返回块
- 某个文档片段

关键字段：

- `kind`
- `locator`
- `path`
- `line`
- `column`
- `sourceTool`

### 2.2 Observation

`Observation` 表示确定性事实。

它不负责表达“更可能是什么原因”，只表达工具或规则已经确认的事实。

例子：

- `task_id=12` 最终成功
- 某节点连续识别失败 18 次
- 任务定义只支持 `Win32-*`

关键字段：

- `id`
- `kind`
- `summary`
- `sourceTool`
- `payload`
- `references`

### 2.3 Finding

`Finding` 表示基于 observation 的归纳判断。

它可以是确定性的，也可以是带置信度的判断。

例子：

- 本次日志未复现用户描述失败
- 当前控制器不受支持
- 疑似 pipeline 分支遗漏

关键字段：

- `statement`
- `status`
- `confidence`
- `basisObservationIds`
- `supportingReferences`
- `gaps`

### 2.4 RetrievalHit

`RetrievalHit` 表示本地检索层命中的知识片段。

它本身不是结论，只是背景知识命中结果。

典型来源：

- MaaFW 文档
- 应用文档
- 历史案例
- 分析指南

### 2.5 CoreResult

`CoreResult` 是 `core` 的统一输出容器。

它固定包含：

1. `rawToolResults`
2. `diagnosticMeta`
3. 可选 `report`

这样外部系统既能拿到底层原始结果，也能拿到本项目的结构化整理结果。

## 3. 输出 JSON 结构

```json
{
  "apiVersion": "core/v1",
  "profileId": "generic-maa-log",
  "rawToolResults": {
    "maaLogAnalyzer": {},
    "maaSupportExtension": {}
  },
  "diagnosticMeta": {
    "observations": [],
    "findings": [],
    "retrievalHits": [],
    "profileHints": [],
    "missingEvidence": []
  },
  "report": {
    "format": "markdown",
    "title": "Diagnostic Report",
    "sections": [],
    "body": ""
  }
}
```

## 4. 建模原则

### 4.1 Observation 和 Finding 必须分开

如果不分开，后面很容易把“事实”和“判断”混在一起，导致：

- 证据链不清楚
- 置信度不好算
- 外部 agent 不知道哪些内容可以直接引用

### 4.2 CoreResult 必须同时保留原始结果和整理结果

如果只有整理结果，外部 agent 无法自己做更细的二次分析。  
如果只有原始结果，本项目又会退化成工具转发器。

所以必须双层保留：

- 原始结果
- 诊断元信息

### 4.3 RetrievalHit 不等于 Observation

检索命中的文档片段只是背景知识，不应自动当成事实。

只有当某条知识被具体分析逻辑采用后，才应转成 observation 或被挂到 finding 的 supporting references 上。
