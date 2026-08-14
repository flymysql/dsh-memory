# dsh-memory-vault

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）打造的跨会话记忆库插件。

每个 DSH 会话都从零开始。`dsh-memory` 给 Agent 一个持久化的"第二大脑"：事实、偏好、决策与项目笔记可以跨会话存活，并自动被回忆。

- **3 个模型工具** — `memory_remember` / `memory_recall` / `memory_forget`
- **每轮提示注入** — 最近的记忆条目会自动注入每次系统提示，Agent 开局就带着上下文
- **持久化存储** — 记录存放在 [storage domain](https://github.com/deepseek-ai/deepseek-harness)（`dsh_memory` 单元，默认 json 后端；单元名按 `UNIT_NAME_RE` 用 snake_case）
- **浏览器管理页** — 设置里的"记忆库"页面，可浏览、新增、删除条目

## 安装

```bash
dsh plugin --profile web add dsh-memory-vault
```

`dsh.bundle` manifest 会自动把 `dsh-memory` 行挂进 profile。也可以手动安装：

```bash
npm install dsh-memory-vault
```

然后在你的 profile `cordis.yml`（或 `cordis.patch.yml`）里加一行：

```yaml
- id: dsh-memory
  name: dsh-memory-vault
```

## 用法

直接告诉 Agent 要记住的事，或让它自己记：

> "记住：这个项目的部署目标是 Windows，测试命令是 `pnpm test`。"

Agent 会调用 `memory_remember`，可带标签：

```
memory_remember(content="User prefers Windows deployment; test command is `pnpm test`", tags=["project:demo", "user"])
```

当需要跨会话上下文时，Agent 调用 `memory_recall(query="Windows deploy")`——按标签匹配（×2）与内容匹配打分，新的优先。记错或过时的条目用 `memory_forget(id="m-...")` 或 `memory_forget(tag="project:demo")` 删除。

### 配置

| 键 | 类型 | 默认 | 含义 |
| --- | --- | --- | --- |
| `injectLimit` | int | 8 | 每次系统提示最多注入的条目数 |
| `recallLimit` | int | 10 | `memory_recall` 最多返回的条目数 |

```yaml
- id: dsh-memory
  name: dsh-memory-vault
  config:
    injectLimit: 12
    recallLimit: 20
```

## 浏览器页面

设置 → 记忆库。按时间倒序列出全部条目（含标签与时间戳），支持快速新增与删除。

页面通过 Harness 官方 `webServer` 服务与 Host 端通信——同源 JSON 端点（`GET/POST /dsh-memory/entries`）。动态插件原型用的是沙箱专用的 `harness.handle`/`host.call` 包内 RPC；发布版走公共路由，任何部署环境都能工作。

## 开发

插件是一个 cordis 包：

- `lib/index.js` — Host 半：domain、工具、提示注入、RPC 处理
- `lib/client.js` — Web 半：设置页

## License

MIT
